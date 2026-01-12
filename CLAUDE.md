# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AP Statistics Consensus Quiz - a collaborative learning web app where students answer quiz questions and see peer responses in real-time.

## Development Commands

```bash
# Frontend - no build step, serve static files
python -m http.server 8000
# or: npx http-server

# Railway Server (Node 18+ required)
cd railway-server
npm install
npm start              # Production
npm run dev            # Dev with auto-reload

# Test server endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api/peer-data
curl http://localhost:3000/api/question-stats/U1-L3-Q01

# Analyze FRQ chart requirements (Node.js script)
node scripts/analyze_frq_charts.js
# Outputs: docs/analysis/frq_chart_inventory.{json,csv}
```

## Architecture

**Three-tier storage with fallback chain:**
1. **IndexedDB** (primary) - structured data in `answers`, `reasons`, `attempts`, `charts`, `peerCache` stores
2. **localStorage** (fallback) - dual-write during transition for backward compatibility
3. **Supabase** (optional cloud sync) - real-time peer data via Railway server cache proxy

**Key architectural decisions:**
- Storage abstraction layer (`js/storage/`) with `DualWriteAdapter` pattern enables IDB+localStorage dual-write
- `classData` object is an in-memory view rebuilt from IDB stores via `rebuildClassDataView()`
- Railway server reduces Supabase queries by 95% (360/hr → 12/hr for 30-student class)
- All storage operations are async; use `await waitForStorage()` before data access

## Module Dependencies

Load order matters (see `index.html` script tags):
1. CDN libs (Chart.js, MathJax, Supabase client, QRCode)
2. Config files (`supabase_config.js`, `railway_config.js`)
3. Storage layer (`js/storage/*.js` → `index.js` initializes adapters)
4. Core modules (`js/charts.js`, `railway_client.js`)
5. Sprite system (`js/sprite_sheet.js` → `canvas_engine.js` → entities → `sprite_manager.js`)
6. Data files (`data/curriculum.js`, `data/units.js`, `data/chart_questions.js`)
7. Inline script in `index.html` (app initialization)

## Key Global Variables

- `currentUsername`: Active user's Fruit_Animal identifier
- `classData`: In-memory cache of user data (rebuilt from IDB on load)
- `storage`: Initialized storage adapter (access via `getStorage()` or `waitForStorage()`)
- `TURBO_MODE`: Whether Supabase sync is enabled (from `supabase_config.js`)
- `USE_RAILWAY`: Whether to use Railway caching proxy (from `railway_config.js`)

## Data Structures

**Question IDs**: Format `U{unit}-L{lesson}-Q{number}` (e.g., `U1-L3-Q01`)

**User data in classData.users[username]:**
```javascript
{
  answers: { questionId: { value, timestamp } },
  reasons: { questionId: string },
  timestamps: { questionId: number },
  attempts: { questionId: number },
  charts: { chartId: data },
  currentActivity: { state, questionId, lastUpdate }
}
```

## Configuration

**Enable Supabase sync:** Edit `supabase_config.js` with project URL and anon key. Schema reference in `docs/supabase_schema.sql` (context only, not executable).

**Enable Railway server:** Set `USE_RAILWAY = true` and `RAILWAY_SERVER_URL` in `railway_config.js`. Deploy `railway-server/` to Railway.app with `SUPABASE_URL` and `SUPABASE_ANON_KEY` env vars.

## Database Schema (Supabase)

Core tables: `users`, `answers` (PK: username+question_id), `badges`, `user_activity`, `votes`

## Deployment

- **Frontend**: Any static host (GitHub Pages, Netlify)
- **Railway server**: Node.js 18+ host with `SUPABASE_URL`, `SUPABASE_ANON_KEY` env vars (ES modules)

## Directory Notes

- `worksheets/`: Standalone HTML files for specific lesson activities (e.g., `u3l67.html` for Unit 3 Lessons 6-7)
- `scripts/`: Node.js utilities for analysis and data processing
- `docs/`: Integration guides, sync documentation, and SQL schema reference