# Zoho PPT Agent

A lightweight Codex workspace for creating executive PowerPoint presentations from Zoho Analytics through natural-language requests.

The repository does not contain Zoho credentials, MCP URLs, OAuth tokens, or OpenAI API keys. Codex uses the `zoho_analytics` MCP server configured on the user's machine.

## What it does

- Discovers Zoho Analytics organizations, workspaces, folders, tables, query tables, reports, and dashboards.
- Converts questions such as â€œCreate a January supply-chain executive deckâ€ into a read-only analysis plan.
- Validates reporting periods, grains, month-end versus period totals, units, and source lineage.
- Builds editable `.pptx` presentations using the Codex Presentations workflow.
- Renders every slide for visual QA before delivery.

## First-time setup

1. Install Codex and open this repository as a trusted workspace.
2. Add the Zoho Analytics MCP server globally as `zoho_analytics` and complete Zoho OAuth.
3. Restart Codex or open a new Codex task.
4. Confirm that Zoho tools are available by asking: `List my Zoho Analytics organizations and workspaces.`

The credential-bearing Zoho MCP URL must never be committed to this repository.

## Using the agent

Open this repository in Codex and ask naturally, for example:

> Create a 6-slide executive supply-chain review for ABNAH for January 2026. Include outlet performance, inventory exposure, procurement risk, menu items at risk, and clear actions.

Codex follows [AGENTS.md](AGENTS.md), uses the workspace catalog in [config/workspaces.json](config/workspaces.json), retrieves current Zoho data, and writes final decks under `output/`.

More examples are available in [prompts/examples.md](prompts/examples.md).

## GitHub Pages interface

The `docs/` directory contains the static GitHub Pages UX, following the same
frontend/deployment pattern as the MAJOS Tech ABNAH control tower. It provides
a conversational request composer, ABNAH workspace and period controls,
presentation scope choices, generation progress, and a PowerPoint download
state.

The interface expects a companion API at
`https://zoho-ppt-agent.techmajos6.workers.dev`. Until that Worker is deployed
and configured, the page safely reports `Backend setup required` and does not
send credentials from browser code.

## Security

- Keep the repository private when business metrics or generated decks are committed.
- Do not commit files under `output/` unless they are intentionally approved for sharing.
- Never paste MCP credentials, OAuth tokens, or API keys into prompts, code, configuration, issues, or commits.
- Treat Zoho as read-only unless a user explicitly authorizes a specific write.

## Project layout

```text
zoho-ppt-agent/
â”œâ”€â”€ AGENTS.md
â”œâ”€â”€ README.md
â”œâ”€â”€ config/
â”‚   â””â”€â”€ workspaces.json
â”œâ”€â”€ prompts/
â”‚   â””â”€â”€ examples.md
â””â”€â”€ output/
    â””â”€â”€ .gitkeep
```

## Engineering governance

MAJOSTech platform and repository rules are defined in [AGENTS.md](AGENTS.md). Architectural decisions are recorded under [docs/decisions](docs/decisions), and the deployed application state is maintained in [PROJECT_STATE.md](PROJECT_STATE.md). GitHub is the source of truth, and Cloudflare-native services are preferred where technically appropriate.

