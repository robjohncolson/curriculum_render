# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AP Statistics Consensus Quiz web application - an educational tool designed for collaborative learning in statistics classes. The app allows students to answer quiz questions and see peer responses in real-time, creating a consensus-based learning environment.

## Architecture

### Core Application Structure

The application is a client-side web app with optional server-side synchronization:

- **Frontend**: Pure JavaScript, HTML, CSS (no build step required)
- **Data Storage**: LocalStorage with optional Supabase cloud sync
- **Real-time Sync**: Railway server (Node.js) acting as a caching proxy to Supabase
- **Visualization**: Chart.js for data visualization, Canvas API for sprite animations

### Key Components

1. **Quiz System** (`index.html`, `js/auth.js`, `data/curriculum.js`, `data/units.js`)
   - Questions embedded directly in JavaScript files
   - Progressive disclosure onboarding for new/returning students
   - Username generation system (Fruit_Animal format)

2. **Data Synchronization**
   - **Local-only mode**: Uses localStorage for offline functionality
   - **Turbo Mode** (Supabase): Direct connection to Supabase for real-time sync
   - **Railway Server**: Caching proxy that reduces Supabase queries by 95%
   - Configuration in `supabase_config.js` and `railway_config.js`

3. **Sprite Animation System** (`js/sprite_*.js`, `js/canvas_engine.js`)
   - Interactive sprite characters for user representation
   - Real-time multiplayer sprite visualization

## Development Commands

### Local Development

```bash
# No build step required - serve static files directly
# Use any static file server, for example:
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

### Testing Server Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Get peer data
curl http://localhost:3000/api/peer-data

# Get question statistics
curl http://localhost:3000/api/question-stats/U1-L3-Q01
```

## Configuration

### Enabling Turbo Mode (Supabase Sync)

1. Edit `supabase_config.js`:
   - Set `SUPABASE_URL` to your Supabase project URL
   - Set `SUPABASE_ANON_KEY` to your public anon key

2. Run the SQL schema (from `supabase_schema.sql`) in your Supabase SQL editor

### Enabling Railway Server

1. Deploy the `railway-server` directory to Railway.app
2. Set environment variables in Railway:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Edit `railway_config.js`:
   - Set `USE_RAILWAY = true`
   - Set `RAILWAY_SERVER_URL` to your deployed server URL

## Data Flow

### Without Railway Server
- Each student queries Supabase directly (30 students × 12 queries/hour = 360 queries/hour)
- 5-minute polling intervals for peer data updates

### With Railway Server
- Server queries Supabase once and caches (12 queries/hour total)
- WebSocket connections for instant updates to all clients
- 30-second cache TTL for frequently accessed data

## File Organization

```
/
├── index.html                 # Main application entry point
├── css/styles.css            # Application styles
├── data/
│   ├── curriculum.js         # Quiz questions database
│   └── units.js             # Course units structure
├── js/
│   ├── auth.js              # User authentication and session management
│   ├── data_manager.js      # Data persistence and synchronization
│   ├── charts.js            # Chart.js visualizations
│   ├── canvas_engine.js     # Sprite animation engine
│   └── sprite_*.js          # Sprite-related modules
├── railway-server/          # Node.js caching server
│   ├── server.js           # Express + WebSocket server
│   └── package.json        # Node dependencies
├── supabase_config.js      # Supabase credentials
└── railway_config.js       # Railway server toggle
```

## Important Considerations

1. **No Build Process**: This is a static site - no webpack, no transpilation needed
2. **Progressive Enhancement**: Works offline-first, cloud sync is optional
3. **Educational Focus**: Designed for classroom use with intentionally simple auth (no passwords)
4. **Real-time Features**: WebSocket support through Railway server for instant updates
5. **Data Privacy**: Uses anonymous usernames (Fruit_Animal format), no personal data collected

## Database Schema

When using Supabase, the app expects these tables (created by `supabase_schema.sql`):
- `answers`: Student quiz responses
- `class_data`: Aggregated class statistics
- Real-time subscriptions enabled for instant updates

## Deployment

The app can be deployed to any static hosting service (GitHub Pages, Netlify, Vercel, etc.). The Railway server component requires Node.js hosting (Railway.app, Heroku, etc.).