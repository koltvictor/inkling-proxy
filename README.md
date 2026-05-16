# inkling-proxy

Cloudflare Worker that proxies Anthropic API calls for the Inkling iOS app.

## Architecture

- Stateless. No KV, no R2, no D1 — explicitly *no storage*.
- No request body logging.
- Authenticates the iOS app via a shared bearer secret (App Attest verification comes later).
- Holds the Anthropic API key server-side; never exposed to the client.

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars
# Fill in ANTHROPIC_API_KEY and SHARED_SECRET in .dev.vars
npm run dev
```

For production deployment:

```bash
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SHARED_SECRET
npm run deploy
```

## Endpoints

| Method | Path         | Purpose                                        |
| ------ | ------------ | ---------------------------------------------- |
| GET    | `/health`    | Liveness check, returns `ok`                   |
| POST   | `/interpret` | Generate narrative interpretation of screeners |

`/interpret` requires `Authorization: Bearer <SHARED_SECRET>`.

### Request body

```json
{
  "sessionId": "ephemeral-uuid",
  "screenerResults": [
    {
      "screenerId": "raads-r",
      "shortName": "RAADS-R",
      "fullName": "Ritvo Autism Asperger Diagnostic Scale - Revised",
      "totalScore": 142,
      "scoreMax": 240,
      "cutoff": 65,
      "cutoffMet": true,
      "subscales": { "social_relatedness": 67, "language": 13 },
      "subscaleMaxes": { "social_relatedness": 117, "language": 21 }
    }
  ],
  "intakeContext": {
    "ageBucket": "30-39",
    "sexAtBirth": "male",
    "triageSummary": "Considering whether traits I've masked since childhood reflect autism."
  }
}
```

### Response

```json
{
  "interpretation": "...prose paragraphs...",
  "generatedAt": 1715812345678
}
```

## Models

- Interpretation: `claude-opus-4-7`
- Triage (future): `claude-haiku-4-5-20251001`
