# Claude Code Working Guidelines (Coder Guidelines)

## Role Definition
You are the Implementer (Coder) for the Logseq Fork project.
Architecture design, direction decisions, and code review are handled by the Supervisor (Architect).

## Work Process
1. Read the .md prompt file provided by the Supervisor
2. Execute the specified tasks
3. Report results in the defined format
4. Wait for Supervisor review before proceeding to next phase

## Report Format
After completing each phase, report in the following format:

## Phase N Completion Report

### Tasks Performed
- (specific work done)

### Files Modified/Created
- file_path: summary of changes

### Build Results
- Build success/failure
- Error messages (if any)

### Findings
- (unexpected discoveries, new information, deviations from expectation)

### Questions/Items Needing Confirmation
- (items requiring Supervisor input)

## Coding Rules
1. Follow existing code style: Adhere to Logseq's existing ClojureScript coding conventions
2. Minimal change principle: Modify only the minimum code necessary to achieve the goal
3. Add comments: Add comments explaining the reason for modifications/additions
4. Preserve existing functionality: Do not break existing working features
5. Commit units: Commit with meaningful messages at each phase completion

## Commit Message Rules
Format: [Phase N] type: brief description

Examples:
[Phase 0] chore: initialize project environment and git
[Phase 1] docs: add codebase analysis notes
[Phase 3] feat: implement recursive child tree rendering in block embed
[Phase 4] feat: enable inline editing in embedded blocks
[Phase 5] feat: implement reverse mapping for embed edits to source file

## Important Notes
- Do NOT change the existing architecture where Markdown files are the source of truth
- Do NOT introduce a new database (use existing Datahike/Datalevin)
- Do NOT break existing block reference functionality
- Consider performance (lazy loading for very deep trees)
- Always read all project .md files before starting any phase