# ADR 0002: Canonical reporting periods for multi-month analytics

- Status: Accepted; migration pending
- Date: 2026-08-14

## Context

The web application sends reporting months as `YYYY-MM`, while current control-tower query tables use values such as `month_01`. The Worker temporarily translates `2026-01` to `month_01`. This works for the 2026 demo but cannot distinguish January 2026 from January 2027.

Flow measures and snapshot measures also require different aggregation behaviour.

## Decision

Adopt `YYYY-MM` as the canonical `period_key` across the ABNAH semantic model. Each governed dataset should also expose `period_start`, `period_end`, `year`, and `month_number`. Snapshot datasets must additionally expose `snapshot_date` and a latest-valid/completeness indicator.

During migration, the Worker may translate `YYYY-MM` to the legacy `month_MM` code for the current single-year demo. This translation is a compatibility layer, not the long-term data model.

Time-aware orchestration must:

- sum flow measures such as sales, purchases, consumption, and wastage across periods;
- use point-in-time logic for stock, days cover, open PO position, and expiry exposure;
- validate period availability before comparison;
- identify missing months and avoid silently treating them as zero;
- support month-over-month, rolling-period, year-to-date, and year-over-year questions using canonical keys.

## Consequences

- Multi-year analysis requires a Zoho model migration before production use.
- Existing `source_period_code` may be retained for lineage, but it must not remain the analytical join key.
- Queries and tests must cover cross-year boundaries and incomplete snapshots.


