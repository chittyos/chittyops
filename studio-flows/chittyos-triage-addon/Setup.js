/**
 * ChittyOS Triage Engine — Setup.js
 *
 * AUGMENTS the existing spreadsheet structure rather than creating new tabs.
 * Maps ChittyOS pipeline outputs to the existing tab layout:
 *
 *   Existing Tab              ← ChittyOS Pipeline Source
 *   ─────────────────────────────────────────────────────
 *   Urgent Incoming           ← Gmail preprocessor (urgent/legal)
 *   Lead Incoming             ← Gmail preprocessor (leads/inquiries)
 *   Urgent Queue              ← Approved items from Urgent Incoming
 *   Inbound Lead Queue        ← Approved items from Lead Incoming
 *   Master: Matters           ← ChittyDispute API sync
 *   Master: Entities          ← chittyagent-finance entity sync
 *   Master: Contacts          ← Extracted sender contacts
 *   Integration Logs          ← ChittyRouter / chittyagent-tasks sync logs
 *   Metrics / Dashboard       ← Aggregate formulas across all tabs
 *
 * Bound to: 1eGah6rT5oKbQmKkI5FvpkudhlpZOKgwB3FrOJQhRIvI
 */

// ─── Existing Tab Names ─────────────────────────────────────────────

var TABS = {
  URGENT_INCOMING: 'Urgent Incoming',
  LEAD_INCOMING: 'Lead Incoming',
  URGENT_QUEUE: 'Urgent Queue',
  LEAD_QUEUE: 'Inbound Lead Queue',
  ARCHIVE: 'Archive',
  ENTITIES: 'Master: Entities',
  PROPERTIES: 'Master: Properties',
  MATTERS: 'Master: Matters',
  CONTACTS: 'Master: Contacts',
  LOGS: 'Integration Logs',
  DASHBOARD: 'Metrics / Dashboard',
  SETTINGS: 'Settings / Dropdown Lists',
  PRICING: 'Dynamic / Smart Pricing',
  MAINTENANCE: 'Maintenance Log',
  CALENDAR: 'Property Calendar',
  LEASES: 'All Leases',
};

// ─── ChittyOS Augmentation Columns ─────────────────────────────────
// These are APPENDED to the right of existing columns, not replacing.

var CHITTYOS_COLUMNS = {
  URGENT_INCOMING: [
    'CO: Category',       // billing / legal / debt_collection / ...
    'CO: Urgency',        // low / normal / high / critical
    'CO: Confidence',     // 0%–100%
    'CO: Sensitivity',    // business / legalink
    'CO: Payee',          // extracted payee
    'CO: Amount',         // extracted $ amount
    'CO: Due Date',       // extracted YYYY-MM-DD
    'CO: Summary',        // Gemini 1-sentence summary
    'CO: Router Status',  // pushed / failed / skipped
    'CO: Classifier',     // gemini-ai-studio / deterministic
  ],
  LEAD_INCOMING: [
    'CO: Category',       // inquiry / lease / other
    'CO: Urgency',        // low / normal / high
    'CO: Confidence',     // 0%–100%
    'CO: Summary',        // Gemini summary
    'CO: Channel',        // workspace-studio-gmail / imessage / ...
    'CO: Classifier',     // gemini-ai-studio / deterministic
  ],
  LOGS: [
    'CO: Service',        // chittyrouter / chittyagent-tasks / ...
    'CO: Operation',      // classify / ingest / sync / push
    'CO: Status Code',    // HTTP status
    'CO: Payload Size',   // bytes
    'CO: Duration (ms)',  // latency
  ],
};

var COLORS = {
  HEADER_BG: '#1a1a2e',
  HEADER_FG: '#e0e0e0',
  CHITTY_ACCENT: '#e94560',
  SUCCESS: '#2ecc71',
  WARNING: '#f39c12',
  DANGER: '#e74c3c',
  LEGAL: '#9b59b6',
  MUTED: '#7f8c8d',
};

// ─── Main Setup ─────────────────────────────────────────────────────

/**
 * Augment existing tabs with ChittyOS columns and formatting.
 * Safe to run multiple times — checks for existing columns first.
 */
function setupChittyOS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var augmented = [];

  // Augment Urgent Incoming
  var urgentResult = augmentTab_(ss, TABS.URGENT_INCOMING, CHITTYOS_COLUMNS.URGENT_INCOMING);
  if (urgentResult) augmented.push(TABS.URGENT_INCOMING + ' (+' + urgentResult + ' cols)');

  // Augment Lead Incoming
  var leadResult = augmentTab_(ss, TABS.LEAD_INCOMING, CHITTYOS_COLUMNS.LEAD_INCOMING);
  if (leadResult) augmented.push(TABS.LEAD_INCOMING + ' (+' + leadResult + ' cols)');

  // Augment Integration Logs
  var logResult = augmentTab_(ss, TABS.LOGS, CHITTYOS_COLUMNS.LOGS);
  if (logResult) augmented.push(TABS.LOGS + ' (+' + logResult + ' cols)');

  // Add validation rules
  addChittyValidation_(ss);

  // Add conditional formatting for ChittyOS columns
  addChittyFormatting_(ss);

  // Update Settings tab with ChittyOS dropdown values
  updateSettings_(ss);

  // Add ChittyOS section to Dashboard
  augmentDashboard_(ss);

  var msg = augmented.length > 0
    ? 'Augmented: ' + augmented.join(', ')
    : 'All ChittyOS columns already present';

  SpreadsheetApp.getActiveSpreadsheet().toast(msg, '🔷 ChittyOS Setup Complete', 8);
}

/**
 * Append ChittyOS columns to an existing tab.
 * Returns number of columns added, or 0 if already present.
 */
function augmentTab_(ss, tabName, newColumns) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    Logger.log('Tab not found: ' + tabName);
    return 0;
  }

  // Find existing headers in row 1
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) lastCol = 1;
  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Check if ChittyOS columns already added (look for "CO:" prefix)
  var hasChitty = existingHeaders.some(function(h) {
    return String(h).indexOf('CO:') === 0;
  });

  if (hasChitty) {
    Logger.log(tabName + ' already has ChittyOS columns');
    return 0;
  }

  // Append new column headers after the last existing column
  var startCol = lastCol + 1;
  var headerRange = sheet.getRange(1, startCol, 1, newColumns.length);
  headerRange.setValues([newColumns]);

  // Style the new headers
  headerRange
    .setBackground(COLORS.HEADER_BG)
    .setFontColor(COLORS.CHITTY_ACCENT)
    .setFontWeight('bold')
    .setFontSize(9)
    .setFontFamily('Roboto Mono')
    .setHorizontalAlignment('center')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);

  // Set column widths
  for (var i = 0; i < newColumns.length; i++) {
    var width = 100;
    if (newColumns[i].indexOf('Summary') !== -1) width = 250;
    if (newColumns[i].indexOf('Payee') !== -1) width = 150;
    if (newColumns[i].indexOf('Category') !== -1) width = 120;
    sheet.setColumnWidth(startCol + i, width);
  }

  return newColumns.length;
}

// ─── Data Validation ────────────────────────────────────────────────

function addChittyValidation_(ss) {
  // Find the CO: columns dynamically
  addDropdownToColumn_(ss, TABS.URGENT_INCOMING, 'CO: Category',
    ['billing', 'legal', 'debt_collection', 'lease', 'financial_statement', 'inquiry', 'spam', 'other']);

  addDropdownToColumn_(ss, TABS.URGENT_INCOMING, 'CO: Urgency',
    ['low', 'normal', 'high', 'critical']);

  addDropdownToColumn_(ss, TABS.URGENT_INCOMING, 'CO: Sensitivity',
    ['business', 'legalink']);

  addDropdownToColumn_(ss, TABS.URGENT_INCOMING, 'CO: Router Status',
    ['pushed', 'failed', 'skipped', 'pending']);

  addDropdownToColumn_(ss, TABS.LEAD_INCOMING, 'CO: Category',
    ['inquiry', 'lease', 'billing', 'other']);

  addDropdownToColumn_(ss, TABS.LEAD_INCOMING, 'CO: Urgency',
    ['low', 'normal', 'high']);
}

function addDropdownToColumn_(ss, tabName, headerName, values) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  var colIndex = findColumnByHeader_(sheet, headerName);
  if (colIndex < 1) return;

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(true) // Allow AI to write values not in the list
    .build();

  sheet.getRange(2, colIndex, 998, 1).setDataValidation(rule);
}

function findColumnByHeader_(sheet, headerName) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return -1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === headerName) return i + 1;
  }
  return -1;
}

// ─── Conditional Formatting ─────────────────────────────────────────

function addChittyFormatting_(ss) {
  var sheet = ss.getSheetByName(TABS.URGENT_INCOMING);
  if (!sheet) return;

  var urgencyCol = findColumnByHeader_(sheet, 'CO: Urgency');
  var sensitivityCol = findColumnByHeader_(sheet, 'CO: Sensitivity');

  if (urgencyCol > 0) {
    var urgRange = sheet.getRange(2, urgencyCol, 998, 1);
    var rules = sheet.getConditionalFormatRules();

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('critical')
      .setBackground(COLORS.DANGER).setFontColor('#fff')
      .setRanges([urgRange]).build());

    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('high')
      .setBackground(COLORS.WARNING).setFontColor('#fff')
      .setRanges([urgRange]).build());

    sheet.setConditionalFormatRules(rules);
  }

  if (sensitivityCol > 0) {
    var senRange = sheet.getRange(2, sensitivityCol, 998, 1);
    var sRules = sheet.getConditionalFormatRules();

    sRules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('legalink')
      .setBackground(COLORS.LEGAL).setFontColor('#fff')
      .setRanges([senRange]).build());

    sheet.setConditionalFormatRules(sRules);
  }
}

// ─── Settings Tab ───────────────────────────────────────────────────

function updateSettings_(ss) {
  var sheet = ss.getSheetByName(TABS.SETTINGS);
  if (!sheet) return;

  // Find an empty column to add ChittyOS dropdown values
  var lastCol = sheet.getLastColumn();
  var startCol = lastCol + 2; // Leave a gap

  sheet.getRange(1, startCol).setValue('CO: Categories')
    .setFontWeight('bold').setBackground(COLORS.HEADER_BG).setFontColor(COLORS.CHITTY_ACCENT);
  var categories = ['billing', 'legal', 'debt_collection', 'lease',
    'financial_statement', 'inquiry', 'spam', 'other'];
  for (var i = 0; i < categories.length; i++) {
    sheet.getRange(2 + i, startCol).setValue(categories[i]);
  }

  sheet.getRange(1, startCol + 1).setValue('CO: Urgency')
    .setFontWeight('bold').setBackground(COLORS.HEADER_BG).setFontColor(COLORS.CHITTY_ACCENT);
  ['low', 'normal', 'high', 'critical'].forEach(function(v, idx) {
    sheet.getRange(2 + idx, startCol + 1).setValue(v);
  });

  sheet.getRange(1, startCol + 2).setValue('CO: Sensitivity')
    .setFontWeight('bold').setBackground(COLORS.HEADER_BG).setFontColor(COLORS.CHITTY_ACCENT);
  ['business', 'legalink'].forEach(function(v, idx) {
    sheet.getRange(2 + idx, startCol + 2).setValue(v);
  });

  sheet.getRange(1, startCol + 3).setValue('CO: Services')
    .setFontWeight('bold').setBackground(COLORS.HEADER_BG).setFontColor(COLORS.CHITTY_ACCENT);
  ['chittyrouter', 'chittyagent-tasks', 'chittyagent-dispute',
   'chittyagent-finance', 'chittyevidence-db', 'workspace-studio'].forEach(function(v, idx) {
    sheet.getRange(2 + idx, startCol + 3).setValue(v);
  });
}

// ─── Dashboard Augmentation ─────────────────────────────────────────

function augmentDashboard_(ss) {
  var sheet = ss.getSheetByName(TABS.DASHBOARD);
  if (!sheet) return;

  // Find last row with content
  var lastRow = sheet.getLastRow();
  var startRow = lastRow + 3; // Leave gap

  // ChittyOS Section Header
  sheet.getRange(startRow, 1).setValue('🔷 CHITTYOS PIPELINE')
    .setFontSize(14).setFontWeight('bold').setFontColor(COLORS.CHITTY_ACCENT);
  sheet.getRange(startRow + 1, 1).setValue('Auto-updated by ChittyOS Triage Engine')
    .setFontSize(9).setFontColor(COLORS.MUTED);

  var metrics = [
    ['Urgent Incoming (total)', '=COUNTA(\'' + TABS.URGENT_INCOMING + '\'!A:A)-1'],
    ['Urgent: Critical', '=COUNTIF(\'' + TABS.URGENT_INCOMING + '\'!$1:$1000,"critical")'],
    ['Urgent: Legal (legalink)', '=COUNTIF(\'' + TABS.URGENT_INCOMING + '\'!$1:$1000,"legalink")'],
    ['Lead Incoming (total)', '=COUNTA(\'' + TABS.LEAD_INCOMING + '\'!A:A)-1'],
    ['Router Pushed', '=COUNTIF(\'' + TABS.URGENT_INCOMING + '\'!$1:$1000,"pushed")'],
    ['Router Failed', '=COUNTIF(\'' + TABS.URGENT_INCOMING + '\'!$1:$1000,"failed")'],
    ['Integration Log Entries', '=COUNTA(\'' + TABS.LOGS + '\'!A:A)-1'],
  ];

  for (var i = 0; i < metrics.length; i++) {
    var row = startRow + 3 + i;
    sheet.getRange(row, 1).setValue(metrics[i][0]).setFontWeight('bold');
    sheet.getRange(row, 2).setFormula(metrics[i][1]);
  }

  // Timestamp
  var tsRow = startRow + 3 + metrics.length + 1;
  sheet.getRange(tsRow, 1).setValue('Last ChittyOS refresh:')
    .setFontColor(COLORS.MUTED).setFontSize(9);
  sheet.getRange(tsRow, 2).setValue(new Date().toISOString())
    .setFontColor(COLORS.MUTED).setFontSize(9);
}

// ─── Data Sync: Disputes → Master: Matters ──────────────────────────

function syncDisputesToMatters() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.MATTERS);
  if (!sheet) {
    SpreadsheetApp.getActiveSpreadsheet().toast('Tab not found: ' + TABS.MATTERS, 'Error', 5);
    return;
  }

  try {
    var response = UrlFetchApp.fetch('https://dispute.chitty.cc/api/disputes?limit=100', {
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      SpreadsheetApp.getActiveSpreadsheet().toast('ChittyDispute returned ' + response.getResponseCode(), 'Sync Error', 5);
      return;
    }

    var data = JSON.parse(response.getContentText());
    var disputes = data.disputes || data.data || data;
    if (!Array.isArray(disputes) || disputes.length === 0) return;

    // Find existing IDs to avoid duplicates
    var lastRow = sheet.getLastRow();
    var existingIds = {};
    if (lastRow > 1) {
      var col1 = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      col1.forEach(function(r) { if (r[0]) existingIds[String(r[0])] = true; });
    }

    var added = 0;
    disputes.forEach(function(d) {
      var id = d.chitty_id || d.id || '';
      if (existingIds[id]) return; // Skip existing

      sheet.appendRow([
        id,
        d.title || '',
        d.dispute_type || '',
        d.status || '',
        d.severity || '',
        d.case_id || '',
        d.property_address || '',
        d.next_deadline || '',
        d.financial_amount || '',
        d.created_at || '',
        'ChittyDispute sync ' + new Date().toISOString(),
      ]);
      added++;
    });

    SpreadsheetApp.getActiveSpreadsheet().toast('Added ' + added + ' new matters from ChittyDispute', 'Sync Complete', 5);
  } catch (err) {
    Logger.log('Dispute sync error: ' + err);
    SpreadsheetApp.getActiveSpreadsheet().toast('Error: ' + err, 'Sync Error', 5);
  }
}

// ─── Data Sync: Entities → Master: Entities ─────────────────────────

function syncEntitiesToMaster() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.ENTITIES);
  if (!sheet) return;

  // Mercury entities from chittyagent-finance
  var entities = [
    { name: 'Aribia LLC', type: 'LLC', role: 'Property Management' },
    { name: 'City Studio LLC', type: 'LLC', role: 'Short-term Rentals' },
    { name: 'Apt Arlene LLC', type: 'LLC', role: 'Property Holding' },
    { name: 'Chicago Furnished Condos LLC', type: 'LLC', role: 'Furnished Rentals' },
    { name: 'IT Can Be LLC', type: 'LLC', role: 'Technology Services' },
    { name: 'Chitty Services LLC', type: 'LLC', role: 'Platform Services' },
    { name: 'Jean Arlene Venturing LLC', type: 'LLC', role: 'Investment' },
  ];

  var lastRow = sheet.getLastRow();
  var existingNames = {};
  if (lastRow > 1) {
    var col1 = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    col1.forEach(function(r) { if (r[0]) existingNames[String(r[0]).toLowerCase()] = true; });
  }

  var added = 0;
  entities.forEach(function(e) {
    if (existingNames[e.name.toLowerCase()]) return;
    sheet.appendRow([e.name, e.type, e.role, 'Mercury sync', new Date().toISOString()]);
    added++;
  });

  SpreadsheetApp.getActiveSpreadsheet().toast('Added ' + added + ' entities', 'Sync Complete', 5);
}

// ─── Integration Log ────────────────────────────────────────────────

function logIntegration_(service, operation, statusCode, details) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.LOGS);
  if (!sheet) return;

  sheet.appendRow([
    new Date().toISOString(),
    service,
    operation,
    statusCode,
    details || '',
  ]);
}

// ─── Write to Urgent Incoming ───────────────────────────────────────

/**
 * Write a classified email to the Urgent Incoming tab.
 * Called by Studio steps and gmail-preprocessor.
 */
function writeToUrgentIncoming(emailData, classification) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.URGENT_INCOMING);
  if (!sheet) return;

  // Find the CO: columns
  var catCol = findColumnByHeader_(sheet, 'CO: Category');
  if (catCol < 1) return; // ChittyOS not set up yet

  // Find existing column count (before CO: columns)
  var coCols = CHITTYOS_COLUMNS.URGENT_INCOMING;
  var baseColCount = catCol - 1; // columns before CO: start

  // Build row — pad base columns with email data, then CO: columns
  var baseRow = new Array(baseColCount).fill('');
  // Try to fill standard columns if they exist
  baseRow[0] = emailData.timestamp || new Date().toISOString();
  if (baseRow.length > 1) baseRow[1] = emailData.from || '';
  if (baseRow.length > 2) baseRow[2] = emailData.subject || '';
  if (baseRow.length > 3) baseRow[3] = (emailData.body || '').substring(0, 1000);

  // CO: columns
  var coValues = [
    classification.category || 'other',
    classification.urgency || 'normal',
    classification.confidence || '',
    classification.sensitivity || 'business',
    classification.payee || '',
    classification.amount || '',
    classification.dueDate || '',
    classification.summary || '',
    classification.routerStatus || 'pending',
    classification.classifierVia || 'gemini-ai-studio',
  ];

  var fullRow = baseRow.concat(coValues);
  sheet.appendRow(fullRow);
}

/**
 * Write a classified email to the Lead Incoming tab.
 */
function writeToLeadIncoming(emailData, classification) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TABS.LEAD_INCOMING);
  if (!sheet) return;

  var catCol = findColumnByHeader_(sheet, 'CO: Category');
  if (catCol < 1) return;

  var baseColCount = catCol - 1;
  var baseRow = new Array(baseColCount).fill('');
  baseRow[0] = emailData.timestamp || new Date().toISOString();
  if (baseRow.length > 1) baseRow[1] = emailData.from || '';
  if (baseRow.length > 2) baseRow[2] = emailData.subject || '';
  if (baseRow.length > 3) baseRow[3] = (emailData.body || '').substring(0, 1000);

  var coValues = [
    classification.category || 'inquiry',
    classification.urgency || 'normal',
    classification.confidence || '',
    classification.summary || '',
    classification.channel || 'workspace-studio-gmail',
    classification.classifierVia || 'gemini-ai-studio',
  ];

  sheet.appendRow(baseRow.concat(coValues));
}

// ─── Triggers ───────────────────────────────────────────────────────

function installChittyTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var toRemove = ['syncDisputesToMatters', 'syncEntitiesToMaster'];
  for (var i = 0; i < triggers.length; i++) {
    if (toRemove.indexOf(triggers[i].getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Sync disputes every 6 hours
  ScriptApp.newTrigger('syncDisputesToMatters').timeBased().everyHours(6).create();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Triggers installed: Dispute sync (6h)',
    'Triggers Set', 5
  );
}

// ─── Menu ───────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🔷 ChittyOS')
    .addItem('🛠️ Setup ChittyOS Columns', 'setupChittyOS')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('🔄 Sync')
      .addItem('⚖️ Disputes → Master: Matters', 'syncDisputesToMatters')
      .addItem('🏢 Entities → Master: Entities', 'syncEntitiesToMaster')
      .addItem('📊 Refresh Dashboard', 'refreshChittyDashboard'))
    .addSeparator()
    .addItem('⏰ Install Triggers', 'installChittyTriggers')
    .addItem('⚙️ Setup Guide', 'showSetup')
    .addToUi();
}

function refreshChittyDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  augmentDashboard_(ss);
  SpreadsheetApp.getActiveSpreadsheet().toast('Dashboard refreshed', '📊', 3);
}

function showSetup() {
  var html = HtmlService.createHtmlOutput(
    '<div style="font-family:Roboto,sans-serif; padding:8px;">' +
    '<h3>🔷 ChittyOS Triage Engine</h3>' +
    '<p>Augments your existing sheets with AI classification columns.</p>' +
    '<h4>What Setup Does</h4>' +
    '<ul>' +
    '<li>Adds <code>CO:</code> columns to <b>Urgent Incoming</b> (10 cols)</li>' +
    '<li>Adds <code>CO:</code> columns to <b>Lead Incoming</b> (6 cols)</li>' +
    '<li>Adds <code>CO:</code> columns to <b>Integration Logs</b> (5 cols)</li>' +
    '<li>Adds dropdown values to <b>Settings / Dropdown Lists</b></li>' +
    '<li>Adds pipeline metrics to <b>Metrics / Dashboard</b></li>' +
    '<li>Adds conditional formatting (critical=red, legalink=purple)</li>' +
    '</ul>' +
    '<h4>Tab Mapping</h4>' +
    '<table style="font-size:11px; border-collapse:collapse; width:100%;">' +
    '<tr style="background:#1a1a2e; color:#e94560;"><th style="padding:4px;">Your Tab</th><th style="padding:4px;">ChittyOS Source</th></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Urgent Incoming</td><td style="padding:4px; border:1px solid #ddd;">Gmail Preprocessor (urgent/legal)</td></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Lead Incoming</td><td style="padding:4px; border:1px solid #ddd;">Gmail Preprocessor (inquiries)</td></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Master: Matters</td><td style="padding:4px; border:1px solid #ddd;">ChittyDispute API sync</td></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Master: Entities</td><td style="padding:4px; border:1px solid #ddd;">Mercury entity sync</td></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Integration Logs</td><td style="padding:4px; border:1px solid #ddd;">All ChittyOS sync events</td></tr>' +
    '<tr><td style="padding:4px; border:1px solid #ddd;">Metrics / Dashboard</td><td style="padding:4px; border:1px solid #ddd;">Pipeline aggregate formulas</td></tr>' +
    '</table>' +
    '<h4>Script Properties Needed</h4>' +
    '<p><code>GEMINI_API_KEY</code>, <code>CHITTYROUTER_URL</code>, <code>CHITTYROUTER_TOKEN</code></p>' +
    '</div>'
  ).setWidth(480).setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, 'ChittyOS Setup Guide');
}
