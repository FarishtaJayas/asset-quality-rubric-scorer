"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const rubric = require("../lib/rubric");
const { scoreAsset, bucketPriority } = require("../lib/scorer");

/* -------------------------------------------------------------------------- */
/* Dimension 1: Title Quality                                                 */
/* -------------------------------------------------------------------------- */

test("title quality: missing or empty scores 0.0", () => {
  assert.equal(rubric.scoreTitleQuality({}), 0.0);
  assert.equal(rubric.scoreTitleQuality({ title: "" }), 0.0);
  assert.equal(rubric.scoreTitleQuality({ title: "   " }), 0.0);
});

test("title quality: auto-generated pattern scores 0.3", () => {
  assert.equal(rubric.scoreTitleQuality({ title: "Asset_123" }), 0.3);
  assert.equal(rubric.scoreTitleQuality({ title: "img42" }), 0.3);
  assert.equal(rubric.scoreTitleQuality({ title: "file_7" }), 0.3);
  assert.equal(rubric.scoreTitleQuality({ title: "ASSET99" }), 0.3);
});

test("title quality: auto-generated pattern takes precedence over short length", () => {
  // "img1" is only 4 characters but the auto-generated rule wins.
  assert.equal(rubric.scoreTitleQuality({ title: "img1" }), 0.3);
});

test("title quality: present but under 10 characters scores 0.5", () => {
  assert.equal(rubric.scoreTitleQuality({ title: "Short" }), 0.5);
});

test("title quality: present, sized, but no meaningful word scores 0.7", () => {
  assert.equal(rubric.scoreTitleQuality({ title: "1234567890" }), 0.7);
});

test("title quality: present, sized, with a meaningful word scores 1.0", () => {
  assert.equal(rubric.scoreTitleQuality({ title: "Winter Banner" }), 1.0);
});

test("title quality: over 100 characters scores 0.7", () => {
  const longTitle = "Descriptive ".repeat(12).trim(); // well over 100 chars
  assert.ok(longTitle.length > 100);
  assert.equal(rubric.scoreTitleQuality({ title: longTitle }), 0.7);
});

/* -------------------------------------------------------------------------- */
/* Dimension 2: Description Completeness                                       */
/* -------------------------------------------------------------------------- */

test("description completeness: missing scores 0.0", () => {
  assert.equal(rubric.scoreDescriptionCompleteness({}), 0.0);
  assert.equal(rubric.scoreDescriptionCompleteness({ description: "  " }), 0.0);
});

test("description completeness: under 20 characters scores 0.5", () => {
  assert.equal(
    rubric.scoreDescriptionCompleteness({ description: "Too short" }),
    0.5
  );
});

test("description completeness: 20+ characters matching title scores 0.8", () => {
  const text = "Winter Apparel Banner Hero";
  assert.equal(
    rubric.scoreDescriptionCompleteness({ title: text, description: text }),
    0.8
  );
  // Case-insensitive match.
  assert.equal(
    rubric.scoreDescriptionCompleteness({
      title: text,
      description: text.toUpperCase()
    }),
    0.8
  );
});

test("description completeness: 20+ characters distinct from title scores 1.0", () => {
  assert.equal(
    rubric.scoreDescriptionCompleteness({
      title: "Winter Banner",
      description: "A hero banner for the winter apparel campaign."
    }),
    1.0
  );
});

/* -------------------------------------------------------------------------- */
/* Dimension 3: Alt-Text Presence                                             */
/* -------------------------------------------------------------------------- */

test("alt-text presence: missing scores 0.0", () => {
  assert.equal(rubric.scoreAltTextPresence({}), 0.0);
  assert.equal(rubric.scoreAltTextPresence({ alt_text: "" }), 0.0);
});

test("alt-text presence: under 10 characters scores 0.5", () => {
  assert.equal(rubric.scoreAltTextPresence({ alt_text: "Banner" }), 0.5);
});

test("alt-text presence: 10+ characters scores 1.0", () => {
  assert.equal(
    rubric.scoreAltTextPresence({ alt_text: "Winter apparel hero banner" }),
    1.0
  );
});

/* -------------------------------------------------------------------------- */
/* Dimension 4: Tag Richness                                                  */
/* -------------------------------------------------------------------------- */

test("tag richness: no tags scores 0.0", () => {
  assert.equal(rubric.scoreTagRichness({}), 0.0);
  assert.equal(rubric.scoreTagRichness({ tags: [] }), 0.0);
  assert.equal(rubric.scoreTagRichness({ tags: ["", "   "] }), 0.0);
});

test("tag richness: 1 tag scores 0.3", () => {
  assert.equal(rubric.scoreTagRichness({ tags: ["winter"] }), 0.3);
});

test("tag richness: 2 tags scores 0.6", () => {
  assert.equal(rubric.scoreTagRichness({ tags: ["winter", "banner"] }), 0.6);
});

test("tag richness: empty and whitespace tags are dropped before counting", () => {
  // Two real tags plus blanks counts as two tags.
  assert.equal(
    rubric.scoreTagRichness({ tags: ["winter", "", "  ", "banner"] }),
    0.6
  );
});

test("tag richness: 3+ tags all repeating the category scores 0.8", () => {
  // Tags match the category id and the folder name only.
  assert.equal(
    rubric.scoreTagRichness({
      category: "fld-9901",
      tags: ["fld-9901", "Apparel", "apparel"]
    }),
    0.8
  );
});

test("tag richness: 3+ tags with at least one distinct from category scores 1.0", () => {
  assert.equal(
    rubric.scoreTagRichness({
      category: "fld-9901",
      tags: ["Apparel", "winter", "hero"]
    }),
    1.0
  );
});

test("tag richness: accepts a comma-separated string", () => {
  assert.equal(
    rubric.scoreTagRichness({ tags: "winter, banner, hero" }),
    1.0
  );
});

/* -------------------------------------------------------------------------- */
/* Dimension 5: Category Mapping                                              */
/* -------------------------------------------------------------------------- */

test("category mapping: missing or unmapped legacy value scores 0.0", () => {
  assert.equal(rubric.scoreCategoryMapping({}), 0.0);
  assert.equal(rubric.scoreCategoryMapping({ category: "Toys" }), 0.0);
  assert.equal(rubric.scoreCategoryMapping({ category: "" }), 0.0);
});

test("category mapping: a valid CMP folder scores 1.0", () => {
  assert.equal(rubric.scoreCategoryMapping({ category: "fld-9901" }), 1.0);
  assert.equal(rubric.scoreCategoryMapping({ category: "fld-9904" }), 1.0);
  // Case-insensitive.
  assert.equal(rubric.scoreCategoryMapping({ category: "FLD-9902" }), 1.0);
});

/* -------------------------------------------------------------------------- */
/* Dimension 6: Source URL Validity                                           */
/* -------------------------------------------------------------------------- */

test("url validity: missing, empty, or non-HTTPS scores 0.0", () => {
  assert.equal(rubric.scoreUrlValidity({}), 0.0);
  assert.equal(rubric.scoreUrlValidity({ source_url: "" }), 0.0);
  assert.equal(
    rubric.scoreUrlValidity({ source_url: "http://example.com/a.jpg" }),
    0.0
  );
  assert.equal(
    rubric.scoreUrlValidity({ source_url: "ftp://example.com/a.jpg" }),
    0.0
  );
});

test("url validity: HTTPS but malformed scores 0.5", () => {
  assert.equal(rubric.scoreUrlValidity({ source_url: "https://" }), 0.5);
  assert.equal(
    rubric.scoreUrlValidity({ source_url: "https:// bad url .com" }),
    0.5
  );
});

test("url validity: HTTPS and well-formed scores 1.0", () => {
  assert.equal(
    rubric.scoreUrlValidity({ source_url: "https://cdn.example.com/a.jpg" }),
    1.0
  );
});

/* -------------------------------------------------------------------------- */
/* Dimension 7: Date Hygiene                                                  */
/* -------------------------------------------------------------------------- */

test("date hygiene: missing scores 0.0", () => {
  assert.equal(rubric.scoreDateHygiene({}), 0.0);
  assert.equal(rubric.scoreDateHygiene({ created_date: "" }), 0.0);
});

test("date hygiene: present but non-ISO scores 0.5", () => {
  assert.equal(rubric.scoreDateHygiene({ created_date: "06/02/2026" }), 0.5);
  assert.equal(rubric.scoreDateHygiene({ created_date: "June 2, 2026" }), 0.5);
  // ISO-shaped but not a real date falls back to 0.5.
  assert.equal(rubric.scoreDateHygiene({ created_date: "2026-13-45" }), 0.5);
});

test("date hygiene: ISO 8601 date or datetime scores 1.0", () => {
  assert.equal(rubric.scoreDateHygiene({ created_date: "2026-06-02" }), 1.0);
  assert.equal(
    rubric.scoreDateHygiene({ created_date: "2026-06-02T10:30:00Z" }),
    1.0
  );
});

/* -------------------------------------------------------------------------- */
/* Priority bucketing                                                         */
/* -------------------------------------------------------------------------- */

test("priority bucketing: boundaries map correctly", () => {
  assert.equal(bucketPriority(0), "critical");
  assert.equal(bucketPriority(50), "critical");
  assert.equal(bucketPriority(51), "medium");
  assert.equal(bucketPriority(75), "medium");
  assert.equal(bucketPriority(76), "good");
  assert.equal(bucketPriority(100), "good");
});

/* -------------------------------------------------------------------------- */
/* Integration: full scorer                                                   */
/* -------------------------------------------------------------------------- */

test("integration: a perfect asset scores 100 and is good", () => {
  const asset = {
    asset_id: "P-1",
    title: "Winter Apparel Hero Banner",
    description: "Hero banner promoting the winter apparel collection launch.",
    alt_text: "Models wearing winter apparel in a snowy outdoor setting",
    tags: ["apparel", "winter", "hero"],
    category: "fld-9901",
    source_url: "https://cdn.example.com/winter-hero.jpg",
    created_date: "2026-06-02"
  };
  const result = scoreAsset(asset);
  assert.equal(result.overall_score, 100);
  assert.equal(result.priority, "good");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.suggestions, []);
});

test("integration: a mid asset reproduces the documented L-1001 example (64, medium)", () => {
  const asset = {
    asset_id: "L-1001",
    title: "Winter Apparel Hero Banner",
    tags: ["winter", "banner"],
    category: "fld-9901",
    source_url: "https://cdn.example.com/winter-hero.jpg",
    created_date: "2026-06-02"
  };
  const result = scoreAsset(asset);
  assert.equal(result.overall_score, 64);
  assert.equal(result.priority, "medium");
  assert.deepEqual(result.dimensions, {
    title_quality: 1.0,
    description_completeness: 0.0,
    alt_text_presence: 0.0,
    tag_richness: 0.6,
    category_mapping: 1.0,
    url_validity: 1.0,
    date_hygiene: 1.0
  });
  assert.deepEqual(result.issues, [
    "Description is missing",
    "Alt-text is missing",
    "Only 2 tags, below the recommended 3 or more"
  ]);
  assert.deepEqual(result.suggestions, [
    "Generate a 20+ character description capturing the asset's marketing context",
    "Generate descriptive alt-text for accessibility and SEO",
    "Add tags drawn from the asset's category, content theme, and intended use case"
  ]);
});

test("integration: a critical asset scores low and flags every dimension", () => {
  const asset = { asset_id: "C-1" };
  const result = scoreAsset(asset);
  assert.equal(result.overall_score, 0);
  assert.equal(result.priority, "critical");
  // Every dimension below 1.0 produces one issue and one suggestion.
  assert.equal(result.issues.length, 7);
  assert.equal(result.suggestions.length, 7);
  assert.equal(result.asset_id, "C-1");
});
