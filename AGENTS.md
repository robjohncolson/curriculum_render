# Rules for Grok Build (read first)

You are taking over this repo from Claude Code (handover finished 2026-11-27). This is the AP Statistics quiz and Progress Check app (GitHub Pages `robjohncolson.github.io/curriculum_render/`, branch `main`) plus `railway-server/` (answer sync, peer data, AI grading, appeals) on Railway. Students use both live. `CLAUDE.md` is a 35k reference and only its first 10,000 characters load: open it for architecture detail, but where it disagrees with this block or your memory topics, this block and the topics are newer. Your workspace memory topics hold the history: read the matching topic before acting.

## Hard rules
- **`data/curriculum.js` is sacred.** It mirrors AP Classroom. Never add, edit or remove questions in it. A new or fixed question goes in follow-alongs `data/formula-probe-supplement.js` (`U{N}-L{N}-QS{N}` ids).
- **Quiz retry policy (current, 2026-11-02):** wrong answer -> explanation -> ONE retry at HALF credit; classmates' letters and the class chart stay hidden until the answer key is revealed. `CLAUDE.md`'s "unlimited attempts" section is out of date. Grading lives in follow-alongs `roster-server/` (ledger.js, scoring.js), not here.
- **Never lower a stored grade.** AI grading only raises.
- **Identity is the roster.** Same origin as the follow-alongs Desk, so localStorage (`apstats_roster.v1`) is shared. Never add a path that mints a non-roster username.
- **Old 9-unit keys are storage ids, never printed.** Labels come from the CED-2026 crosswalk vendored here by follow-alongs `node scripts/sync-ced-crosswalk.mjs`; never hand-edit the vendored copies in `data/` or `railway-server/data/`.

## Pushing
1. **Teacher sign-off in THIS session**, then `touch "$(git rev-parse --git-dir)/PUSH_APPROVED"` and a plain `git push origin main`. The pre-push hook deletes the sentinel. Never `--no-verify`, never force-push.
2. The hook also refuses a push whose `sw.js` BUILD stamp is older than a precached asset: run `node scripts/bump-build.mjs` (writes `version-check.js`, `version.json`, `sw.js`) and commit those three.
3. **Never during a live class block:** a push redeploys `railway-server/` (bell times: follow-alongs `apstat-park/class-session.mjs` BELL_SCHEDULE).
4. Before pushing: `npm test` (root) and, if you touched it, the `railway-server/` tests. After: check the Railway `/health` and follow-alongs `status.html`.

## Shared dirty tree and privacy
- Never `git stash`, `git reset --hard` or `git add -A`; stage only your own paths and read the staged diff.
- This repo is public: never commit student names, answers of a named student, or keys. The Supabase service key lives only in Railway variables.

## GitNexus
The block below assumes GitNexus MCP tools you may not have (index broken since 2026-11-08). Without them, find callers with `rg` and read them before editing a shared function.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **curriculum_render** (5538 symbols, 13006 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/curriculum_render/context` | Codebase overview, check index freshness |
| `gitnexus://repo/curriculum_render/clusters` | All functional areas |
| `gitnexus://repo/curriculum_render/processes` | All execution flows |
| `gitnexus://repo/curriculum_render/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
