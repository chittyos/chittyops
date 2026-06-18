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
 * Per the custom-resources docs, the canonical return is via
 * AddOnsResponseService if available. Falls back to raw JSON
 * envelope for compatibility.
 *
 * @param {Object} outputs Key-value pairs to return
 */
function workflowOutput_(outputs) {
  // Try the official AddOnsResponseService API
  if (typeof AddOnsResponseService !== 'undefined' &&
      AddOnsResponseService.newReturnOutputVariablesAction) {
    try {
      var action = AddOnsResponseService.newReturnOutputVariablesAction();
      for (var key in outputs) {
        var val = outputs[key] != null ? String(outputs[key]) : '';
        action.addOutputVariable(key, val);
      }
      return action.build();
    } catch (e) {
      Logger.log('AddOnsResponseService fallback: ' + e);
    }
  }

  // Fallback: raw JSON envelope (works in preview builds)
  var formatted = {};
  for (var key in outputs) {
    formatted[key] = { value: String(outputs[key] != null ? outputs[key] : '') };
  }
  return { workflow: { outputs: formatted } };
}

/**
 * Return a structured error response for the Studio Activity tab.
 *
 * Per handle-errors docs:
 *   - ACTIONABLE: Adds "Fix it" button → config card
 *   - RETRYABLE: Studio will retry up to 5 times
 *
 * @param {string} message  Error message for Activity tab
 * @param {boolean} actionable  Whether user can fix via config card
 * @param {boolean} retryable   Whether Studio should auto-retry
 */
function workflowError_(message, actionable, retryable) {
  // Try the official AddOnsResponseService API
  if (typeof AddOnsResponseService !== 'undefined' &&
      AddOnsResponseService.newReturnElementErrorAction) {
    try {
      var errAction = AddOnsResponseService.newReturnElementErrorAction()
        .setText(message);

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

      return errAction.build();
    } catch (e) {
      Logger.log('AddOnsResponseService error fallback: ' + e);
    }
  }

  // Fallback: throw to let Studio handle it generically
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
  var emailText = 'From: ' + sender + '\nSubject: ' + subject + '\n\n' + body.substring(0, 3000);
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
        content: body.substring(0, 1500),
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
      .setHeader('Pipeline')
      .addWidget(CardService.newTextParagraph()
        .setText(
          'POST /api/v1/ingest → NeonIngestionWorkflow\n' +
          '→ cc_obligations → runTriage() → cc_recommendations\n\n' +
          '<b>Requires:</b> TASKS_API_URL and TASKS_API_TOKEN in Script Properties.'
        )))
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

  var isDispute = /legal|lawsuit|court|dispute/i.test(category || routerCategory || '');

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
          text: body.substring(0, 2000),
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
    var action = code >= 200 && code < 300 ? 'ingested' : 'failed';
    var dest = isDispute ? 'chittyagent-dispute' : 'chittyagent-tasks';

    logActivity_('chittyagent-tasks', action,
      'POST /api/v1/ingest → ' + code + ', routed=' + dest +
      ', dispute=' + isDispute + ', category=' + (category || routerCategory));

    return workflowOutput_({
      action: action,
      routedTo: dest,
      disputeCreated: String(isDispute),
      statusCode: String(code),
    });
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
    classifierVia: 'workspace-studio',
    channel: 'workspace-studio-gmail',
  };

  try {
    // Route based on category + urgency
    var isUrgent = /billing|legal|debt_collection|financial_statement/i.test(category) ||
      /critical|high/i.test(urgency) ||
      sensitivity === 'legalink';

    if (isUrgent) {
      writeToUrgentIncoming(emailData, classification);
    } else {
      writeToLeadIncoming(emailData, classification);
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
    return workflowOutput_({ action: 'error', rowNumber: '0' });
  }
}
