# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AP Statistics Consensus Quiz Renderer - a browser-based educational application for collaborative learning without answer keys. The application uses peer consensus (70% threshold) to identify agreement on answers.

## Architecture

The codebase follows a simplified 26-atom architecture organized into 5 subsystems:
- **Questions (Q)**: 4 atoms for rendering curriculum data
- **User (U)**: 5 atoms for identity and input management
- **Storage/Sync (S)**: 6 atoms for local data and file operations
- **Views (V)**: 7 atoms for consensus displays and peer interactions
- **Progress/Filters (P)**: 4 atoms for navigation and filtering

See FUNDAMENTAL.md for detailed architecture documentation.

## Development Commands

This is a zero-build vanilla HTML/CSS/JavaScript application. No build process is required.

**Running the application:**
```bash
# Open the HTML file directly in a browser
open quiz_renderer.html
# Or for Windows/WSL
start quiz_renderer.html
```

**Testing:**
- No automated test suite exists
- Manual testing by opening quiz_renderer.html in browser

**Development workflow:**
- Edit quiz_renderer.html directly
- Refresh browser to see changes
- No compilation or bundling needed

## Key Files

- `quiz_renderer.html` - Complete standalone application (3,283 lines)
- `curriculum.json` - AP Statistics questions dataset (1.6MB)
- `FUNDAMENTAL.md` - Architecture and design documentation
- `one.txt` through `five.txt` - Chunked source code (development artifacts)

## Important Implementation Details

**Data Storage:**
- Uses browser localStorage for persistence
- Manual file import/export for class synchronization
- No backend server or database

**External Dependencies (loaded via CDN):**
- Chart.js 3.9.1 for visualizations
- MathJax 3 for mathematical notation
- Chart.js DataLabels plugin

**Question Types:**
- Multiple Choice Questions (MCQ) - displayed as dot plots
- Free Response Questions (FRQ) - with peer voting system

**Consensus Logic:**
- 70% agreement threshold for consensus detection
- No answer keys or correctness checking
- Username required for accountability

## Code Conventions

- Single HTML file contains all HTML, CSS, and JavaScript
- Atom-based architecture with clear separation of concerns
- Each atom handles a specific functionality
- No frameworks or build tools - vanilla JavaScript only
- Comments describe atom purposes and interactions