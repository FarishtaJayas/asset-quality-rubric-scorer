"use strict";

/**
 * POST /tools/score-asset
 *
 * Thin handler for the Asset Quality Rubric Scorer. Parses the request body,
 * validates that asset_id is present, calls the deterministic scorer, and
 * returns the scored output. All scoring logic lives in lib/scorer.js and
 * lib/rubric.js; this file only handles the HTTP concerns.
 */

const { scoreAsset } = require("../../lib/scorer");

/** Apply permissive CORS headers. Opal calls this tool from another origin. */
function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

/** Send a JSON response with the given status code. */
function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

/**
 * Read and parse the JSON body. The default Vercel Node runtime may pre-parse
 * the body into req.body; if it is a string or absent, parse the raw stream.
 * Returns the parsed object, or throws on invalid JSON.
 */
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  if (typeof req.body === "string" && req.body.length > 0) {
    return JSON.parse(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw === "") {
    return {};
  }
  return JSON.parse(raw);
}

/** True when value is a non-empty trimmed string asset_id holder. */
function hasAssetId(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.asset_id === "string" &&
    obj.asset_id.trim() !== ""
  );
}

/**
 * Resolve the parameters object from the parsed body.
 *
 * Opal and some other MCP-style clients wrap tool parameters in an outer
 * envelope rather than posting them at the top level. Try the common envelope
 * keys before failing. Direct top-level POSTs (curl style) keep working because
 * the top-level body is checked first.
 */
function resolveParams(body) {
  if (hasAssetId(body)) {
    return body;
  }
  const envelopeKeys = ["params", "parameters", "arguments", "input"];
  for (const key of envelopeKeys) {
    if (body && hasAssetId(body[key])) {
      return body[key];
    }
  }
  return body;
}

module.exports = async function handler(req, res) {
  applyCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, {
      error: "Method not allowed. Use POST to score an asset."
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendJson(res, 400, {
      error: "Request body must be valid JSON."
    });
    return;
  }

  // Diagnostic: capture the actual incoming payload in Vercel function logs.
  console.log(JSON.stringify(body));

  const params = resolveParams(body);

  const assetId =
    params && typeof params.asset_id === "string" ? params.asset_id.trim() : "";
  if (assetId === "") {
    sendJson(res, 400, {
      error: "asset_id is required and must be a non-empty string."
    });
    return;
  }

  const result = scoreAsset(params);
  sendJson(res, 200, result);
};
