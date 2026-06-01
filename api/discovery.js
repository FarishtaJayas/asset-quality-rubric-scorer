"use strict";

/**
 * GET /discovery
 *
 * Returns Opal-compatible tool metadata for the Asset Quality Rubric Scorer so
 * the tool can be registered in Opal's Tools Registry. The schema matches what
 * the registry expects: a functions array describing the score_asset function,
 * its parameters, endpoint, and HTTP method.
 */

const DISCOVERY = {
  functions: [
    {
      name: "score_asset",
      description:
        "Scores a single CMP DAM asset's metadata against the Asset Quality Rubric. Returns per-dimension scores 0.0 to 1.0, an overall score 0 to 100, a priority bucket (critical, medium, good), an issues array, and a suggestions array.",
      parameters: [
        {
          name: "asset_id",
          type: "string",
          description: "Legacy or CMP asset identifier",
          required: true
        },
        {
          name: "title",
          type: "string",
          description: "Asset title",
          required: false
        },
        {
          name: "description",
          type: "string",
          description: "Asset description text",
          required: false
        },
        {
          name: "alt_text",
          type: "string",
          description: "Image alt text for accessibility and SEO",
          required: false
        },
        {
          name: "tags",
          type: "array",
          description: "Array of string tags",
          required: false
        },
        {
          name: "category",
          type: "string",
          description:
            "CMP folder ID (fld-9901, fld-9902, fld-9903, fld-9904) or raw legacy category value",
          required: false
        },
        {
          name: "source_url",
          type: "string",
          description: "HTTPS URL pointing to the asset binary",
          required: false
        },
        {
          name: "created_date",
          type: "string",
          description: "Creation date, ideally ISO 8601 format",
          required: false
        }
      ],
      endpoint: "/tools/score-asset",
      http_method: "POST",
      auth_requirements: []
    }
  ]
};

/** Apply permissive CORS headers. Opal calls this endpoint from another origin. */
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Method not allowed. Use GET to retrieve tool metadata."
      })
    );
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(DISCOVERY));
};
