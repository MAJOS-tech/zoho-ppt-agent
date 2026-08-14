# Project State

Last updated: 2026-08-14

## Production

- GitHub Pages: `https://majos-tech.github.io/zoho-ppt-agent/`
- Cloudflare Worker: `https://zoho-ppt-agent.techmajos6.workers.dev`
- Worker version: `1.2.2`
- Zoho workspace: `ABG-GIT-Workspace`
- Deployment: GitHub Actions to Cloudflare Workers; GitHub Pages from the repository root

## Implemented

- Secure Zoho OAuth session and live governed SQL evidence retrieval.
- Workers AI/Llama chat with validated JSON output.
- Role-aware answer framing for CEO, COO, Procurement Manager, Executive Chef, Outlet Manager, and Finance Controller.
- Logical specialist domains for commercial, inventory, consumption, waste/expiry, procurement, vendor, and FOH/menu availability.
- Cross-domain orchestration with a maximum of two Zoho evidence exports per chat request.
- January demo compatibility mapping from `2026-01` to `month_01`.
- Compound outlet-margin plus inventory/PO exposure routing.
- Editable PowerPoint generation from live Zoho data.
- Repository governance records the MAJOSTech Cloudflare-first policy, GitHub source-of-truth rule, standard structure, environment separation, secret handling, ADR requirements, and deployment-test expectations.

## Known constraints

- Legacy `month_MM` period codes are ambiguous across years.
- Specialist agents are logical modules inside one Worker, not independent persistent Cloudflare Agent instances.
- Broad questions are bounded to two evidence exports to avoid Worker subrequest failures.
- FOH impact is inferred through affected menu items; guest experience and service-time metrics are not currently available.
- Expiry evidence in the demo includes estimates and must remain labelled as estimated.

## Next architectural work

1. Add canonical `YYYY-MM` period keys to the Zoho semantic layer.
2. Create curated cross-domain outlet and executive aggregate views to support broad questions in one query.
3. Add automated routing tests and data-availability tests for every persona and domain.
4. Evaluate independent Cloudflare Agents SDK specialists when persistent memory, schedules, or proactive alerts are required.

## Decisions

- [ADR 0001: Orchestrated domain specialists with persona-based framing](docs/decisions/0001-orchestrated-domain-specialists.md)
- [ADR 0002: Canonical reporting periods for multi-month analytics](docs/decisions/0002-canonical-reporting-periods.md)
- [ADR 0003: Cloudflare-first platform governance](docs/decisions/0003-cloudflare-first-platform-governance.md)

