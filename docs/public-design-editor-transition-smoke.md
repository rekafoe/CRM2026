# PublicDesignEditor Transition Smoke

## Purpose

This checklist verifies that page navigation stays idempotent and does not degrade canvas content after repeated `next/back` transitions.

## Preconditions

- Open sandbox route `/adminpanel/public-design-editor-preview/:templateId?mode=multipage`.
- Use a template with at least one photo field and one text field.
- Wait until fonts and thumbnails are loaded.

## Scenario 1: Repeated Next/Back

- Place one photo and edit one text field on the current page.
- Run 20-30 cycles: `next -> back`.
- After each cycle, verify:
  - no objects disappear,
  - no black/duplicated objects appear,
  - object positions and sizes stay unchanged.

## Scenario 2: Insert Photo + Immediate Navigation

- Upload a photo and place it into a photo field.
- Immediately click `next`, then `back`.
- Verify the photo remains in the same field and crop state is preserved.

## Scenario 3: Preflight-Driven Navigation

- Open the check/preflight panel and click issues from different pages/fragments.
- Verify each jump lands on the correct fragment.
- Return back and forth through the same issue list.
- Confirm no additional canvas mutations happen without user edits.

## Scenario 4: Draft Recovery

- Make visible edits on multiple pages.
- Wait for autosave.
- Reload the page.
- Verify the restored draft matches the latest visible state before reload.

## Dev Diagnostics (Transition Invariants)

During development, inspect Fabric upper canvas dataset:

- `data-page-requested-key`
- `data-page-displayed-key`
- `data-page-active-index`
- `data-page-object-count-before-flush`
- `data-page-object-count-after-load`

Expected behavior:

- requested and displayed keys converge after each transition,
- active index matches the visible page,
- object counts are non-negative and stable across repeated `next/back` without edits.
