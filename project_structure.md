# Project Structure Analysis - AP Stats Quiz App

## File Overview
- **index.html**: Main application (3,873 lines) - single-page application with embedded JavaScript
- **js/charts.js**: Chart rendering functions (immutable)
- **js/charthelper.js**: Chart utility functions
- **css/styles.css**: Main stylesheet
- **data/curriculum.js**: Embedded curriculum questions
- **data/units.js**: Unit structure definitions

## Key Components and Line Ranges

### Username Management Functions
- **promptUsername()**: Lines 250-260 - Checks for saved username, initializes data
- **showUsernamePrompt()**: Lines 262-350+ - Shows comprehensive username entry interface
- **acceptUsername()**: Around line 394 - Saves username to localStorage
- **recoverUsername()**: Referenced in HTML (line 287) - Manual username entry
- **importUsernameFromFile()**: Referenced in HTML (line 301) - File-based username recovery

### QR Code Functionality (TO BE REMOVED)
- **QR Scanner Modal HTML**: Lines 354-369 - Modal dialog for QR scanning
- **showQRScanner()**: Lines 560-564 - Opens QR scanner modal
- **closeQRScanner()**: Lines 566-568 - Closes QR scanner modal
- **processQRCode()**: Lines 570-585 - Processes QR input
- **generateUsernameQR()**: Lines 588-620+ - Generates QR for current user
- **QR HTML Elements**: Lines 308-316 - QR option in username prompt

### Import/Export Functions
- **importClassData()**: Lines 2418-2440 - Main import function
- **mergeMasterData()**: Lines 2442-2550+ - Handles master database imports
- **mergeRegularClassData()**: Referenced but needs location
- **exportMasterData()**: Line 2361+ - Exports complete database
- **exportPersonal()**: Around line 649 - Exports individual user data

### PigSprite Implementation
- **PigSprite class**: Lines 2671-2850+ - Complete sprite class with movement/animation
- **Constructor**: Lines 2672-2685 - Initial setup and positioning
- **bindControls()**: Lines 2714-2770 - Keyboard event handling
- **Initialization**: Line 2857 - Creates pig sprite instance

### Data Storage Structure (localStorage)
- **consensusUsername**: Current user's username
- **classData**: Global class data structure
- **answers_${username}**: Individual user answers
- **progress_${username}**: Individual user progress
- **consensusResponses**: Class-wide consensus data

## Data Flow Analysis

### User Journey
1. **Initial Load**: `promptUsername()` → Check localStorage → Show username prompt or welcome
2. **Username Setup**: Manual entry, file import, or QR scan → `acceptUsername()`
3. **Data Initialization**: `initClassData()` → Load/create user data structure
4. **Navigation**: Unit selection → Lesson selection → Questions
5. **Data Persistence**: Auto-save to localStorage with user-specific keys

### Import/Export Flow
1. **Personal Export**: Extract user's answers/progress → JSON file download
2. **Master Export**: Aggregate all users' data → Comprehensive JSON export
3. **Import Process**: File upload → Parse JSON → Merge based on export type
4. **Data Merging**: Preserve existing user data, update class-wide statistics

## Critical Issues Identified

### Import Functionality Problems
- **checkExistingData()**: May not properly detect user data in exported files
- **File Format Recognition**: Inconsistent handling of master vs personal exports
- **Data Parsing**: May fail to extract usernames from imported data structure

### Missing Sync UI
- **No Consistent Sync Button**: No fixed sync button across all screens
- **Modal Issues**: QR scanner modal exists but general sync modal missing
- **Inconsistent Placement**: Import/export functions exist but no unified UI

### Username Management Limitations
- **No Switch User**: Cannot change username without clearing localStorage
- **Hidden from Main UI**: Username management only accessible on initial load

### PigSprite Collision Issues
- **No Collision Detection**: Sprite exists but no boundary collision logic
- **Missing Trigger Logic**: No counter for bounces or username prompt trigger

## Dependencies and Conflict Points

### External Libraries
- Chart.js 3.9.1 - Chart rendering
- MathJax 3 - Mathematical notation
- chartjs-plugin-datalabels - Chart labels

### Potential Conflicts
- **Large File Size**: 3,873 lines in single file makes editing complex
- **Mixed Concerns**: HTML, CSS, and JavaScript all in index.html
- **Global Variables**: Many globals could conflict during refactoring
- **Event Handlers**: Inline onclick handlers throughout HTML

### Safe Edit Zones
- **QR Code Removal**: Lines 308-316, 354-369, 560-620 (well-isolated)
- **Import Function Updates**: Lines 2418+ (self-contained functions)
- **PigSprite Enhancements**: Lines 2671+ (class-based, isolated)
- **New File Creation**: Excel integration can be separate file

## Recommended Implementation Strategy

### Phase 1: QR Removal
- Safe to remove - well-isolated code sections
- No dependencies on other functionality

### Phase 2: Import Fixes
- Modify existing functions rather than rewrite
- Focus on data format detection and parsing logic

### Phase 3: Excel Integration
- Create separate `excel-integration.js` file
- Add SheetJS library dependency
- Minimal changes to existing import flow

### Phase 4-6: UI Improvements
- Add new elements rather than modify existing structure
- Use CSS for positioning consistency
- Maintain existing functionality while adding new features

This analysis shows the application is well-structured but needs targeted improvements in specific functional areas.