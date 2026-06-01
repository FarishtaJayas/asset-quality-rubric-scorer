# DAM Asset Quality Auditor

Opal agent solution for Project B of the Optimizely Onboarding Solutions Architect take-home test.

## What this document is

This README is the single source of truth for Project B. It captures every locked decision, the full rubric, the architecture, the execution plan, and the spec compliance map. Read it once end-to-end before starting Phase 1. Reference specific sections as you build.

## Concept

DAM Asset Quality Auditor. An Opal agent solution that picks up where Project A's migration ended. Project A delivered 477 assets into CMP. They are technically valid (POSTed and PUTed without errors) but many are not marketing-ready: auto-generated titles, missing descriptions, missing alt-text, thin tags. Project B builds the agent that closes that gap.

The narrative arc is intentional. Project A is the migration. Project B is the onboarding work that happens immediately after migration cutover. Together they tell the full story an Onboarding Solutions Architect would own end-to-end for a CMP customer.

## Locked decisions

Names (used throughout this README and in the write-up):

- Primary agent: **Asset Readiness Coordinator**
- Specialized Agent 1: **Metadata Enrichment Agent**
- Specialized Agent 2: **Report Composer Agent**
- Workflow: **Post-Migration Asset Readiness Pipeline**
- Custom tool: **Asset Quality Rubric Scorer**

Architecture:

- Two specialized agents (spec requires minimum 2)
- One orchestrating workflow
- One custom tool, deterministic (not LLM-backed), hosted on Vercel
- Uses search_web and create_canvas as existing Opal tools

Tech:

- Custom tool: Node.js serverless functions
- Hosting: Vercel
- Source control: GitHub (public repo, doubles as the optional technical-challenge deliverable)
- Coding assistant: Claude Code

## Architecture

### Component map

```
                         ┌──────────────────────────────────┐
                         │  Asset Readiness Coordinator     │
                         │  (Primary agent / instructions)  │
                         └────────────────┬─────────────────┘
                                          │
                                          ▼
              ┌──────────────────────────────────────────────────┐
              │  Post-Migration Asset Readiness Pipeline          │
              │  (Workflow)                                        │
              └──┬─────────────┬────────────────┬────────────────┘
                 │             │                │
                 ▼             ▼                ▼
        ┌─────────────┐ ┌──────────────┐ ┌────────────────┐
        │ Score       │ │ Enrich       │ │ Compose Report │
        │ (custom     │ │ (Metadata    │ │ (Report        │
        │  tool call) │ │  Enrichment  │ │  Composer      │
        │             │ │  Agent)      │ │  Agent)        │
        └─────────────┘ └──────┬───────┘ └────────┬───────┘
                               │                  │
                               ▼                  ▼
                        ┌──────────────┐   ┌────────────────┐
                        │ search_web   │   │ create_canvas  │
                        └──────────────┘   └────────────────┘

External: Asset Quality Rubric Scorer (Vercel-hosted)
         POST /tools/score-asset
         GET  /discovery
```

### Components

**Asset Readiness Coordinator** (primary agent). Top-level instructions. User says "audit and enrich the migrated assets." Coordinator owns the workflow invocation.

**Post-Migration Asset Readiness Pipeline** (workflow). Orchestrates the data flow below.

**Metadata Enrichment Agent** (Specialized Agent 1). Takes low-scoring assets, generates improved titles, alt-text, descriptions, tags. Uses search_web for SEO-relevant context. Returns enriched metadata.

**Report Composer Agent** (Specialized Agent 2). Takes the final scored output (post-enrichment) and produces a customer-facing audit report: executive summary, priority counts, top issues, recommended next actions. Uses create_canvas.

**Asset Quality Rubric Scorer** (custom tool). Deterministic Node.js scoring service. POST /tools/score-asset takes one asset, returns scored output. GET /discovery returns tool metadata for Opal registration. Deployed on Vercel.

### Data flow

1. User provides cleaned migration CSV (or sample subset) as input
2. For each asset: workflow calls custom tool, receives score, priority, issues, suggestions
3. Assets with priority "critical" or "medium" routed to Metadata Enrichment Agent
4. Enriched metadata re-scored via custom tool
5. All assets (with original and enriched scores) passed to Report Composer Agent
6. Report Composer produces final canvas: executive summary, priority counts, top issues, action list
7. Output presented to user

## The rubric

This is the opinionated core of the custom tool. Every dimension, weight, and rule below is a design decision that needs to be defensible in the panel.

### Scoring model

Each dimension scores 0.0 to 1.0. Overall score is the weighted sum, multiplied by 100, rounded to nearest integer. Weights total 100.

### Dimensions

#### 1. Title Quality (weight: 20)

Present, descriptive, neither too short nor too long, not an auto-generated placeholder.

| Score | Condition |
|-------|-----------|
| 0.0 | Missing or empty after trim |
| 0.3 | Matches auto-generated pattern: /^(Asset\|img\|file)_?\d+$/i |
| 0.5 | Present but length < 10 characters |
| 0.7 | Present, length 10 to 100, no obvious issues |
| 1.0 | Present, length 10 to 100, contains at least one meaningful word |

Auto-flag: titles longer than 100 chars (CMP hard limit from POST /assets).

#### 2. Description Completeness (weight: 15)

Present, substantive, distinct from title.

| Score | Condition |
|-------|-----------|
| 0.0 | Missing or empty |
| 0.5 | Present, length < 20 characters |
| 0.8 | Present, length >= 20 characters, but matches title |
| 1.0 | Present, length >= 20 characters, distinct from title |

Note: source CSV has no description field, so every asset starts at 0 here. This is intentional. The score surfaces the gap that the Enrichment Agent fills.

#### 3. Alt-Text Presence (weight: 15)

Present, descriptive enough for screen readers and SEO.

| Score | Condition |
|-------|-----------|
| 0.0 | Missing or empty |
| 0.5 | Present, length < 10 characters |
| 1.0 | Present, length >= 10 characters |

Note: source CSV has no alt-text field, so every asset starts at 0 here. This is intentional. The score surfaces the gap that the Enrichment Agent fills.

#### 4. Tag Richness (weight: 15)

Enough tags to be findable, not all duplicates, not just the category.

| Score | Condition |
|-------|-----------|
| 0.0 | No tags |
| 0.3 | 1 tag |
| 0.6 | 2 tags |
| 0.8 | 3+ tags, but all identical to category folder |
| 1.0 | 3+ tags, at least one distinct from category |

#### 5. Category Mapping (weight: 10)

Mapped to a real CMP folder, not an unmapped legacy value.

Valid folders: fld-9901 (Apparel), fld-9902 (Footwear), fld-9903 (Accessories), fld-9904 (Brand).

| Score | Condition |
|-------|-----------|
| 0.0 | Missing or unmapped value (e.g., legacy "Toys") |
| 1.0 | Mapped to one of the four valid folders |

#### 6. Source URL Validity (weight: 15)

HTTPS scheme (CMP rejects HTTP and FTP at ingestion), well-formed.

| Score | Condition |
|-------|-----------|
| 0.0 | Missing, empty, or non-HTTPS scheme |
| 0.5 | HTTPS but malformed (fails URL parse) |
| 1.0 | HTTPS and well-formed |

#### 7. Date Hygiene (weight: 10)

Present, ISO 8601 formatted.

| Score | Condition |
|-------|-----------|
| 0.0 | Missing or empty |
| 0.5 | Present but non-ISO format |
| 1.0 | Present and ISO 8601 (YYYY-MM-DD or full datetime) |

### Priority bucketing

| Overall score | Priority | Action |
|---------------|----------|--------|
| 0 to 50 | critical | Route to Enrichment Agent immediately |
| 51 to 75 | medium | Route to Enrichment Agent if capacity allows |
| 76 to 100 | good | Ready for marketing use |

### Output schema

```json
{
  "asset_id": "L-1001",
  "overall_score": 64,
  "priority": "medium",
  "dimensions": {
    "title_quality": 1.0,
    "description_completeness": 0.0,
    "alt_text_presence": 0.0,
    "tag_richness": 0.6,
    "category_mapping": 1.0,
    "url_validity": 1.0,
    "date_hygiene": 1.0
  },
  "issues": [
    "Description is missing",
    "Alt-text is missing",
    "Only 2 tags, below the recommended 3 or more"
  ],
  "suggestions": [
    "Generate a 20+ character description capturing the asset's marketing context",
    "Generate descriptive alt-text for accessibility and SEO",
    "Add tags drawn from the asset's category, content theme, and intended use case"
  ]
}
```

Suggestion strings are deterministic templated (not LLM-generated). They can include asset-specific context via simple string interpolation (e.g., "Generate alt-text for 'Winter Banner 1' in the Apparel folder").

### Design rationale

Weights reflect what a marketing team in a CMP DAM most needs:

- Find assets: title + tags = 35 points
- Use them on the web: alt-text + URL = 30 points
- Trust them: category + dates + description = 35 points

No single dimension can sink a score on its own. The rubric is forgiving in the right places and strict where CMP itself is strict (URL must be HTTPS, title has a hard 100-char limit).

### Deliberate omissions

For panel defensibility, these are NOT in the rubric:

- **URL liveness check**: rubric scores must be reproducible. An asset's quality shouldn't depend on whether the hosting server is responsive right now. Adds latency, retries, and failure modes for marginal scoring value.
- **File size validation**: weak signal for marketing readiness. A 50MB asset isn't inherently worse than a 1MB one; depends on use case and asset type.
- **Title > 100 chars dimension**: CMP's POST /assets rejects long titles at ingestion. Post-migration data is pre-filtered, so this dimension would always score 1.0. Handled as a pre-migration auto-flag, not a scoring dimension.

## Spec compliance checklist

Every line item the take-home requires, with how this submission addresses it:

| Spec requirement | This submission |
|---|---|
| Identify a real-world problem | Post-migration asset readiness, a documented CMP customer pain point |
| Primary instructions / skills | Asset Readiness Coordinator agent |
| At least 2 Specialized Agents | Metadata Enrichment Agent + Report Composer Agent |
| Tool integration (existing) | search_web (Enrichment), create_canvas (Report Composer) |
| Tool integration (custom) | Asset Quality Rubric Scorer with /discovery endpoint |
| Agent Workflow | Post-Migration Asset Readiness Pipeline orchestrating both specialized agents |
| Build in Opal instance | All agents and workflow created in the provided instance |
| In-instance deliverable | Names of Instructions, Specialized Agents, Workflows listed in write-up |
| Custom tool /discovery endpoint | GET /discovery returning tool metadata |
| Technical challenge (optional) | GitHub repo link with tool source code |
| Write-up file name | Farishta_OpalAgentSolution.pdf |
| Write-up max length | 2 pages |
| Write-up sections | Problem Identification, Solution Overview, Key Design Decisions, Self-Reflection |

## Execution plan

Eight phases, sized so each has a clear "done" state. Time estimates are working time, not wall-clock.

### Phase 0: Recon and Lock
**Time:** 30 min (complete once this README is reviewed and locked)
**Done when:** No further direction changes.

### Phase 1: Custom Tool Scaffold
**Time:** 90 min
**Goal:** Working Vercel-deployed custom tool at a public URL, responding to /discovery and /tools/score-asset.

**Deliverables:**
- GitHub repo created
- `api/discovery.js` returning Opal-compatible tool metadata
- `api/tools/score-asset.js` implementing the full rubric above
- `package.json`
- README in the repo with brief usage notes
- Vercel project linked to repo, auto-deploys on push
- Public HTTPS URL verified by hitting /discovery in a browser

**How:** Run the Phase 1 Claude Code prompt (provided when phase starts). Review output, push to GitHub, connect Vercel.

### Phase 2: Custom Tool Verification
**Time:** 30 min
**Goal:** Confirm the tool scores assets correctly against a hand-picked sample.

**Deliverables:**
- 5 test assets curated from Project A's cleaned CSV (one perfect, one mid, one critical, one with bad URL, one with missing fields)
- Manual curl or browser test against /tools/score-asset for each
- Expected vs actual scores documented in `test_cases.md`

**How:** Test cases and expected scores provided in Phase 2 instructions.

### Phase 3: Opal Setup and Tool Registration
**Time:** 30 min
**Goal:** Tool registered with Opal Tools Registry, discoverable from within Opal.

**Deliverables:**
- Opal Tools Registry entry pointing to `https://<your-deployment>.vercel.app/discovery`
- Tool visible in Opal's tool list

**How:** Follow spec's Tool Registry steps. Exact registration values provided in Phase 3 instructions.

### Phase 4: Specialized Agents Built in Opal
**Time:** 60 min
**Goal:** Both specialized agents created in the Opal instance with working instructions.

**Deliverables:**
- Metadata Enrichment Agent (instructions, tools enabled: custom rubric scorer + search_web)
- Report Composer Agent (instructions, tools enabled: create_canvas)
- Both tested individually with sample inputs

**How:** Instructions for each agent provided as markdown blocks in Phase 4. Paste into Opal's agent builder.

### Phase 5: Workflow Built in Opal
**Time:** 30 min
**Goal:** Workflow orchestrating Score → Triage → Enrich → Re-score → Compose Report.

**Deliverables:**
- Post-Migration Asset Readiness Pipeline created in Opal
- Steps connected, conditional routing for priority-based triage
- Tested with a small sample of assets

**How:** Workflow logic provided in Phase 5 instructions. Configure in Opal's workflow builder.

### Phase 6: End-to-End Demo Run
**Time:** 30 min
**Goal:** Full pipeline runs against a sample CSV, produces a real audit report.

**Deliverables:**
- Demo run captured (screenshots for your reference)
- Final audit report generated and reviewed

**How:** Run the workflow in Opal with a curated sample of 10 to 20 assets. Verify output makes sense.

### Phase 7: Write-Up
**Time:** 60 min
**Goal:** `Farishta_OpalAgentSolution.pdf`, max 2 pages, hitting all four required sections.

**Deliverables:**
- Problem Identification (1 paragraph)
- Solution Overview (2-3 paragraphs with architecture summary)
- Key Design Decisions & Implementation Notes (bulleted list)
- Self-Reflection (1 paragraph on extensions and Opal learnings)
- Exact names of Instructions, Specialized Agents, Workflows listed
- GitHub link included

**How:** Draft provided in Phase 7. Review with fresh eyes, paste into Word or convert MD to PDF.

### Phase 8: Submission Packaging
**Time:** 15 min
**Goal:** Both Project A and Project B deliverables packaged and ready to send.

**Deliverables:**
- Project A zip (per the original handoff)
- Project B PDF
- Combined submission per Optimizely's instructions

## Time budget

| Phase | Time |
|---|---|
| 0. Recon | 30 min |
| 1. Custom tool scaffold | 90 min |
| 2. Tool verification | 30 min |
| 3. Opal setup + registration | 30 min |
| 4. Specialized agents | 60 min |
| 5. Workflow | 30 min |
| 6. End-to-end demo | 30 min |
| 7. Write-up | 60 min |
| 8. Submission packaging | 15 min |
| **Total** | **5h 45min** |

Plus 30 to 50 percent realistic buffer. Plan for 7-8 hours of focused work. Monday evening plus Tuesday morning gives roughly 10-12 hours of available time. Tight but achievable. Tuesday morning is the debug-and-polish buffer.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Vercel deployment fails first time | Verify locally with `vercel dev` before pushing; ngrok fallback (15 min to set up) |
| Opal tool registration fails | Double-check /discovery JSON schema matches spec example; test URL in browser first |
| Enrichment Agent produces low-quality output | Use search_web in instructions to ground output; constrain with clear examples |
| Workflow orchestration buggy | Build agents individually first (Phase 4), confirm each works, then connect (Phase 5) |
| Write-up exceeds 2 pages | Draft in markdown with strict section caps; cut ruthlessly |
| Submission deadline slip | Buffer Tuesday morning for unexpected issues; ship what works rather than over-polishing |

## Out of scope (explicit)

To prevent scope drift, the following are NOT in this submission:

- Real CMP API integration (mock or simulated assets only)
- URL liveness checking (deliberate omission)
- File-size or file-type validation (deliberate omission)
- Authentication on the custom tool (not required by spec for demo)
- More than 2 specialized agents (spec minimum is 2; more would expand scope without strengthening submission)
- Bulk scoring endpoint (single-asset is enough for demo; bulk is a "v2" consideration mentioned in self-reflection)
- Persistence layer (no database; agents operate on data passed through workflow)

## Definition of Done

The submission is done when:

1. Custom tool deployed to Vercel and responding correctly at /discovery and /tools/score-asset
2. All three Opal components (Coordinator, Enrichment Agent, Report Composer Agent) created in the instance
3. Workflow runs end-to-end on at least one sample input and produces a real audit report
4. Write-up PDF is 2 pages or fewer, named `Farishta_OpalAgentSolution.pdf`, hits all four required sections, names every Opal component
5. GitHub repo is public and linked in the write-up
6. Project A zip is ready (per original handoff)
7. Submission email or upload sent before 12:00 PM Tuesday June 3

## How to use this document

Read it once end-to-end. Then proceed phase by phase. Each phase has a separate, focused instruction set (Claude Code prompts, Opal configuration steps, write-up template) that I will provide as you move through them. This README is your reference; the phase-specific instructions are your action items.

When you are ready to start Phase 1, tell me. I will provide the Claude Code prompt for the custom tool scaffold next.
