---
name: Autosave queue
description: Debounced + ordered + retried persistence for pautas/materials inputs
type: feature
---
All edits to `pautas.raw_inputs_json` and `episode_materials.*` go through `src/lib/autosave-queue.ts` (`enqueueUpdate`).
- Debounce 500ms per row, monotonic version per entity (out-of-order responses ignored).
- Exponential retry up to 4 attempts; snapshot kept in `localStorage` (`autosave:<table>:<id>`) until confirmed saved.
- `recoverAutosaveSnapshots()` re-enqueues leftovers on app boot (called from AppContext after initial load).
- `beforeunload` guard installed once globally; flushes pending writes.
- Global UI: `<AutosaveBadge/>` (Pautas, Materiais, Releases headers) reads `useAutosaveStatus()`.
- View toggles use `useViewMode(key)` + `<ViewModeToggle/>`. Default mode is `table` for Releases/Pautas/Materiais.
