# PaperLyft test harness

This repository tests a separate PaperLyft application. Do not modify the application repository without asking the lead agent. Leave all work uncommitted; never commit, push, change Git identity, provision infrastructure, or change account permissions unless the user explicitly requests it.

Use test-driven development for behavior changes. Test observable behavior. Real product tests must call a real target; never intercept product API responses or label a simulator run as end-to-end processing evidence. Report missing credentials, unsupported capabilities, and unrun cases explicitly.

Use one browser worker and one heavy command at a time. Reuse installed system Chrome or Edge; do not download browser runtimes. Coordinate test/install/typecheck execution with the lead agent. Do not start permanent background processes. Close every fixture server/browser you start. Keep generated fixtures small by default; large boundaries are opt-in. Do not copy the application or its node_modules, and do not create dependency symlinks.

No secrets or browser storage states in Git. Use ignored .auth/, .env.local, and artifacts/ paths; never print their contents. Live tests use dedicated test accounts. Production supports an explicitly enabled, budget-limited canary only. Never run stress, destructive, external county crawling, real payments, or broad fault injection on production.

The user explicitly requested gpt-6-luna subagents for most implementation. Work in assigned paths and coordinate shared interfaces. Read docs/PLAN.md before implementing.
