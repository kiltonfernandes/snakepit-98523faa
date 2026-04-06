

## Plan: Multi-fix — Sorting, Comments in Prompts, Section Data Sources, Review Filter Fix

### 1. Dashboard History: Sort oldest → newest
**File:** `src/pages/Dashboard.tsx` (lines 133-140)
- Change year sort from `Number(b) - Number(a)` → `Number(a) - Number(b)`
- Change month sort from `Number(b) - Number(a)` → `Number(a) - Number(b)`  
- Change weeks sort from `b.start_date.localeCompare(a.start_date)` → `a.start_date.localeCompare(b.start_date)`

### 2. Release Comments in ALL Prompts
**File:** `src/lib/prompt-builder.ts`

Currently `buildDayPayload` (line 87) enriches inputs with `review_rafa_release` and `review_kilton_release` strings like `Artist - Album (date)`. These get serialized into the context XML via `renderContextXml`.

**Changes:**
- In `buildDayPayload`, when enriching review releases (lines 109-121), also include `r.comments` if present: `"Artist - Album (date) | Comentário do editor: ..."` 
- For `selected_releases` (Saturday), same treatment
- In `renderContextXml`, the data already flows through `raw_inputs` so no extra changes needed — the comments will be part of the enriched strings

This covers `buildWeekPrompt`, `buildDayPrompt`, `buildSectionPrompt` (all call `buildDayPayload` → `renderContextXml`).

For `buildMaterialTitlesPrompt` and `buildMaterialDescriptionsPrompt`, the context comes from `pauta.sections_json` (already generated content), so comments are already baked in at that point.

### 3. Section Data Source Configuration (Pauta Templates)
**Concept:** Each section in a template can declare what data sources it reads from. This enables fully customizable sections.

**Database:** Add a `data_sources` array to each section in `pauta_templates.sections_config` JSON. No migration needed — it's already a JSONB field with flexible structure.

**Type update in `src/lib/types.ts`:**
```typescript
export interface PautaTemplateSectionConfig {
  key: string;
  label: string;
  enabled: boolean;
  core_prompt: string;
  data_sources?: Array<{
    type: 'free_text' | 'url' | 'releases_lookup' | 'releases_review';
    label: string;
    input_key: string; // maps to raw_inputs_json key
  }>;
}
```

**UI in Pautas.tsx (template section editor):** For each section, render input fields based on its `data_sources`:
- `free_text` → Textarea
- `url` → URL input
- `releases_lookup` → ReleasePicker (uses eligible releases)  
- `releases_review` → ReleasePicker with dedup logic

**Prompt builder:** In `buildDayPayload`, read the template's `data_sources` to know which `raw_inputs` keys to enrich with release data. This makes the enrichment logic generic instead of hardcoded to `review_rafa_id`/`review_kilton_id`.

### 4. Fix Review Dropdown Date Filter (CRITICAL)
**File:** `src/pages/Pautas.tsx`

The `getEligibleReviews` function (line 39) looks correct in isolation. The likely issue is that the `pauta.publication_date` being passed doesn't match what the user expects. 

**Debug approach:** Add defensive logging and verify the actual `publication_date` value. Also ensure the `ReleasePicker` component is receiving the correct pauta — the Flow view iterates `flowWeekdayPautas` and each step renders for ALL weekday pautas simultaneously (lines 1190-1270), so each `ReleasePicker` should receive its specific pauta.

**Fix:** Re-examine the Flow rendering. Currently in the Flow (lines ~1190-1270), the code iterates over `flowWeekdayPautas` and renders a card per pauta per step. The `ReleasePicker` receives `pauta={pauta}` which should have the correct `publication_date`. But the `groupReleasesByWeekAndGenre` function sorts weeks from newest to oldest (line 109: `b.weekLabel.localeCompare(a.weekLabel)`). Since `getEligibleReviews` filters D-90 to D-1, releases from April 30 should NOT appear for a pauta dated April 6.

**Root cause hypothesis:** The `releases` array may contain items that aren't properly date-filtered because `getEligibleReviews` uses `new Date(publicationDate + 'T12:00:00')` but the release dates might have timezone issues. Will add explicit date string comparison (YYYY-MM-DD) to be safe:
```typescript
function getEligibleReviews(releases: Release[], publicationDate: string): Release[] {
  const pub = new Date(publicationDate + 'T12:00:00');
  const dMinus90 = new Date(pub); dMinus90.setDate(pub.getDate() - 90);
  const dMinus1 = new Date(pub); dMinus1.setDate(pub.getDate() - 1);
  const minDate = dMinus90.toISOString().slice(0, 10);
  const maxDate = dMinus1.toISOString().slice(0, 10);
  return releases.filter(r => r.release_date >= minDate && r.release_date <= maxDate);
}
```
Using string comparison on YYYY-MM-DD format eliminates any timezone issues.

Same fix for `getEligibleSaturdayReleases`.

### 5. Release Dropdown Sort: oldest → newest
**File:** `src/pages/Pautas.tsx`

In `groupReleasesByWeekAndGenre` (line 105): change release sort from `b.release_date.localeCompare(a.release_date)` → `a.release_date.localeCompare(b.release_date)`.

Week groups sort (line 109): change from `b.weekLabel.localeCompare(a.weekLabel)` → `a.weekLabel.localeCompare(b.weekLabel)`.

---

### Summary of files to edit:
1. `src/pages/Dashboard.tsx` — history sort order
2. `src/pages/Pautas.tsx` — date filter fix, sort order fix, template-driven section inputs
3. `src/lib/prompt-builder.ts` — inject release comments into all prompt contexts
4. `src/lib/types.ts` — add `data_sources` to `PautaTemplateSectionConfig`

