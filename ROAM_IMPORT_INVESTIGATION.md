# Roam Import + Storage + VPS Investigation — Comprehensive Report

> Phase 2D — read-only investigation. Covers Roam export data, Logseq's storage architecture transition, built-in import, UID mapping, `{{embed}}`/`((block-ref))` with Roam UIDs, VPS readiness, and a full pipeline plan.
>
> **Headline finding:** the user's Roam data has **0 `{{embed}}` and 1,848 `((block-ref))`** references. The Phase 2 `{{embed}}` bridge is therefore **not needed for this data**. The real gap is Roam-UID block-reference resolution. Separately, the "Markdown-file mode" version of Logseq (with a working **Roam importer** that maps UIDs→UUIDs and writes `.md` files, plus chokidar file watching) was removed only ~6 months ago (Dec 26-29 2025) and is recoverable by forking from `467c5200d6`.

---

## 1. Roam Export Data Structure

Source: `/Users/johnlee/LogseqToRoam/logseq/ROAM RESEARCH DATA/` (NOTE: this folder lives **inside the git working tree** — it must never be `git add`ed.)
- `John_Artifex.json` — 3.99 MB
- `John_Artifex.edn` — 7.24 MB (a full Datascript DB dump)
- `Roam-Export-1686337050772/` — 826 files (decompressed "pretty" markdown export)

### 1.1 Decompressed Markdown Files
- **Folder structure:** mostly **flat** — 823 `.md` files at the root named by page title, plus a few subfolders created by page names containing `/` (e.g. `히브리서 53 / 히 11:17-19/...`), and a `roam/` config folder (`css.md`, `js/`, `sr.md`, `smartblocks.md`).
- **File naming:** page titles verbatim (e.g. `Mere Christianity.md`, `BIBLE.md`); daily notes as `May 19th, 2021.md`, `July 12th, 2021.md` (Roam date format — **identical to Logseq's journal page naming**, so journals import cleanly).
- **Counts:** 826 total `.md`; 346 non-empty, 477 empty (0-byte) pages.
- **Block format:** bullet points `- ` with **tab/space indentation** for nesting — **the same convention Logseq uses**.
- **Block UID storage in `.md`: NONE.** The decompressed export is a "pretty" export: no `id::` properties, no `^uid` block IDs, no `((uid))` block refs, no `{{embed}}`. `grep` for `id::`, `((...))`, `{{embed}}` across all 826 files returned **zero** matches. Block identity is **stripped** from this export.
- **Embed representation:** none (0 in the whole dataset).
- **Block-ref representation:** none in `.md` (stripped); 1,848 in JSON/EDN.
- **Page links:** `[[page]]`. **Hashtags:** `#tag` and `#[[tag]]`. **Macros:** `{{[[TODO]]}}`, `{{[[DONE]]}}` (Roam-style, differs from Logseq's `{{todo}}`/`{{done}}`).
- **Daily notes:** top-level blocks are timestamps (`- 06:30`, `- 07:11`), nested children are the day's content. This matches Roam's daily-notes structure; Logseq journals render this shape natively.
- **Sample** (`May 19th, 2021.md`, abbreviated):
  ```
  - 06:30
      - [[DOs]]
          - {{[[DONE]]}} Color Correction Handbook Zettel
      - [[Gratitude]]
          - {{[[TODO]]}} 편안한 잠을 주심 ...
  - 09:24
      - [[Diary]]
          -  나에게는 늘 성경의 인물의 중첩이 있다 ...
  ```

### 1.2 JSON Format (`John_Artifex.json`)
- **Top-level:** a JSON array of **862 pages**.
- **Page fields:** `title` (string), `uid` (string — page UID), `create-time` (int ms), `edit-time` (int ms), `:create/user`, `:edit/user`, `:log/id`, `children` (array of blocks).
- **Block fields:** `string` (the block's text), `uid` (block UID string), `create-time`, `edit-time`, `refs` (array), `:block/refs` (array), `children` (array), `:create/user`, `:edit/user`.
- **UID format:** 9-char (11,461 UIDs) or 10-char (290 UIDs) alphanumeric + `_` + `-`. Charset: `[0-9A-Za-z_-]`. Examples: `8nd9KbDv6`, `_uuZ-kiaS`, `zy_hM-JZV`, `9_j1cfed-`. Page UIDs for daily notes are date-based: `03-26-2021`, `06-09-2022`.
- **Total UIDs:** 11,751. **`{{embed}}` count: 0.** **`((block-ref))` count: 1,848.**
- **Sample page** (`March 26th, 2021`):
  ```json
  {"title":"March 26th, 2021","uid":"03-26-2021","create-time":...,"edit-time":1616745714008,
   "children":[
     {"uid":"_uuZ-kiaS","string":"[[나의 독서노트]] Knowledge_Management","children":[
       {"uid":"8nd9KbDv6","string":"[[글쓰기]]는 먼저, 책의 문장을 ...","children":[...]}]}]}
  ```
- **Block-ref example:** a block with `uid` `6Xkhbe0G-` has `string` `((zy_hM-JZV))` — i.e. the block's entire content is a block reference.

### 1.3 EDN Format (`John_Artifex.edn`)
- A **`#datascript/DB`** literal — Roam's native Datascript database dump with its full schema (`:block/uid`, `:block/string`, `:block/children`, `:block/refs`, `:node/title`, `:create/user`, `:edit/user`, etc.).
- 11,904 `:block/uid` entries; 0 `{{embed}}`; 1,848 `((block-ref))`.
- **Advantages for ClojureScript:** it is already a Datascript DB. In principle it could be loaded with minimal transformation. However Roam's schema differs from Logseq's (`:block/uid` strings vs `:block/uuid` UUIDs; `:block/string` vs `:block/title`; `:block/children` many-ref vs Logseq's `:block/parent` reverse lookup; `:node/title` vs `:block/name`), so a direct load is not possible without a schema-mapping translator. The JSON is easier to consume for a custom converter.

### 1.4 Roam `.md` vs Logseq `.md` Format Comparison
- **Bullet/indentation convention:** **compatible** (both use `- ` + indentation).
- **Journal page naming:** **compatible** (both use `May 19th, 2021`).
- **Block identity:** **incompatible** — Roam's pretty `.md` export strips UIDs; Logseq persists block UUIDs via an `id:: <uuid>` property. The Roam `.md` files have **no** `id::` properties, so block refs/embeds cannot resolve from the `.md` export alone.
- **Macros:** `{{[[TODO]]}}` (Roam) vs `{{todo}}` (Logseq) — needs conversion.
- **Can Roam `.md` files be used directly as a Logseq vault?** **Partially.** Pages, nesting, links, hashtags, and journals would render. **Block references and embeds would NOT work** (no UIDs preserved). 1,848 block-refs would render as missing/broken.
- **What conversion is needed?** A Roam→Logseq converter must: (1) map each Roam UID to a Logseq UUID; (2) rewrite every `((uid))` → `((uuid))`; (3) attach `id:: <uuid>` properties to blocks whose UID is referenced; (4) convert `{{[[TODO]]}}`/`{{[[DONE]]}}` → `{{todo}}`/`{{done}}`. **This converter already existed in Logseq** — see §3.3.

### 1.5 Recommendation: JSON vs EDN vs MD for Import
- **JSON** — recommended. It preserves UIDs, block refs, and the full tree; is easy to parse; and is exactly the format the deleted Roam importer (`external/roam.cljs`) consumed (`js/JSON.parse`). The Roam importer already does UID→UUID mapping + `((uid))`→`((uuid))` rewriting + `id::` property attachment + `.md` file emission.
- EDN is more faithful (full DB) but its schema differs enough that a custom Datascript→Logseq translator is needed — more work than reusing the JSON importer.
- The decompressed `.md` export is unusable for block refs (UIDs stripped) — useful only as a visual reference.

---

## 2. Logseq Storage Architecture

### 2.1 Current Master Storage Model (HEAD = `2.0.1`, branch `feature/block-embed-improvement`)
- **DB (Datalevin over SQLite) is the runtime source of truth.** `src/main/frontend/db/restore.cljs` `restore-graph!` loads the graph from SQLite via `persist-db/<fetch-init-data` — the `.md` re-parse-on-load path has been removed.
- **`.md` files are a derived mirror.** `src/main/frontend/worker/markdown_mirror.cljs` regenerates whole-page `.md` files on every edit (write-only).
- **No filesystem watching.** `src/main/frontend/fs/node.cljs:104` `watch-dir!` is a **no-op**; `memory_fs.cljs:148` likewise. No `chokidar`, no `fs.watch` anywhere. External `.md` edits (by AI tools) are **not** auto-detected; a manual re-index is required.
- **Evidence:** VPS agent confirmed `restore-graph!` is sqlite-only; `markdown-mirror` present; `watch-dir!` stubbed.

### 2.2 The SQLite Transition — TWO removals, both in late Dec 2025
The "Markdown-file mode" was dismantled in **two commits, three days apart**:

| Commit | Date | What it removed |
|--------|------|-----------------|
| `f1de1ea163` "remove git, chokidar, rsapi" | 2025-12-26 | `src/electron/electron/fs_watcher.cljs` (166-line chokidar wrapper) + handler wiring + node.cljs `watch-dir!` body. **File watching removed.** |
| `bcc478b5f7` "refactor: separate og and db version (#12276)" | 2025-12-29 | The **file-graph ("og") version** (`handler/file_based/`) where `.md` is the live source of truth; the **Roam importer** (`external/roam.cljs`); legacy `handler/import.cljs`; file sync, tldraw, excalidraw, zotero. |

Earlier (2023-05-23, `b158262ce6` "initial load from sqlite") load source switched from re-parse-`.md` to load-from-sqlite, but the file-graph version still existed as a fallback until `bcc478b5f7`.

- **Last Markdown-file-mode commit (with chokidar + Roam importer + file-graph):** `467c5200d6` ("fix: lint", **2025-12-26 11:00:41**) = `f1de1ea163^`.
  - Version: `0.10.12-9643-g467c5200d6` (~0.10.12).
  - On the main line (ancestor of HEAD).
  - **Only 2,472 commits behind HEAD** (~6 months), not years.
  - Confirmed present at `467c5200d6`: `chokidar@3.5.1` in package.json; `src/main/frontend/external/roam.cljs`; `src/main/frontend/handler/import.cljs` (JSON/tree import); file-graph handlers as the default (the `file_based/` split hadn't happened yet — file-graph was still the main code path).
- **`{{embed}}` was already deprecated** at `467c5200d6` (`block.cljs:1513` → `[:div.warning "{{embed}} is deprecated..."]`). Irrelevant for this dataset (0 embeds).

### 2.3 Can Markdown-File Mode Be Re-enabled on Current Master?
- **File watching:** technically yes — `f1de1ea163` removed `fs_watcher.cljs` cleanly; it is recoverable via `git show f1de1ea163^:src/electron/electron/fs_watcher.cljs` and chokidar is a standard lib. But the handler wiring (`handler.cljs`, `state.cljs`, `window.cljs` changes in `f1de1ea163`) would need reverting too.
- **`.md` as load source:** hard on current master. `restore.cljs` was rewritten to be sqlite-only; the `restore-graph-from-text!` (re-parse) path no longer exists. Re-adding it is invasive — the whole restore/worker pipeline assumes sqlite.
- **File-graph ("open folder as graph") live mode:** gone. The DB version only creates new DB graphs or imports a folder one-way into a DB graph (`import-file-graph`, `components/imports.cljs:357`). There is no "open an existing `.md` folder as a live file-graph vault" mode.

### 2.4 Recommendation: Fork from Current Master or Older Version?
- **Recommendation: FORK from `467c5200d6` (2025-12-26)** — the last commit with the file-graph version + Roam importer + chokidar file watching.
- **Why (ties to all three goals):**
  - **Goal 1 (Roam fidelity):** `external/roam.cljs` at that commit already does Roam UID→UUID mapping, `((uid))`→`((uuid))` rewriting, `id:: <uuid>` property attachment, and writes `.md` files. After running it, the vault's `.md` files contain `((uuid))` block refs that Logseq's native block-ref renderer resolves — **no runtime Roam-UID code needed**.
  - **Goal 2 (.md source of truth + AI/cloud):** the file-graph version treats `.md` as the live source of truth (re-parses on load) and has chokidar file watching → AI tools editing `.md` files are picked up live; iCloud/Drive sync just works.
  - **Goal 3 (VPS):** neither version has a multi-user server, but the file-graph version's "`.md` files on disk + file watcher" model is **simpler to serve** than the DB version's per-client sqlite. See §6.
- **Cost:** only ~6 months / 2,472 commits behind HEAD; version 0.10.12 is a recent, functional daily-driver.
- **Impact on existing work (Phase 0-2):**
  - Phase 0 (env/git setup): re-runs trivially on the new base.
  - Phase 1/1B (code maps / investigation): the file-graph codebase differs (no `db_based/` split yet; `restore-graph-from-text!` exists; `macro-cp` at a different line). The maps need light revision but the concepts transfer.
  - Phase 2 (`embed-block-cp` bridge): **does not transfer and is not needed** — the user's data has 0 embeds, and the Roam importer rewrites `((uid))`→`((uuid))` so native block-ref rendering handles everything. The embed-bridge work can be dropped.
- **Estimated effort to re-apply Roam rendering on the older version:** SMALL — mostly just run the existing Roam importer + verify rendering. The importer already exists at that commit; no new bridge code required.
- **Alternative (stay on master + recover):** would require (a) porting the deleted `roam.cljs` importer to the DB version's transaction API (it targets `file-handler/alter-file`, which is gone), (b) re-adding chokidar + the `.md`-load path, (c) the runtime Roam-UID support of §5 (Option A, ~8 code sites). This is strictly more work than forking and re-using the importer in its native environment.

### 2.5 File Watching / Live Update Capability
- **Current master:** NO (see §2.1).
- **At `467c5200d6`:** YES — `src/electron/electron/fs_watcher.cljs` wraps chokidar; file-change events flow on the `file-watcher` IPC channel and trigger re-parse of changed files. AI tools writing `.md` files → Logseq re-indexes those files live. **This is the decisive capability for Goal 2.**

---

## 3. Built-in Import Functionality

### 3.1 Existing Import Methods
**Current master** (`handler/db_based/import.cljs` + `components/imports.cljs`) — **5 methods, all transact to the DB, NONE write `.md` files:**

| Method | Handler | Behavior |
|--------|---------|----------|
| SQLite DB (`.db.sqlite`) | `import-from-sqlite-db!` (L99) | `persist-db/<import-db` + `sqlite-util/import-tx` |
| SQLite + assets ZIP (`.zip`) | `import-from-sqlite-zip!` (L118) | Unzip → `import-from-sqlite-db!` + copy assets to disk |
| File-graph folder → DB graph (`.md/.org/.edn`) | `import-file-graph` (imports.cljs:357) → `gp-exporter/export-file-graph` (exporter.cljs:3067) → `<add-file-to-db-graph` (exporter.cljs:2601) | **Parses `.md` from disk and transacts into a new DB graph.** Original `.md` files left on disk but become irrelevant (DB = source of truth). One-way. |
| Debug transit | `import-from-debug-transit!` (L175) | `ldb/read-transit-str` → transact |
| DB EDN (sqlite.build export) | `import-from-edn-file!` (L189); paste-in `import-edn-data-dialog` (L230) | `clojure.edn/read-string` → `validate-export` → `batch-import-edn!` |

There is **no JSON import** and **no Roam import** in the current DB version. The "open folder as live graph" mode does not exist.

### 3.2 Import Code Analysis
- All paths end in a Datalevin `transact!` against a freshly created DB graph. Only asset binaries and `logseq/config.edn` are written to disk; **no `.md` page files are written by any importer.**
- UID handling: the sqlite/transit/EDN importers preserve existing `:block/uuid` values (no remapping). The folder→DB importer reads block UUIDs from `id::` properties (or mints new ones); **no Roam-UID→UUID translation layer exists.**
- Would it work with Roam data? **No** — Roam JSON is not accepted, and Roam UIDs in `((uid))` are dropped at parse time (`graph_parser/block.cljs:214` `parse-uuid`; `get-custom-id-or-new-id` L572-580 replaces non-UUID `id::` values with fresh `squuid`s).

### 3.3 Deleted Roam Importer (RECOVERABLE — this is the key artifact)
- A Roam-specific importer existed at `src/main/frontend/external/roam.cljs` and was **deleted in `bcc478b5f7` (2025-12-29)**.
- **Recover at the recommended fork point:** `git show 467c5200d6:src/main/frontend/external/roam.cljs` (145 lines) — it is present and intact at the fork point, so no recovery is even needed if we fork from there.
- **What it does** (confirmed by reading `467c5200d6:src/main/frontend/external/roam.cljs`):
  - `uid-pattern` = `#"\(\(([a-zA-Z0-9_\\-]{6,24})\)\)"` — matches Roam `((uid))`.
  - `uid->uuid` atom: scans the whole Roam JSON for `((uid))`, maps each UID to a fresh `random-uuid` (`load-all-refed-uids!`).
  - `uid-transform`: rewrites every `((uid))` → `((uuid))` via `block-ref/->block-ref`.
  - Attaches `id:: <uuid>` property to any block whose UID was referenced (so the UUID becomes the block's identity in Logseq).
  - Converts `{{[[TODO]]}}`/`{{[[DONE]]}}` → `TODO`/`DONE`; reformats generic macros via `macro-transform`.
  - Emits per-page Markdown with front-matter (`---\ntitle: ...\n---`) and tab indentation.
  - The file-graph import handler (`handler/import.cljs` `import-from-roam-json!` → `index-files!`) **writes each page to `pages/<title>.md` (or `journals/<date>.md`) via `file-handler/alter-files`, then `parse-files-and-load-to-db!`** — i.e. `.md` files become the source of truth.
  - `{{embed ((uid))}}`: not specially handled, but `uid-transform` runs on the whole text so the inner `((uid))` becomes `((uuid))` and `macro-transform` reformats the wrapper to `{{embed ((uuid))}}` incidentally. (Moot for this dataset — 0 embeds.)
- **Can it be recovered and adapted?** If we fork from `467c5200d6`, no adaptation is needed — it runs in its native file-graph environment. If we stay on master, it would need porting to the DB-transaction API (the `file-handler/alter-file` target is gone).

### 3.4 Old Version's Import Capabilities (at `467c5200d6`)
- `handler/import.cljs`: `import-from-json!` (JSON tree), `import-from-edn!`, `import-from-roam-json!` (writes `.md`), `tree-vec-translate-json`, OPML import (`external.cljs` `import-from-opml!` via `mldoc/opml->edn`).
- The Roam importer was present and functional.
- "Open folder as graph" live mode: present (file-graph version is the default).

### 3.5 Recommendation: Use Built-in Import or Build Custom?
- **Use the built-in (recovered) Roam importer** at the fork point. It already solves UID→UUID mapping + `.md` emission. **Do not build a custom importer.** Just fork from `467c5200d6`, run the importer on `John_Artifex.json`, and the vault is ready.

---

## 4. UID Mapping Strategy

### 4.1 Roam UID Format (from actual data)
- Pattern: `[0-9A-Za-z_-]{9,10}` (11,461 are 9-char, 290 are 10-char).
- Charset: `0-9 A-Z a-z _ -`.
- Examples: `8nd9KbDv6`, `_uuZ-kiaS`, `zy_hM-JZV`, `9_j1cfed-`, `R8t4Av-Ad`.
- Page UIDs (daily notes): date-based `MM-DD-YYYY` (e.g. `03-26-2021`).
- Inside text, references appear as `((uid))` (1,848 occurrences).

### 4.2 Logseq UUID Schema (`deps/db/src/logseq/db/frontend/schema.cljs:61`)
- `:block/uuid {:db/unique :db.unique/identity}` — **no `:db/valueType` declared**, so Datascript does not enforce UUID type. But every read path coerces with `parse-uuid`/`uuid`/`util/uuid-string?`, so a string stored here would never be found by `[:block/uuid (uuid ...)]` lookups.
- `:block/roam-uid` attribute: **does not exist** (only matches are in planning `.md` docs).
- Logseq persists block UUIDs in `.md` via the `id:: <uuid>` property (parsed by `graph_parser/block.cljs` `get-custom-id-or-new-id` L572-580; written back by `fix-duplicate-id` L735-747 and `markdown-mirror`).

### 4.3 Recommended UID Mapping Approach
Two viable strategies, depending on the forking decision:

- **Strategy 1 (RECOMMENDED — fork from `467c5200d6`, use the Roam importer):** the importer maps each Roam UID → a fresh `random-uuid` at import time, writes `((uuid))` into block text and `id:: <uuid>` into block properties, and emits `.md` files. **No schema change, no runtime Roam-UID code, no `:block/roam-uid` attribute.** After import, everything is native Logseq UUIDs. This is the lowest-risk, lowest-effort path and preserves Logseq's strict-UUID invariant.
- **Strategy 2 (if staying on master):** Option A from the UID agent — add `:block/roam-uid {:db/unique :db.unique/identity :db/index true}`; add a `roam-block-ref-re`/`roam-uid-string?` to `block_ref.cljs`; teach `db/get-page`, `db-async/<get-block`, `block-reference`, `page-reference`, `embed-block-cp`, `extract-block-refs`, `get-custom-id-or-new-id`, `exporter.cljs` to try `[:block/roam-uid ...]` for Roam-UID-shaped ids. ~8 code sites, medium complexity, preserves the strict-UUID invariant for native data. Options B (string `:block/uuid`) and D (raw string ids) are high-regression-risk; Option C (hash) is lossy.

**Recommendation: Strategy 1.** It eliminates the UID-mapping problem at import time rather than carrying Roam UIDs through the runtime.

### 4.4 Impact on `{{embed}}` bridge and `((block-ref))`
- Under Strategy 1, `((block-ref))` becomes `((uuid))` after import → the existing `block-reference` component (block.cljs:1299) and `block-ref/get-block-ref-id` strict-UUID regex work unchanged. **No changes to embed-block-cp or block-reference needed.**
- The Phase 2 `embed-block-cp` bridge is **not needed** (0 embeds in data) and does not transfer to the fork point anyway.

---

## 5. `{{embed}}` and Block-Ref with Roam UIDs

### 5.1 Current Implementation (Phase 2, on current master)
- `embed-block-cp` (block.cljs:1677) uses `block-ref/get-block-ref-id` (strict UUID regex) → Roam UIDs return `nil` → deprecation warning. Won't match Roam UIDs.
- `block-reference` (block.cljs:1299-1314): `block-id = (parse-uuid id)` (strict); `db/entity [:block/uuid block-id]`; `db-async/<get-block` with `:children? false` (children NOT fetched for inline refs). Roam UID → `nil` → silent no-op.
- 5 independent strict-UUID gates filter Roam UIDs: `block-ref/block-ref?`, `block-ref/get-block-ref-id`, `parse-uuid` (3 call sites), `util/uuid-string?`, and the `block-ref-re` body.

### 5.2 Required Changes (on current master — only if NOT forking)
- `block_ref.cljs:9` — add `roam-block-ref-re` + `get-roam-block-ref-id` + `roam-block-ref?`.
- `embed-block-cp` (block.cljs:1677-1710) — add a Roam-UID branch; generalize `:embed-links` cycle guard; pass `:block/roam-uid` to `block-container`.
- `block-reference` (block.cljs:1299-1314) — add Roam-UID branch at L1301; use `[:block/roam-uid ...]` lookup; generalize `:ref-set`.
- `db/get-page` (deps/db/src/logseq/db.cljs:539-548), `db-async/<get-block` (async.cljs:135-186 L147-148), `page-reference` (block.cljs:1205-1268) — add Roam-UID lookup branches.
- `graph_parser/block.cljs:204-216` `extract-block-refs` and `:572-580` `get-custom-id-or-new-id` — stop dropping Roam-UID-shaped ids; emit `[:block/roam-uid ...]` / store `:block/roam-uid`.
- `exporter.cljs:1905-1909` — add `roam-block-ref?` branch for `{{embed ((roam-uid))}}`.
- Schema `schema.cljs:61` — add `:block/roam-uid`.

### 5.3 If Forking from `467c5200d6`
- **None of the §5.2 changes are needed.** The Roam importer rewrites `((uid))`→`((uuid))` and attaches `id:: <uuid>` at import time, so the vault contains only native Logseq UUIDs. The file-graph version's standard `block-reference` / `block-ref` code resolves them unchanged.
- Code locations differ from current master (different line numbers, no `db_based/` split), but the analysis concepts from Phase 1/1B transfer with light revision.
- The Phase 2 embed-bridge would need re-applying only if the user later has embeds (they don't).

---

## 6. VPS Deployment Readiness

### 6.1 Current Web App Architecture
- The web (non-Electron) build (`:app` target, `shadow-cljs.edn:17`) is a **static SPA**; nginx can serve it (the shipped `Dockerfile` does exactly this — nginx:1.24-alpine copying `static/`).
- Browser storage: **SQLite-wasm over OPFS** for the content DB (`src/main/frontend/worker/platform/browser.cljs`, `@sqlite.org/sqlite-wasm` 3.51.2); IndexedDB for settings; lightning-fs for memory graphs; **File System Access API** (`utils.js:154` `showDirectoryPicker`) for on-disk local graphs.
- The web app opens a graph by picking a **local directory** (File System Access API) or a Logseq Sync cloud graph. **There is no "open remote server-side graph URL" code path.** "Remote graphs" = Sync cloud graphs downloaded into the browser's OPFS.
- HTTPS is required for remote browser access to the File System Access API (`docs/docker-web-app-guide.md:8`).

### 6.2 Existing Server-Side Code
- **`db-worker-node`** (`src/main/frontend/worker/db_worker_node.cljs`): a localhost per-graph HTTP daemon (`/v1/invoke` RPC, `/v1/events` SSE, `/v1/import-db-binary`). **Hardcoded `host "127.0.0.1"`** (L561), ephemeral port. Used by the CLI/Electron, not exposed to remote browsers.
- **Electron Fastify API server** (`src/electron/electron/server.cljs`): `127.0.0.1:12315` by default; `POST /api` forwards to the renderer via IPC; optional `/mcp` routes; Bearer-token auth. **This is the AI/MCP integration surface** — but requires the Electron desktop app running and binds localhost by default (host configurable).
- **Self-hostable DB-Sync Node adapter** (`deps/db-sync/src/logseq/db_sync/node/server.cljs`): `http.createServer` + WebSocketServer on `DB_SYNC_PORT` (default 8787), Cognito JWT auth, SQLite index. Speaks the **real-time sync protocol** (syncs client DBs); does **not** serve `.md` files. ADR 0001 (2026-01-30, Status: Proposed) names VPS as a target runtime.
- **Docker:** `Dockerfile` = nginx static SPA only. No `docker-compose`. `docs/docker-web-app-guide.md` covers single-user remote access over HTTPS.
- **WebDAV / remote-file backend:** none.

### 6.3 VPS Deployment Gap Analysis
- **What works today:** static SPA via nginx (Dockerfile); localhost AI/MCP API via the Electron Fastify server; self-hostable real-time sync (syncs DBs, not `.md`).
- **What's missing for the user's VPS goal** (server-side `.md` files, multi-browser, multi-user, AI on same VPS):
  1. No server that reads `.md` files from the VPS filesystem and serves them to browser clients.
  2. No multi-user access to a single server-side graph (each browser has its own OPFS sqlite).
  3. No filesystem watching (current master) — AI `.md` writes not auto-detected.
  4. `db-worker-node` binds `127.0.0.1` hardcoded; web SPA not wired to use it remotely.
  5. No docker-compose / deployment recipe combining SPA + backend + shared `.md` storage.
- **What needs to be built:** a backend that owns the on-disk `.md` graph, exposes the db-worker/`<get-block` API over the network, teaches the SPA to open a *remote* graph URL, adds multi-user auth/sessions, and re-enables file watching so external AI `.md` writes trigger re-indexing.
- **Estimated effort:** LARGE on current master (new backend + SPA remote-graph support + re-enable file watching + re-add `.md`-load). **Smaller on the `467c5200d6` fork** because the file-graph version already watches files and treats `.md` as source of truth — the main remaining piece is a network-exposed backend + SPA remote-graph path.

### 6.4 Recommended VPS Architecture
```
                     +--------------------------+
   browser (any) --->|  nginx (static SPA :app) |
                     +------------+-------------+
                                  | HTTPS (WSS/SSE)
                                  v
                     +--------------------------+
                     |  NEW backend service     |   <-- to be built
                     |  (Node/Fastify or Clojure)|
                     |  - owns /srv/vault/*.md   |
                     |  - file watcher (chokidar)|
                     |  - exposes db-worker API  |
                     |    over the network       |
                     |  - multi-user auth        |
                     +-----+-----------+---------+
                           |           |
            .md read/write |           | API/MCP
                           v           v
                  +----------------+  +------------------+
                  |  /srv/vault    |  |  AI tools (GLM/  |
                  |  pages/*.md    |  |  Claude/Gemini)  |
                  |  journals/*.md |  |  read/write .md  |
                  +----------------+  +------------------+
```

### 6.5 VPS Implementation Phases (high-level)
- **V1:** Fork from `467c5200d6`; serve the SPA via nginx; run the file-graph version's graph against `/srv/vault/*.md` server-side; expose a read API.
- **V2:** Add a thin backend that proxies the db-worker/`<get-block` API over HTTPS + WSS; teach the SPA a "open remote graph URL" entry point.
- **V3:** Multi-user auth/sessions; concurrent-edit conflict handling; AI/MCP HTTP endpoint on the backend (port the Electron Fastify API server logic server-side).
- **V4:** Hardening, backups, cloud-sync coexistence (iCloud/Drive syncing `/srv/vault`).

---

## 7. Full Pipeline Plan

### 7.1 Recommended Approach
**Fork from `467c5200d6` (2025-12-26, ~0.10.12) → run the built-in Roam importer on `John_Artifex.json` → verify native rendering → build the VPS backend.** This re-uses the deleted-but-present Roam importer and the file-graph `.md`-source-of-truth + chokidar watching, satisfying Goals 1 & 2 with minimal new code, and isolates all new work to the VPS backend (Goal 3).

### 7.2 Architecture
```
John_Artifex.json  --[external/roam.cljs importer]-->  pages/*.md + journals/*.md
   (Roam UIDs)         UID->UUID, ((uid))->((uuid))       (Logseq UUIDs, id:: props)
                              |                                  |
                              v                                  v
                   Logseq file-graph vault              .md = source of truth
                   (re-parse on load + chokidar)        AI tools read/write .md
                              |
                              v  (render natively)
                   ((uuid)) block-refs resolve  |  [[links]]  |  #tags  |  journals
                              |
                              v  (VPS backend, to build)
                   nginx SPA + network db-worker API + multi-user auth
```

### 7.3 Forking Decision
- **Fork from: `467c5200d6`** (2025-12-26 11:00:41, "fix: lint", `0.10.12-9643`).
- **Why (all three goals):**
  - Goal 1: the Roam importer (`external/roam.cljs`) is present and does UID→UUID + `.md` emission natively.
  - Goal 2: file-graph version = `.md` source of truth + chokidar live watching (AI/cloud-ready).
  - Goal 3: simpler `.md`-on-disk model is easier to serve than the DB version; the older SPA build still works behind nginx.
- **What existing work transfers:** Phase 0 setup; the *concepts* from Phase 1/1B (corrected reactivity, schema, embed mechanism) — with line-number revision.
- **What needs re-doing / dropping:** Phase 2 `embed-block-cp` bridge — **drop** (0 embeds in data; importer handles block-refs). Code-map line numbers — light revision for the older base. The fork itself: create a new branch from `467c5200d6`, re-init project docs against the older base.
- **Net:** forking *reduces* total work (no runtime Roam-UID code, no embed bridge, no chokidar re-enable, no `.md`-load re-add) versus staying on master.

### 7.4 Implementation Phases
- **Phase A (fork + import):** Branch from `467c5200d6`; build; run the Roam importer on `John_Artifex.json`; verify the vault renders (block-refs, links, tags, journals, nesting). Convert `{{[[TODO]]}}`/`{{[[DONE]]}}` (importer does this). Confirm `.md` files on disk have `id:: <uuid>` and `((uuid))`.
- **Phase B (fidelity verification):** Spot-check the 1,848 block-refs resolve; verify daily-notes timestamps render; verify Korean/CJK content; verify the `roam/` config pages (css/js) import or are deliberately dropped.
- **Phase C (AI integration):** Confirm AI tools can read/write `/srv/vault/*.md` and chokidar picks up changes live (re-index).
- **Phase D (VPS backend V1-V2):** nginx SPA + network-exposed db-worker API + SPA "remote graph URL" path.
- **Phase E (VPS V3-V4):** multi-user auth, AI/MCP server-side endpoint, hardening.

### 7.5 Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Roam importer has bugs on this specific dataset (CJK, macros) | Medium | Medium | Run on a copy; spot-check 1,848 block-refs; the importer is 145 lines — easy to patch |
| `random-uuid` mapping is non-deterministic (re-import → new UUIDs) | Low | Low | One-time import; UUIDs persist in `.md` via `id::` after first import |
| Older base (0.10.12) missing features the user wants | Medium | Medium | Identify must-have features; cherry-pick from master if needed |
| VPS backend is net-new work | High | High | Scope V1 narrowly (read-only SPA + static files); iterate |
| Fork diverges from upstream, hard to merge future Logseq fixes | Medium | Medium | Accept divergence (personal fork); periodically cherry-pick security fixes |
| 0 embeds means Phase 2 work was unnecessary | Known | Low | Drop the embed bridge; document the pivot |
| File-graph version's `{{embed}}` is deprecated too | Known | None | 0 embeds in data; irrelevant |

---

## 8. AI Integration + Cloud Sync Readiness
- **Can AI tools read/write `.md` files?** On the `467c5200d6` fork: **yes** — `.md` files are the source of truth on disk. On current master: files exist (mirror) but edits aren't auto-detected (no watcher) and the app loads from sqlite — AI edits need a manual re-index.
- **Does file watching detect external changes?** Fork: **yes** (chokidar). Current master: **no**.
- **Can the vault be stored in iCloud/Google Drive?** Fork: **yes** — it's a folder of `.md` files; cloud sync works; chokidar detects synced changes on the local mount. Current master: partial — `.md` mirror syncs, but each device loads from its own sqlite cache and won't see synced `.md` changes without re-index.
- **Cross-device config:** point the file-graph vault at the iCloud/Drive-mounted folder; ensure chokidar watches the mount.
- **VPS ↔ AI synergy:** on the VPS, AI tools on the same machine read/write `/srv/vault/*.md` directly (filesystem), and the Logseq backend + chokidar pick up changes — no API needed for AI writes (the API/MCP endpoint is for remote/AI-as-a-service calls).

---

## 9. Edge Cases and Special Considerations
- **0 embeds, 1,848 block-refs** — the project's original `{{embed}}` framing does not match this data. The real need is block-reference resolution, which the Roam importer solves at import time.
- **Roam UIDs are 9-10 char `[0-9A-Za-z_-]`** — never UUIDs; the strict-UUID `block-ref-re` will never match them without the importer's rewrite.
- **Decompressed `.md` export is a dead end** for block refs (UIDs stripped). Use JSON.
- **`{{[[TODO]]}}`/`{{[[DONE]]}}`** macros differ from Logseq — the importer converts these.
- **Daily-notes timestamp blocks** (`- 06:30`) — render natively as nested bullets in Logseq journals.
- **CJK content** (Korean) — well-represented in the data; verify the importer + Logseq render it correctly (file names contain Korean).
- **`roam/` config pages** (`css.md`, `js/`, `sr.md`, `smartblocks.md`) — Roam-specific config (custom CSS, JS, spaced-repetition). Logseq has its own `custom.css` / `logseq/config.edn`; these should be migrated manually or dropped.
- **Page-name collisions / case** — the importer merges pages with the same lowercased title; verify no unexpected merges.
- **Nested-page subfolders** in the export (page names containing `/`) — verify Logseq handles these as hierarchical pages.
- **Block-ref whose target was deleted in Roam** — `((uid))` with no matching UID; the importer maps it to a `random-uuid` that resolves to nothing → renders as a broken/missing ref. Acceptable (mirrors Roam's behavior for dangling refs).
- **EDN export** is a full Datascript DB — a fallback path if the JSON importer proves insufficient, but requires a custom schema-mapping translator.

---

## Appendix: Key Commit References
- `467c5200d6` — 2025-12-26 — **recommended fork point** (file-graph + Roam importer + chokidar).
- `f1de1ea163` — 2025-12-26 — removed chokidar / `fs_watcher.cljs`.
- `bcc478b5f7` — 2025-12-29 — removed file-graph version + Roam importer + legacy `handler/import.cljs`.
- `b158262ce6` — 2023-05-23 — "initial load from sqlite" (load source switched to sqlite).
- `9fc3f0f21d` — 2020-08-20 — original Roam importer prototype (wrote `pages/<title>.md`).
- Recovered Roam importer: `git show 467c5200d6:src/main/frontend/external/roam.cljs` (145 lines).
- Recovered file-graph Roam import handler: `git show bcc478b5f7^:src/main/frontend/handler/file_based/import.cljs`.