# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AP Statistics educational platform built as a static HTML application. The system is designed around **file-based persistence** where student progress files serve as both storage and homework artifacts, avoiding reliance on browser localStorage/cookies that can be cleared.

## Architecture

### File Structure
- `index.html` - Main application entry point with embedded JavaScript
- `js/charts.js` - Core chart rendering functionality (🚨 **IMMUTABLE** - do not modify)
- `js/charthelper.js` - Chart utility functions for colors and themes
- `css/styles.css` - Main stylesheet with dark/light theme support
- `data/curriculum.js` - Embedded curriculum questions and content
- `data/units.js` - Unit structure definitions
- `sample_users/` - Sample student progress files (JSON format)
- `docs/FOUNDATION_DOCUMENT.md` - Complete system architecture specification

### Key Components

**Student Progress Files**: JSON files containing:
- `personalData` - Student's own answers, notes, bookmarks (never modified by imports)
- `sessionState` - Current position, preferences, progress tracking
- `peerData` - Class data imported from teacher (replaced on each import)
- `curriculumCache` - Optional offline curriculum storage

**Chart System**: Built around the `renderChart(chartData, questionId)` function in `js/charts.js`. This function is considered **golden/immutable** and handles all chart types (bar, histogram, dotplot, boxplot, scatterplot, etc.).

## Development Workflow

This is a **static HTML application** with no build system required:

1. **Local Development**: Open `index.html` directly in a browser
2. **Testing**: Manual testing in browser (no automated test suite)
3. **Deployment**: Copy files to any static web server

### Key Functions to Understand

- `generateChartColors(count)` - Creates consistent color palettes
- `renderChart(chartData, questionId)` - **DO NOT MODIFY** - Core chart rendering
- `loadFile()` / `saveFile()` - File-based persistence system
- `importPeerData()` - Merges class data without affecting personal data

## Data Flow

1. **Student Workflow**: Create username → Work on questions → Save progress file
2. **Teacher Integration**: Students export files → Teacher aggregates → Import back to students
3. **Peer Learning**: View classmate answers WITH NAMES (no anonymization)

## Critical Constraints

- **No localStorage dependency** - Everything must work if browser storage is cleared
- **File integrity** - Personal data must never be corrupted by peer data imports
- **Chart function preservation** - `renderChart()` in `js/charts.js` is immutable
- **Progressive enhancement** - App works without peer data or curriculum files

## Question ID Format

Questions follow the pattern: `U{unit}-L{lesson}-Q{number}` (e.g., `U1-L3-Q01`)
Progress Check questions use: `U{unit}-PC-Q{number}`

## Theme Support

The application supports dark/light themes through CSS classes and helper functions:
- `isDarkMode()` - Check current theme
- `getTextColor()` / `getGridColor()` - Theme-aware colors for charts

## File-Based Persistence Philosophy

The core principle is "The File IS the Database" - student progress files are not exports but the primary storage mechanism. This teaches digital responsibility and ensures data survives browser cache clearing.