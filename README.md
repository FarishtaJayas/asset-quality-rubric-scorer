# Asset Quality Rubric Scorer

A deterministic scoring service for CMP DAM assets, deployed as Vercel serverless functions and registered as a custom tool in Optimizely Opal. Given one asset's metadata, it returns a per-dimension quality score, an overall score, a priority bucket, and concrete issues and suggestions. Scoring is pure: the same input always produces the same output.

## Endpoints

- `GET /discovery` returns Opal-compatible tool metadata (the `score_asset` function and its parameters).
- `POST /tools/score-asset` scores a single asset. It accepts the asset fields as JSON and returns the scored output.

Both are also reachable under `/api/discovery` and `/api/tools/score-asset`; `vercel.json` rewrites the root-level paths.

## The rubric

Seven weighted dimensions, totaling 100:

| Dimension | Weight |
|---|---|
| Title quality | 20 |
| Description completeness | 15 |
| Alt-text presence | 15 |
| Tag richness | 15 |
| Source URL validity | 15 |
| Category mapping | 10 |
| Date hygiene | 10 |

Each dimension scores 0.0 to 1.0. The overall score is the weighted sum, rounded to an integer from 0 to 100. Priority buckets: critical (0 to 50), medium (51 to 75), good (76 to 100).

## Request and response

`POST /tools/score-asset`

```json
{
  "asset_id": "L-1001",
  "title": "Winter Apparel Hero Banner",
  "description": "",
  "alt_text": "",
  "tags": ["apparel", "winter"],
  "category": "fld-9901",
  "source_url": "https://cdn.example.com/winter.jpg",
  "created_date": "2024-01-15"
}
```

The response contains `asset_id`, `overall_score`, `priority`, `dimensions` (per-dimension scores), `issues`, and `suggestions`. Only `asset_id` is required; any other field may be missing or empty.

## Develop and test

```
npm test       # runs the node:test suite
npm run dev    # vercel dev for local serving
```

No runtime dependencies. Requires Node 18 or later.

## Layout

```
api/discovery.js            GET /discovery handler
api/tools/score-asset.js    POST /tools/score-asset handler
lib/rubric.js               pure per-dimension scoring functions
lib/scorer.js               orchestration: overall score, priority, issues, suggestions
test/rubric.test.js         unit and integration tests
vercel.json                 root-path rewrites
```
