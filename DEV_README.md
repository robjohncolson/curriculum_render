# AP Statistics Quiz - Developer Guide

## 🚀 Quick Start

```bash
# Start development server (Python 3 required)
python3 dev_server.py

# Or without auto-opening browser
python3 dev_server.py --no-browser
```

Server runs at: http://localhost:8080

## 📁 Project Structure

```
curriculum_render/
├── index.html          # Main application (monolithic)
├── styles.css          # Extracted styles
├── question.js         # Quiz questions data
├── allUnitsData.js     # Units and lessons data
├── dev_server.py       # Simple development server
└── test_*.html         # Test files for features
```

## 🏗️ Architecture (Week 3 Refactored)

### No Build Process Required! 
This is a **monolithic HTML application** that runs directly in the browser. No webpack, no npm, no build steps.

### Key Improvements Implemented:

#### 1. **Event Delegation System**
- Centralized click handling
- No inline onclick handlers
- Works with dynamically added elements

#### 2. **DataService Abstraction**
```javascript
// Centralized data access
APStatsQuiz.dataService.getCurrentUsername()
APStatsQuiz.dataService.saveUserAnswer(questionId, answer)
APStatsQuiz.dataService.getStorageStats()
```

#### 3. **Performance Optimizations**
- **Debounced Saving**: Prevents excessive localStorage writes
- **Throttled Scrolling**: Smooth 60fps scrolling
- **Lazy Loading**: Quiz data loads on demand
- **Virtual Scrolling**: Handles long lists efficiently

#### 4. **Developer Tools**
Available in localhost via browser console:
```javascript
// Inspect application state
DevTools.inspectData()

// Enable debug logging
DevTools.enableDebugMode()

// Check memory usage
DevTools.getMemoryUsage()

// Measure performance
DevTools.measurePerformance('Task Name', () => {
    // Code to measure
})
```

## 🛠️ Development Features

### Error Handling
```javascript
// Wrap functions with error boundaries
const safeFunction = errorBoundary(riskyFunction, 'Context Name');
```

### Debugging
1. Open browser DevTools console
2. Type: `DevTools.enableDebugMode()`
3. Debug logs will appear with 🐛 emoji

### Performance Monitoring
- Automatic timing for key operations
- Memory usage tracking
- Storage statistics

## 📊 Data Flow

```
User Input → Event Delegation → Business Logic → DataService → localStorage
                                       ↓
                                  UI Update ← Debounced Save
```

## 🎯 Best Practices

1. **Never edit data directly** - Use DataService methods
2. **Batch DOM updates** - Use `batchDOMUpdates()` for multiple changes
3. **Debounce saves** - Already implemented for classData
4. **Use error boundaries** - Wrap risky operations
5. **Log with DevTools** - Use `DevTools.log.info()` instead of console.log

## 🔍 Testing

Test pages available:
- `/test_event_delegation.html` - Event system test
- `/test_dataservice.html` - DataService test

## 📈 Performance Tips

1. **Large datasets**: Use virtual scrolling
2. **Frequent updates**: Use throttle/debounce
3. **Heavy computations**: Use `smoothUpdate()` with RAF
4. **Image loading**: Use Intersection Observer

## 🚫 What NOT to Do

- Don't add build dependencies
- Don't split into multiple files that need bundling
- Don't add npm packages (use CDN if needed)
- Don't make changes that break the monolithic structure

## 📝 Code Organization

The main application is organized into clear sections:

1. Configuration Constants
2. Data Service Layer
3. Performance Utilities
4. Error Handling & Debugging
5. Optimized Rendering
6. Helper Functions
7. Core Application Logic
8. UI Components
9. Chart Rendering
10. Event Handlers

Each section is clearly marked with:
```javascript
// ===============================================
// SECTION NAME
// ===============================================
```

## 🔄 Future Improvements (Without Build Process)

- IndexedDB for larger storage
- Service Worker for offline support
- WebAssembly for heavy computations
- Progressive enhancement
- CDN for large libraries

## 💡 Tips

- The entire app is in `APStatsQuiz` namespace
- All functions are documented with JSDoc
- Chrome DevTools work best for debugging
- Use Lighthouse for performance audits

---

Remember: **Keep it simple, keep it monolithic!**