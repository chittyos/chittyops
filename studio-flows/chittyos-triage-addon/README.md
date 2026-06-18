# ChittyOS Workspace Studio Steps

Native drag-and-drop workflow elements for [Google Workspace Studio](https://workspace.google.com/studio/)
that wire the ChittyOS triage pipeline directly into Gmail event flows.

> **Event-driven, not poll-based.** When Gmail receives an email, Studio
> fires the trigger instantly — no 15-minute cron scan.

## Architecture

```
Gmail: "When email received"  (Studio trigger)
  │
  ▼
┌───────────────────────────────────┐
│ Step 1: Gemini Classify           │  ← Google AI Studio (free tier)
│   onExecuteGeminiClassify()       │
│   → category, payee, amount, etc. │
└────────────┬──────────────────────┘
             │ outputs flow downstream
             ▼
┌───────────────────────────────────┐
│ Step 2: Router Push               │  ← ChittyRouter POST /process
│   onExecuteRouterPush()           │     (5-model AI chain)
│   → routerCategory, urgencyScore  │     auto-forwards disputes
└────────────┬──────────────────────┘
             │
        ┌────┴────┐
        ▼         ▼
┌──────────────┐ ┌───────────────────┐
│ Step 3:      │ │ Step 4:           │
│ Triage       │ │ Sheet Log         │
│ Ingest       │ │   → Triage Sheet  │
│   → Neon     │ │   columns A–L     │
│   cc_obligs  │ │   human review    │
└──────────────┘ └───────────────────┘
```

## Manifest Format

Uses the official `addOns.flows.workflowElements` structure per
[Workspace Add-ons docs](https://developers.google.com/workspace/add-ons/studio):

```json
{
  "addOns": {
    "common": { "name": "ChittyOS Triage Engine" },
    "flows": {
      "workflowElements": [{
        "id": "chittyGeminiClassify",
        "name": "ChittyOS: Gemini Classify",
        "onConfigFunction": "onConfigGeminiClassify",
        "onExecuteFunction": "onExecuteGeminiClassify",
        "workflowAction": {
          "inputs": [
            {"id": "emailBody", "dataType": {"basicType": "STRING"}}
          ],
          "outputs": [
            {"id": "category", "description": "billing|legal|..."}
          ]
        }
      }]
    }
  }
}
```

Each element defines:
- **`onConfigFunction`** — Returns a `CardService` card for the Studio UI configuration panel
- **`onExecuteFunction`** — Runs the step logic when the flow fires
- **`workflowAction.inputs`** — Variables the user maps from upstream steps/triggers
- **`workflowAction.outputs`** — Variables available to downstream steps

## Steps

### 1. ChittyOS: Gemini Classify

| | |
|---|---|
| Config | `onConfigGeminiClassify` |
| Execute | `onExecuteGeminiClassify` |
| AI | Gemini 2.0 Flash (free tier) |
| Fallback | Deterministic keyword matching |

**Inputs**: `emailBody`, `emailSubject`, `emailFrom`
**Outputs**: `category`, `payee`, `amount`, `dueDate`, `urgency`, `isLegal`, `isActionable`, `sensitivity`, `confidence`, `summary`

### 2. ChittyOS: Router Push

| | |
|---|---|
| Config | `onConfigRouterPush` |
| Execute | `onExecuteRouterPush` |
| Calls | ChittyRouter `POST /process` |
| Side Effect | Auto-forwards disputes to `dispute.chitty.cc` |

**Inputs**: `emailBody`, `emailSubject`, `emailFrom`, `category`, `isLegal`
**Outputs**: `routerCategory`, `routerPriority`, `urgencyScore`, `caseRelated`, `routingRecommendation`, `reasoning`

### 3. ChittyOS: Triage Ingest

| | |
|---|---|
| Config | `onConfigTriageIngest` |
| Execute | `onExecuteTriageIngest` |
| Calls | chittyagent-tasks `POST /api/v1/ingest` |
| Triggers | NeonIngestionWorkflow → cc_obligations → runTriage() |

**Inputs**: `emailBody`, `emailFrom`, `category`, `urgency`, `sensitivity`, `routerCategory`
**Outputs**: `action`, `routedTo`, `disputeCreated`, `statusCode`

### 4. ChittyOS: Log to Triage Sheet

| | |
|---|---|
| Config | `onConfigSheetLog` |
| Execute | `onExecuteSheetLog` |
| Action | Appends row to Triage Google Sheet (columns A–L) |

**Inputs**: `emailBody`, `emailSubject`, `emailFrom`, `category`, `urgency`, `confidence`, `sensitivity`, `payee`, `amount`, `dueDate`, `summary`
**Outputs**: `action`, `rowNumber`

## Example Flows

### Flow A: Full Pipeline
```
Gmail trigger → Gemini Classify → Router Push → Triage Ingest
```
- All emails classified + routed + ingested automatically
- Disputes auto-forwarded by ChittyRouter

### Flow B: Human-in-Loop
```
Gmail trigger → Gemini Classify → Sheet Log
```
- Classified emails logged to sheet with "Pending" status
- Operator reviews, marks Approved → existing `pushTriagedMessages()` syncs

### Flow C: Conditional (legal fast-track)
```
Gmail trigger → Gemini Classify
  → Condition: isLegal == "true"
    → YES: Router Push (auto-forwards to ChittyDispute)
    → NO:  Sheet Log (human review)
```

## Deployment

```bash
cd studio-flows/chittyos-triage-addon

# This project is container-bound to spreadsheet 1eGah6rT5oKbQmKkI5FvpkudhlpZOKgwB3FrOJQhRIvI
# Clone the .clasp.json from .clasp.json.example and set your scriptId

# Push code + manifest
clasp push

# Open in browser to configure
clasp open
```

### Script Properties (set in Apps Script → Project Settings)

| Property | Value | Required |
|----------|-------|:---:|
| `GEMINI_API_KEY` | From [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | ✅ |
| `CHITTYROUTER_URL` | `https://router.chitty.cc` | ✅ |
| `CHITTYROUTER_TOKEN` | `scrape:service_token` value | ✅ |
| `TASKS_API_URL` | `https://tasks.agent.chitty.cc/api/v1/ingest` | ✅ |
| `TASKS_API_TOKEN` | Bearer token for chittyagent-tasks | ✅ |
| `TRIAGE_SHEET_ID` | Spreadsheet ID for the triage sheet | ✅ |

### Activate in Studio

1. Open [Google Workspace Studio](https://workspace.google.com/studio/)
2. **Create Flow** → Gmail: "When an email is received"
3. **Add Step** (+) → find **"ChittyOS: Gemini Classify"** in your catalog
4. Map Gmail variables: `Body → emailBody`, `Subject → emailSubject`, `From → emailFrom`
5. Chain: **Router Push** → **Triage Ingest** or **Sheet Log**
6. Use output variables in conditions (e.g., `isLegal`, `urgency`, `category`)

## Relationship to Other Apps Script Projects

| Project | Trigger Mode | Use Case |
|---------|-------------|----------|
| **chittyos-studio/** (this) | Event-driven (Studio) | Production: instant Gmail → pipeline |
| **gmail-preprocessor/** | Cron (every 15 min) | Fallback: batch scanning when Studio unavailable |
| **message-triage/** | On-demand (menu + hourly) | iMessage + manual sheet triage |

The Studio project is the **primary deployment target**. The preprocessor
serves as a fallback for environments where Studio isn't available.
