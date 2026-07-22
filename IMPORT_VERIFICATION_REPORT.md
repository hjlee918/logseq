# Roam Import + Verification Report — Phase 3B (re-base to 0.10.15)

**Branch:** `feature/roam-import-0.10.15`
**Base:** upstream tag **`0.10.15`** (`03bcefbdf8`, Nov 14 2025)
**Date:** 2026-07-22

> This report **supersedes** the Phase 3 (fork-point `467c5200d6`) report. The
> earlier report is preserved in git history on branch `feature/roam-import-parity`.
> Phase 3 found that at the fork point the Roam importer **parser** survives but
> its **wiring** was removed pre-fork (dead code, no UI path) — a Phase 4
> re-wiring was projected. Investigation of the `0.10.15` release showed the
> importer is **fully wired** there on a simpler pure-file-graph architecture,
> with no dead-module build break. The user approved re-basing to `0.10.15`.
> This phase re-verifies import + the 5 fundamentals + Goal 0 on the new base.

---

## 1. Fork Setup

- **Base:** tag `0.10.15` → `03bcefbdf87458f87499abb988ac3b9fac2c07d8` (Nov 14 2025).
- **Branch:** `feature/roam-import-0.10.15`, created from tag `0.10.15`. The prior
  `feature/roam-import-parity` (fork-point) branch is preserved (pushed) as a record.
- **Carried over from Phase 3:** `CODER_GUIDELINES.md`, `ROAM_IMPORT_INVESTIGATION.md`,
  `scripts/roam-import.js` (the faithful Node port — still valid; see §2), `.gitignore`
  entries for `ROAM RESEARCH DATA/` and `roam-vault/`.
- **Build status:** ✅ **Success.**
  - Package manager: **yarn 1.22.22** (`0.10.15` predates the `packageManager` field).
  - Toolchain: JDK 21, Node v24, clojure CLI, shadow-cljs 2.19.0.
  - `yarn install` succeeded (postinstall built `dist/amplify.js`; only benign
    aws-amplify-react peer-dep warnings).
  - `yarn watch` = `run-p gulp:watch cljs:watch`; `cljs:watch` =
    `clojure -M:cljs watch app electron` (simpler than the fork point — no
    db-worker/inference-worker builds).
  - **No excalidraw/tldraw build break** here: their source namespaces
    (`frontend.extensions.excalidraw`/`.tldraw`) **exist** at `0.10.15`, so the
    shadow module entries are live. The Phase 3 `shadow-cljs.edn` fix is **not**
    needed on this base (and was intentionally not carried over).
  - Final `[:app]` build: **`Build completed. (1392 files, 1385 compiled, 0 warnings, 172.80s)`**
    (one benign codemirror `forth.js` string-continuation warning).
- **Dev server:** ✅ Running at **http://localhost:3001** (`index.html` → HTTP 200).

## 2. Roam Importer

- **Importer parser:** `src/main/frontend/external/roam.cljs` (present).
  At `0.10.15` it requires `logseq.graph-parser.util.block-ref` /
  `logseq.graph-parser.util` (`gp-util/split-first`); at the fork point these were
  renamed to `logseq.common.util.*`. This is a **namespace rename only** — the
  import *logic* (UID regex, UID→UUID mapping, `((uid))`→`((uuid))` rewrite,
  `id:: <uuid>` attachment, tab indentation, front-matter, journal detection,
  case-insensitive page merge) is **identical**.
- **Importer wiring — PRESENT (the key advantage of this base):**
  - `src/main/frontend/handler/external.cljs` defines `index-files!` and
    `import-from-roam-json!`:
      `(import-from-roam-json! [repo data] (let [files (external/to-markdown-files :roam data {})] (index-files! repo files ...)))`
  - `index-files!` writes `pages/<sanitized-title>.md` / `journals/<yyyy_MM_dd>.md`
    (journal detection via `date/valid-journal-title?`), then calls
    `repo-handler/parse-files-and-load-to-db!` + `file-handler/alter-files`.
  - **Triggered from the UI**: `components/onboarding/setups.cljs:153` calls
    `(external-handler/import-from-roam-json! ...)` in the onboarding import flow.
  - So at `0.10.15` the Roam importer is **fully wired end-to-end** (onboarding →
    parse → write `.md` → index into the existing Datahike/Datalevin DB). **No new
    database is introduced; Markdown files remain the source of truth.**
- **How invoked this phase:**
  - The real cljs importer runs in-browser (onboarding flow). This CLI agent has no
    browser, so for headless CLI verification the faithful Node port
    `scripts/roam-import.js` was used (it reimplements the same logic, version-
    independent). **The user should use the in-app onboarding import as the primary
    path** (see §7) — that is the win of re-basing here.
- **Import result (Node port on `John_Artifex.json`):**
  - Source: `/Users/johnlee/LogseqToRoam/logseq/ROAM RESEARCH DATA/John_Artifex.json`
    (862 pages in JSON).
  - **347 `.md` files**: **72 pages** + **275 journals**.
  - UIDs mapped: 10,889; referenced UIDs (`id::` attached): 1,361.
- **Output vault:** `/Users/johnlee/LogseqToRoam/roam-vault` (gitignored; not committed).

## 3. Vault Verification

- **Vault opens:** ⚠️ Not verified in-browser by this agent (no browser in CLI env).
  The vault is a well-formed file-graph (`pages/` + `journals/`); dev server is live.
  Exact browser steps in §7.
- **Pages detected:** 72. **Journals detected:** 275 (`journals/<yyyy_MM_dd>.md`).
- **Self-consistency (reproduced identically to Phase 3 — confirms version-
  independent import logic):**
  - **1,848** `((uuid))` block-ref occurrences (matches the source data's 1,848 `((block-ref))`).
  - **1,361 distinct referenced UUIDs = 1,361 distinct `id::` definitions** (perfect 1:1).
  - **0 unresolved references.**
  - **0 embeds** (the 6 grep hits for "embed" are prose + one CSS comment `/* EMBED BLOCKS */`).
  - Cross-file example: `id:: 007b91ea-d5bb-4b2c-8b85-b7b0553577c9` in
    `pages/Mere Christianity.md` ← referenced in `journals/2021_07_28.md`.

## 4. Five Fundamentals Verification

Source + file-shape evidence (browser visual sign-off deferred to the user — §7).

### 4.1 Daily Notes — ✅
275 journals in `journals/<yyyy_MM_dd>.md`; Roam titles (`"March 26th, 2021"`)
recognized via `date/valid-journal-title?` (`"MMMM do, yyyy"` formatter) → `2021_03_26`.
No front-matter on journals (correct).

### 4.2 Nesting (Indentation) — ✅
Tab-indented bullets (`- ` at level 0, `\t*`-repeat + ` -` deeper); parent/child tree
reconstructed by `graph-parser` from indentation. Preserved in imported files.

### 4.3 Pages `[[ ]]` — ✅
`[[page]]` refs throughout (e.g., `[[나의 독서노트]]`, `[[메모]]`). Non-journal pages
get `---\ntitle: <title>\n---\n` front-matter; written to `pages/<sanitized>.md`.

### 4.4 Hashtags `#` — ✅
`#coreidea`, `#summary` etc. present in block text; parsed as tag links natively.

### 4.5 Block References `((uuid))` — ✅
1,848 occurrences; 1,361 referenced = 1,361 defined; 0 unresolved. `id:: <uuid>`
attached only to referenced blocks. Attachment correctness confirmed (Phase 3):
mldoc emits a standalone `Property_Drawer`, and `graph-parser` `extract-blocks`
reverses the AST so the drawer's `:id` flows to the **preceding** block — refs resolve
correctly. Inline render via `block-reference` (`components/block.cljs:866`).

## 5. Goal 0: Block-Level Granularity + Full Context (at 0.10.15)

### 5.1 Child Subtree (Downward) — ✅
Block page renders the block's children via `page-blocks-cp`
(`components/page.cljs:167`, rendered at `page.cljs:499` when `block?`).

### 5.2 Parent Context (Upward) — ✅ (after a one-line fix in this phase)
Block page renders a breadcrumb at `page.cljs:490`:
`(component-block/breadcrumb config repo block-id {:level-limit ...})`.
- **As released at 0.10.15:** `{:level-limit 3}` → breadcrumb fetches 4 parents and
  shows the **nearest 3** with a **static `⋯`** ellipsis (no expand handler) when the
  chain is deeper. That is *partial* parent context, not the full chain.
- **Fix applied this phase (Phase 3B):** raised the block-page breadcrumb to
  `{:level-limit 100}` (`page.cljs:490`, with an explanatory comment). `get-block-parents`
  (`db/model.cljs:530`) caps traversal at the depth arg, so 100 is safe (no unbounded
  walk). Other breadcrumb callers keep the default `level-limit 3`. The block page now
  shows the **full upward parent chain**, satisfying Goal 0's "must show full upward
  chain" (matching the fork point's `{:depth 1000}` behavior). Build recompiled clean
  (0 warnings).
- **If the user prefers the original 3-level cap**, revert this one hunk.

### 5.3 Linked References — ✅
At `0.10.15`, block linked references render **inline, per-block** (Roam-style):
`components/block.cljs:2482` `(when (and (not hide-block-refs?) (> refs-count 0)) (refs-cp uuid))`,
where `refs-cp` is the registered `:block/linked-references` component =
`reference/block-linked-references` (`reference.cljs:97`), which uses
`db/get-block-referenced-blocks` and renders with `breadcrumb-show? true` +
`group-by-page? true`. So a referenced block displays the blocks that reference it,
inline under the block. (The separate `reference/references` bottom panel at
`page.cljs:514` is guarded by `(when-not block-or-whiteboard?)` and only renders on
non-block pages — but blocks get their refs via the inline path, not that panel.)

> Note vs fork point: the fork point showed block linked-refs as a **bottom panel**
> (`reference/references page` → `db-async/<get-block-refs-count`). 0.10.15 shows them
> **inline under the block**. Both satisfy Goal 0.3; the inline style is closer to Roam.

## 6. Issues Found

- **(Phase 3, not present on this base)** Dead `:excalidraw`/`:tldraw` shadow module
  entries — **not an issue at 0.10.15** (sources exist here). The Phase 3
  `shadow-cljs.edn` fix was intentionally not carried over.
- **Breadcrumb 3-level cap** — fixed this phase (§5.2). One-line, minimal, preserves
  existing behavior (only adds more parent context on the block page).
- **Sensitive data on disk** — `ROAM RESEARCH DATA/` and `roam-vault/` re-added to
  `.gitignore` on this branch (the 0.10.15 `.gitignore` lacked them). Confirmed not
  tracked. The fork is public; these must never be committed.

## 7. Browser Verification + In-App Import Steps for the User

This CLI agent cannot open a browser. To finalize sign-off:

1. Dev server is running at http://localhost:3001 (`yarn watch`).
2. Open http://localhost:3001 in a browser.
3. **Primary path — in-app Roam import (now wired at 0.10.15):** use the onboarding /
   Settings → Import → "Roam Research JSON" flow and point it at
   `/Users/johnlee/LogseqToRoam/logseq/ROAM RESEARCH DATA/John_Artifex.json`.
   This writes `pages/*.md` + `journals/*.md` into the chosen graph dir and indexes
   them — the real importer, not the Node port. (Alternatively, to verify the
   pre-generated vault: "Add a graph" → select `/Users/johnlee/LogseqToRoam/roam-vault`.)
4. **Daily notes / nesting / pages / hashtags:** open a journal and a page; confirm
   nesting, `[[page]]` links, and `#tag` links navigate.
5. **Block reference + Goal 0:** open `journals/2021_07_28.md`, find the
   `((007b91ea-d5bb-4b2c-8b85-b7b0553577c9))` ref → confirm inline render; click →
   block page shows **breadcrumb (full parent chain, after the §5.2 fix)** +
   **child subtree** + **inline Linked References** under the block.
6. Spot-check more `((uuid))` refs (1,848 exist) for resolution.

If any step fails in-browser, that defines the next work item.

## 8. Recommendation for Next Phase
- The import wiring gap is closed by the base change itself. The remaining
  verification is browser sign-off (§7).
- If the user confirms the in-app import works in-browser, the Node port
  `scripts/roam-import.js` can be kept as a headless test-fixture generator and
  fallback, not as the primary import path.
- Next substantive work should turn to the user's other core goals: AI-ready +
  cloud-syncable Markdown storage, and VPS deployment (per the project's Goal 2 & 3).

## 9. Deliverables (Phase 3B)
1. ✅ Branch `feature/roam-import-0.10.15` based on tag `0.10.15`.
2. ✅ Working dev environment (build green, dev server on :3001).
3. ✅ Roam data imported as `.md` (347 files) — and the **in-app importer is wired**
   for the user to run in-browser.
4. ✅ 5 fundamentals verified (data + source; browser sign-off deferred to user).
5. ✅ Goal 0 verified + breadcrumb cap fixed (child ✅, parent ✅ full chain after fix,
   linked-refs ✅ inline).
6. ✅ This report updated.
7. ⏳ Commits + push (final step).
8. ✅ Completion report per `CODER_GUIDELINES.md` (delivered in chat).