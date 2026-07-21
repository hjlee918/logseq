# Logseq Fork — Block Embed Rendering Improvement

## 1. Project Overview

### Goal
Fork Logseq and improve block embed (Transclusion) rendering to match Roam Research's behavior.

### Background
The user built a Digital Zettelkasten in Roam Research using its 5 fundamental features (Daily Notes, Nesting, Pages, Hashtags, Block References & Transclusion). They are migrating to Logseq, but block embed rendering — specifically full recursive child tree display and inline editing — does not match Roam's quality. This is the critical gap.

### Roam's 5 Fundamentals (ref: https://www.youtube.com/watch?v=P60-XvcIT5g)
1. **Daily Notes** — temporal context (Logseq: fully supported)
2. **Nesting (indenting)** — parent-child-sibling structure (Logseq: fully supported)
3. **Pages [[]]** — conceptual connections (Logseq: fully supported)
4. **Hashtags #** — contextual classification (Logseq: fully supported)
5. **Block References & Transclusion** — atomic reuse + multi-context display (Logseq: ~75% supported)

> This project aims to raise the 5th fundamental's support level from ~75% to ~95%+.

## 2. Current Problems (Logseq vs Roam)

### Block Embed Behavior Comparison

| Feature | Roam Research | Logseq (current) |
|---------|---------------|-------------------|
| Block self embed | Yes | Yes |
| 1st-level child blocks display | Yes | Yes |
| 2nd-level+ deep subtree rendering | Yes perfect | Incomplete/missing |
| Inline editing within embed | Yes full | Often read-only |
| Adding new child blocks within embed | Yes | Limited |
| Real-time sync to original on edit | Yes | Limited |

### Root Cause
- Roam: DB is source of truth, recursive block tree rendering is straightforward
- Logseq: Markdown files are source of truth, extracting and rendering block trees from files introduces constraints

## 3. Improvement Goals (3 Key Features)

### Goal 1: Full Recursive Subtree Rendering
Render all children, grandchildren, great-grandchildren of an embedded block as a complete tree structure, matching Roam.

### Goal 2: Inline Editing Within Embed
Enable direct click-to-edit on embedded blocks. Edits must sync with the original block.

### Goal 3: Reverse Mapping (Edit to Source File)
Ensure edits made within an embed are accurately reflected in the original Markdown file at the correct block location.

## 4. Tech Stack

| Component | Technology |
|-----------|------------|
| Language | ClojureScript |
| UI Framework | React (re-frame) |
| Database | Datahike/Datalevin (Datalog) |
| Desktop | Electron |
| Build Tool | shadow-cljs |
| Package Manager | yarn |
| License | AGPL-3.0 |

## 5. Key Source Files to Analyze

src/main/frontend/components/
- block.cljs              : core block rendering component
- block_embed.cljs        : block embed rendering (PRIMARY TARGET)
- referenced_block.cljs   : referenced block display
- node.cljs               : block node component

src/main/frontend/db/
- query_datalog.cljs      : Datalog queries (block tree retrieval)
- model.cljs              : block data model
- persist_db.cljs         : DB persistence

src/main/frontend/handler/
- editor.cljs             : edit event handlers
- route.cljs              : page/block routing

## 6. Phase-by-Phase Execution Plan

### Phase 0: Dev Environment Setup + Git Init
- Fork and clone Logseq repository
- Install dev tools (JDK, Node.js, Clojure CLI, shadow-cljs, yarn)
- Run local build and verify
- Initialize Git, connect GitHub remote

### Phase 1: Codebase Exploration
- Analyze block embed rendering source code
- Identify where subtree rendering is limited
- Identify where editing is disabled

### Phase 2: Data Model Analysis
- Understand block tree query logic
- Analyze child block retrieval Datalog queries
- Understand block UUID to Markdown file line mapping

### Phase 3: Recursive Subtree Rendering Implementation
- Modify block_embed.cljs: recursively render all child blocks
- Integrate with block.cljs: support full block rendering in embed context

### Phase 4: Inline Editing in Embed
- Enable edit mode for embedded blocks
- Ensure edit events work correctly within embed context

### Phase 5: Reverse Mapping Implementation
- Map embed edits back to original Markdown file block location
- Implement block UUID to file position mapping logic

### Phase 6: Testing and Verification
- Import Roam JSON/EDN data and verify embed behavior
- Test block tree embeds at various nesting depths

### Phase 7: Full Zettelkasten Structure Verification
- Verify all 5 fundamentals compound correctly with Roam export data

## 7. Success Criteria

| Criterion | Current (Logseq) | Target |
|-----------|-------------------|--------|
| Embed subtree rendering depth | 1-2 levels limited | Unlimited (full tree) |
| Editing within embed | Read-only | Full inline editing |
| Edit to original sync | Limited | Perfect bidirectional sync |
| Roam parity (block embed area) | ~75% | ~95%+ |

## 8. References
- Roam Zettelkasten 5 fundamentals: https://www.youtube.com/watch?v=P60-XvcIT5g
- Logseq GitHub: https://github.com/logseq/logseq
- Logseq Development Guide: https://github.com/logseq/logseq/blob/master/DEVELOPMENT.md