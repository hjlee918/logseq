# Phase 1B Findings Summary

> Phase 1B was a read-only investigation (no source code changes). It deepened Phase 1's mapping, evaluated bridge strategies for reviving `{{embed ((uuid))}}`, enumerated edge cases, and re-scoped the project. This file is the condensed record; `PROJECT_PLAN.md` and `ARCHITECTURE.md` were rewritten from these findings.

## {{embed}} Deprecation History

- **Render:** `{{embed ((uuid))}}` renders only `[:div.warning (t :block.macro/embed-deprecated)]` at `src/main/frontend/components/block.cljs:1740-1741` inside `macro-cp` (L1677).
- **Deprecation string:** `src/resources/dicts/en.edn:127` — "{{embed}} is deprecated. Use '/Node embed' command instead." Confirms the deprecation is **policy**, not a technical limitation.
- **Parse time (asymmetric):** `deps/graph-parser/src/logseq/graph_parser/block.cljs`:
  - `get-block-reference` (L112-118) *recognizes* `{{embed ((uuid))}}` (Macro branch, `name="embed"`).
  - `extract-block-refs` (L204-216) emits the target UUID into `:block-refs` → merged into `:block/refs` by `with-block-refs` (L530-534). So the embed target **is already captured as a ref at parse time** — it just isn't rendered.
  - `macro->block` (L594-600) produces a synthetic `:block/type "macro"` entity and **never sets `:block/link`**, even for embed macros. Macro blocks are stored under `:block/macros` of the host block as auxiliary (non-outline) entities (`extract-macros-from-ast`, L602-613; `with-parent-and-order`, L829-834).
- **File→DB import:** `deps/graph-parser/src/logseq/graph_parser/exporter.cljs:1892-1914` (`handle-embeds`) converts `{{embed [[page]]}}` and `{{embed ((strict-uuid))}}` to `:block/link`. Roam alphanumeric UIDs fall through to `:else` and remain literal text.
- **Conclusion:** `{{embed}}` is deprecated by policy. The infrastructure to recognize it and capture its target already exists at parse time; only the render branch is missing.

## :block/link Pipeline (Complete)

1. **Creation:** `/Node embed` slash command in `editor.cljs:288-308` (`block-on-chosen-handler`) → `api-insert-new-block!` with `:other-attrs {:block/link (:db/id (db/entity [:block/uuid id]))}`. New block carries a `:block/link` ref.
2. **Render:** `block-item-inner` (`block.cljs:5162-5185`) reads `linked-block (:block/link item)`; computes `loop-linked?` from the `(:links config)` db-id set (**cycle guard**); swaps `item` → `linked-block`; threads updated `:links` into config (L5167-5169); calls `block-container`.
3. **Fetch + subtree:** `block_container` (L4753-4776) → `db-async/<get-block` (default `:children? true`, `db/async.cljs:137`) → children via `block-children` (L2010) and recursion (L4633) — **no depth limit**.
4. **Editing:** `edit-block!` (`handler/block.cljs:112`) → `set-editing!` (`state.cljs:1914`, no embed gate) → `save-current-block!` (`editor.cljs:1402`) → `save-block-inner!` (L258) issues `:save-block` op on the **linked block's UUID**. Edits land on the original block. No embed gate blocks inline editing.
5. **Reverse mapping:** `markdown-mirror` (`worker/markdown_mirror.cljs`): `page-id-for-entity` (L115) follows `:block/page` of the *edited* (original) block; `render-page-content` (L523) whole-page regenerates that page; `embed-target` (L320) follows `:block/link` so the host page mirror re-walks embedded content. Cross-page embeds already supported.

All three original goals (recursive subtree, inline editing, reverse mapping) **already work** for `:block/link` embeds.

## Bridge Strategy Recommendation

**Adopt Option 2 — render-time macro interception in `macro-cp`.**

The decisive constraint: `{{embed ((uuid))}}` is **inline body text**; `:block/link` is a **block-level, single-valued** `:db.type/ref` (schema `:db.cardinality/one`). Options 1 and 3 fight the data model.

| Option | Where | Handles inline-in-body? | Complexity | Verdict |
|--------|-------|--------------------------|-----------|---------|
| 1. Parse-time → `:block/link` | `graph_parser/block.cljs` (`macro->block`, `extract-blocks`, `with-parent-and-order`) | **No** — would require splitting host blocks or only whole-body case | LARGE | Rejected |
| 2. Render-time `macro-cp` interception | `block.cljs:1740-1741` | **Yes** — only option that does | SMALL | **Chosen** |
| 3. Roam import-time transform | (no importer exists) | No | LARGE (build importer first) | Dismissed |

**Exact change (Option 2):**
- File: `src/main/frontend/components/block.cljs`, function `macro-cp` (L1677), branch `(= name "embed")` at L1740-1741.
- Replace `[:div.warning (t :block.macro/embed-deprecated)]` with a call to a new helper `embed-block-cp config arguments`:
  1. Parse first arg via `logseq.common.util.block-ref/get-block-ref-id` (UUID-only). If nil → return the existing deprecation warning (fallback, no regression).
  2. Cycle guard: if UUID in `(:embed-links config #{})` → return warning Hiccup.
  3. Else return `[block-container (-> config (assoc :embed? true :embed-id uuid) (update :embed-links (fnil conj #{}) uuid)) {:block/uuid uuid}]`.
- Reuse: `block_container` already fetches + renders the subtree (same path as `/Node embed`). The `:embed?` / `:embed-id` config keys are already read at L4214-4215 / L4256-4257, so reuse is consistent.
- Cycle guard precedent: `page-reference` (L1205, L1217-1218) threads `:ref-set` exactly this way.
- Estimated diff: ~15-25 lines in `block.cljs`. No schema/parser/importer/outliner changes.
- **Caveats to verify at implementation:** (a) `block_container`'s `:embed?`/`:embed-id` semantics produce the desired content+children view (the `/Node embed` slash command uses this exact path, so behavior should match); (b) prefer a **separate** `:embed-links` UUID set over reusing `:links` (which mixes UUIDs and db/ids and could over-suppress legitimate nested `:block/link` embeds); (c) an inline `block_container` (`.ls-block` with bullet/indent) nested inside a paragraph may need a `[:div.embed-block …]` wrapper + CSS.

## Edge Cases

- **B1 — Roam UID vs Logseq UUID:** No UID→UUID mapping exists (no Roam importer). `block-ref-re` (`block_ref.cljs:9`) is strict-UUID; Roam UIDs like `Oct-14-2020_1234` don't match. `string-block-ref?` is looser but parse-time `parse-uuid` filters non-UUIDs. → `{{embed ((roam-uid))}}` cannot resolve without a separate import/migration step. Option 2 inherits whatever UUID is in the text; unresolved UUIDs render a graceful "block not found" warning. **Out of scope** (deferred to optional Phase 5).
- **B2 — Multiple embeds of the same block:** `:block/link` is `:db.cardinality/one`, so one block can link to only one target — but *distinct* embedding blocks can each link to the same target, which works. For the text-based `{{embed ((uuid))}}` (Option 2), multiple embeds (even in the same block body) are trivially fine — repeated text, each `macro-cp` returns its own `block-container`. The `:embed-links` guard keys per render-path, so duplicate embeds in *different* branches don't conflict; only true cycles are blocked.
- **B3 — Nested embeds (A embeds B, B embeds C):** `:block/link` chains recurse with `:links` accumulating db/ids; true cycles (C → B) flip `loop-linked?` and suppress re-render (L5171/L5175). For Option 2, `macro-cp` needs its own `:embed-links` UUID set (analogous to `:ref-set`); true cycles (A↔B) are caught because the inner `macro-cp` sees A's UUID already in `:embed-links`. Legitimate deep nesting (A→B→C) renders fully. The guard prevents only true cycles, not depth.
- **B4 — Cross-page embeds:** `:block/link` works cross-page; `block_container` fetches by `:block/uuid` regardless of `:block/page`; the mirror already re-walks `:block/link` cross-page via `embed-target`. For Option 2 the `{{embed ((uuid))}}` text stays verbatim in the host file; the embedded block's own page mirrors independently when it changes. Works.
- **B5 — Editing the embed line itself:** Option 2 is text-based — editing the `{{embed ((uuid))}}` text (e.g. changing the UUID) re-parses on save and `macro-cp` re-renders against the new UUID (Roam-like UX). Options 1/3 require changing `:block/link` via the slash-command/drag flow, not text editing — different UX from Roam.

## Revised Phase Plan

- Phase 0 (env + git) ✅
- Phase 1 (codebase exploration → `CODE_MAP.md`) ✅
- Phase 1B (this investigation + re-scoping) ✅
- **Phase 2** — Implement the render-time bridge in `macro-cp` + `:embed-links` cycle guard (+ optional `embed-block-cp` helper).
- **Phase 3** — Visual frame: add `.embed-block` CSS / wrapper for Roam-like bordered box; verify inline `block_container` DOM fit.
- **Phase 4** — Edge-case verification + testing (multiple embeds, nested, cycles, cross-page, retarget-on-edit, graceful unresolved-UUID warning, `/Node embed` regression).
- **Phase 5 (optional, Supervisor decision)** — Roam-UID handling if the user supplies a separate import/migration step; otherwise document as out of scope.