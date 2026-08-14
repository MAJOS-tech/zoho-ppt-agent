# ADR 0003: Cloudflare-first platform governance

- Status: Accepted
- Date: 2026-08-14

## Context

MAJOSTech will operate multiple products and needs a consistent platform, deployment, security, and repository model. Uncontrolled adoption of clouds, databases, frameworks, or dependencies would increase operational complexity and weaken repeatability.

## Decision

MAJOSTech applications are Cloudflare-first and GitHub-governed:

- GitHub is the source of truth.
- Cloudflare-native compute, AI, storage, messaging, security, and observability services are preferred when technically appropriate.
- Development, staging, and production use separate configuration and resources.
- Secrets are stored only in managed secret systems, never in source control.
- Applications follow the standard repository structure documented in `AGENTS.md`.
- Introducing another cloud, database, application framework, or major dependency requires an ADR describing the need, considered Cloudflare-native alternatives, security and operational impact, cost implications, and an exit or migration path.
- Production-impacting changes are explained before implementation and tested before deployment.

## Consequences

- New projects begin with consistent documentation, CI/CD, environment boundaries, and security controls.
- Cloudflare is a preference, not an absolute constraint; technically justified exceptions remain possible through an explicit decision record.
- Repository state documentation becomes part of the definition of done for meaningful work.


