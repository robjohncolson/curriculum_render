# Repository Guidelines

## Project Structure & Module Organization
- `index.html` drives the main curriculum experience; `level_editor.html` is the map editor. Styling lives in `css/styles.css`, images in `img/`.
- `js/` holds front-end logic (canvas engine, charts, auth, toast, teacher dashboard); sprites and interactables live under `js/entities/`.
- Curriculum content and question sets live in `data/*.js` and `csv/`; supporting docs and analysis live in `docs/` (see `docs/chart-wizard-usage.md`, `docs/analysis/` outputs). Utility scripts are in `scripts/`.
- `railway-server/` is a lightweight Express/WebSocket service for Supabase sync and FRQ grading; no build step beyond Node.

## Build, Test, and Development Commands
- Serve the static app locally: `python -m http.server 8000` from repo root, then open `http://localhost:8000/index.html`.
- Backend setup: `cd railway-server && npm install`.
- Backend development: `npm run dev` (auto-reloads server.js). Production-like run: `npm start`.
- Data checks: `node scripts/analyze_frq_charts.js` regenerates `scripts/frq_analysis_results.txt` after FRQ content changes.

## Coding Style & Naming Conventions
- JavaScript uses 2-space indentation, semicolons, camelCase for functions/variables, PascalCase for classes (e.g., `CanvasEngine`). Server code uses ES modules.
- Keep data additions consistent with existing `data/*.js` structures; prefer descriptive filenames (`chart_wizard.js`, `teacher_dashboard.js`) and lowercase assets with underscores.
- No repo-wide linter is configured; mirror surrounding style and prefer concise comments only where logic is non-obvious.

## Testing Guidelines
- No automated test suite currently. Before opening a PR: load the app via the local server, verify core flows (curriculum navigation, chart wizard, sync indicators, teacher dashboard) and ensure sprite interactions still render correctly.
- When the backend is used, confirm `/health` responds and that Supabase interactions succeed against your dev project.
- For data updates, spot-check newly added questions/levels in the UI and re-run the FRQ analysis script if prompts change.

## Commit & Pull Request Guidelines
- Follow the existing Git history: short, task-focused commit subjects in the imperative mood (e.g., `canvas: fix sprite jitter`, `docs: add chart guide`). Group related changes together.
- Pull requests should describe the goal, list major UI/data changes, note any new configuration, and include screenshots or short clips for visible changes.
- Reference related issues or tasks when available, and call out any manual steps (e.g., required Supabase migrations) in the PR description.

## Security & Configuration Tips
- Backend expects environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `DEFAULT_GRADING_MODEL` (optional), `PRESENCE_TTL_MS` (optional), and `PORT`. Keep real values in a local `.env`; do not commit secrets.
- Front-end `supabase_config.js` contains placeholder defaults—replace locally for your project, but avoid committing private keys.
