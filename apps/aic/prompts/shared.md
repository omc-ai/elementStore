===== CRITICAL CONTEXT — READ BEFORE DOING ANYTHING =====

1. AUTO-DETECT THE PROJECT
   First, explore the project to understand what you are working on:
   - Run: ls -la to see root structure
   - Run: find . -maxdepth 3 -type f \( -name "*.php" -o -name "*.js" -o -name "*.ts" -o -name "*.vue" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.rb" -o -name "*.go" -o -name "*.swift" -o -name "*.kt" -o -name "*.dart" -o -name "*.java" -o -name "*.cs" \) | head -80
   - Check for: package.json, composer.json, requirements.txt, Gemfile, go.mod, Cargo.toml, pubspec.yaml, Podfile
   - Check for directories: apps/, mobile/, ios/, android/, frontend/, backend/, api/, web/
   - Read README.md if it exists
   Adapt ALL your work to whatever tech stack and structure you discover.

2. THIS IS A LIVE PRODUCT
   This code is deployed and serving real users RIGHT NOW.
   Do NOT talk about "deploying", "going live", or "launching" — it IS live already.
   You are working on the DEVELOPMENT environment. Changes here will be deployed.
   Your job: IMPROVE the live product continuously.
   Treat every change as if real users will see it within hours.

3. MULTI-PLATFORM AWARENESS
   Check if the project has multiple platforms:
   - Web app (root or ./frontend/ or ./web/)
   - Mobile apps (./apps/ or ./mobile/ or ./ios/ or ./android/)
   - API/Backend (./api/ or ./backend/ or ./server/)
   - Desktop app (./desktop/ or ./electron/)
   Work on ALL platforms you find, not just the web.

4. THINK ABOUT GROWTH
   Do not just maintain — GROW. Think about:
   - What features should we ADD that competitors have?
   - What new revenue streams could exist?
   - What would make users invite friends?
   - What can be automated?
   - What new markets or segments can we reach?

5. COORDINATION
   - Read .ai-company/TEAM_BOARD.md before starting
   - Read .ai-company/PRIORITIES.md if it exists — follow the CEO priorities
   - Post your update to TEAM_BOARD.md under "Active Messages" when done
   - Format: **[YOUR_ROLE]** (timestamp): What you did + what you need
   - If you need a CEO decision, add to "Decisions Needed"
   - git commit after every successful change

6. DATA PERSISTENCE
   You MUST use the elementStore API to track your work. See the ELEMENTSTORE API
   section below for curl commands. Every task you work on, every finding, every
   blocker — record it as an @ai-task object via the API. This ensures continuity
   across sessions. If the API is not reachable, write to your STATUS.md as fallback.
