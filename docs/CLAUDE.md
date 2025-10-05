# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# AP Statistics Consensus Quiz - Development Guide

## Project Overview

**Project Type**: Static HTML Educational Web Application
**Purpose**: Interactive AP Statistics learning platform with consensus-based quiz system and peer learning capabilities
**Architecture**: Single-page application (SPA) with embedded JavaScript, no build system required
**Target Audience**: AP Statistics students and educators

This application enables students to work through AP Statistics curriculum questions while seeing peer responses and explanations, fostering collaborative learning through transparent peer interaction.

## Quick Start Commands

### Development Workflow
```bash
# No build system - direct file serving
# Open index.html in browser or serve via local HTTP server
python -m http.server 8000  # Python 3
# OR
npx http-server .           # Node.js alternative

# For development with live reload (optional)
npx live-server .
```

### No Traditional Build/Test Commands
- **No package.json**: This is a static web application
- **No build step required**: All code is directly executable
- **Testing**: Manual testing in browser (no automated test framework)
- **Linting**: No automated linting - follow existing code patterns in index.html

### Git Workflow
```bash
# Recent development pattern focuses on function mapping and data management
git status                  # Check modified files
git add .                   # Stage all changes
git commit -m "Description" # Commit with descriptive message
git push origin main        # Push to main branch
```

## Architecture Overview

### Core Technology Stack
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Charting**: Chart.js 3.9.1 with datalabels plugin
- **Math Rendering**: MathJax 3
- **QR Code Generation**: QRCode.js for sharing functionality
- **Data Storage**: Browser localStorage + JSON file import/export
- **Styling**: Custom CSS with dark/light theme support

### File Structure
```
proto_curriculum_render/
├── index.html              # Main application (6,159 lines) - contains ALL JavaScript
├── css/
│   └── styles.css          # Complete styling with theme support (3,369 lines)
├── js/
│   ├── charts.js          # Chart rendering logic (1,499 lines)
│   └── charthelper.js     # Chart utility functions (27 lines)
├── data/
│   ├── curriculum.js      # Complete AP Stats curriculum data (1.7MB)
│   └── units.js          # Unit structure and lesson organization (2,591 lines)
├── docs/
│   ├── FOUNDATION_DOCUMENT.md              # Architecture philosophy & data models
│   ├── advanced_combiner_tool.html        # Data aggregation utility
│   ├── master_database_*.json             # Aggregated class data
│   ├── master_peer_data_*.json           # Peer data snapshots
│   ├── student2username.csv              # Username mapping
│   └── users/                            # Individual student JSON files
├── CLAUDE.md                              # This development guide
├── COMPREHENSIVE_FUNCTION_DOCUMENTATION.md  # Complete function reference
└── example_multi_player_game/             # Separate multiplayer game project (see its own CLAUDE.md)
```

### Application Architecture Patterns

#### 1. **Monolithic JavaScript Architecture**
- **Single HTML file contains all application logic** (6,159 lines)
- No module system - all functions in global scope
- Script execution starts with `DOMContentLoaded` event
- 110+ functions organized by functional area

#### 2. **Data Layer Architecture**
```javascript
// Three-tier data structure:
localStorage -> Personal Data (answers, preferences)
File Import -> Peer Data (class insights, comparisons)
Static Data -> Curriculum (questions, units, lessons)
```

#### 3. **File-Based Data Persistence**
- **Core Philosophy**: "The File IS the Database"
- Student progress stored in downloadable JSON files
- No server dependencies - completely client-side
- Import/export system for peer data sharing

#### 4. **Progressive Enhancement Pattern**
- Works with personal data only (offline capable)
- Enhanced with peer insights when available
- Graceful degradation for missing curriculum data
- Theme-aware rendering (dark/light modes)

## Recent Development Focus

### Active Development Areas (from git history)
- **User Management**: Recent focus on username handling and data imports
- **Peer Data Aggregation**: Advanced combining tools for class-wide data analysis
- **Cloud Sync**: Modal adjustments and sync functionality improvements
- **Data Loss Recovery**: Fixes for student data import after cache clearing

## Critical Development Information

### Key Functions by Purpose

**Navigation & Question Loading**
- `loadQuestion(topic, questionNum)` - Main question loading (index.html:~2100)
- `renderQuestion()` - Individual question rendering with MathJax (index.html:~1450)
- `navigateToQuestion(topic, questionNum)` - URL-based navigation

**Data Management**
- `importDataForUser()` - Most complex function (578+ lines, index.html:~600)
- `saveToFile()` - Export student progress
- `loadStudentData(event)` - JSON file import processing
- `mergePeerData()` - Peer insight integration

**Quiz & Response System**
- `renderQuiz()` - Main quiz interface rendering
- `submitAnswer()` - Response submission and processing
- `processSubmission(studentResponse)` - Answer validation and feedback
- `displayPeerResponses()` - Peer learning visualization

**Chart System**
- `buildChart()` - Main chart rendering function (js/charts.js)
- `getChartTheme()` - Theme integration for charts
- `generateChartColors()` - Consistent color palettes

## Key System Components

### 1. **User Management System**
**Files**: `index.html` (lines 115-600)
**Key Functions**:
- `generateRandomUsername()` - Fruit + Animal username generation
- `promptUsername()` - User onboarding flow
- `importDataForUser()` - Most complex function (578+ lines)
- `checkExistingData()` - Data continuity validation

**Pattern**: Transparent peer identification (no anonymization)

### 2. **Question & Quiz Management**
**Files**: `index.html` (lines 1436-2000), `data/curriculum.js`
**Key Functions**:
- `renderQuiz()` - Main quiz interface rendering
- `renderQuestion()` - Individual question rendering with MathJax
- `isQuestionAnswered()` - Progress tracking
- `calculateBadges()` - Achievement system

**Pattern**: Dynamic question rendering with peer response visualization

### 3. **Chart & Visualization System**
**Files**: `js/charts.js`, `js/charthelper.js`
**Key Functions**:
- `renderChart()` - Chart.js wrapper with educational features
- `generateChartColors()` - Consistent color palettes
- Theme-aware color management for accessibility

**Pattern**: Educational chart rendering with consensus visualization

### 4. **Data Sync & Import/Export System**
**Files**: `index.html` (lines 578-1000)
**Key Functions**:
- `saveToFile()` - Export student progress
- `importFromFile()` - Import peer or personal data
- `mergePeerData()` - Peer insight integration
- Data migration functions for format compatibility

**Pattern**: File-based data exchange with automatic migration support

### 5. **Theme & UI Management**
**Files**: `css/styles.css`, `js/charthelper.js`
**Key Functions**:
- `toggleTheme()` - Dark/light mode switching
- Theme-aware color functions for charts and UI
- Responsive grid layouts for question display

### 6. **Curriculum Navigation System**
**Files**: `data/units.js`, `index.html` (lines 1280-1436)
**Key Functions**:
- `renderLessonSelector()` - Unit/lesson navigation
- `detectUnitAndLessons()` - Curriculum structure analysis
- Progress tracking across units and lessons

### 7. **Data Aggregation Tools**
**Files**: `docs/advanced_combiner_tool.html`, `docs/master_database_*.json`
**Purpose**: Combine multiple student JSON files into master peer data
**Usage**: Teacher/administrator tool for class-wide data analysis
**Output**: Creates aggregated JSON files for peer learning features

## Data Models & Storage

### Student Progress File Structure
```javascript
{
  "exportTime": "2025-09-19T12:59:26.856Z",
  "username": "Apple_Rabbit",
  "users": {
    "Apple_Rabbit": {
      "answers": {
        "U1-L2-Q01": {
          "value": "B",
          "timestamp": 1757683639793
        }
      },
      "badges": {...},
      "preferences": {...}
    }
  }
}
```

### Curriculum Data Structure
- **Units**: Major AP Stats topics (Unit 1-9)
- **Lessons**: Sub-topics within units
- **Questions**: Individual quiz items with multiple choice answers
- **Charts**: Data visualization components for questions

## Development Patterns & Conventions

### Code Organization
1. **Functional Programming Style**: Most functions are pure or have minimal side effects
2. **Global Namespace**: All functions accessible globally (no modules)
3. **Event-Driven**: Heavy use of `addEventListener` patterns
4. **DOM Manipulation**: Direct DOM updates, no virtual DOM
5. **Error Handling**: Try-catch blocks around localStorage and JSON operations

### Naming Conventions
- **Functions**: camelCase with descriptive names (`generateRandomUsername`)
- **Variables**: camelCase for local, UPPER_CASE for constants
- **IDs**: kebab-case for HTML elements (`user-stats-display`)
- **CSS Classes**: kebab-case with semantic naming

### Data Handling Patterns
- **Immutable Exports**: Student files never modified in-place
- **Merge-Heavy Operations**: Peer data merged into personal data views
- **Timestamp Tracking**: All student actions timestamped for analytics
- **Graceful Degradation**: Missing data handled without crashes

## Testing & Debugging Approach

### Manual Testing Protocol
1. **Username Generation**: Test random generation and import flows
2. **Question Rendering**: Verify MathJax rendering and chart display
3. **Data Persistence**: Test save/load cycles with localStorage
4. **Peer Data Integration**: Test import/export with sample files
5. **Theme Switching**: Verify dark/light mode functionality
6. **Cross-browser**: Test in Chrome, Firefox, Safari

### Debugging Tools
- **Console Logging**: Extensive console output for data flows
- **localStorage Inspector**: Browser dev tools for storage debugging
- **Network Tab**: Monitor Chart.js and MathJax loading
- **File System Access**: Test import/export functionality

### Common Issues & Solutions
- **MathJax Loading**: Check async script loading timing
- **Chart Rendering**: Verify Chart.js canvas initialization
- **File Import Failures**: Check JSON format and browser file access
- **Theme Persistence**: Verify localStorage theme storage

## Performance Considerations

### Asset Loading
- **Chart.js**: 3.9.1 via CDN (minimize local caching issues)
- **MathJax**: Version 3 with async loading
- **Large Data Files**: curriculum.js is 1.7MB (consider chunking for production)

### Memory Management
- **DOM Cleanup**: Charts properly destroyed when re-rendering
- **Event Listeners**: Proper cleanup to prevent memory leaks
- **localStorage Limits**: Monitor storage usage with large peer datasets

## Future Development Areas

### Identified Enhancement Opportunities
1. **Module System**: Convert to ES6 modules for better organization
2. **Build Process**: Add webpack/vite for optimization
3. **Testing Framework**: Implement Jest or similar for automated testing
4. **TypeScript**: Add type safety for large codebase
5. **Component Architecture**: Refactor to component-based structure

### Current Technical Debt
- **Monolithic HTML**: 6,159 lines in single file needs modularization
- **Global Functions**: 110+ functions in global namespace
- **No Dependency Management**: Manual CDN management for external libraries
- **Manual Testing Only**: No automated test coverage

## Key Files for Future Development

### Critical Files to Understand First
1. **`index.html`** - Main application logic (6,159 lines)
2. **`docs/FOUNDATION_DOCUMENT.md`** - Architecture philosophy
3. **`COMPREHENSIVE_FUNCTION_DOCUMENTATION.md`** - Complete function reference
4. **`data/curriculum.js`** - Question database (1.7MB)
5. **`js/charts.js`** - Visualization logic (1,499 lines)

### Development Entry Points
- **New Features**: Start with `index.html` function additions
- **Styling**: Modify `css/styles.css` with theme awareness
- **Curriculum**: Update `data/curriculum.js` and `data/units.js`
- **Charts**: Extend `js/charts.js` with new visualization types

## Common Development Tasks

### Adding New Questions
1. Edit `data/curriculum.js` to add question objects
2. Follow existing structure: `type`, `prompt`, `options`, `correctAnswer`
3. Test question rendering and peer response display
4. Verify MathJax rendering for mathematical notation

### Modifying Chart Behavior
1. Edit functions in `js/charts.js`
2. Use `buildChart()` as entry point for new chart types
3. Ensure theme compatibility with both light/dark modes
4. Test chart destruction and recreation for performance

### Data Structure Changes
1. Update validation in `validateStudentDataStructure()` (index.html:~800)
2. Add migration logic in `importDataForUser()` for backward compatibility
3. Test import/export functionality thoroughly
4. Update sample files in `docs/sample_users/`

### UI/UX Changes
1. Modify HTML structure in `index.html`
2. Update CSS in `css/styles.css` with theme awareness
3. Test responsive behavior across screen sizes
4. Verify accessibility with screen readers

---

*This application represents a unique approach to educational technology, prioritizing peer transparency and file-based data portability over traditional database-driven architectures. Understanding the "file as database" philosophy is crucial for effective development.*