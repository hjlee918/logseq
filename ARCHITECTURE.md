# Technical Architecture Design

## 1. Current Logseq Architecture (Block Embed Perspective)

### Data Flow: Block Embed Rendering

Markdown File (source of truth)
    |
    v (parsing)
Internal Graph Model (Datahike/Datalevin DB)
    |
    +-- Block Node (UUID, content, parent, children, page, etc.)
    |
    v (query)
block_embed.cljs
    |
    +-- Look up embed block by UUID
    +-- Render block content
    +-- Retrieve child blocks (limited)
    |
    v (rendering)
React Component (block.cljs)
    |
    v
Screen Display

### Current Limitations (estimated, confirm in Phase 1)

block_embed.cljs
    +-- Yes: Look up block by UUID for embed
    +-- Yes: Render block content
    +-- Problem: Child block retrieval only 1st-level children or limited recursion
        -> deep tree gets omitted
    +-- Problem: Edit mode likely set to read-only
        -> inline editing not possible
    +-- Problem: Reverse mapping edits within embed may not reflect to original file
        -> mapping logic not implemented or disabled

## 2. Target Architecture

### Improved Data Flow

Markdown File (source of truth, preserved)
    |
    v (parsing)
Internal Graph Model (Datahike/Datalevin DB)
    |
    +-- Block Node (UUID, content, parent, children, page, file-path, line-number)
    |   ^ file-path and line-number used for reverse mapping
    |
    v (query, improved)
block_embed.cljs (modified)
    |
    +-- Look up embed block by UUID
    +-- Render block content
    +-- Full recursive child tree retrieval (modified)
        -> use Datalog query that returns entire subtree
    +-- Enable edit mode (modified)
        -> allow block.cljs editing in embed context
    +-- Reverse mapping: map edits to original file block location (new)
        -> editor.cljs handles edit events from embed context

## 3. Target Modules and Expected Changes

### 3.1 block_embed.cljs: Recursive Subtree Rendering
Current (estimated):
  - embed-block function looks up single block by UUID
  - children retrieved 1-level only or omitted
  - rendered in read-only mode

Target:
  - embed-block function retrieves block + entire subtree
  - Recursively render all children, grandchildren
  - Reuse same rendering logic as block.cljs
  - Render in editable state

### 3.2 block.cljs: Embed Context Support
Current:
  - Renders blocks in normal page context
  - Limited rendering in embed context

Target:
  - Use same rendering logic in embed context
  - Enable edit mode
  - Enable add/delete child blocks
  - Enable indent-based child block creation

### 3.3 query_datalog.cljs: Full Subtree Retrieval Query
Current:
  - Query for direct children of a single block

Target:
  - Query that recursively retrieves entire subtree by block UUID
  - Datalog rules for recursive query:
    (rules
      [(descendant ?child ?parent)
       [(get-children ?parent) [?child ...]]]
      [(descendant ?desc ?parent)
       [(get-children ?parent) [?child ...]]
       (descendant ?desc ?child)])

### 3.4 editor.cljs: Reverse Mapping and Edit Handling
Current:
  - Normal edit events to file save
  - Embed context edit events not handled or ignored

Target:
  - Detect edit events from embed context
  - Map edited block UUID to original file location (file-path, line)
  - Modify the block content in original file
  - DB update auto-reflect across all embed locations

### 3.5 model.cljs: Block to File Mapping Info
Current:
  - Block model may have file-path info (confirm needed)

Target:
  - Ensure block UUID to file-path + line-number mapping
  - Use this info for accurate reverse mapping

## 4. Data Structure (estimated, confirm in Phase 1/2)

### Block Node (Datalog Entity)
{:block/uuid       #uuid "..."
 :block/content    "block content"
 :block/parent     {:block/uuid ...}    ; parent block
 :block/page       {:block/name ...}   ; owning page
 :block/left       {:block/uuid ...}   ; sibling ordering
 :block/file       {:file/path ...}    ; source markdown file
 :block/properties {...}}

## 5. Risks and Mitigations

| Risk | Probability | Mitigation |
|------|-------------|-----------|
| Logseq internal structure differs from expectation | Medium | Adjust design after actual code analysis in Phase 1/2 |
| Reverse mapping depends on Markdown parsing | High | Reuse existing file save logic as much as possible |
| Performance degradation (deep tree rendering) | Medium | Tree depth limit option or lazy rendering |
| re-frame event conflicts | Medium | Separate embed-specific events or use context flags |