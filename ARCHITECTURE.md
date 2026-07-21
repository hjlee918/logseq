# Technical Architecture (Corrected)

> Corrected by Phase 1 (`CODE_MAP.md`) and Phase 1B investigation. The v1 architecture doc assumed re-frame, a `block_embed.cljs` file, and a `:block/content` / `:block/children` / `:block/left` / `:block/file` / `:block/lineno` schema. **All of those assumptions were wrong.** This document reflects the actual codebase at `master`.

## 1. Actual Logseq Architecture

### Reactivity System (custom, NOT re-frame)
There is **no re-frame**. Logseq uses a custom reactive Datalog layer and a core.async event bus:
- `db.react/react/q` — reactive Datalog query primitive.
- `db.hooks/use-query` — React hook wrapping a reactive query.
- `db.model/sub-block` — block subscription.
- Event bus: `state/pub-event!` → `defmulti handle` (dispatch in `src/main/frontend/handler/events.cljs:59`).
- Outliner mutations go through the `ui-outliner-tx/transact!` macro, not re-frame events.

### Data Schema (Datalog; `deps/db/src/logseq/db/frontend/schema.cljs`)
Key block attributes:
| Attribute | Type | Notes |
|-----------|------|-------|
| `:block/uuid` | uuid | block identity |
| `:block/title` | string | **the block's content** (NOT `:block/content`) |
| `:block/order` | number | sibling order (NOT `:block/left`) |
| `:block/_parent` | ref (reverse) | **children** = reverse lookup of `:block/parent` (NOT `:block/children`) |
| `:block/parent` | ref | parent block |
| `:block/page` | ref | owning page |
| `:block/link` | `:db.type/ref`, index, **`:db.cardinality/one`** (default) | the embed link — single-valued, stores a `:db/id` (int), not a UUID |
| `:block/refs` | many ref | accumulated block references (incl. embed target UUID at parse time) |
| `:block/macros` | — | inline macros stripped from AST and stored here as auxiliary non-outline entities |

**Explicitly absent:** `:block/content`, `:block/left`, `:block/children`, `:block/file`, `:block/lineno`. Block→file position mapping does **not** exist; Markdown files are regenerated **whole-page** by `markdown-mirror`.

### Key Files (actual)
| File | Purpose |
|------|---------|
| `src/main/frontend/components/block.cljs` | Core block rendering; `macro-cp`, `block-container`, `block-item-inner`, `block-children`, `build-block` |
| `src/main/frontend/components/editor.cljs` | `/Node embed` slash command → `api-insert-new-block!` with `:other-attrs {:block/link …}` |
| `src/main/frontend/components/block.css` | Block CSS — **no `.embed-block` rule exists** (gap vs Roam's bordered box) |
| `src/main/frontend/handler/block.cljs` | `edit-block!` edit entry funnel |
| `src/main/frontend/handler/editor.cljs` | `save-current-block!` → `save-block-inner!` (`:save-block` op on the *linked* block UUID) |
| `src/main/frontend/db/async.cljs` | `db-async/<get-block` with default `:children? true` |
| `src/main/frontend/worker/markdown_mirror.cljs` | Whole-page Markdown regeneration; `page-id-for-entity`, `render-page-content`, `embed-target` |
| `deps/graph-parser/src/logseq/graph_parser/block.cljs` | Parse-time: `get-block-reference`, `extract-block-refs`, `macro->block`, `extract-blocks` |
| `deps/graph-parser/src/logseq/graph_parser/exporter.cljs` | `handle-embeds` — file→DB import converts `{{embed ((uuid))}}` to `:block/link` (UUID-only) |
| `deps/common/src/logseq/common/util/block_ref.cljs` | `block-ref-re` (strict UUID regex), `get-block-ref-id` |
| `src/resources/dicts/en.edn` | `:block.macro/embed-deprecated` deprecation string (L127) |

## 2. Embed Mechanism: `:block/link` (the working pipeline)

### Creation
`/Node embed` slash command (`editor.cljs:288-308`, `block-on-chosen-handler`) calls `api-insert-new-block!` with `:other-attrs {:block/link (:db/id (db/entity [:block/uuid id]))}`. A new block is created carrying a `:block/link` ref to the target.

### Rendering
1. `block-item-inner` (`block.cljs:5162-5185`) reads `linked-block (:block/link item)`.
2. Computes `loop-linked?` from the `(:links config)` set (a db-id set threaded down the recursion) — **cycle guard**.
3. If not a cycle: swaps `item` to `linked-block`, threads an updated `:links` set into `config` (L5167-5169), and calls `block-container`.
4. `block-container` (`block.cljs:4753-4776`) computes `id` and calls `db-async/<get-block` (default `:children? true`), async-fetching the block + children.
5. Children render via `block-children` (`block.cljs:2010`) and recursion (L4633) — **no depth limit**.

### Editing
Editing flows through the normal pipeline (`edit-block!` → `set-editing!` → `save-current-block!` → `save-block-inner!`). The `:save-block` op is dispatched on the **linked block's UUID**, so edits land on the original block. There is no embed gate blocking inline editing for `:block/link` embeds.

### Reverse mapping
`markdown-mirror` (`worker/markdown_mirror.cljs`): `page-id-for-entity` (L115) follows `:block/page` of the edited block — i.e. the **original** block's owning page — and `render-page-content` (L523) regenerates that whole page. `embed-target` (L320) follows `:block/link` so the host page's mirror re-walks embedded content. Cross-page embeds are already supported.

## 3. `{{embed}}` Deprecation History

- `{{embed ((uuid))}}` renders only `[:div.warning (t :block.macro/embed-deprecated)]` at `block.cljs:1740-1741` (inside `macro-cp`, L1677).
- The deprecation string is at `src/resources/dicts/en.edn:127`: "{{embed}} is deprecated. Use '/Node embed' command instead."
- At **parse time**, `graph_parser/block.cljs`'s `get-block-reference` (L112-118) *does* recognize `{{embed ((uuid))}}` and `extract-block-refs` captures the target UUID into `:block/refs` — but `macro->block` never sets `:block/link`, so the embed target is captured as a ref yet never rendered. The exporter's `handle-embeds` (`exporter.cljs:1892-1914`) converts `{{embed ((strict-uuid))}}` to `:block/link` on file→DB import; Roam UIDs fall through to `:else` and remain literal text.
- The deprecation is **policy** (push users to the `/Node embed` slash command), not a technical impossibility — no architectural conflict forces it.

## 4. Bridge Strategy (chosen: render-time interception in `macro-cp`)

`{{embed ((uuid))}}` is **inline body text**. `:block/link` is **block-level and single-valued**. Converting the macro to a `:block/link` at parse/import time would require splitting host blocks or only handling whole-body embeds — both lossy.

**Chosen change (Option 2):** intercept at render time in `macro-cp`.
- Replace `block.cljs:1740-1741` with: parse first arg as `((uuid))` via `block-ref/get-block-ref-id`; if not a valid UUID → keep the deprecation warning (fallback); if UUID is in `(:embed-links config #{})` → render cycle warning; else return `[block-container (-> config (assoc :embed? true :embed-id uuid) (update :embed-links (fnil conj #{}) uuid)) {:block/uuid uuid}]`.
- `block_container` already async-fetches block + children and renders the full subtree via the **same** path as `/Node embed`.
- Cycle guard precedent: `page-reference` (L1205, L1217-1218) threads `:ref-set` exactly this way.
- Optional helper `embed-block-cp`; optional CSS for a visual frame.
- Estimated diff: ~15-25 lines in `block.cljs`.

**Dismissed options:**
- Option 1 (parse-time `:block/link` transform): cannot preserve inline-in-body; changes block identities; conflicts with `:block/macros` model. LARGE.
- Option 3 (Roam import-time transform): no Roam importer exists; only helps future imports, not existing graphs. Dismissed.

## 5. Data Flow Diagram (corrected)

```
Markdown file (source of truth)
   │  graph-parser parse
   ▼
Datalog DB (Datahike/Datalevin)  — :block/title, :block/order, :block/_parent, :block/link, :block/refs
   │
   │  {{embed ((uuid))}} path (DEPRECATED today):
   │     macro-cp (block.cljs:1740-1741) → [:div.warning ...]   ← we replace this
   │
   │  /Node embed path (works today, reused by the bridge):
   │     block-item-inner (5162) reads :block/link, cycle-guard via :links set
   │       → block_container (4753) → db-async/<get-block (:children? true)
   │         → block-children (2010) recurse (4633), no depth limit
   ▼
React (custom reactivity: db.react/react/q, db.hooks/use-query) — NOT re-frame
   │
   ▼
DOM  (no .embed-block CSS today — Phase 3 adds a visual frame)

Edit path (works for :block/link, inherited by the bridge):
   edit-block! → set-editing! → save-current-block! → save-block-inner! (:save-block op on LINKED block UUID)
       → markdown-mirror regenerates the ORIGINAL block's owning page file (whole-page)
```

## 6. Risks
See PROJECT_PLAN.md §4. Chief risks: inline `block_container` DOM fit (wrap in `.embed-block` + CSS), cycle recursion (guarded by `:embed-links`), and reversing an intentional deprecation (acceptable in a personal fork; keep the deprecation warning as the non-UUID fallback).