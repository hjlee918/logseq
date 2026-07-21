# Logseq Fork — `{{embed ((uuid))}}` Revival for Roam Research Compatibility

> **Status:** Phase 1B complete. The original plan (improve a hypothetical `block_embed.cljs` pipeline) was overturned by Phase 1 investigation and re-scoped here. This document supersedes the v1 plan.

## 1. Project Overview

### Goal
Revive the deprecated `{{embed ((uuid))}}` macro so it renders the referenced block **and its full descendant subtree** inline in the page, matching Roam Research's transclusion behavior — by routing the macro through Logseq's existing, working `:block/link` embed rendering pipeline rather than building any new pipeline.

### Background
The user has a Digital Zettelkasten built in Roam Research. Roam uses `{{embed ((block-uid))}}` for block transclusion: it renders the referenced block and all descendants as a full recursive tree, inline-editable, with edits propagating to the original. When this data lands in Logseq, every `{{embed ((uuid))}}` renders only a deprecation warning ("{{embed}} is deprecated. Use '/Node embed' command instead.") — so the user's notes do not display the way they did in Roam.

### Technical Reality (corrected from Phase 1)
- **No re-frame.** Logseq uses a custom reactivity layer: `db.react/react/q`, `db.hooks/use-query`, `db.model/sub-block`, plus a core.async event bus (`state/pub-event!` → `defmulti handle`). The original plan's "re-frame subscriptions" assumption was wrong.
- **No `block_embed.cljs`.** The original plan's primary target file does not exist. The real embed mechanism is the **`:block/link`** attribute on a block, rendered by `block-item-inner` / `block-container` in `src/main/frontend/components/block.cljs`.
- **`:block/link` embeds already satisfy all three original goals** (recursive subtree with no depth limit, inline editing, reverse mapping to the original block's page file). Phase 1 confirmed this. So there is nothing to *build* for `:block/link` — only to *expose* the same path for `{{embed ((uuid))}}`.
- **Schema is not what the v1 plan assumed.** There is no `:block/content`, `:block/left`, `:block/children`, `:block/file`, or `:block/lineno`. Content lives in `:block/title`; order in `:block/order`; children are the reverse of `:block/_parent`; owning page is `:block/page`. Files are regenerated **whole-page**, not by line-mapping individual blocks.
- **`{{embed}}` deprecation is policy, not a technical impossibility.** The deprecation string lives in `src/resources/dicts/en.edn:127`. There is no architectural conflict forcing it.
- **No Roam importer exists.** Import handlers cover EDN / sqlite / sqlite-zip / debug-transit only. Roam-JSON import was deleted; only a dead `(comment …)` Roam-JSON *export* remains (`handler/export.cljs:169-197`).

### Roam's 5 Fundamentals (ref: https://www.youtube.com/watch?v=P60-XvcIT5g)
1. Daily Notes — Logseq: fully supported
2. Nesting — Logseq: fully supported
3. Pages `[[ ]]` — Logseq: fully supported
4. Hashtags `#` — Logseq: fully supported
5. Block References & Transclusion — Logseq `:block/link` works; **`{{embed ((uuid))}}` syntax is broken (deprecation warning)**. This is the gap this project closes.

## 2. Strategy

**Chosen bridge: Render-time macro interception in `macro-cp` (Option 2).**

`{{embed ((uuid))}}` is **inline body text**. `:block/link` is a **block-level, single-valued** `:db.type/ref` (schema `:db.cardinality/one`). Options that tried to convert the macro into a `:block/link` at parse/import time (Options 1 and 3) fight the data model: a block body like `"text {{embed ((uuid))}} more text"` cannot become the block's one `:block/link` without splitting the block or only handling the whole-body special case — both lossy and surprising.

Instead, intercept the macro at render time. In `macro-cp` (`src/main/frontend/components/block.cljs:1677`), replace the unconditional deprecation branch at **L1740-1741** with logic that:
1. Parses the first argument as `((uuid))` via `logseq.common.util.block-ref/get-block-ref-id` (UUID-only). If it is not a valid UUID → fall back to the existing deprecation warning (preserves behavior for non-block-embed usages).
2. **Cycle guard:** reads a new `:embed-links` UUID set threaded through `config` (precedent: `page-reference` uses `:ref-set` at L1217-1218). If the UUID is already in the set → render a cycle warning (prevents `A embeds B, B embeds A` infinite recursion).
3. Otherwise return `[block-container (-> config (assoc :embed? true :embed-id uuid) (update :embed-links (fnil conj #{}) uuid)) {:block/uuid uuid}]`.

`block-container` (L4753) already async-fetches the block **and its children** (`db-async/<get-block` with default `:children? true`) and renders the full subtree via the **same code path** used by the `/Node embed` slash command. No schema, parser, importer, or outliner changes. No new block identities. No file rewrites. Estimated diff: ~15-25 lines in `block.cljs` plus an optional small helper and a CSS rule for a visual frame.

**Why not the other options:**
- **Option 1 (parse-time transform to `:block/link`):** Cannot preserve inline-in-body semantics; would require splitting host blocks or only handling whole-body embeds; changes block identities; conflicts with the `:block/macros` model. Complexity LARGE.
- **Option 3 (Roam import-time transform):** No Roam importer exists to attach to; would only help future imports, not existing graphs that already contain `{{embed ((uuid))}}`. Dismissed.

## 3. Phases

> Phases 0 and 1 are complete. The original 8-phase plan is replaced below.

- **Phase 0 — Dev environment + git init.** ✅ Done. Fork `hjlee918/logseq`, branch `feature/block-embed-improvement`, pnpm (not yarn) build verified, dev server on port 3001.
- **Phase 1 — Codebase exploration.** ✅ Done. `CODE_MAP.md` (commit `35d92a133d`) mapped the corrected pipeline and overturned the original premise.
- **Phase 1B — Deep investigation + re-scoping.** ✅ Done (this commit). Traced `{{embed}}` deprecation history, mapped the `:block/link` pipeline end-to-end, evaluated bridge options, documented edge cases, re-scoped the project.
- **Phase 2 — Implement render-time bridge in `macro-cp`.** Replace the deprecation branch with the `block-container` dispatch + `:embed-links` cycle guard. Add optional `embed-block-cp` helper. Verify the embedded block's content + children render inline.
- **Phase 3 — Visual frame + DOM fit.** Logseq block embeds have **no CSS** for `.embed-block` (unlike Roam's bordered box). Add a minimal wrapper/CSS rule so revived `{{embed}}` is visually distinguishable, matching Roam's presentation. Verify the inline `block_container` (renders as `.ls-block` with its own bullet/indent) sits acceptably inside a paragraph; wrap if needed.
- **Phase 4 — Edge-case handling + testing.** Verify: multiple embeds of the same block; nested embeds (A→B→C, no cycle); true cycles (A↔B, guard fires); cross-page embeds; editing the `{{embed ((uuid))}}` text line to retarget (re-parses on save). Confirm graceful "block not found" warning for unresolved UUIDs.
- **Phase 5 — Roam-UID consideration (optional, Supervisor decision).** Roam UIDs (`Oct-14-2020_1234`) don't match the strict UUID regex, so `{{embed ((roam-uid))}}` cannot resolve without a UID→UUID mapping. Since no Roam importer exists, this is out of scope unless the user supplies a separate import/migration step. Document and defer.

## 4. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| `block_container` rendered inline inside a paragraph looks wrong (bullet/indent inside text flow) | Medium | Wrap in `[:div.embed-block …]`; add CSS. Verify against Roam's visual. Phase 3. |
| Infinite recursion via `{{embed}}` cycles | Medium | `:embed-links` UUID set threaded through config, mirroring `:ref-set`. Phase 2. |
| `:embed-links` vs reusing `:links` — mixing UUIDs and db/ids could over-suppress legitimate nested `:block/link` embeds | Low | Use a **separate** `:embed-links` UUID set (recommended), not the existing `:links` db-id set. |
| Performance: every render resolves the macro and async-loads the block | Low | This is the same cost `/Node embed` already pays; acceptable. Monitor deep nesting. |
| Large embeds (≥100 descendants) lazy-load instead of full-depth | Low | Pre-existing `:block/link` behavior (`initial_data.cljs:235`), not introduced by this change. Accept for now. |
| Reversing an intentional deprecation may surprise upstream / future Logseq updates | Medium | This is a personal fork for the user's Roam data. Keep the change isolated and well-commented; preserve the deprecation warning as the fallback for non-UUID args. |
| Roam UIDs don't resolve (no importer) | Known | Out of scope (Phase 5). Render graceful "block not found" warning. |

## 5. Testing Plan

1. **Unit/behavioral (manual, in dev server):**
   - Create a block tree A → B → C (B child of A, C child of B). In another page, write `{{embed ((<A-uuid>))}}`. Verify the full A→B→C subtree renders inline.
   - Cycle: A's body contains `{{embed ((B))}}`, B's body contains `{{embed ((A))}}`. Verify a cycle warning renders instead of hanging the renderer.
   - Multiple embeds: embed the same block twice in one block body and in two different pages. Verify both render independently.
   - Cross-page: embed a block from page X into page Y. Verify it renders and that editing inside the embed updates X's file.
   - Editing the macro line: change the UUID in `{{embed ((uuid))}}` and save. Verify the rendered target updates on re-parse.
   - Non-UUID arg: `{{embed ((not-a-uuid))}}` or `{{embed [[Some Page]]}}` still shows the existing deprecation/fallback behavior (no regression).
2. **Reverse-mapping:** edit text inside an embedded block; confirm the original block's owning page Markdown file regenerates with the new content (existing `markdown-mirror` path, already works for `:block/link`).
3. **Visual:** confirm the embed has a visible frame (Roam-like border) and does not break page layout at various nesting depths.
4. **Regression:** existing `/Node embed` slash-command embeds still render and edit identically (the bridge reuses their code path; verify nothing shared was perturbed).