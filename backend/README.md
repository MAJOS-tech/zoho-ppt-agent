Exit code: 0
Wall time: 0.4 seconds
Output:
# Cloudflare Worker

This Worker is the API companion for the GitHub Pages interface.

## Current milestone

- `GET /health` proves the browser-to-Cloudflare connection.
- Zoho OAuth and deck routes return a clear setup response until their secrets and storage bindings are configured.
- Browser access is restricted to `https://majos-tech.github.io`.

Secrets must be added with `wrangler secret put`; never commit them to Git.

