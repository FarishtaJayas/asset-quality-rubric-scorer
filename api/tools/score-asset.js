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

  const assetId =
    body && typeof body.asset_id === "string" ? body.asset_id.trim() : "";
  if (assetId === "") {
    sendJson(res, 400, {
      error: "asset_id is required and must be a non-empty string."
    });
    return;
  }

  const result = scoreAsset(body);
  sendJson(res, 200, result);
};
