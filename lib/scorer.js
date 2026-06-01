"use strict";

/**
 * Asset Quality Rubric Scorer: orchestration.
 *
 * Calls the seven pure dimension scorers in lib/rubric.js, computes the weighted
 * overall score, assigns a priority bucket, and builds deterministic, templated
 * issues and suggestions. No LLM calls and no I/O: same input, same output.
 *
 * Issue and suggestion phrasing is calibrated to severity. A dimension scoring
 * 0.0 gets stronger language than one scoring 0.5 or 0.8. The structure stays
 * the same across bands; only the tone and detail change.
 */

const rubric = require("./rubric");

const {
  FOLDERS,
  WEIGHTS,
  TITLE_MAX_LENGTH,
  scoreTitleQuality,
  scoreDescriptionCompleteness,
  scoreAltTextPresence,
  scoreTagRichness,
  scoreCategoryMapping,
  scoreUrlValidity,
  scoreDateHygiene
} = rubric;

/** Trim a value to a string, matching the helper used inside rubric.js. */
function trimmed(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return String(value);
  }
  return "";
}

/** Human-readable folder name for a category value, or empty string. */
function folderName(asset) {
  const category = trimmed(asset && asset.category).toLowerCase();
  return FOLDERS[category] || "";
}

/**
 * Build the issue and suggestion for Title Quality when below 1.0. The 0.7 band
 * has two causes (over the length limit, or no descriptive keyword), so the
 * message is derived from the trimmed title.
 */
function titleFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  const title = trimmed(asset && asset.title);
  if (score === 0.0) {
    return {
      issue: "Title is missing",
      suggestion:
        "Generate a descriptive title of 10 to 100 characters capturing the asset's subject and intended use"
    };
  }
  if (score === 0.3) {
    return {
      issue: "Title is an auto-generated placeholder",
      suggestion:
        "Replace the placeholder title with a descriptive name capturing the asset's subject"
    };
  }
  if (score === 0.5) {
    return {
      issue: "Title is too short (under 10 characters)",
      suggestion:
        "Expand the title to 10 to 100 characters with descriptive keywords"
    };
  }
  // score === 0.7
  if (title.length > TITLE_MAX_LENGTH) {
    return {
      issue: "Title exceeds the CMP 100-character limit",
      suggestion: "Shorten the title to 100 characters or fewer"
    };
  }
  return {
    issue: "Title lacks a descriptive keyword",
    suggestion: "Add a descriptive keyword to the title so it reads meaningfully"
  };
}

/** Issue and suggestion for Description Completeness when below 1.0. */
function descriptionFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  if (score === 0.0) {
    return {
      issue: "Description is missing",
      suggestion:
        "Generate a 20+ character description capturing the asset's marketing context"
    };
  }
  if (score === 0.5) {
    return {
      issue: "Description is too short (under 20 characters)",
      suggestion:
        "Expand the description to at least 20 characters of marketing context"
    };
  }
  // score === 0.8
  return {
    issue: "Description duplicates the title",
    suggestion: "Rewrite the description so it adds context beyond the title"
  };
}

/** Issue and suggestion for Alt-Text Presence when below 1.0. */
function altTextFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  if (score === 0.0) {
    return {
      issue: "Alt-text is missing",
      suggestion: "Generate descriptive alt-text for accessibility and SEO"
    };
  }
  // score === 0.5
  return {
    issue: "Alt-text is too short (under 10 characters)",
    suggestion:
      "Expand the alt-text to at least 10 characters describing the image for screen readers and SEO"
  };
}

/** Issue and suggestion for Tag Richness when below 1.0. */
function tagFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  const addTags =
    "Add tags drawn from the asset's category, content theme, and intended use case";
  if (score === 0.0) {
    return {
      issue: "No tags present",
      suggestion: addTags
    };
  }
  if (score === 0.3) {
    return {
      issue: "Only 1 tag, below the recommended 3 or more",
      suggestion: addTags
    };
  }
  if (score === 0.6) {
    return {
      issue: "Only 2 tags, below the recommended 3 or more",
      suggestion: addTags
    };
  }
  // score === 0.8
  return {
    issue: "All tags merely repeat the category",
    suggestion:
      "Add tags beyond the category, covering content theme and intended use case"
  };
}

/** Issue and suggestion for Category Mapping when below 1.0. */
function categoryFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  return {
    issue: "Category is missing or not mapped to a valid CMP folder",
    suggestion:
      "Map the asset to one of the four CMP folders: Apparel, Footwear, Accessories, or Brand"
  };
}

/** Issue and suggestion for Source URL Validity when below 1.0. */
function urlFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  if (score === 0.0) {
    return {
      issue: "Source URL is missing or not HTTPS",
      suggestion:
        "Provide an HTTPS source URL; CMP rejects HTTP and FTP at ingestion"
    };
  }
  // score === 0.5
  return {
    issue: "Source URL is HTTPS but malformed",
    suggestion: "Correct the malformed HTTPS URL so it parses cleanly"
  };
}

/** Issue and suggestion for Date Hygiene when below 1.0. */
function dateFeedback(asset, score) {
  if (score >= 1.0) {
    return null;
  }
  if (score === 0.0) {
    return {
      issue: "Creation date is missing",
      suggestion: "Provide a creation date in ISO 8601 format (YYYY-MM-DD)"
    };
  }
  // score === 0.5
  return {
    issue: "Creation date is not in ISO 8601 format",
    suggestion: "Reformat the creation date to ISO 8601 (YYYY-MM-DD)"
  };
}

/**
 * Map an overall score (0 to 100) to a priority bucket per the rubric.
 * 0 to 50 critical, 51 to 75 medium, 76 to 100 good.
 */
function bucketPriority(overall) {
  if (overall <= 50) {
    return "critical";
  }
  if (overall <= 75) {
    return "medium";
  }
  return "good";
}

/**
 * Score a single asset against the Asset Quality Rubric.
 *
 * @param {object} asset Asset metadata (asset_id, title, description, alt_text,
 *   tags, category, source_url, created_date). Only asset_id is required by the
 *   endpoint; every other field may be missing or empty and is handled here.
 * @returns {object} The scored output: asset_id, overall_score, priority,
 *   dimensions, issues, suggestions.
 */
function scoreAsset(asset) {
  const safeAsset = asset && typeof asset === "object" ? asset : {};

  const dimensions = {
    title_quality: scoreTitleQuality(safeAsset),
    description_completeness: scoreDescriptionCompleteness(safeAsset),
    alt_text_presence: scoreAltTextPresence(safeAsset),
    tag_richness: scoreTagRichness(safeAsset),
    category_mapping: scoreCategoryMapping(safeAsset),
    url_validity: scoreUrlValidity(safeAsset),
    date_hygiene: scoreDateHygiene(safeAsset)
  };

  // Weighted sum. Weights total 100 and dimension scores are 0.0 to 1.0, so the
  // sum already lands on a 0 to 100 scale. Round to the nearest integer.
  let weightedSum = 0;
  for (const key of Object.keys(dimensions)) {
    weightedSum += dimensions[key] * WEIGHTS[key];
  }
  const overallScore = Math.round(weightedSum);

  // Build issues and suggestions in dimension order, one pair per dimension
  // scoring below 1.0.
  const feedbackBuilders = [
    titleFeedback(safeAsset, dimensions.title_quality),
    descriptionFeedback(safeAsset, dimensions.description_completeness),
    altTextFeedback(safeAsset, dimensions.alt_text_presence),
    tagFeedback(safeAsset, dimensions.tag_richness),
    categoryFeedback(safeAsset, dimensions.category_mapping),
    urlFeedback(safeAsset, dimensions.url_validity),
    dateFeedback(safeAsset, dimensions.date_hygiene)
  ];

  const issues = [];
  const suggestions = [];
  for (const feedback of feedbackBuilders) {
    if (feedback !== null) {
      issues.push(feedback.issue);
      suggestions.push(feedback.suggestion);
    }
  }

  return {
    asset_id: trimmed(safeAsset.asset_id),
    overall_score: overallScore,
    priority: bucketPriority(overallScore),
    dimensions: dimensions,
    issues: issues,
    suggestions: suggestions
  };
}

module.exports = {
  scoreAsset,
  bucketPriority,
  folderName
};
