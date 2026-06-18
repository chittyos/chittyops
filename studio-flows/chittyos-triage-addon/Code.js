/**
 * ChittyOS Workspace Studio Steps — Code.js
 *
 * Four composable workflow elements for Google Workspace Studio:
 *
 *   1. Gemini Classify   — onConfigGeminiClassify / onExecuteGeminiClassify
 *   2. Router Push        — onConfigRouterPush / onExecuteRouterPush
 *   3. Triage Ingest      — onConfigTriageIngest / onExecuteTriageIngest
 *   4. Sheet Log          — onConfigSheetLog / onExecuteSheetLog
 *
 * Each element has:
 *   - onConfigFunction: Returns a configuration card for the Studio UI
 *   - onExecuteFunction: Runs the step logic when the flow executes
 *
 * Event-driven via Gmail "When email received" trigger — no cron polling.
 *
 * @canonical-uri chittycanon://core/scripts/chittyos-studio
 * @see https://developers.google.com/workspace/add-ons/studio
 */

// ─── Constants ──────────────────────────────────────────────────────

var GEMINI_MODEL = 'gemini-2.0-flash';
var GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

var CLASSIFICATION_PROMPT = [
  'You are ChittyOS Email Classifier. Analyze the email below and extract structured data.',
  'Respond ONLY with compact JSON — no markdown, no explanation, just the JSON object.',
  '',
  'Output schema:',
  '{',
  '  "category": "billing|legal|debt_collection|lease|financial_statement|inquiry|spam|other",',
  '  "payee": "company or person name (who is owed money)",',
  '  "amount": null or number (dollars, no $ sign),',
  '  "due_date": null or "YYYY-MM-DD",',
  '  "urgency": "low|normal|high|critical",',
  '  "is_legal": true|false,',
  '  "is_actionable": true|false,',
  '  "summary": "1-sentence summary of what this email is about"',
  '}',
  '',
  'Rules:',
  '- amount should be the total amount due, not a partial or minimum payment',
  '- due_date should be the payment due date or deadline, not the statement date',
  '- is_legal=true for anything involving courts, lawsuits, legal deadlines, subpoenas',
  '- is_actionable=false for marketing, newsletters, confirmations of past payments',
  '- urgency=critical for overdue/final notices; high for upcoming due dates; normal for statements',
].join('\n');

var LEGAL_CASE_PATTERN = /2024D007847|#?\s?287\b|#?\s?239\b|arias\s+v\.?\s+bianchi/i;
var LEGAL_KEYWORD_PATTERN = /\b(lawsuit|subpoena|court|hearing|motion|deposition|notice of motion|debt[-\s]?collection|collection agency)\b/i;

// Privileged domains whose email bodies must NOT be sent to external AI.
// F-L10 metadata-only: classify using subject + sender only.
var PRIVILEGED_DOMAINS = /vanguardadvocates\.com|bertonring\.com|ksnlaw\.com/i;

// ─── Helpers ────────────────────────────────────────────────────────

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

/**
 * Extract a workflow input variable from the event object.
 *
 * Per the Studio event-objects docs, the actual path is:
 *   event.workflow.actionInvocation.inputs["id"].stringValues[0]
 *
 * We also check the simpler event.workflow.inputs["id"].value as a
 * fallback since the API is in limited preview and may evolve.
 */
function getInput_(event, id) {
  // Path 1: Official event-objects docs pattern
  if (event && event.workflow && event.workflow.actionInvocation &&
      event.workflow.actionInvocation.inputs &&
      event.workflow.actionInvocation.inputs[id]) {
    var ai = event.workflow.actionInvocation.inputs[id];
    // stringValues is an array — take first element
    if (ai.stringValues && ai.stringValues.length > 0) return ai.stringValues[0];
    // integerValues fallback
    if (ai.integerValues && ai.integerValues.length > 0) return String(ai.integerValues[0]);
    // Generic value fallback
    if (ai.value != null) return String(ai.value);
  }

  // Path 2: Simpler format (some preview builds)
  if (event && event.workflow && event.workflow.inputs) {
    var input = event.workflow.inputs[id];
    if (input && input.value != null) return String(input.value);
  }

  return '';
}

/**
 * Build the standard workflow output response.
 *
 * Per the output-variables docs, the canonical pattern is:
 *   ReturnOutputVariablesAction → addVariableData(VariableData) per output
 *   → wrap in HostAppAction → return via RenderActionBuilder
 *
 * Falls back to raw JSON envelope for preview builds that don't
 * yet expose the full CardService/AddOnsResponseService chain.
 *
 * @param {Object} outputs Key-value pairs to return
 */
function workflowOutput_(outputs) {
  // Path 1: Official RenderAction wrapping
  try {
    var action = AddOnsResponseService.newReturnOutputVariablesAction();
    for (var key in outputs) {
      var val = outputs[key] != null ? String(outputs[key]) : '';
      var varData = AddOnsResponseService.newVariableData()
        .setId(key)
        .setStringValues([val]);
      action.addVariableData(varData);
    }
    var hostAction = CardService.newHostAppAction()
      .setReturnOutputVariablesAction(action);
    return CardService.newRenderActionBuilder()
      .setHostAppAction(hostAction)
      .build();
  } catch (e) {
    Logger.log('RenderAction output fallback: ' + e);
  }

  // Path 2: raw JSON envelope (preview builds)
  var formatted = {};
  for (var key in outputs) {
    formatted[key] = { value: String(outputs[key] != null ? outputs[key] : '') };
  }
  return { workflow: { outputs: formatted } };
}

/**
 * Return a structured error response for the Studio Activity tab.
 *
 * Per handle-errors docs, the pattern is:
 *   ReturnElementErrorAction → setErrorLog() → HostAppAction → RenderActionBuilder
 *   - ACTIONABLE: Adds "Fix it" button → re-opens config card
 *   - RETRYABLE: Studio will auto-retry up to 5 times
 *
 * @param {string} message  Error message for Activity tab
 * @param {boolean} actionable  Whether user can fix via config card
 * @param {boolean} retryable   Whether Studio should auto-retry
 */
function workflowError_(message, actionable, retryable) {
  // Path 1: Official RenderAction wrapping
  try {
    var errAction = AddOnsResponseService.newReturnElementErrorAction()
      .setErrorLog(message);

    if (actionable) {
      errAction.setErrorActionability(AddOnsResponseService.ErrorActionability.ACTIONABLE);
    } else {
      errAction.setErrorActionability(AddOnsResponseService.ErrorActionability.NOT_ACTIONABLE);
    }

    if (retryable) {
      errAction.setErrorRetryability(AddOnsResponseService.ErrorRetryability.RETRYABLE);
    } else {
      errAction.setErrorRetryability(AddOnsResponseService.ErrorRetryability.NOT_RETRYABLE);
    }

    var hostAction = CardService.newHostAppAction()
      .setReturnElementErrorAction(errAction);
    return CardService.newRenderActionBuilder()
      .setHostAppAction(hostAction)
      .build();
  } catch (e) {
    Logger.log('RenderAction error fallback: ' + e);
  }

  // Path 2: throw to let Studio handle it generically
  throw new Error(message);
}

/**
 * Write a structured activity log entry to the Integration Logs tab.
 * These also appear in Studio's Activity tab via Logger.
 * @param {string} service  Service name (gemini-classify, chittyrouter, etc.)
 * @param {string} status   success | failed | error
 * @param {string} details  Human-readable detail string
 */
function logActivity_(service, status, details) {
  // Log for Studio Activity tab
  Logger.log('[' + service + '] ' + status + ': ' + details);

  // Also write to Integration Logs sheet tab
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Integration Logs');
    if (sheet) {
      sheet.appendRow([
        new Date().toISOString(),
        'workspace-studio',
        service,
        status,
        details,
      ]);
    }
  } catch (e) {
    // Don't let logging failures break the pipeline
    Logger.log('logActivity_ write failed: ' + e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 1: GEMINI CLASSIFY
// ═══════════════════════════════════════════════════════════════════

/**
 * Configuration card for the Gemini Classify step.
 * Shows in the Studio visual editor when the user adds this step.
 */
function onConfigGeminiClassify(event) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('ChittyOS: Gemini Classify')
      .setSubtitle('AI-powered email classification via Google AI Studio'))
    .addSection(CardService.newCardSection()
      .setId('gemini_classify_info')
      .setHeader('How It Works')
      .addWidget(CardService.newTextParagraph()
        .setText(
          'Classifies email content using Gemini 2.0 Flash (free tier).\n\n' +
          '<b>Categories:</b> billing, legal, debt_collection, lease, ' +
          'financial_statement, inquiry, spam, other.\n\n' +
          '<b>Extracts:</b> payee, amount, due date, urgency, legal sensitivity.\n\n' +
          '<b>Requires:</b> GEMINI_API_KEY in Script Properties ' +
          '(from aistudio.google.com/apikey).'
        )))
    .addSection(CardService.newCardSection()
      .setId('gemini_classify_inputs')
      .setHeader('Input Variables')
      .addWidget(CardService.newTextInput()
        .setFieldName('emailBody')
        .setTitle('Email Body')
        .setHint('Map to Gmail body variable'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailSubject')
        .setTitle('Email Subject')
        .setHint('Map to Gmail subject variable'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailFrom')
        .setTitle('Sender Email')
        .setHint('Map to Gmail from variable')))
    .build();
  return card;
}

/**
 * Execute the Gemini Classify step when the flow runs.
 * Receives email data, classifies via Gemini, returns structured outputs.
 */
function onExecuteGeminiClassify(event) {
  var body = getInput_(event, 'emailBody');
  var subject = getInput_(event, 'emailSubject');
  var from = getInput_(event, 'emailFrom');

  // ── Input validation (per validate-inputs docs) ──────────────
  if (!body && !subject) {
    logActivity_('gemini-classify', 'error', 'Missing input: emailBody and emailSubject are both empty');
    return workflowError_(
      'Email body and subject are both empty. Ensure the flow passes email content to this step.',
      true,   // ACTIONABLE — user can rewire inputs
      false   // NOT_RETRYABLE
    );
  }

  var apiKey = prop_('GEMINI_API_KEY');
  if (!apiKey) {
    logActivity_('gemini-classify', 'error', 'GEMINI_API_KEY not configured in Script Properties');
    return workflowError_(
      'GEMINI_API_KEY not set. Go to Script Properties (Project Settings) and add your API key from aistudio.google.com/apikey.',
      true,   // ACTIONABLE — user can fix config
      false   // NOT_RETRYABLE — won't work without key
    );
  }

  var startMs = Date.now();

  // Call Gemini API
  var cls = callGemini_(subject, body, from, apiKey);
  var classifierUsed = 'gemini-ai-studio';

  // Fallback to deterministic classification if Gemini fails
  if (!cls) {
    cls = deterministicClassify_(body);
    classifierUsed = 'deterministic';
  }

  var durationMs = Date.now() - startMs;

  // Compute legal sensitivity (Two-Space gate — mirrors contextual-ingest.ts)
  var isLegal = cls.is_legal ||
    LEGAL_CASE_PATTERN.test(body) ||
    LEGAL_KEYWORD_PATTERN.test(body);
  var sensitivity = isLegal ? 'legalink' : 'business';

  // Activity log
  logActivity_('gemini-classify', 'success',
    'Classified via ' + classifierUsed + ': category=' + (cls.category || 'other') +
    ', urgency=' + (cls.urgency || 'normal') + ', sensitivity=' + sensitivity +
    ' (' + durationMs + 'ms)');

  return workflowOutput_({
    category: cls.category || 'other',
    payee: cls.payee || '',
    amount: cls.amount != null ? cls.amount : '',
    dueDate: cls.due_date || '',
    urgency: cls.urgency || 'normal',
    isLegal: String(isLegal),
    isActionable: String(cls.is_actionable !== false),
    sensitivity: sensitivity,
    confidence: cls.confidence ? Math.round(cls.confidence * 100) + '%' : '70%',
    summary: cls.summary || '',
  });
}

function callGemini_(subject, body, sender, apiKey) {
  // P1 #3: Privileged domain redaction — metadata only (F-L10)
  var senderDomain = (sender || '').split('@')[1] || '';
  var isPrivileged = PRIVILEGED_DOMAINS.test(senderDomain);
  var emailBody = isPrivileged ? '[REDACTED — privileged domain]' : body.substring(0, 3000);

  var emailText = 'From: ' + sender + '\nSubject: ' + subject + '\n\n' + emailBody;
  var url = GEMINI_API_BASE + GEMINI_MODEL + ':generateContent?key=' + apiKey;

  try {
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: CLASSIFICATION_PROMPT + '\n\n--- EMAIL ---\n' + emailText }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
        },
      }),
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      Logger.log('Gemini ' + response.getResponseCode() + ': ' +
                 response.getContentText().substring(0, 300));
      return null;
    }

    var result = JSON.parse(response.getContentText());
    var text = result.candidates &&
      result.candidates[0] &&
      result.candidates[0].content &&
      result.candidates[0].content.parts &&
      result.candidates[0].content.parts[0] &&
      result.candidates[0].content.parts[0].text;

    return text ? JSON.parse(text) : null;
  } catch (err) {
    Logger.log('Gemini error: ' + err);
    return null;
  }
}

function deterministicClassify_(text) {
  var lower = (text || '').toLowerCase();
  var isLegal = LEGAL_CASE_PATTERN.test(text) || LEGAL_KEYWORD_PATTERN.test(text);
  var isDebt = /\b(past.due|final.notice|collection agency|debt[-\s]?collection)\b/i.test(text);
  return {
    category: isLegal ? 'legal' : isDebt ? 'debt_collection' : 'billing',
    urgency: isLegal ? 'high' : 'normal',
    is_legal: isLegal,
    is_actionable: true,
    confidence: 0.4,
    summary: 'Deterministic classification (Gemini unavailable)',
  };
}

// ═══════════════════════════════════════════════════════════════════
// STEP 2: ROUTER PUSH
// ═══════════════════════════════════════════════════════════════════

function onConfigRouterPush(event) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('ChittyOS: Router Push')
      .setSubtitle('Push to ChittyRouter for AI-powered routing'))
    .addSection(CardService.newCardSection()
      .setId('router_push_info')
      .setHeader('How It Works')
      .addWidget(CardService.newTextParagraph()
        .setText(
          'Sends classified email to ChittyRouter POST /process.\n\n' +
          '<b>AI Chain:</b> Llama 4 Scout 17B (primary) → GPT-OSS 120B → ' +
          'Gemma 4 26B → Llama 3.1 8B (fallback).\n\n' +
          '<b>Auto-forwards:</b> Dispute-worthy emails (lawsuit, court, ' +
          'emergency_legal) go to ChittyDispute automatically.\n\n' +
          '<b>Requires:</b> CHITTYROUTER_URL and CHITTYROUTER_TOKEN in Script Properties.'
        )))
    .addSection(CardService.newCardSection()
      .setId('router_push_inputs')
      .setHeader('Input Variables')
      .addWidget(CardService.newTextInput()
        .setFieldName('emailBody')
        .setTitle('Email Body'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailSubject')
        .setTitle('Email Subject'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailFrom')
        .setTitle('Sender Email'))
      .addWidget(CardService.newTextInput()
        .setFieldName('category')
        .setTitle('Classification Category'))
      .addWidget(CardService.newTextInput()
        .setFieldName('isLegal')
        .setTitle('Legal Flag (true/false)')))
    .build();
  return card;
}

function onExecuteRouterPush(event) {
  var body = getInput_(event, 'emailBody');
  var subject = getInput_(event, 'emailSubject');
  var from = getInput_(event, 'emailFrom');
  var category = getInput_(event, 'category');
  var isLegal = getInput_(event, 'isLegal');

  var routerUrl = prop_('CHITTYROUTER_URL');
  var routerToken = prop_('CHITTYROUTER_TOKEN');

  if (!routerUrl || !routerToken) {
    logActivity_('chittyrouter', 'error', 'CHITTYROUTER_URL or TOKEN not configured');
    return workflowError_(
      'CHITTYROUTER_URL or CHITTYROUTER_TOKEN not set. Add them in Script Properties.',
      true,   // ACTIONABLE
      false   // NOT_RETRYABLE
    );
  }

  try {
    var response = UrlFetchApp.fetch(routerUrl + '/process', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + routerToken,
        'X-Source-Service': 'workspace-studio',
        'X-Channel-Id': 'chitty:channel:workspace-studio-gmail',
      },
      payload: JSON.stringify({
        from: from,
        to: 'nick@nevershitty.com',
        subject: subject,
        content: (body || '').substring(0, 1500),
        pre_classification: {
          source: 'gemini-ai-studio',
          model: GEMINI_MODEL,
          category: category,
          is_legal: isLegal === 'true',
        },
      }),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var result = JSON.parse(response.getContentText());
      var analysis = (result.ai && result.ai.analysis) || {};

      logActivity_('chittyrouter', 'success',
        'POST /process → ' + code + ': category=' + (analysis.category || category) +
        ', priority=' + (analysis.priority || 'NORMAL'));

      return workflowOutput_({
        routerCategory: analysis.category || category || 'other',
        routerPriority: analysis.priority || 'NORMAL',
        urgencyScore: analysis.urgency_score != null ? analysis.urgency_score : '50',
        caseRelated: String(!!analysis.case_related),
        routingRecommendation: analysis.routing_recommendation || '',
        reasoning: analysis.reasoning || 'chittyrouter /process',
      });
    }

    // Fallback: passthrough
    logActivity_('chittyrouter', 'failed', 'POST /process → HTTP ' + code);
    return workflowOutput_({
      routerCategory: category || 'other',
      routerPriority: 'NORMAL',
      urgencyScore: '50',
      caseRelated: String(isLegal === 'true'),
      routingRecommendation: 'passthrough',
      reasoning: 'ChittyRouter returned ' + code,
    });
  } catch (err) {
    Logger.log('Router error: ' + err);
    logActivity_('chittyrouter', 'error', 'Router unavailable: ' + err);
    return workflowError_(
      'ChittyRouter unavailable: ' + err + '. The service may be temporarily down.',
      false,  // NOT_ACTIONABLE — nothing user can fix
      true    // RETRYABLE — transient network issue
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 3: TRIAGE INGEST
// ═══════════════════════════════════════════════════════════════════

function onConfigTriageIngest(event) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('ChittyOS: Triage Ingest')
      .setSubtitle('Push to chittyagent-tasks for Neon ingestion'))
    .addSection(CardService.newCardSection()
      .setId('triage_ingest_info')
      .setHeader('Pipeline')
      .addWidget(CardService.newTextParagraph()
        .setText(
          'POST /api/v1/ingest → NeonIngestionWorkflow\n' +
          '→ cc_obligations → runTriage() → cc_recommendations\n\n' +
          '<b>Requires:</b> TASKS_API_URL and TASKS_API_TOKEN in Script Properties.'
        )))
    .addSection(CardService.newCardSection()
      .setId('triage_ingest_inputs')
      .setHeader('Input Variables')
      .addWidget(CardService.newTextInput()
        .setFieldName('emailBody')
        .setTitle('Email Body'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailFrom')
        .setTitle('Sender Email'))
      .addWidget(CardService.newTextInput()
        .setFieldName('category')
        .setTitle('Classification Category'))
      .addWidget(CardService.newTextInput()
        .setFieldName('urgency')
        .setTitle('Urgency Level'))
      .addWidget(CardService.newTextInput()
        .setFieldName('sensitivity')
        .setTitle('Sensitivity (business/legalink)'))
      .addWidget(CardService.newTextInput()
        .setFieldName('routerCategory')
        .setTitle('Router Category')))
    .build();
  return card;
}

function onExecuteTriageIngest(event) {
  var body = getInput_(event, 'emailBody');
  var from = getInput_(event, 'emailFrom');
  var category = getInput_(event, 'category');
  var urgency = getInput_(event, 'urgency');
  var sensitivity = getInput_(event, 'sensitivity');
  var routerCategory = getInput_(event, 'routerCategory');

  var apiUrl = prop_('TASKS_API_URL');
  var apiToken = prop_('TASKS_API_TOKEN');

  if (!apiUrl || !apiToken) {
    logActivity_('chittyagent-tasks', 'error', 'TASKS_API_URL or TOKEN not configured');
    return workflowError_(
      'TASKS_API_URL or TASKS_API_TOKEN not set. Add them in Script Properties.',
      true,   // ACTIONABLE
      false   // NOT_RETRYABLE
    );
  }

  // P2 #7: Check BOTH category AND routerCategory for dispute patterns
  var disputePattern = /legal|lawsuit|court|dispute|emergency_legal/i;
  var isDispute = disputePattern.test(category || '') || disputePattern.test(routerCategory || '');

  try {
    var response = UrlFetchApp.fetch(apiUrl, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'Authorization': 'Bearer ' + apiToken,
        'X-Source-Service': 'workspace-studio',
        'X-Channel-Id': 'chitty:channel:workspace-studio-gmail',
      },
      payload: JSON.stringify({
        records: [{
          timestamp: new Date().toISOString(),
          contact: from,
          sender: from,
          text: (body || '').substring(0, 2000),
          is_from_me: false,
          classification: {
            category: category || routerCategory || 'other',
            urgency: urgency || 'normal',
            sensitivity: sensitivity || 'business',
            classifier_via: 'workspace-studio',
          },
          source: 'workspace-studio',
        }],
      }),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();

    // P2 #8: Non-2xx should return retryable error, not silent success
    if (code >= 200 && code < 300) {
      var dest = isDispute ? 'chittyagent-dispute' : 'chittyagent-tasks';
      logActivity_('chittyagent-tasks', 'ingested',
        'POST /api/v1/ingest → ' + code + ', routed=' + dest +
        ', dispute=' + isDispute + ', category=' + (category || routerCategory));

      return workflowOutput_({
        action: 'ingested',
        routedTo: dest,
        disputeCreated: String(isDispute),
        statusCode: String(code),
      });
    }

    // Non-2xx: retryable for 429/5xx, actionable for 4xx
    var isRetryable = code === 429 || code >= 500;
    logActivity_('chittyagent-tasks', 'failed',
      'POST /api/v1/ingest → HTTP ' + code);
    return workflowError_(
      'Triage ingest returned HTTP ' + code + '. ' +
        (isRetryable ? 'The tasks service may be temporarily overloaded.' : 'Check your TASKS_API_URL and TASKS_API_TOKEN.'),
      !isRetryable,  // ACTIONABLE for 4xx client errors
      isRetryable    // RETRYABLE for 429/5xx
    );
  } catch (err) {
    Logger.log('Ingest error: ' + err);
    logActivity_('chittyagent-tasks', 'error', 'Ingest failed: ' + err);
    return workflowError_(
      'Triage ingest failed: ' + err + '. The tasks service may be temporarily down.',
      false,  // NOT_ACTIONABLE
      true    // RETRYABLE — transient
    );
  }
}

// ═══════════════════════════════════════════════════════════════════
// STEP 4: SHEET LOG
// ═══════════════════════════════════════════════════════════════════

function onConfigSheetLog(event) {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader()
      .setTitle('ChittyOS: Log to Sheet')
      .setSubtitle('Route to Urgent Incoming or Lead Incoming'))
    .addSection(CardService.newCardSection()
      .setId('sheet_log_info')
      .setHeader('Routing Logic')
      .addWidget(CardService.newTextParagraph()
        .setText(
          'Routes classified emails to existing tabs:\n\n' +
          '<b>→ Urgent Incoming:</b> billing, legal, debt_collection, ' +
          'financial_statement, or urgency=critical/high\n\n' +
          '<b>→ Lead Incoming:</b> inquiry, lease, or urgency=low/normal\n\n' +
          'Appends CO: columns (Category, Urgency, Confidence, etc.) ' +
          'to the right of existing columns.\n\n' +
          'Run <b>🔷 ChittyOS → Setup ChittyOS Columns</b> first to add CO: headers.'
        )))
    .addSection(CardService.newCardSection()
      .setId('sheet_log_inputs')
      .setHeader('Input Variables')
      .addWidget(CardService.newTextInput()
        .setFieldName('emailBody')
        .setTitle('Email Body'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailSubject')
        .setTitle('Email Subject'))
      .addWidget(CardService.newTextInput()
        .setFieldName('emailFrom')
        .setTitle('Sender Email'))
      .addWidget(CardService.newTextInput()
        .setFieldName('category')
        .setTitle('Classification Category'))
      .addWidget(CardService.newTextInput()
        .setFieldName('urgency')
        .setTitle('Urgency Level'))
      .addWidget(CardService.newTextInput()
        .setFieldName('confidence')
        .setTitle('Confidence %'))
      .addWidget(CardService.newTextInput()
        .setFieldName('sensitivity')
        .setTitle('Sensitivity'))
      .addWidget(CardService.newTextInput()
        .setFieldName('payee')
        .setTitle('Payee'))
      .addWidget(CardService.newTextInput()
        .setFieldName('amount')
        .setTitle('Amount'))
      .addWidget(CardService.newTextInput()
        .setFieldName('dueDate')
        .setTitle('Due Date'))
      .addWidget(CardService.newTextInput()
        .setFieldName('summary')
        .setTitle('Summary')))
    .build();
  return card;
}

function onExecuteSheetLog(event) {
  var body = getInput_(event, 'emailBody');
  var subject = getInput_(event, 'emailSubject');
  var from = getInput_(event, 'emailFrom');
  var category = getInput_(event, 'category');
  var urgency = getInput_(event, 'urgency');
  var confidence = getInput_(event, 'confidence');
  var sensitivity = getInput_(event, 'sensitivity');
  var payee = getInput_(event, 'payee');
  var amount = getInput_(event, 'amount');
  var dueDate = getInput_(event, 'dueDate');
  var summary = getInput_(event, 'summary');

  // ── Input validation ─────────────────────────────────────────
  if (!from && !body) {
    logActivity_('sheet-log', 'error', 'Missing input: emailFrom and emailBody are both empty');
    return workflowError_(
      'No email data received. Ensure previous steps pass emailFrom or emailBody to this step.',
      true,   // ACTIONABLE
      false   // NOT_RETRYABLE
    );
  }

  var emailData = {
    timestamp: new Date().toISOString(),
    from: from,
    subject: subject,
    body: body,
  };

  var classification = {
    category: category || 'other',
    urgency: urgency || 'normal',
    confidence: confidence || '',
    sensitivity: sensitivity || 'business',
    payee: payee || '',
    amount: amount || '',
    dueDate: dueDate || '',
    summary: summary || '',
    classifierVia: 'workspace-studio',
    channel: 'workspace-studio-gmail',
  };

  try {
    // Route based on category + urgency
    var isUrgent = /billing|legal|debt_collection|financial_statement/i.test(category) ||
      /critical|high/i.test(urgency) ||
      sensitivity === 'legalink';

    var wrote;
    if (isUrgent) {
      wrote = writeToUrgentIncoming(emailData, classification);
    } else {
      wrote = writeToLeadIncoming(emailData, classification);
    }

    // Surface missing sheet setup as a failure
    if (!wrote) {
      logActivity_('sheet-log', 'error', 'Sheet tab or CO: columns not found. Run Setup ChittyOS Columns first.');
      return workflowError_(
        'Sheet tab or CO: columns not found. Run 🔷 ChittyOS → Setup ChittyOS Columns from the spreadsheet menu.',
        true,   // ACTIONABLE
        false   // NOT_RETRYABLE
      );
    }

    var targetTab = isUrgent ? 'Urgent Incoming' : 'Lead Incoming';
    logActivity_('sheet-log', 'success',
      'Routed to ' + targetTab + ': category=' + category +
      ', urgency=' + urgency + ', sensitivity=' + sensitivity);

    return workflowOutput_({
      action: 'logged_to_' + targetTab.toLowerCase().replace(/ /g, '_'),
      rowNumber: 'appended',
    });
  } catch (err) {
    Logger.log('Sheet error: ' + err);
    logActivity_('sheet-log', 'error', 'Sheet write failed: ' + err);
    return workflowError_(
      'Sheet write failed: ' + err,
      false,  // NOT_ACTIONABLE
      true    // RETRYABLE
    );
  }
}

