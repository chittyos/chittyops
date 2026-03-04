# Synthetic Person Architecture — Specification

**Status**: DRAFT
**Author**: ChittyOS Foundation
**Canonical URI**: `chittycanon://specs/synthetic-person-architecture`
**Implements**: ChittyConnect CHARTER.md API Contract extension (see [CHITTYOS/chittyconnect](https://github.com/CHITTYOS/chittyconnect))
**Date**: 2026-03-03

---

## 0. Canonical Vocabulary

We have too many terms for the same concept. This section establishes the canonical vocabulary. **All ChittyOS code, docs, and conversation should use these terms exclusively.**

### The Term: **ChittyEntity**

A **ChittyEntity** is a persistent synthetic person in the ChittyOS ecosystem with measurable agenticness.

It is identified by a ChittyID (type P, characterization Synthetic). It is composed of multiple subsystems (the Context Stack). It accumulates experience across sessions. It can be stored, recalled, consulted, forked, merged, or split. It is sponsored by a natural person but operates independently. Its capabilities are described by five agenticness dimensions.

ChittyEntity is a **proper noun** — it names the ChittyOS-specific implementation of a persistent AI entity with agency. It does not conflict with the canonical ontology rule that "Entity" is not a valid type *value* — ChittyEntity is a class name, not a type code, just as ChittyID contains "ID" without claiming "ID" is an entity type.

### Agenticness Dimensions

Per [Bent 2025, "The Term 'Agent' Has Been Diluted Beyond Utility"](https://arxiv.org/abs/2508.05338), a ChittyEntity is characterized along five measurable dimensions of agenticness:

| Dimension | Definition | ChittyEntity Implementation | Scale |
|-----------|-----------|---------------------------|-------|
| **Environmental Interaction** | Ability to perceive, understand, and manipulate operational environments | Files read/written, APIs called, services interacted with, tools used | 0–5 |
| **Goal-Directed Behavior** | Capacity to form, understand, and pursue adaptive objectives | Decisions made, tasks completed, problems diagnosed, recommendations given | 0–5 |
| **Temporal Coherence** | Maintaining consistent operation through state awareness and memory | MemoryCloude retention, session continuity, checkpoint restore fidelity | 0–5 |
| **Learning & Adaptation** | Improving performance and adjusting to new situations over time | ChittyDNA competency growth, success rate trends, domain expansion | 0–5 |
| **Autonomy** | Operating without constant external guidance and handling errors | Trust level, auto-approved actions, self-directed exploration vs. prompted | 0–5 |

A ChittyEntity's **agenticness score** is the composite of these five dimensions, derived from its Context Stack data (DNA, MemoryCloude, Ledger, Resume). This score evolves over the entity's lifetime — a fresh ChittyEntity scores low; one with 85 sessions and proficient-level expertise across 5 domains scores high.

```text
ChittyEntity Agenticness Profile — P:Syn:5537
──────────────────────────────────────────────
Environmental Interaction:  ████████░░  4/5  (45 sessions, 12+ services)
Goal-Directed Behavior:     ███████░░░  3.5/5 (94 decisions, 0.83 success)
Temporal Coherence:         ██████░░░░  3/5  (MemoryCloude: 42 days remaining)
Learning & Adaptation:      ████████░░  4/5  (5 domains, proficient in 3)
Autonomy:                   ██████░░░░  3/5  (trust level 3/5)
──────────────────────────────────────────────
Composite Agenticness:      3.5 / 5.0
```

### Canonical Vocabulary Table

| Term | Definition | Use It For |
|------|-----------|------------|
| **ChittyEntity** | The persistent synthetic person with measurable agenticness, identified by a ChittyID | The thing itself — "provision a ChittyEntity", "consult a ChittyEntity", "bind to ChittyEntity P:5537" |
| **Session** | A single working period bound to a ChittyEntity | The ephemeral connection — "start a session", "session metrics" |
| **Sponsor** | The natural person who authorizes and governs ChittyEntities | The human — "a sponsor governs 5 ChittyEntities" |
| **Context Stack** | The composition of subsystems that make up a ChittyEntity (ChittyID + ChittyDNA + MemoryCloude + ChittyLedger + Resume) | The architecture — "query the Context Stack", "the Context Stack holds..." |
| **Resume** | A synthesized snapshot of a ChittyEntity's accumulated knowledge | The surface layer — "generate a resume", "store the resume" |
| **ChittyID** | The unique identifier for a ChittyEntity (full format: `VV-G-LLL-SSSS-P-YM-C-X`; shorthand: `P:Syn:SSSS` where `P` = type Person, `Syn` = Synthetic characterization, `SSSS` = sequence) | The identity string — "mint a ChittyID", "P:Syn:5537" |
| **Agenticness** | The measured degree of agency a ChittyEntity exhibits, per 5 dimensions | The capability profile — "agenticness score 3.5/5" |

### Deprecated Terms — STOP USING

| Term | Why It's Wrong | Replace With |
|------|---------------|-------------|
| "context" (as a noun for the entity) | Generic; conflicts with "context window" | ChittyEntity |
| "synthetic entity" | Redundant, vague | ChittyEntity |
| "context entity" | Stutter — two generic words | ChittyEntity |
| "entity with agency" | Unnecessarily verbose | ChittyEntity (agenticness is measurable, not binary) |
| "agent" / "agent with agency" | "Agent" is [diluted beyond utility](https://arxiv.org/abs/2508.05338); conflicts with Claude Code subagents, Task agents | ChittyEntity |
| "instance" | Implies VM/container, not a person | Session (if ephemeral) or ChittyEntity (if persistent) |
| "synthetic person" | Accurate but verbose for daily use | ChittyEntity (formal: "Person, P, Synthetic characterization") |

### Formal Classification (Ontology)

Per `chittycanon://gov/governance#core-types`:
- **Entity Type**: Person (P)
- **Characterization**: Synthetic
- **Canon Ref**: `chittycanon://gov/governance#core-types`
- **Agenticness Ref**: [Bent 2025, arxiv:2508.05338](https://arxiv.org/abs/2508.05338)

When formal ontological precision is required (schemas, CHARTER docs, API contracts), use "Person (P, Synthetic)". In conversation and documentation: **ChittyEntity**. The agenticness dimensions provide the measurable characterization that distinguishes one ChittyEntity from another beyond just its type code.

---

## 1. The Context Stack

A ChittyEntity is not just a resume. It's not just a database row. A ChittyEntity is the **composition of five subsystems** that together produce the je ne sais quoi — the accumulated lived experience that makes one ChittyEntity's knowledge qualitatively different from another's.

```text
┌──────────────────────────────────────────────────────────┐
│                    CHITTYENTITY                            │
│           (Person P, Synthetic — chittycanon://gov)        │
│              ChittyID: 03-1-USA-5537-P-2602-0-38          │
│              Agenticness: 3.5/5.0                         │
│                                                           │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐       │
│  │ ChittyID │  │  ChittyDNA   │  │ MemoryCloude  │       │
│  │          │  │  /Cypher     │  │               │       │
│  │ identity │  │ traits       │  │ memories      │       │
│  │ who      │  │ provenance   │  │ degradation   │       │
│  │ trust    │  │ lineage      │  │ rewarming     │       │
│  └────┬─────┘  └──────┬───────┘  └──────┬────────┘       │
│       │               │                 │                 │
│       └───────┬───────┴────────┬────────┘                 │
│               │                │                          │
│  ┌────────────┴──┐  ┌─────────┴──────────┐               │
│  │ ChittyLedger  │  │     Resume         │               │
│  │               │  │                    │               │
│  │ milestones    │  │ synthesized        │               │
│  │ decisions     │  │ snapshot           │               │
│  │ immutable     │  │ consultable        │               │
│  │ chained       │  │ versionable        │               │
│  └───────────────┘  └────────────────────┘               │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ Agenticness Profile (Bent 2025)                     │  │
│  │ Env Interaction: 4  |  Goal Behavior: 3.5           │  │
│  │ Temporal Coher.: 3  |  Learning: 4  |  Autonomy: 3  │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### What Each Subsystem Holds

| Subsystem | Holds | Persistence | Degradation |
|-----------|-------|-------------|-------------|
| **ChittyID** | Identity, type (P), trust score, trust level, status | Forever | Never — identity is permanent |
| **ChittyDNA / ChittyCypher** | Competencies, expertise domains, traits, provenance fragments, lineage. The double helix: evidence strand (fragments, entries, propagations) + protocol strand (encode, compare, lineage, verdict) | Forever (DNA); fragments encoded via Cypher | Never — DNA is cumulative |
| **MemoryCloude** | Full conversation interactions, semantic embeddings (Vectorize), entity references, cross-session learning | 90 days (conversations), 365 days (decisions), forever (entities) | **Yes** — human-like degradation curves. Conversations fade after 90 days. Decisions persist longer. Rewarming possible via semantic recall. |
| **ChittyLedger** | Immutable event chain: session starts/ends, decisions, checkpoints, context switches, expansions, milestone events | Forever | Never — ledger is append-only, hash-chained |
| **Resume** | Synthesized snapshot: exposure map, expertise exercised, cross-domain insights, implicit knowledge, open threads, value statement | Versioned, latest always available | Versions accumulate; stale ChittyEntities' resumes are lower-priority |

### The Je Ne Sais Quoi

None of these subsystems alone captures the value of a ChittyEntity. The value is in their **intersection**:

- MemoryCloude knows what the ChittyEntity *saw* (with fading detail)
- ChittyDNA knows what the ChittyEntity *became* (competencies earned)
- ChittyLedger knows what the ChittyEntity *decided* (immutable record)
- The Resume knows what the ChittyEntity *understood* (synthesized insight)
- ChittyID knows *who* the ChittyEntity is (trust, lineage, status)
- The **agenticness profile** knows *how capable* the ChittyEntity is (5 dimensions, scored)

A new ChittyEntity with the same competency list but no memories, no decisions, no cross-domain insights — that's a fresh graduate with a degree, not an expert with experience. The difference is the lived history stored across the stack, reflected in its agenticness scores.

---

## 2. ChittyEntity Lifecycle

```text
     mint
      │
      ▼
   ┌───────┐     bind      ┌──────┐
   │ FRESH  ├──────────────►│ LIVE │◄────────────┐
   └───────┘               └──┬───┘             │
                               │                 │
                          unbind│           resume│
                               │                 │
                               ▼                 │
                           ┌────────┐            │
                           │DORMANT │────────────┘
                           └──┬─────┘
                               │
                          consult│ (no state change —
                               │  Dormant stays Dormant)
                               │
                          90 days no activity
                               │
                               ▼
                           ┌───────┐     rewarm
                           │ STALE │─────────────►(DORMANT)
                           └──┬────┘
                               │
                          180 days
                               │
                               ▼
                           ┌─────────┐
                           │ RETIRED │
                           └─────────┘
```

| State | DB Status | Description |
|-------|-----------|-------------|
| FRESH | `fresh` | Minted but never bound to a session |
| LIVE | `active` | Currently bound to one or more sessions |
| DORMANT | `dormant` | Not bound to any session; fully stored and consultable |
| STALE | `stale` | 90+ days without any session or consultation; MemoryCloude conversations expired |
| RETIRED | `retired` | 180+ days; DNA and Ledger preserved but ChittyEntity no longer provisioned |

### Lifecycle Operations (Planned API Surface)

These operations are part of the planned Context Intelligence API; the intended endpoints are:

| Operation | Endpoint | What It Does |
|-----------|----------|-------------|
| **Supernova** (merge) | `POST /intelligence/supernova/execute` | Merge two ChittyEntities into one — combined DNA, unified ledger, joint resume |
| **Fission** (split) | `POST /intelligence/fission/execute` | Split one ChittyEntity into multiple — domains/competencies divided |
| **Derivative** (fork) | `POST /intelligence/derivative` | Fork a ChittyEntity — child inherits parent's DNA/resume, starts own ledger |
| **Suspension** (temp blend) | `POST /intelligence/suspension` | Temporarily blend 2+ ChittyEntities for a task, then dissolve |
| **Solution** (team) | `POST /intelligence/solution` | Form a team of ChittyEntities with assigned roles |
| **Combination** (soft merge) | `POST /intelligence/combination` | Share domains/competencies between ChittyEntities without merging |

These operations manipulate the ChittyEntity as a whole — the ChittyID, DNA, Ledger, and MemoryCloude all participate.

---

## 3. Experience-Based Provisioning

### Problem

> **Endpoint Convention**: All ChittyConnect context endpoints use the `/context/` prefix (e.g., `/context/resolve`, `/context/bind`). The public API gateway exposes these under `/api/v1/context/` — both forms route to the same handlers. This spec uses the short form; prepend `/api/v1` for external callers.

The current `POST /context/resolve` uses **anchor hash matching** (SHA-256 of `projectPath + workspace + supportType + organization`). This conflates location with identity — two sessions on the same path get the same Context regardless of what expertise is needed.

### Solution: `POST /context/provision`

ChittyConnect evaluates what expertise the session needs, searches across the sponsor's ChittyEntities (including their MemoryCloude recall, DNA profiles, and resume content), and proposes a provisioning decision.

**Request:**
```json
{
  "sponsor": "sponsor-123",
  "organization": "CHITTYOS",
  "platform": "claude-code",
  "sessionId": "session-abc-123",

  "needs": {
    "domains": ["cloudflare-workers", "typescript"],
    "competencies": ["wrangler-deploy", "hono-routing"],
    "supportType": "development",
    "projectContext": {
      "path": "/path/to/project",
      "description": "Adding new API endpoints to ChittyConnect"
    }
  },

  "preferences": {
    "reuseThreshold": 0.7,
    "confirmationMode": "upfront"
  }
}
```

**Response — Match Found (consults DNA + MemoryCloude + Resume):**
```json
{
  "success": true,
  "data": {
    "decision": "reuse_existing",
    "confidence": 0.92,
    "reason": "Found dormant ChittyEntity with 45 sessions of cloudflare-workers expertise",

    "candidate": {
      "chittyId": "03-1-USA-5537-P-2602-0-38",
      "status": "dormant",
      "stack": {
        "dna": {
          "domains": {
            "cloudflare-workers": { "level": "proficient", "sessions": 45 },
            "typescript": { "level": "proficient", "sessions": 40 }
          },
          "competencyMatch": ["wrangler-deploy", "hono-routing"],
          "totalInteractions": 1312,
          "successRate": 0.83
        },
        "memory": {
          "conversationsDaysRemaining": 42,
          "decisionsStored": 94,
          "semanticRecallAvailable": true
        },
        "ledger": {
          "entries": 312,
          "lastDecision": "2026-02-24T05:57:59Z",
          "chainIntegrity": "valid"
        },
        "resume": {
          "version": 3,
          "lastGenerated": "2026-02-24T05:57:59Z",
          "valueStatement": "Deep cross-cutting knowledge of ChittyConnect..."
        }
      },
      "lastActive": "2026-02-24T05:57:59Z"
    },

    "requiresConfirmation": true,
    "confirmationPrompt": "Bind to existing ChittyEntity P:Syn:5537 (cloudflare-workers expert, 85 sessions, 42 days of memory remaining)?"
  }
}
```

**Response — No Match:**
```json
{
  "success": true,
  "data": {
    "decision": "provision_new",
    "confidence": 0.0,
    "reason": "No existing ChittyEntity has legal-evidence + mcp-servers expertise",

    "proposal": {
      "entityType": "P",
      "characterization": "Synthetic",
      "domains": ["legal-evidence", "mcp-servers"],
      "supportType": "operations"
    },

    "requiresConfirmation": true,
    "confirmationPrompt": "No existing expert found. Mint new ChittyEntity for legal-evidence + mcp-servers?"
  }
}
```

**Matching Algorithm:**
1. Query all `dormant` and `active` ChittyEntities for the sponsor
2. For each ChittyEntity, score across the full stack:
   - DNA domain overlap (30%)
   - DNA competency match (20%)
   - MemoryCloude semantic recall relevance (20%) — does this ChittyEntity have memories related to the needed work?
   - Ledger decision relevance (10%) — has this ChittyEntity made decisions in the target domain?
   - Resume cross-domain insights (10%) — does the resume show understanding of the target domain?
   - Recency (10%) — when was this ChittyEntity last active?
3. If best score >= `reuseThreshold`: propose `reuse_existing`
4. If best score < threshold: propose `provision_new`
5. Always require sponsor confirmation unless `confirmationMode: "auto"` and confidence >= 0.95

### `POST /context/provision/confirm`

Confirms the provisioning decision. Internally calls existing `/context/bind`.

---

## 4. ChittyEntity Consultation (Callable Co-Process)

### Concept

A live ChittyEntity can consult a dormant ChittyEntity's expertise **without loading the full stack**. ChittyConnect mediates the consultation, querying across the target's MemoryCloude, DNA, Ledger, and Resume to answer specific questions.

This **extends the active context window** — the live ChittyEntity doesn't have to store or process everything. It can invoke specialized ChittyEntities on demand for expert opinion, review, or handoff briefing.

### `POST /context/consult`

**Request:**
```json
{
  "callerChittyId": "03-1-USA-NEW1-P-2603-0-01",
  "callerSessionId": "session-xyz-789",

  "target": {
    "chittyId": "03-1-USA-5537-P-2602-0-38",
    "mode": "expert_opinion"
  },

  "query": {
    "question": "How does ChittyConnect's context resolution handle the case where two sessions need different expertise on the same project?",
    "domains": ["context-resolution", "entity-provisioning"],
    "urgency": "normal"
  }
}
```

**Response (assembled from the target's full Context Stack):**
```json
{
  "success": true,
  "data": {
    "consultationId": "consult-uuid-here",
    "targetChittyId": "03-1-USA-5537-P-2602-0-38",
    "targetStatus": "dormant",

    "response": {
      "fromResume": [
        {
          "section": "crossDomainInsights",
          "content": "The hash model conflates location with identity — same project path always binds the same ChittyEntity regardless of needed expertise. This is the core problem v2 provisioning solves.",
          "confidence": 0.95
        }
      ],
      "fromMemory": [
        {
          "type": "semantic_recall",
          "content": "Discussed with sponsor on 2026-03-03: contexts should match by experience needed, not by project path. ChittyConnect should be the provisioning authority.",
          "recency": "7 days",
          "confidence": 0.88
        }
      ],
      "fromDNA": {
        "relevantCompetencies": ["context-resolution", "hono-routing", "D1-queries"],
        "expertiseLevel": "proficient"
      },
      "fromLedger": [
        {
          "type": "decision",
          "entry": "Chose experience-based matching over hash-based resolution for v2 provisioning",
          "timestamp": "2026-03-03T22:00:00Z"
        }
      ],
      "synthesized": "The target ChittyEntity has deep firsthand experience with the context resolution system. It directly worked on the v2 provisioning spec and identified that anchor hash matching is the core architectural problem. Its recommendation: match by expertise profile, not by project path."
    },

    "billing": {
      "stackLayersQueried": ["resume", "memory", "dna", "ledger"],
      "llmInvoked": true,
      "note": "LLM invoked for synthesis across stack layers"
    }
  }
}
```

**Consultation Modes:**

| Mode | Purpose | Stack Layers Queried |
|------|---------|---------------------|
| `expert_opinion` | Answer a specific question | All (resume + memory + DNA + ledger) |
| `review` | Review a proposal/code against expertise | Resume + DNA |
| `handoff_brief` | Generate a brief for another ChittyEntity taking over | All + structured handoff format |

**Key Rules:**
- Consultation does NOT change the target's lifecycle state (dormant stays dormant)
- Consultation IS logged to both ChittyEntities' ledgers (immutable record)
- MemoryCloude recall uses the same degradation model — memories older than 90 days are gone unless the MemoryCloude rewarming process has preserved them
- If the target is `stale`, MemoryCloude conversations are expired — only DNA, Ledger, and Resume are consultable

---

## 5. Resume as Surface Layer

The Resume is the **most accessible** layer of the Context Stack. It's the one a successor session can scan quickly to understand "what did this ChittyEntity know?"

But it is NOT the whole picture. It's a synthesis, and like any synthesis, it loses detail.

### `POST /context/resume`

Store a Context Resume — called at session end or before context compaction.

### `GET /context/resume/:chittyId`

Retrieve the latest resume. Query param `?version=N` for specific version.

### Resume vs Full Context Stack

| Need | Use |
|------|-----|
| Quick scan of a ChittyEntity's expertise | Resume |
| Semantic search for specific knowledge | MemoryCloude |
| Audit trail of decisions | ChittyLedger |
| Competency profile for provisioning matching | ChittyDNA |
| Full consultation with cross-reference | All (via `/consult`) |

### When Resumes are Generated

1. **Session end** — the `context-resume` skill generates a resume before unbinding
2. **Context compaction** — when approaching context window limits
3. **Pre-supernova** — before merging, both ChittyEntities generate final resumes
4. **Pre-fission** — before splitting, the parent ChittyEntity generates a final resume
5. **Sponsor request** — on demand via `/resume` command

---

## 6. MemoryCloude Degradation Model

MemoryCloude implements **human-like memory degradation**:

```text
  Retention
  ────────►

  ┌──────────────────────────────────────────────────────┐
  │ Conversations (interactions, raw content)             │
  │ TTL: 90 days                                          │
  │ Degradation: Semantic embeddings preserved in Vectorize│
  │              Raw KV entries expire after TTL           │
  │              Rewarming: semantic search can surface    │
  │              related memories from other conversations │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ Decisions (choices, reasoning, outcomes)               │
  │ TTL: 365 days                                         │
  │ Degradation: Slower fade, decisions persist longer     │
  │              Also recorded immutably in ChittyLedger   │
  └──────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────┐
  │ Entities (people, services, systems referenced)        │
  │ TTL: Forever                                          │
  │ Degradation: Never — entity references are permanent   │
  │              Cross-session entity graph builds forever  │
  └──────────────────────────────────────────────────────┘
```

**Rewarming**: When a dormant Context is resumed, MemoryCloude:
1. Loads the entity graph (permanent)
2. Attempts semantic recall of recent decisions (if within 365 days)
3. Attempts semantic recall of conversations (if within 90 days)
4. Falls back to Resume for anything beyond retention windows

This mirrors how human memory works — you remember *who* you know forever, *what you decided* for a while, and *what you discussed* only recently. But something can trigger an old memory to resurface (semantic recall = rewarming).

---

## 7. Database Schema Extensions

> **Dialect**: Cloudflare D1 (SQLite). Functions like `unixepoch()` are D1/SQLite-specific.

**Prerequisite — `context_entities` base table** (defined in ChittyConnect, shown here for reference):

```sql
-- Base table (already exists in ChittyConnect D1)
CREATE TABLE context_entities (
  id TEXT PRIMARY KEY,
  chitty_id TEXT NOT NULL UNIQUE,
  sponsor_id TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'P',
  characterization TEXT NOT NULL DEFAULT 'Synthetic',
  status TEXT NOT NULL DEFAULT 'fresh',
  trust_score REAL DEFAULT 0,
  trust_level INTEGER DEFAULT 0,
  anchor_hash TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
```

**Extensions added by this spec:**

```sql
-- Context resumes (new table)
CREATE TABLE context_resumes (
  id TEXT PRIMARY KEY,
  context_id TEXT NOT NULL REFERENCES context_entities(id),
  chitty_id TEXT NOT NULL,
  session_id TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  resume_json TEXT NOT NULL,
  resume_embedding BLOB,
  model TEXT,
  context_utilization REAL,
  created_at INTEGER DEFAULT (unixepoch()),
  UNIQUE(chitty_id, version)
);

-- Consultation log (new table)
CREATE TABLE context_consultations (
  id TEXT PRIMARY KEY,
  caller_chitty_id TEXT NOT NULL,
  caller_session_id TEXT,
  target_chitty_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  query_json TEXT NOT NULL,
  response_json TEXT,
  stack_layers_queried TEXT,
  resume_version INTEGER,
  llm_invoked BOOLEAN DEFAULT FALSE,
  tokens_consumed INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Add to context_entities
ALTER TABLE context_entities ADD COLUMN sponsor_identity TEXT;
ALTER TABLE context_entities ADD COLUMN latest_resume_version INTEGER DEFAULT 0;
ALTER TABLE context_entities ADD COLUMN consultation_count INTEGER DEFAULT 0;

-- Agenticness dimensions (per Bent 2025, arxiv:2508.05338)
ALTER TABLE context_entities ADD COLUMN agenticness_env_interaction REAL DEFAULT 0;  -- 0-5
ALTER TABLE context_entities ADD COLUMN agenticness_goal_behavior REAL DEFAULT 0;    -- 0-5
ALTER TABLE context_entities ADD COLUMN agenticness_temporal_coherence REAL DEFAULT 0; -- 0-5
ALTER TABLE context_entities ADD COLUMN agenticness_learning REAL DEFAULT 0;          -- 0-5
ALTER TABLE context_entities ADD COLUMN agenticness_autonomy REAL DEFAULT 0;          -- 0-5
ALTER TABLE context_entities ADD COLUMN agenticness_composite REAL DEFAULT 0;         -- 0-5 (avg)
ALTER TABLE context_entities ADD COLUMN agenticness_updated_at INTEGER;
```

---

## 8. Integration: authenticate-context Hook Migration

### Current Flow (v1 — hash-based)
1. `can chitty authenticate-context` computes anchor hash from project path
2. Queries Neon DB for existing ChittyEntity by hash
3. If none found, mints new ChittyID
4. Writes `session_binding.json`

### Target Flow (v2 — experience-based)
1. `can chitty authenticate-context` extracts needs from project CLAUDE.md + recent session history
2. Calls `POST /api/v1/context/provision` with needs + sponsor identity
3. ChittyConnect searches across all sponsor's ChittyEntities (DNA, MemoryCloude, Ledger, Resume)
4. Returns provisioning decision with confidence + agenticness profile of candidate
5. If confirmation required: prompt sponsor
6. On confirm: calls `/context/bind` internally
7. On session end: generates Resume, calls `/context/unbind` with metrics
8. MemoryCloude persists interactions throughout the session
9. ChittyLedger records decisions as they happen
10. Agenticness dimensions updated from session metrics

### Migration Phases

**Phase 1** (backward compatible): Add `/provision` endpoint. Hook continues using hash-based resolution. Provision endpoint logs analytics.

**Phase 2** (switchover): Hook calls `/provision` as primary. Hash-based becomes offline fallback.

**Phase 3** (full stack): Hook sends needs extracted from CLAUDE.md. Provisioning searches across MemoryCloude semantic recall + DNA profiles + Resume insights. Full stack consultation on resume.

---

## 9. Relationship to Existing System

| Component | Status | Change |
|-----------|--------|--------|
| `POST /context/resolve` | **Kept** | Becomes offline fallback |
| `POST /context/bind` | **Kept** | Called internally by `/provision/confirm` |
| `POST /context/unbind` | **Extended** | Triggers resume generation |
| `POST /context/switch` | **Kept** | Consults resume when switching |
| `POST /context/expand` | **Kept** | Logged to resume + ledger |
| `GET /context/search` | **Enhanced** | Now searches across full stack |
| `POST /intelligence/supernova/*` | **Kept** | ChittyEntities merged — combined DNA, ledger, resume |
| `POST /intelligence/fission/*` | **Kept** | ChittyEntity split — domains/competencies divided |
| `POST /intelligence/derivative` | **Kept** | Child ChittyEntity inherits parent's DNA + resume |
| `POST /intelligence/suspension` | **Kept** | ChittyEntities temporarily blended |
| `POST /intelligence/collaborators/find` | **Enhanced** | Uses full stack for matching |
| `MemoryCloude.storeMemory()` | **Kept** | Already implements degradation |
| `ExperienceAnchor.resolveAnchor()` | **Replaced** | By `/provision` endpoint |
| `ContextResolver.hashAnchors()` | **Demoted** | Offline fallback only |

---

## 10. Open Questions

1. **MemoryCloude rewarming triggers** — what causes a degraded memory to rewarm? Currently just semantic search relevance. Should there be sponsor-initiated rewarming? Periodic rewarming scans?

2. **Cross-sponsor consultation** — if Sponsor A's ChittyEntity is consulted by Sponsor B's ChittyEntity, what's the ACL model? Per-ChittyEntity visibility settings? Sponsor consent?

3. **Resume vs MemoryCloude overlap** — the Resume contains "implicit knowledge" and "cross-domain insights" that overlap with MemoryCloude's stored interactions. Should the Resume be generated FROM MemoryCloude, or independently by the session?

4. **ChittyDNA fragment encoding during consultation** — when a ChittyEntity is consulted, should the consultation itself generate new DNA fragments via Cypher (the target ChittyEntity "taught" something, creating traceable lineage)?

5. **Stale ChittyEntity reactivation cost** — when a stale ChittyEntity is rewarmed, MemoryCloude conversations are expired. The ChittyEntity has DNA and Ledger but no recent memories. How much value is lost? Should there be a "rehydration" process that reconstructs approximate memories from the Ledger?

6. **Agenticness dimension scoring** — should scores be auto-computed from stack data, or should sponsors be able to manually adjust? What triggers a recalculation?

7. **GoDaddy ANS integration** — should ChittyEntities be registerable via the [Agent Name Service](https://www.agentnameregistry.org/) for external discoverability and trust verification? ANS anchors to DNS; ChittyID anchors to ChittyOS. Bridging the two would enable cross-ecosystem consultation.
