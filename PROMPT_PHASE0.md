# Phase 0: Development Environment Setup + Git Init

## Prerequisites
Before executing this prompt, ensure you have read:
1. PROJECT_PLAN.md — Full project plan
2. ARCHITECTURE.md — Technical architecture design
3. CODER_GUIDELINES.md — Working guidelines

## Objective
Set up the Logseq development environment and initialize the Git repository to start the project.

## Execution Steps

### Step 1: Verify Project Folder
Confirm the current working folder is the dedicated project folder.

### Step 2: Git Repository Init
git init

### Step 3: Fork and Clone Logseq
1. Fork the Logseq repository (https://github.com/logseq/logseq)
   - Use GitHub CLI if available: gh repo fork logseq/logseq --clone
   - If GitHub CLI is not installed, provide manual instructions
2. Clone the forked repository
   - git clone https://github.com/<username>/logseq.git
   - Or use GitHub CLI for auto-clone
3. Add upstream (original) remote
   - git remote add upstream https://github.com/logseq/logseq.git
4. Create working branch
   - git checkout -b feature/block-embed-improvement

### Step 4: Check and Install Dev Tools
Check if the following tools are installed. If not, provide OS-specific installation instructions:

java -version        # Java (JDK 11+)
node --version       # Node.js (v18+)
yarn --version       # yarn
clojure --version    # Clojure CLI
npx shadow-cljs --version  # shadow-cljs

For each missing tool, provide OS-specific installation commands.

### Step 5: Install Logseq Dependencies
cd logseq
yarn install

### Step 6: Run Development Build
yarn watch
Wait for the build:
- Wait for "Build completed" message (timeout 300 seconds)
- Check if build succeeds
- If localhost:3000 verification is not possible automatically, provide instructions

### Step 7: Verify .gitignore
Check if Logseq's existing .gitignore exists and ensure project documentation files are tracked.

### Step 8: Initial Commit
git add .
git commit -m "[Phase 0] chore: initialize project environment and git"

### Step 9: Connect GitHub Remote Repository
gh repo create logseq-block-embed-fork --private --source=. --remote=origin --push
If GitHub CLI is not available, provide manual creation instructions.

## Completion Report
After completing all steps, write a Phase 0 completion report following the format defined in CODER_GUIDELINES.md.

Specifically include:
1. Installed tool versions list
2. yarn install result (success/failure)
3. yarn watch build result (success/failure)
4. Git status (branch name, commit hash)
5. GitHub repository URL (if created)
6. Any errors encountered and how they were resolved
7. Items to confirm before proceeding to Phase 1