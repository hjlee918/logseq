# Code Map: Block Embed Rendering Pipeline

> Phase 1 read-only exploration. Produced by tracing the embed pipeline through
> `src/main/frontend/` and `deps/`. All line numbers are against the checkout at
> Phase 0 commit `b2d2d7faa5` (upstream `master` @ `ab5709218b`).
>
> **READ THIS FIRST — the project premise needs revisiting.** See §4 and the
> "Critical reframing" note below. The 3 improvement goals appear to be *already
> satisfied* by Logseq's current `:block/link` ("Node embed") mechanism; the
> `{{embed ((uuid))}}` macro the plan was written against is **deprecated** and
> renders only a warning.

## Critical reframing (supersedes assumptions in ARCHITECTURE.md / PROJECT_PLAN.md)

1. **`{{embed ((uuid))}}` is DEPRECATED.** At render time it emits only a
   deprecation-warning `div` (`components/block.cljs:1740-1741`; dict string at
   `src/resources/dicts/en.edn:127`: *"{{embed}} is deprecated. Use '/Node embed'
   command instead."*). The replacement is the **"Node embed" / "Block embed"**
   slash command, which inserts a normal block carrying a **`:block/link`**
   attribute pointing at the embedded block (`components/editor.cljs:289-368`,
   the `:other-attrs {:block/link …}` at line 306).
2. **The live embed mechanism is `:block/link` → `:original-block`**, not the
   `:embed?` config flag. `:embed?` / `:embed-parent` / `:embed-id` are **dead
   scaffolding** — never set `true` anywhere in app source (only in
   `src/test/frontend/handler/editor_async_test.cljs:158,64`). The renderer's
   real embed signal is the `:original-block` config key, derived from
   `:block/link` in `block-item-inner` (`block.cljs:5162-5185`).
3. **There is NO re-frame.** No `reg-sub`/`reg-event-db`/`subscribe` anywhere.
   Reactivity = a custom query cache `frontend.db.react/react/q` + React bridge
   `frontend.db.hooks/use-query` + entity wrapper `frontend.db.model/sub-block`.
   Events = a core.async bus `state/pub-event!` → `defmulti handle`
   (`handler/events.cljs:59`). The outliner mutation pipeline is a separate
   macro system (`ui-outliner-tx/transact!`).
4. **The DB schema differs from ARCHITECTURE.md.** There is **no**
   `:block/content`, `:block/left`, `:block/children`, `:block/file`, or
   `:block/lineno`. Block body text = `:block/title`; sibling order =
   `:block/order`; children = reverse lookup `:block/_parent`; owning page =
   `:block/page`. Blocks carry **no file-path / line-number** — files are
   regenerated whole-page from the DB tree (`worker/markdown_mirror.cljs`).
5. **The 3 goals are largely already met** by the `:block/link` mechanism
   (full recursive subtree, inline editing, reverse-mapping to the original
   block's file). See §4 Gap Analysis for the *real* residual gaps.

## 1. Key Files

| File | Path | Purpose |
|------|------|---------|
| block.cljs | `src/main/frontend/components/block.cljs` | Core block/outliner rendering. Contains the embed swap (`block-item-inner` L5162, `build-block` L4092), recursive children (`block-children` L2010), editor-vs-content gate (L3538), and the deprecated `{{embed}}` macro branch (L1740). |
| editor.cljs (component) | `src/main/frontend/components/editor.cljs` | "Block embed" slash command inserts a `:block/link` block (L289-368). |
| reference.cljs | `src/main/frontend/components/reference.cljs` | Linked-references panel (queries), not the embed renderer. |
| block/macros.cljs | `src/main/frontend/components/block/macros.cljs` | Generic macro helpers; **no** embed handling (embed dispatched in `block.cljs:macro-cp`). |
| model.cljs | `src/main/frontend/db/model.cljs` | Block entity lookups (`get-block-by-uuid` L44, `query-block-by-uuid` L48), reactive `sub-block` L120, tree builder `sort-by-order-recursive` L136, `get-block-and-children` L262. |
| react.cljs | `src/main/frontend/db/react.cljs` | Custom reactive query engine `react/q` (L145). |
| hooks.cljs | `src/main/frontend/db/hooks.cljs` | `use-query` — bridges reactive atoms to React (L6). |
| async.cljs | `src/main/frontend/db/async.cljs` | `<get-block` async fetch + transact + refresh (L135); the embed/block-ref data fetcher. |
| transact.cljs | `src/main/frontend/db/transact.cljs` | `apply-outliner-ops` → worker RPC (L43). |
| schema.cljs | `deps/db/src/logseq/db/frontend/schema.cljs` | DB-graph schema (L56-108). **No** `:block/content`/`:left`/`:children`/`:file`. |
| db.cljs | `deps/db/src/logseq/db.cljs` | `get-children` (direct-only, L652), `get-block-and-children-aux` (recursive, L372), `sort-by-order` (L368), `get-block-parents` (depth-limited, L666). |
| initial_data.cljs | `deps/db/src/logseq/db/common/initial_data.cljs` | `get-block-children-ids` (recursive descendants, L86), `get-block-and-children` (100-block large-page branch, L214). |
| block.cljs (graph-parser) | `deps/graph-parser/src/logseq/graph_parser/block.cljs` | Parse-time `get-block-reference` (L99, embed branch L112-118), `get-page-reference` (L45), `macro->block` (L594). |
| block_ref.cljs | `deps/common/src/logseq/common/util/block_ref.cljs` | `((uuid))` extraction primitives (L9-27). |
| mldoc.cljc | `deps/graph-parser/src/logseq/graph_parser/mldoc.cljc` | Rust mldoc → AST (`->edn` L36). Emits `["Macro" {:name "embed" …}]` for `{{embed}}`. |
| editor.cljs (handler) | `src/main/frontend/handler/editor.cljs` | Save pipeline: `save-current-block!` L1402, `save-block!` L1381, `save-block-aux!` L1372, `save-block-if-changed!` L271, `save-block-inner!` L258, `outliner-save-block!` L83. |
| block.cljs (handler) | `src/main/frontend/handler/block.cljs` | `edit-block!` L112 (single edit-entry funnel; best embed-origin hook point). |
| events.cljs | `src/main/frontend/handler/events.cljs` | Custom event bus `defmulti handle` L59; `:editor/save-current-block` L297. |
| state.cljs | `src/main/frontend/state.cljs` | `set-editing!` L1914, `pub-event!` L1184, `use-sub` L650, `use-sub-block-collapsed` L2089. |
| outliner/ui.cljc | `src/main/frontend/modules/outliner/ui.cljc` | `transact!` macro L10. |
| outliner/op.cljs | `src/main/frontend/modules/outliner/op.cljs` | `save-block!` op L52. |
| outliner/core.cljs | `deps/outliner/src/logseq/outliner/core.cljs` | `save-block!`/`save-block` L1206/L455. |
| op.cljs (outliner) | `deps/outliner/src/logseq/outliner/op.cljs` | `apply-op!` `:save-block` dispatch L285/289. |
| db_core.cljs (worker) | `src/main/frontend/worker/db_core.cljs` | `:thread-api/apply-outliner-ops` L1472; `get-block-parents` worker depth default 3 (L1091). |
| db_listener.cljs | `src/main/frontend/worker/db_listener.cljs` | DB tx listener → `markdown-mirror` (L65). |
| markdown_mirror.cljs | `src/main/frontend/worker/markdown_mirror.cljs` | Whole-page file regen: `<handle-tx-report!` L676, `<mirror-page!` L570, `render-page-content` L523, `page-id-for-entity` L115, `page-relative-path` L89. |
| common_impl.cljs | `src/main/frontend/handler/export/common_impl.cljs` | Only place that still *expands* `{{embed}}` into content (export); `:embed-depth` cap 5 (L473-500). |

## 2. Embed Rendering Pipeline

### 2.1 Parsing
- **File:** `deps/graph-parser/src/logseq/graph_parser/mldoc.cljc` (Rust mldoc `->edn`, L36) → `deps/graph-parser/src/logseq/graph_parser/block.cljs`.
- **Functions:** `get-block-reference` (L99, embed branch L112-118), `get-page-reference` (L45, embed branch L77-86), `macro->block` (L594). UUID extraction in `deps/common/src/logseq/common/util/block_ref.cljs` (`get-string-block-ref-id` L16, `string-block-ref?` L27).
- **Description:** mldoc parses `{{embed ((uuid))}}` into the AST node
  `["Macro" {:name "embed" :arguments ["((uuid))"]}]`. At index time
  `get-block-reference` extracts the UUID (paren-strip + `parse-uuid` validation,
  L132) and records a `[:block/uuid <uuid>]` ref for the DB. A bare `((uuid))`
  is a *different* AST node `["Block_reference" id]` (L102-104) — handled in a
  separate branch. At **render** time the `["Macro" …]` node reaches
  `block.cljs:macro-cp` (L1677) which short-circuits on `(= name "embed")`
  (L1740) and returns a deprecation warning. So the macro no longer renders
  embedded content in the app — only the export path expands it
  (`handler/export/common_impl.cljs:324/348/391`, with an `:embed-depth` cap of
  5 at L473-500).
- **Live embed creation:** the "Block embed" slash command
  (`components/editor.cljs:289-368`) inserts a block with
  `:other-attrs {:block/link (:db/id (db/entity [:block/uuid id]))}` (L306). No
  macro text is involved.

### 2.2 Datalog Query
- **File:** `src/main/frontend/db/model.cljs` + `deps/db/src/logseq/db.cljs` + `deps/db/src/logseq/db/common/initial_data.cljs`.
- **Query:** there is **no** Datalog `:find`/`pull` for the single-block lookup — it is a Datascript **entity lookup** `[:block/uuid uuid]`:
  ```clojure
  ;; model.cljs:44
  (defn get-block-by-uuid [id] (db-utils/entity [:block/uuid (if (uuid? id) id (uuid id))]))
  ```
  Children are fetched two ways:
  - **Direct-only** (used per-level by the renderer at `block.cljs:4345`):
    ```clojure
    ;; deps/db/src/logseq/db.cljs:652
    (defn get-children [db block-entity-or-eid] … (sort-by-order (:block/_parent parent)))
    ```
  - **Recursive descendants** (async path, `db-async/<get-block` with `:children? true`):
    ```clojure
    ;; deps/db/src/logseq/db/common/initial_data.cljs:86
    (defn get-block-children-ids [db block-eid & {:keys [include-collapsed-children?]}] …)
    ;; initial_data.cljs:214 — get-block-and-children, with a 100-block large-page branch
    ```
- **Input:** repo + block eid/uuid (+ `:children?`, `:include-collapsed-children?`).
- **Output:** Datascript entity (single block) or a flat list of descendant entities (recursive). The renderer assembles the tree via `model/sort-by-order-recursive` (`model.cljs:136`) which rewrites `:block/_parent` into a sorted `:block/children` vector.
- **Depth handling:** recursive fetch has **no fixed depth limit**. The only
  bound is a **large-page threshold of 100 descendants** (`initial_data.cljs:235`):
  above it, the fetch degrades to direct-children-only and marks each child
  `:block.temp/load-status :self` for lazy on-expand loading. `get-block-parents`
  (ancestors, not children) defaults `depth 100` (`db.cljs:666`); the worker API
  default is 3 (`db_core.cljs:1091`).

### 2.3 re-frame Subscription
- **There is no re-frame.** The reactive delivery to the embed/block renderer:
  - `model/sub-block` (`model.cljs:120`) — reactive block entity via `react/q`
    key `[:frontend.worker.react/block id]`, consumed through
    `db-hooks/use-query` (`hooks.cljs:6`). Used at `block.cljs:1006,1216,4078,4111,5366`.
  - `db-async/<get-block` (`async.cljs:135`) — async fetch+transact+refresh; the
    refresh key `[[:frontend.worker.react/block (:db/id block)]]` (L169) wakes
    `sub-block` subscribers. Used by `block-reference` (L1307) with
    `{:children? false}`.
  - `state/use-sub-block-collapsed` (`state.cljs:2089`) — collapsed-state path
    cursor `[:ui/collapsed-blocks repo container-id block-id]`.
- **Output shape:** a Datascript entity map (attrs per schema §1) — single block.
  For a full child tree the renderer uses `build-block-renderer-children-props`
  (`block.cljs:4116`) → `db/get-block-and-children` → `tree/blocks->vec-tree` →
  a vector of child maps with nested `:block/children`.

### 2.4 Component Rendering
- **Component:** embed is rendered by the **same core block component** as any
  block — there is no separate embed component. The embed swap happens just
  before render:
  - `block-item-inner` (`block.cljs:5162`) — detects `:block/link`, sets
    `:original-block` on config, swaps `item` to the linked block, calls
    `block-container`.
  - `build-block` (`block.cljs:4092`) — returns `[original-block block-to-render]`.
  - `block-container` (L4753) → `loaded-block-container` (L4750) →
    `loaded-block-container-inner` (L4702) → `block-container-inner` (L4650) →
    `block-container-inner-aux` (L4253).
- **Children rendering:** `block-container-inner-aux` recurses at L4633-4642:
  ```clojure
  (when-not (or (:hide-children? config) table? property? comments-area?
                (block-renderer-hides-outline-children? …))
    (let [config' (-> (update config :level inc) (dissoc :original-block :data))]
      (block-children config' block children collapsed?)))
  ```
  → `block-children` (L2010) → `block-list` (L5190) → `block-item` (L5187) →
  `block-item-inner` (L5162) → `block-container` … recursion.
- **Depth limit:** **none.** `:level`/`:block-level` only increment for
  layout/CSS, never truncate. Children are fetched one level at a time via
  `ldb/get-children` (`block.cljs:4345`) and via `db-async/<get-block` with
  `:children? load-children?` (`block.cljs:4763`).
- **Truncation point:** **no embed-specific truncation exists.** The only
  things that stop child rendering are collapse state (`collapsed?`,
  `block-children` L2076) and non-embed flags (`:hide-children?` set on
  page-title blocks at `page.cljs:293`; `table?`/`property?`/`comments-area?`).
  **`:original-block` is `dissoc`'d before recursing (L4641)**, so descendants
  render as normal blocks (no embed marking).

### 2.5 DOM Output
- **Structure** (emitted by `block-container-inner-aux`, L4428-4648):
  ```
  div.ls-block.swipe-item {id "ls-block-<uuid>" class "embed-block" data-embed? data-transclude? level}
    div.block-main-container.flex.flex-row.gap-1
      div.block-control-wrap  (bullet / collapse arrow; bullet = "link" icon when original-block, L2277)
      div.flex.flex-col.w-full
        div.block-main-content.flex.flex-row.gap-2
          div.block-content-or-editor-wrap → div.block-content {id "block-content-<uuid>"}
            div.block-head-wrap → block-title ; div.block-body → inline text
    div.ls-block-content-indent (db-properties-cp)
    div.block-children-container.flex  (when children & not collapsed & not hide-children?)
      div.block-children-left-border
      div.block-children.w-full
        <for each child: block-list → block-item → block-container (same structure, WITHOUT embed-block/original-block)>
  ```
- **Comparison to Roam:** Roam's `{{embed ((uid))}}` renders the referenced block
  + full descendant tree, editable. Logseq's `:block/link` embed does the same:
  full recursive tree, editable, edits write back to the original block's file.
  The live `:block/link` path therefore already matches Roam's transclusion
  behavior. The `{{embed}}` *macro* path does not (it only shows a warning).

## 3. Editing Pipeline

### 3.1 Edit Entry Point
- **File:** `src/main/frontend/handler/block.cljs`
- **Function:** `edit-block!` (L112) → `edit-block-aux` (L86) → `state/set-editing!` (`state.cljs:1914`). This is the single funnel for *every* "begin editing a block" action (click, keyboard nav, sidebar, the dormant embed edit-pencil at `block.cljs:3515`).
- **Signature:** `(edit-block! block {:keys [_container-id custom-content tail-len save-code-editor?]})` — **no embed-origin parameter exists.**
- Save triggers: `save-current-block!` (`handler/editor.cljs:1402`, implicit blur/Enter) and `save-block!` (L1381, explicit).

### 3.2 Event Dispatch
- **No re-frame.** Orchestration signals travel the core.async bus
  `state/pub-event!` (`state.cljs:1184`) → `defmulti handle`
  (`handler/events.cljs:59`). Save-relevant events:
  - `:editor/save-current-block` (`events.cljs:297`) → `editor-handler/save-current-block!`
  - `:editor/save-code-editor` (`events.cljs:303`)
  - `:editor/upsert-type-block` (`events.cljs:326`)
- **The actual content mutation is NOT an event** — it runs synchronously
  in-process through the outliner macro:
  `save-block-inner!` (`editor.cljs:258`) → `outliner-save-block!` (L83) →
  `outliner-op/save-block!` (`modules/outliner/op.cljs:52`) →
  `ui-outliner-tx/transact!` (`modules/outliner/ui.cljc:10`) →
  `frontend.db.transact/apply-outliner-ops` (`db/transact.cljs:43`) →
  worker RPC `:thread-api/apply-outliner-ops` (`worker/db_core.cljs:1472`) →
  `outliner-op/apply-op!` `:save-block` (`deps/outliner/.../op.cljs:285/289`) →
  `outliner-core/save-block!` (`deps/outliner/.../core.cljs:1206/455`).

### 3.3 DB Update
- The `:save-block` op mutates the original block entity (looked up by
  `:block/uuid`) — `{:block/uuid … :block/title value}`. Because the embed
  renderer swapped to the *linked* block, the UUID here is the **original**
  block's UUID, so the edit lands on the original block in the DB.

### 3.4 File Write (Reverse Mapping Path)
- **File:** `src/main/frontend/worker/markdown_mirror.cljs`
- **Functions:** `<handle-tx-report!` (L676) → `<flush-repo!` (L694) →
  `<run-job!` (L654) → `<mirror-page!` (L570) → `render-page-content` (L523) →
  `<write-if-changed!` (L550) → `<write-text-atomic!` (L176) → platform
  `:write-text-atomic!` (`fs.cljs:104` / `fs/node.cljs:78`).
- **How edits reach the Markdown file:** the DB conn listener
  (`worker/db_listener.cljs:65`) routes tx-reports to `markdown-mirror`. For
  each affected page it **regenerates the entire page file** from the DB tree
  (`render-page-content` L523 writes page properties + all child blocks) and
  atomically replaces the file. **There is no per-block line patch.**
- **Block → file mapping (no stored line numbers):** block UUID → `:block/page`
  (walk `:block/parent` if needed via `page-id-for-entity` L115) → page entity
  → `:block/title` (or `:block/journal-day`) → relative path
  `pages/<stem>.md` / `journals/<stem>.md` (`page-relative-path` L89). File
  position is recomputed by tree traversal, never stored.
- **Whether embed context is handled:** **No.** There is no embed-origin
  tracking anywhere in the pipeline: `edit-block!` opts, `state/set-editing!`,
  `get-editor-info` (`state.cljs:2209`), and the `:save-block` op payload
  (`deps/outliner/.../op.cljs:52`) all carry **no** embed flag. **However,
  reverse-mapping already works correctly** because the edit targets the
  original block's UUID, so `markdown-mirror` re-renders and writes the
  **original block's owning page file** (not the embed-host page). The UI simply
  has no awareness that the edit came from an embed context.

## 4. Gap Analysis

### 4.1 Recursive Child Tree Rendering
- **Current behavior:** For `:block/link` embeds, the full descendant tree
  renders recursively with **no depth limit** (`block-children` L2010, recursion
  at L4633). Children load one level at a time. The only truncation is collapse
  state and non-embed flags. For the deprecated `{{embed}}` macro, **nothing
  renders** (warning div only).
- **Roam behavior:** `{{embed ((uid))}}` renders the full recursive tree.
- **Gap location:** none for the live `:block/link` mechanism. The only real
  truncation risk is the **large-page (≥100 descendants) lazy-load degradation**
  (`initial_data.cljs:235`) — on very large embedded subtrees the renderer
  fetches direct children only and loads deeper levels on expand. This is
  performance-driven, not embed-specific, and matches Logseq's general
  large-page behavior.
- **What needs to change:** Possibly nothing. If the goal is to guarantee
  *immediate* full-depth rendering for embeds regardless of subtree size, the
  `:embed?` deferral-exclusion at `block.cljs:1949-1956` would need to be
  re-wired to the live `:original-block` signal (it currently keys off the dead
  `:embed?` flag). **Needs Supervisor decision.**

### 4.2 Inline Editing
- **Current behavior:** Embeds are **editable**. `edit?` is driven by global
  state `state/get-edit-block` (`block.cljs:4531`), not by any embed flag. The
  editor renders when `show-editor?` (`block.cljs:3538`). The click-to-edit
  handler `block-content-on-pointer-down` (`block.cljs:2615`) has **no**
  embed/`original-block` check — only `target-forbidden-edit?` and a
  max-content-length guard. The only real edit gate is the recycled-block check
  (`handler/block.cljs:121-122`), which is not embed-specific.
- **Roam behavior:** Full inline editing inside embeds, syncing to the original.
- **Gap location:** none — editing inside `:block/link` embeds already works
  and syncs to the original block.
- **What needs to change:** Possibly nothing. If embed-aware *UX* is desired
  (e.g., the edit-pencil affordance at `block.cljs:3509-3516`, which is dead),
  the `:embed?`/`:embed-parent` machinery would need reviving against
  `:original-block`. **Needs Supervisor decision.**

### 4.3 Reverse Mapping
- **Current behavior:** Already works at the DB/file level. An edit to a block
  shown via `:block/link` embed targets the original block's UUID; the
  `:save-block` op mutates that entity; `markdown-mirror` regenerates and writes
  the **original block's owning page file**. The embed-host page is not touched
  (unless the embedded block lives on it). There is **no per-block line
  mapping** — the whole page is re-rendered from the DB tree, so "correct block
  location" is guaranteed by construction.
- **Roam behavior:** Edits inside an embed write back to the original block.
- **Gap location:** no functional gap. The only missing piece is **embed-context
  awareness** in the edit pipeline (no `:embed-origin` in `edit-block!` /
  `set-editing!` / the `:save-block` op), which matters only if you want
  embed-aware UX, validation, or writing back to the embed-host page instead of
  the original block's page.
- **What needs to change:** If embed-context tracking is wanted, the single best
  hook point is **`edit-block!` (`handler/block.cljs:112`)** — add an
  `:embed-origin` key to its `opts`, flow it through `set-editing!`
  (`state.cljs:1914`) and attach it to the `:save-block` op in
  `save-block-inner!` (`editor.cljs:258`). A narrower hook is
  `save-block-inner!` alone. **Needs Supervisor decision.**

## 5. Key Function Signatures

```clojure
;; --- Rendering (src/main/frontend/components/block.cljs) ---
(hsx/defc block-item-inner [config item {:keys [top? bottom?}])                 ;; L5162 — detects :block/link, sets :original-block, swaps item
(defn- build-block [config block* {:keys [navigating-block navigated?}])        ;; L4092 — returns [original-block block-to-render]
(hsx/defc block-container [config block* & {:as opts}])                         ;; L4753
(hsx/defc block-container-inner [container-state repo config* block opts])      ;; L4650
(hsx/defc block-container-inner-aux [container-state repo config* block {:keys [navigating-block navigated? editing? selected?] :as opts}]) ;; L4253
(hsx/defc block-children [config block children collapsed?])                    ;; L2010 — recursive children renderer
(hsx/defc block-list [config blocks])                                           ;; L5190 — iterates siblings
(hsx/defc blocks-container [config blocks])                                     ;; L5337
(hsx/defn- macro-cp [config options])                                           ;; L1677 — (= name "embed") → deprecation warning (L1740)
(hsx/defc block-reference [config id label])                                   ;; L1299 — inline ((uuid)) ref; fetches {:children? false}
(defn block-content-on-pointer-down …)                                         ;; L2615 — click-to-edit entry (no embed gate)

;; --- Data (src/main/frontend/db/) ---
(defn get-block-by-uuid [id])                                                  ;; model.cljs:44
(defn query-block-by-uuid [id])                                                 ;; model.cljs:48
(defn sub-block [id & {:keys [ref?] :or {ref? false}}])                         ;; model.cljs:120 — reactive block entity
(defn sort-by-order-recursive [form])                                           ;; model.cljs:136 — :block/_parent → sorted :block/children
(defn get-block-and-children [db block-uuid & {:as opts}])                      ;; model.cljs:262
(defn get-block-immediate-children [repo block-uuid])                          ;; model.cljs:256
(defn <get-block [graph id-uuid-or-name opts])                                  ;; async.cljs:135 — :children? opts

;; --- DB (deps/db/) ---
(defn get-children [db block-entity-or-eid])                                    ;; db.cljs:652 — direct children only
(defn- get-block-and-children-aux [entity & {:keys [include-property-block?]}]) ;; db.cljs:372 — recursive
(defn get-block-children-ids [db block-eid & {:keys [include-collapsed-children?]}]) ;; initial_data.cljs:86 — recursive descendants
(defn get-block-and-children [db eid & {:as opts}])                             ;; initial_data.cljs:106 (+100-block branch at L214)
(defn sort-by-order [blocks])                                                  ;; db.cljs:368
(defn get-block-parents [db block-id & {:keys [depth] :or {depth 100}}])        ;; db.cljs:666

;; --- Parsing (deps/graph-parser, deps/common) ---
(defn get-block-reference [block])                                             ;; graph_parser/block.cljs:99 (embed branch L112-118)
(defn get-page-reference [block])                                              ;; graph_parser/block.cljs:45 (embed branch L77-86)
(defn- macro->block [macro])                                                   ;; graph_parser/block.cljs:594
(defn get-string-block-ref-id [s])                                             ;; common/util/block_ref.cljs:16
(defn string-block-ref? [s])                                                   ;; common/util/block_ref.cljs:27

;; --- Editing (src/main/frontend/handler/) ---
(defn edit-block! [block {:keys [_container-id custom-content tail-len save-code-editor?]}]) ;; block.cljs:112 — BEST embed-origin hook
(defn- edit-block-aux [block opts])                                            ;; block.cljs:86
(defn save-current-block! [& [opts]])                                          ;; editor.cljs:1402
(defn save-block! [& args])                                                    ;; editor.cljs:1381
(defn- save-block-aux! [& args])                                               ;; editor.cljs:1372
(defn- save-block-if-changed! [& args])                                        ;; editor.cljs:271
(defn- save-block-inner! [block value opts])                                   ;; editor.cljs:258 — emits :save-block op
(defn- outliner-save-block! [block opts])                                      ;; editor.cljs:83

;; --- Outliner / worker / file-write ---
(defmacro transact! …)                                                        ;; modules/outliner/ui.cljc:10
(defn save-block! [block opts])                                                ;; modules/outliner/op.cljs:52
(defn apply-outliner-ops [db repo ops opts])                                   ;; db/transact.cljs:43
(defn <handle-tx-report! [repo _ tx-report opts])                              ;; worker/markdown_mirror.cljs:676
(defn- <mirror-page! [repo db page-id opts])                                   ;; worker/markdown_mirror.cljs:570
(defn- render-page-content [db page options])                                  ;; worker/markdown_mirror.cljs:523 — whole-page regen
(defn- page-id-for-entity [db eid])                                            ;; worker/markdown_mirror.cljs:115
(defn page-relative-path [db page opts])                                       ;; worker/markdown_mirror.cljs:89
```

## 6. Additional Files Discovered

| File | Path | Relevance |
|------|------|-----------|
| editor.cljs (component) | `src/main/frontend/components/editor.cljs:289-368` | "Block embed" slash command — the *actual* way embeds are created now (`:block/link`). |
| schema.cljs | `deps/db/src/logseq/db/frontend/schema.cljs:56-108` | Authoritative DB schema; corrects ARCHITECTURE.md (no `:block/content`/`:left`/`:children`/`:file`). `:block/link` documented as "used for tag, embeds" (L76-78). |
| async/util.cljs | `src/main/frontend/db/async/util.cljs:15-17` | Legacy `:block/content` → `:block/title` rewrite at query time. |
| markdown_mirror.cljs | `src/main/frontend/worker/markdown_mirror.cljs` | Whole-page file regen; proves there is no per-block line mapping. |
| common_impl.cljs | `src/main/frontend/handler/export/common_impl.cljs:324-500` | Only live expansion of `{{embed}}` (export only); `:embed-depth` cap 5. |
| dicts/en.edn | `src/resources/dicts/en.edn:127` | `{{embed}}` deprecation message. |
| editor_async_test.cljs | `src/test/frontend/handler/editor_async_test.cljs:64,158` | Only place `:embed?` is set true — confirms it is dead in app code. |

## 7. Recommendations for the Supervisor

1. **Re-scope the project.** The 3 goals (recursive subtree, inline editing,
   reverse mapping) are **already implemented** for the live `:block/link`
   ("Node embed") mechanism. The "75% support" premise in PROJECT_PLAN.md
   appears stale relative to current `master`. Recommend confirming the actual
   user-visible gap (e.g., a specific failing scenario with Roam-exported data)
   before any code changes.
2. **Candidate real gaps** worth investigating in Phase 2 (with concrete data):
   - (a) Large embedded subtrees (≥100 descendants) lazy-load instead of
     rendering full-depth immediately (`initial_data.cljs:235`). Does this
     diverge from Roam for big embeds?
   - (b) The inline `((uuid))` block reference renders as a page-style
     preview with **no children** (`block-reference` L1299, `:children? false`)
     — but Roam's `((uid))` is also just a link, so this likely matches.
   - (c) Embed-context is invisible to the edit pipeline — only relevant if
     embed-aware UX/validation is desired.
3. **If the goal is to revive the `{{embed ((uuid))}}` macro** to match Roam's
   exact syntax, that is a deliberate feature reversal of an intentional
   deprecation — needs an explicit Supervisor decision.
4. **ARCHITECTURE.md should be corrected** (no re-frame; no `:block/content`/
   `:left`/`:children`/`:file`; embed = `:block/link` not a macro) before
   Phase 2/3 build on it.