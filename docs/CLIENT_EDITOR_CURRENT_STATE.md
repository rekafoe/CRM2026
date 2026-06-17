# Client Editor Current State

Last updated: 2026-06-17

This handoff captures the current production state of the client/public Fabric editor shared between CRM and the website.

## Repositories

| Repository | Path | GitHub | Branch |
|---|---|---|---|
| CRM | `D:\CRM` | `rekafoe/CRM2026` | `main` |
| Website | `D:\printcore-website` | `Andryteck/printcore-website` | `main` |

The website contains a vendored copy of the CRM editor at `D:\printcore-website\vendor\crm-design-editor`.

Important: when changing editor code, update the CRM source first and mirror the same change into the website vendor copy unless the change is website-only.

## Latest Pushed Commits

| Repository | Commit | Message |
|---|---|---|
| CRM | `fffbeb78` | `fix(client-editor): improve text editing and checks` |
| Website | `22be08c8` | `fix(client-editor): improve text editing and checks` |
| CRM | `6cd5cb91` | `fix(client-editor): stabilize canvas editing flow` |
| Website | `9c6551cd` | `fix(client-editor): stabilize canvas editing flow` |

## Main Fixes Already Done

### Canvas Stability

- Follow-up fix: page transitions now commit the outgoing live canvas into `pages[]` inside `runPageLoadKeyTransition()` before loading the incoming page/spread. This prevents page switching from depending only on external debounced flush timing.
- Stability reset (race hardening): pending document commits are now stamped by `pageLoadKey` and invalidated on page transitions; stale delayed commits can no longer overwrite a newly loaded page state.
- `flushPendingDocumentCommit()` now waits for page transition idle before commit instead of returning early under lock.
- Page merge during `commitCanvasToPages()` no longer relies on stale closure values of `currentPage/navigation`; refs are used to avoid wrong-page writes during rapid strip clicks.
- Draft persist now waits for transition idle before building payload, and no longer force-applies `setPages(updatedPages)` after save (avoids clobber race).
- Default autosave interval is reduced from 180s to 30s to improve reload recovery without forcing server-save on every strip click.
- Added debounced and flushable commit flow from live canvas to `pages[]`.
- Removed heavy `commitCanvasToPages()` from the text-edit exit path.
- Coalesced `text:changed` and text toolbar updates through debounced snapshots.
- Added `flushPendingDocumentCommit()` before save, navigation, checkout, and check-tab analysis.
- Made `commitCanvasToPages()` return the fresh `pages[]` so preflight/save do not read stale state.
- Moved thumbnail generation out of the critical page-strip path: `toDataURL()` is now delayed and cancelled if the user switches pages again.

### Text Editing

- Added an explicit `Текст` button to the desktop floating toolbar.
- Made the mobile `В окне` button always open the bottom-sheet text editor.
- Changed `beginTextEditingForActive()` on coarse/mobile so it opens the text sheet instead of silently entering Fabric text editing.
- Made mobile/coarse double tap open the text sheet.
- Strengthened desktop double-click with fallback target resolution through `resolveInteractiveTargetAtScene()`.
- Made the mobile text toolbar a fixed bottom overlay above the canvas so it no longer pushes the canvas to the right.
- Enlarged mobile font/family/size controls and normalized touch targets; size `+/-` controls are easier to use.

### Preflight And Check Tab

- Removed the service warning `Есть несохранённые изменения` from preflight issues.
- Check tab now flushes the live canvas before analysis.
- This should reduce false warnings that previously did not disappear after edits.

### Website Draft URL Flow

- Previously a draft was created but the URL stayed as `?templateId=25`.
- The route now accepts `draft`, and client/inner components pass `initialDraftToken`.
- After draft creation, the URL is replaced with `...?templateId=25&draft=<token>`.
- Reopening the editor picks up the draft token from the URL.

### Wide-Format 404

- Console showed `GET /services/wide-format/posters?_rsc=... 404`.
- Cause: header/footer linked to `/services/wide-format/<slug>`, but the route did not exist.
- Added `app/services/wide-format/[slug]/page.tsx` on the website; it redirects to `/services/wide-format`.

### Page Count

- For products with `step=4`, adding pages no longer fails.
- The editor automatically adds the required number of pages and shows an informational modal.

### Spread Canvas

- Fixed the issue where the left side was empty and the right side did not load by using a direct JSON merge in spread mode.

### Prepress Overlay

- Increased safe-zone and spread join hints.
- Added background plaques and a stronger vertical seam warning.

## Frequently Touched Files

### CRM

- `frontend/src/pages/admin/designEditor/DesignEditorCanvas.tsx`
- `frontend/src/pages/admin/designEditor/canvas/useDesignEditorCanvasHistory.ts`
- `frontend/src/pages/admin/designEditor/canvas/registerCanvasEventHandlers.ts`
- `frontend/src/pages/admin/designEditor/canvas/createDesignEditorCanvasHandle.ts`
- `frontend/src/pages/admin/designEditor/canvas/canvasPageTransitions.ts`
- `frontend/src/pages/admin/designEditor/TextFormattingControls.tsx`
- `frontend/src/pages/admin/designEditor/TextMobileToolbar.css`
- `frontend/src/pages/admin/designEditor/EditorInAppFieldSheets.css`
- `frontend/src/features/publicDesignEditor/PublicDesignEditor.tsx`
- `frontend/src/features/publicDesignEditor/publicDesignPreflight.ts`
- `frontend/src/features/publicDesignEditor/usePublicDesignPageActions.ts`
- `frontend/src/features/publicDesignEditor/usePublicDesignDraftActions.ts`

### Website

- `components/poligrafy/PoligrafyDesignEditorInner.tsx`
- `components/poligrafy/PoligrafyDesignEditorClient.tsx`
- `app/services/poligrafy/[slug]/[typeId]/order/editor/page.tsx`
- `app/services/wide-format/[slug]/page.tsx`
- `vendor/crm-design-editor/...`

## Verification Commands

### CRM

```powershell
cd D:\CRM\frontend
node ./node_modules/typescript/bin/tsc --noEmit
```

This passed after the latest pushed CRM changes.

### Website

```powershell
cd D:\printcore-website
npm test
```

This passed with `72 passed, 1 skipped`.

`npm run lint:ts` on the website previously failed on older project TypeScript errors outside the editor/vendor area; those were not considered regressions.

## Current Git State

- CRM: clean for tracked changes after the last push, but contains old untracked files in `D:\CRM` such as `tools/*`, miniapp JS files, and `.docx` files. Do not touch them unless explicitly asked.
- Website: clean after the last push.

## Manual Checks After Deploy

Use a production editor URL such as:

```text
/services/poligrafy/albums/photo-album/order/editor?templateId=25
```

Check the following:

- URL becomes `?templateId=25&draft=...` after draft creation.
- On desktop, selecting text shows a floating toolbar with `Текст`; the button opens the text editing dialog.
- On mobile, the text toolbar opens at the bottom above the canvas and does not push the canvas to the right.
- Font and size are selectable on mobile.
- Switching the page strip back and forth does not degrade the canvas.
- After fixing text or photos, opening `Проверка` refreshes warnings after flushing the live canvas.

## Related Docs

- `docs/client-editor-site-integration.md`
- `docs/client-editor-crm-site-boundary.md`
- Website: `D:\printcore-website\docs\CLIENT_DESIGN_EDITOR.md`
