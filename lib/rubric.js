"use strict";

/**
 * Asset Quality Rubric Scorer: pure scoring functions.
 *
 * One function per rubric dimension. Each takes the asset object and returns a
 * number from 0.0 to 1.0. No side effects, no I/O, no LLM calls: the same input
 * always produces the same output. Orchestration (weighting, overall score,
 * priority, issues, suggestions) lives in lib/scorer.js.
 *
 * Rubric source of truth: README.md, section "The rubric". Dimensions, weights,
 * and scoring conditions are locked. Do not change them here.
 */

/**
 * Valid CMP folders. A category counts as "mapped" only if it is one of these
 * four folder ids. The display names are also used for suggestion phrasing and
 * to detect tags that merely repeat the category.
 */
const FOLDERS = {
  "fld-9901": "Apparel",
  "fld-9902": "Footwear",
  "fld-9903": "Accessories",
  "fld-9904": "Brand"
};

/** Weights per dimension. These total 100 and are locked. */
const WEIGHTS = {
  title_quality: 20,
  description_completeness: 15,
  alt_text_presence: 15,
  tag_richness: 15,
  category_mapping: 10,
  url_validity: 15,
  date_hygiene: 10
};

/** CMP hard limit on title length, enforced by POST /assets at ingestion. */
const TITLE_MAX_LENGTH = 100;

/** Auto-generated placeholder title pattern (e.g., Asset_123, img42, file_7). */
const AUTO_GENERATED_TITLE = /^(asset|img|file)_?\d+$/i;

/**
 * Coerce a value to a trimmed string. Null, undefined, and non-strings that are
 * not numbers become an empty string. Numbers are stringified (defensive).
 */
function toTrimmedString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value).trim();
  }
  return "";
}

/**
 * Normalize the tags input into a clean array of non-empty strings. Accepts a
 * real array (the declared type) or, defensively, a comma-separated string from
 * CSV-derived input. Tags are trimmed and empty entries are dropped. Duplicates
 * are intentionally kept: the rubric's 0.8 band ("3+ tags, all identical to the
 * category folder") relies on counting repeated tags, so deduplicating here
 * would make that band unreachable.
 */
function normalizeTags(tags) {
  let raw = [];
  if (Array.isArray(tags)) {
    raw = tags;
  } else if (typeof tags === "string") {
    raw = tags.split(",");
  } else {
    return [];
  }

  const result = [];
  for (const tag of raw) {
    const cleaned = toTrimmedString(tag);
    if (cleaned !== "") {
      result.push(cleaned);
    }
  }
  return result;
}

/**
 * Dimension 1: Title Quality (weight 20).
 * Precedence: empty first, then auto-generated pattern, then length bands.
 * Titles over 100 chars are not covered by the table; they have real content,
 * so they score 0.7 and are auto-flagged elsewhere against the CMP limit.
 */
function scoreTitleQuality(asset) {
  const title = toTrimmedString(asset && asset.title);
  if (title === "") {
    return 0.0;
  }
  if (AUTO_GENERATED_TITLE.test(title)) {
    return 0.3;
  }
  if (title.length < 10) {
    return 0.5;
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return 0.7;
  }
  // Length is 10 to 100 here. A meaningful word is a run of at least three
  // alphabetic characters; without one (e.g., a numeric string) the title is
  // present and well-sized but not descriptive, so it scores 0.7.
  if (/[A-Za-z]{3,}/.test(title)) {
    return 1.0;
  }
  return 0.7;
}

/**
 * Dimension 2: Description Completeness (weight 15).
 * Distinctness from title is a case-insensitive, trimmed exact comparison.
 */
function scoreDescriptionCompleteness(asset) {
  const description = toTrimmedString(asset && asset.description);
  if (description === "") {
    return 0.0;
  }
  if (description.length < 20) {
    return 0.5;
  }
  const title = toTrimmedString(asset && asset.title);
  if (title !== "" && description.toLowerCase() === title.toLowerCase()) {
    return 0.8;
  }
  return 1.0;
}

/**
 * Dimension 3: Alt-Text Presence (weight 15).
 */
function scoreAltTextPresence(asset) {
  const altText = toTrimmedString(asset && asset.alt_text);
  if (altText === "") {
    return 0.0;
  }
  if (altText.length < 10) {
    return 0.5;
  }
  return 1.0;
}

/**
 * Dimension 4: Tag Richness (weight 15).
 * Counts distinct, non-empty tags. A tag is "the category" if it matches the
 * category id (fld-99xx) or the mapped folder name, case-insensitive.
 */
function scoreTagRichness(asset) {
  const tags = normalizeTags(asset && asset.tags);
  const count = tags.length;
  if (count === 0) {
    return 0.0;
  }
  if (count === 1) {
    return 0.3;
  }
  if (count === 2) {
    return 0.6;
  }

  // 3 or more distinct tags. Determine whether every tag merely repeats the
  // category (by id or folder name).
  const categoryValue = toTrimmedString(asset && asset.category).toLowerCase();
  const folderName = (FOLDERS[categoryValue] || "").toLowerCase();
  const categoryAliases = new Set();
  if (categoryValue !== "") {
    categoryAliases.add(categoryValue);
  }
  if (folderName !== "") {
    categoryAliases.add(folderName);
  }

  const hasDistinctFromCategory = tags.some(function (tag) {
    return !categoryAliases.has(tag.toLowerCase());
  });

  return hasDistinctFromCategory ? 1.0 : 0.8;
}

/**
 * Dimension 5: Category Mapping (weight 10).
 * Only the four valid CMP folder ids count as mapped.
 */
function scoreCategoryMapping(asset) {
  const category = toTrimmedString(asset && asset.category).toLowerCase();
  return Object.prototype.hasOwnProperty.call(FOLDERS, category) ? 1.0 : 0.0;
}

/**
 * Dimension 6: Source URL Validity (weight 15).
 * HTTPS and well-formed scores 1.0. HTTPS but unparseable scores 0.5. Anything
 * missing, empty, or non-HTTPS scores 0.0.
 */
function scoreUrlValidity(asset) {
  const sourceUrl = toTrimmedString(asset && asset.source_url);
  if (sourceUrl === "") {
    return 0.0;
  }

  let parsed = null;
  try {
    parsed = new URL(sourceUrl);
  } catch (err) {
    parsed = null;
  }

  if (parsed !== null) {
    return parsed.protocol === "https:" ? 1.0 : 0.0;
  }

  // Failed to parse. Reward the correct HTTPS intent with a partial score;
  // anything else is treated as a non-HTTPS or unusable URL.
  return /^https:\/\//i.test(sourceUrl) ? 0.5 : 0.0;
}

/** Date-only ISO 8601: YYYY-MM-DD. */
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Full ISO 8601 datetime: YYYY-MM-DDThh:mm(:ss(.sss)?)?(Z|+/-hh:mm)? */
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Dimension 7: Date Hygiene (weight 10).
 * Present and ISO 8601 (date or full datetime) scores 1.0. Present but non-ISO
 * scores 0.5. Missing or empty scores 0.0. The string must also be a real date.
 */
function scoreDateHygiene(asset) {
  const date = toTrimmedString(asset && asset.created_date);
  if (date === "") {
    return 0.0;
  }
  const looksIso = ISO_DATE_ONLY.test(date) || ISO_DATETIME.test(date);
  if (looksIso && !Number.isNaN(Date.parse(date))) {
    return 1.0;
  }
  return 0.5;
}

module.exports = {
  FOLDERS,
  WEIGHTS,
  TITLE_MAX_LENGTH,
  AUTO_GENERATED_TITLE,
  normalizeTags,
  scoreTitleQuality,
  scoreDescriptionCompleteness,
  scoreAltTextPresence,
  scoreTagRichness,
  scoreCategoryMapping,
  scoreUrlValidity,
  scoreDateHygiene
};
