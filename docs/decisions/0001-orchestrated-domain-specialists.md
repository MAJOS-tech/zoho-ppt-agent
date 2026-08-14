# ADR 0001: Orchestrated domain specialists with persona-based framing

- Status: Accepted
- Date: 2026-08-14

## Context

ABNAH users ask cross-functional QSR supply-chain questions as CEO, COO, Procurement Manager, Executive Chef, Outlet Manager, or Finance Controller. Treating each persona as a data-access boundary caused incomplete answersâ€”for example, a CEO question could omit inventory evidence.

Cloudflare Worker subrequest limits also require evidence retrieval to remain deliberately bounded.

## Decision

Use one governed orchestrator that separates two concerns:

1. The selected persona controls language, priority, and decision framing.
2. Domain specialists control evidence selection for commercial performance, inventory and availability, kitchen consumption, waste and expiry, procurement, vendor risk, and menu/FOH availability.

The orchestrator detects question intent, selects at most two optimized Zoho evidence queries per request, and asks Workers AI to synthesize one answer. It must disclose missing evidence and distinguish observed, calculated, and estimated measures.

## Consequences

- Every persona may access every governed domain.
- Compound questions require explicit cross-domain routes, such as outlet margin plus inventory/PO exposure.
- Specialist labels describe logical capabilities inside the current Worker; they are not yet independent Durable Object agents.
- Persistent specialist agents, scheduled monitoring, and proactive alerts may be introduced later through Cloudflare Agents SDK without changing the semantic contract.
- Query-count limits remain a design constraint; broader questions may require curated aggregate views or staged follow-ups.


