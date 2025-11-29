# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AP Statistics Consensus Quiz web application - an educational tool designed for collaborative learning in statistics classes. The app allows students to answer quiz questions and see peer responses in real-time, creating a consensus-based learning environment.

## Architecture

### Core Application Structure

The application is a client-side web app with optional server-side synchronization:

- **Frontend**: Pure JavaScript, HTML, CSS (no build step required)
- **Data Storage**: IndexedDB (via Dexie.js) with optional Supabase cloud sync
- **Real-time Sync**: Railway server (Node.js) acting as a caching proxy to Supabase
- **Visualization**: Chart.js for data visualization, Canvas API for sprite animations

### Key Components

1. **Quiz System** (`index.html`, `js/auth.js`, `data/curriculum.js`, `data/units.js`)
   - Questions embedded directly in `data/curriculum.js` as `EMBEDDED_CURRICULUM` array
   - Progressive disclosure onboarding for new/returning students
   - Username generation system (Fruit_Animal format, e.g., "Apple_Dolphin")

2. **Data Layer** (`js/db.js`, `js/data_manager.js`)
   - IndexedDB with Dexie.js for local persistence (replaces older localStorage approach)
   - Per-user sharding with automatic migration from localStorage
   - Graceful fallback to in-memory storage if IndexedDB is blocked

3. **Data Synchronization** (`railway_client.js`, `js/sync_status.js`)
   - **Local-only mode**: Uses IndexedDB for offline functionality
   - **Railway Server**: Caching proxy that reduces Supabase queries by 95%
   - WebSocket connections for instant real-time updates
   - Configuration in `supabase_config.js` and `railway_config.js`

4. **Sprite Animation System** (`js/canvas_engine.js`, `js/sprite_manager.js`, `js/study_buddy_room.js`, `js/entities/`)
   - Entity-component architecture with `CanvasEngine` managing game loop
   - Entity types: `PlayerSprite`, `PeerSprite`, `UnitBlock`, `ExitDoor`, `MenuDoor`
   - Real-time multiplayer visualization showing peers in a shared "room"

5. **Chart Wizard** (`js/chart_wizard.js`, `js/chart_registry.js`, `js/charts.js`)
   - Interactive chart creation for FRQ responses
   - Supports: bar, line, scatter, bubble, radar, polar area, pie, doughnut, histogram, dotplot, boxplot, normal curve, chi-square curve, number line
   - Charts stored in Standard Internal Format (SIF) as JSON

6. **FRQ Grading** (`js/frq_grader.js`, server-side in `railway-server/server.js`)
   - AI-powered grading via Groq (Llama) or Google Gemini APIs
   - Server handles API calls to avoid exposing keys client-side

## Development Commands

### Local Development

```bash
# No build step required - serve static files directly
python -m http.server 8000
# or
npx http-server
```

### Railway Server Development

```bash
cd railway-server
npm install           # Install dependencies
npm start            # Start production server
npm run dev          # Start with auto-reload (Node 18+ required)
```

### Analysis Scripts

```bash
# Analyze FRQ chart requirements
node scripts/analyze_frq_charts.js
```

### Testing Server Endpoints

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/peer-data
curl http://localhost:3000/api/question-stats/U1-L3-Q01
curl http://localhost:3000/api/stats
```

## Configuration

### Enabling Railway Server (Recommended)

1. Deploy the `railway-server` directory to Railway.app
2. Set environment variables in Railway:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `GROQ_API_KEY` (optional, for FRQ grading)
   - `GEMINI_API_KEY` (optional, for FRQ grading)
3. Edit `railway_config.js`:
   - Set `USE_RAILWAY = true`
   - Set `RAILWAY_SERVER_URL` to your deployed server URL

## Data Flow

### Script Load Order (Critical)

Scripts must load in this order (see `index.html` lines 274-294):
1. External libraries (Chart.js, MathJax, Supabase client, QRCode)
2. Config files (`supabase_config.js`, `railway_config.js`)
3. `js/charts.js` - Chart rendering utilities
4. `railway_client.js` - Sync client
5. Sprite system scripts
6. `js/lib/dexie.min.js` → `js/db.js` → `js/sync_status.js` → `js/restore_ui.js`
7. `js/user_management.js` → `js/auth.js` → `js/data_manager.js`
8. Chart wizard components

### Data Storage Structure

```javascript
// IndexedDB schema (js/db.js)
users: 'username'  // { answers: {}, charts: {}, currentActivity: {}, reasons: {}, timestamps: {}, attempts: {} }
meta: 'key'        // App-level state

// In-memory structure (window.classData)
classData.users[username].answers[questionId]
classData.users[username].charts[questionId]  // SIF format
classData.users[username].currentActivity     // For sprite system
```

### Railway Server Benefits

- **Without server**: 30 students × 12 queries/hour = 360 queries/hour to Supabase
- **With server**: 12 queries/hour total (97% reduction)
- 30-second cache TTL, WebSocket broadcasts for instant updates

## Key Global Variables

- `window.classData` - All user data (answers, charts, activity state)
- `window.currentUsername` - Active user's username
- `window.USE_RAILWAY` - Toggle Railway server integration
- `window.RAILWAY_SERVER_URL` - Railway server endpoint
- `window.FEATURE_FLAGS` - Runtime feature toggles (restoreFromCloud, classPacks, autoExport)
- `window.turboModeActive` - Whether cloud sync is active
- `window.CHART_TYPE_LIST` - Registry of available chart types

## File Organization

```
/
├── index.html                 # Main app (366KB - contains inline JS)
├── level_editor.html          # Map/level editor tool
├── css/styles.css            # Application styles
├── data/
│   ├── curriculum.js         # EMBEDDED_CURRICULUM - all quiz questions
│   ├── units.js             # ALL_UNITS_DATA - course structure with videos/blookets
│   ├── levels.js            # Level/map data
│   └── chart_questions.js   # Chart-eligible question mappings
├── js/
│   ├── db.js                # IndexedDB layer (Dexie), AppDB singleton
│   ├── auth.js              # Username generation, session management
│   ├── data_manager.js      # Import/export, data persistence
│   ├── canvas_engine.js     # Sprite game loop, entity management
│   ├── study_buddy_room.js  # Room scene with camera, ground plane
│   ├── sprite_manager.js    # Sprite lifecycle management
│   ├── chart_wizard.js      # Interactive chart builder modal
│   ├── chart_registry.js    # CHART_TYPE_LIST definitions
│   ├── charts.js            # Chart.js rendering helpers
│   ├── frq_grader.js        # Client-side FRQ grading UI
│   ├── sync_status.js       # SyncStatus component for UI feedback
│   ├── user_management.js   # Multi-user account switching
│   ├── teacher_dashboard.js # Teacher view and analytics
│   └── entities/            # Sprite entity classes
├── railway-server/          # Node.js caching server
│   ├── server.js           # Express + WebSocket + AI grading
│   └── package.json        # Requires Node 18+
├── scripts/
│   └── analyze_frq_charts.js # FRQ chart requirement analysis
└── docs/
    └── analysis/           # Generated FRQ analysis outputs
```

## Important Patterns

1. **No Build Process**: Static site with ES5/ES6 JavaScript, no transpilation
2. **Progressive Enhancement**: Works offline-first, cloud sync is optional
3. **Anonymous Identity**: Fruit_Animal usernames, no passwords or personal data
4. **Global Functions**: Many functions exposed on `window` for cross-module access
5. **Inline JavaScript**: `index.html` contains substantial inline script (~5000+ lines) including app initialization, Supabase integration, and UI handlers
