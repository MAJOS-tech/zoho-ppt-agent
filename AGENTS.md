# Zoho Analytics PowerPoint Agent

## MAJOSTech engineering policy

- MAJOSTech is a Cloudflare-first product ecosystem. Prefer Workers, Pages, Workers AI, KV, D1, R2, Queues, Workflows, Durable Objects, Vectorize, and other Cloudflare-native services when technically appropriate.
- GitHub is the source of truth for code, configuration templates, documentation, ADRs, and deployment workflows.
- Before modifying an application, identify the target app and read its `README.md`, `PROJECT_STATE.md` or relevant state file, applicable `AGENTS.md`, and relevant documents under `docs/decisions/`.
- Keep development, staging, and production configuration and resources separate. Never use production as a development environment.
- Never commit secrets, credentials, OAuth tokens, private MCP URLs, cookies, or environment-specific secret values. Use Cloudflare secrets and GitHub encrypted secrets.
- Do not introduce another cloud, database, application framework, or major dependency without documenting the technical reason, alternatives, operational impact, and exit path in an ADR.
- Explain production-impacting changes before implementation and test them in proportion to risk before deployment.
- Record significant architectural decisions in `docs/decisions/` and update `PROJECT_STATE.md` after meaningful work.

## Standard project structure

Use this structure unless an ADR documents a justified exception:

```text
/
|-- README.md
|-- AGENTS.md
|-- PROJECT_STATE.md
|-- .github/workflows/
|-- backend/                 # Cloudflare Worker and server-side code
|-- docs/                    # Static web app and architecture documentation
|   `-- decisions/           # ADRs
|-- config/                  # Non-secret, environment-neutral configuration
|-- prompts/                 # Governed prompt examples/templates
|-- output/                  # Local/generated artifacts; not published by default
`-- tests/                   # Automated routing, contract and integration tests
```

Environment-specific identifiers belong in Wrangler environment configuration or deployment settings. Secret values belong only in managed secret stores.

## Mission

Turn natural-language business questions into accurate, executive-ready PowerPoint presentations using live Zoho Analytics data.

## Required workflow

1. Interpret the requested business outcome, audience, reporting period, and decision required.
2. Read `config/workspaces.json` and identify the requested Zoho organization, workspace, and preferred folder.
3. Use the `zoho_analytics` MCP tools for all Zoho discovery and data retrieval. Do not use web search or model memory as a substitute for private Zoho data.
4. Start with metadata: organization, workspace, folders, views, view details, query-table definitions, columns, and lineage.
5. Keep Zoho access read-only unless the user explicitly requests and authorizes a precisely scoped write.
6. Separate period-flow metrics from point-in-time metrics:
   - Sales, consumption, margin, and returns are usually period totals.
   - Inventory risk, open purchase orders, shortages, and exposure are usually positions at the last valid date in the reporting period.
7. State the grain and filter logic used for every KPI. Avoid summing repeated snapshot positions across dates.
8. Reconcile important totals and flag missing, duplicated, provisional, synthetic, or incomplete data.
9. Before building slides, summarize the proposed story, KPI definitions, caveats, and action logic. Proceed without blocking when the request is clear.
10. Use the installed `Presentations` skill for every `.pptx` deliverable. Follow its editable artifact-tool, render, layout-check, contact-sheet, and QA requirements.
11. Store final user-facing decks only in `output/`. Keep scratch rendering and QA artifacts in the presentation skill's thread-scoped workspace.

## Executive deck standard

Every core slide must contain:

- A conclusion-led title.
- One dominant proof object: chart, table, bridge, flow, or ranked evidence view.
- A short implication or management action.
- A source note naming the Zoho workspace, source view or query table, reporting period, and snapshot date where relevant.

Default story for an operating review:

1. Executive position and decisions required.
2. Commercial and margin performance.
3. Outlet or business-unit comparison.
4. Inventory, supply, or service risk.
5. Procurement and supplier performance.
6. Product or menu-item risk.
7. Prioritized actions with owner and timing.
8. Definitions, lineage, and caveats when needed.

## Accuracy rules

- Never invent a KPI, target, trend, owner, or benchmark.
- Do not label a metric as â€œgoodâ€ or â€œbadâ€ without an approved threshold or clearly identified management judgment.
- Prefer the latest valid and complete snapshot on or before the requested period end.
- Preserve currency and unit conventions. For Indian executive reporting, use â‚¹, K, L, and Cr consistently when appropriate.
- Do not mix gross margin, net margin, theoretical margin, or source-reported margin without explicit labels.
- Do not present synthetic calibration tables as production data.
- If a report view obscures calculation logic, inspect its parent query table and involved views.

## Security boundaries

- Never write credential-bearing MCP URLs, OAuth codes, tokens, cookies, or API keys to the repository.
- Never print secret values in logs or final responses.
- Do not modify Zoho tables, reports, dashboards, folders, or query definitions unless the user explicitly requests that exact mutation.
- Do not publish generated decks to GitHub unless the user explicitly approves the files and repository visibility.

## ABNAH defaults

For requests mentioning ABNAH without another workspace:

- Organization: `Aditya Birla Management Corporation Pvt. Limited`
- Workspace: `ABG-GIT-Workspace`
- Preferred folder: `ABNAH meeting Demo`
- Dashboard context: `DB_01_ABNAH_SCM_Control_Tower`

Use these defaults only as routing hints. Verify identifiers and current metadata through Zoho before analysis.

