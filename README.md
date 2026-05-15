# inkling-proxy

Cloudflare Worker that proxies Anthropic API calls for the Inkling iOS app.
Stateless. App Attest-gated. Never logs payloads.

Endpoints:
- POST /attest    - verify App Attest, issue device JWT
- POST /triage    - Claude Haiku triage call
- POST /interpret - Claude Opus interpretation call
