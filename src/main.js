/**
 * Main Entry Point - AP Statistics Quiz Application
 * @module Main
 * @version 3.1.0 - Modularized Architecture
 */

// Import all modules (using dynamic imports for browser compatibility)
async function loadModules() {
    try {
        // Load configuration
        const { CONFIG, UNIT_STRUCTURE, USERNAME_DATA } = await import('./config/config.js');
        window.CONFIG = CONFIG;
        window.UNIT_STRUCTURE = UNIT_STRUCTURE;
        window.USERNAME_DATA = USERNAME_DATA;

        // Load utilities
        const { DOMUtils } = await import('./utils/DOMUtils.js');
        window.DOMUtils = DOMUtils;

        // Load core modules
        const { StorageModule } = await import('./modules/StorageModule.js');
        window.StorageModule = StorageModule;

        // Load components
        const { Components } = await import('./components/Components.js');
        window.Components = Components;

        console.log('✅ All modules loaded successfully');

        // Initialize the application
        initializeApp();
    } catch (error) {
        console.error('Failed to load modules:', error);
        // Fallback to inline script if modules fail to load
        console.log('Falling back to inline script...');
    }
}

/**
 * Initialize the application after modules are loaded
 */
function initializeApp() {
    // Check for existing data
    const username = StorageModule.getCurrentUsername();

    if (username) {
        console.log(`Welcome back, ${username}!`);
        showMainInterface();
    } else {
        showUsernamePrompt();
    }

    // Set up event delegation
    setupEventDelegation();

    // Initialize theme
    initializeTheme();

    // Load embedded curriculum data if available
    if (typeof EMBEDDED_CURRICULUM !== 'undefined') {
        console.log('Embedded curriculum data loaded');
    }

    // Initialize development tools if in dev mode
    if (CONFIG.DEV.SHOW_DEVTOOLS) {
        setupDevTools();
    }
}

/**
 * Show username prompt for new users
 */
function showUsernamePrompt() {
    const suggestedName = generateRandomUsername();
    const container = DOMUtils.safeGetElement('questionsContainer');

    if (!container) return;

    const promptHTML = Components.createModal({
        id: 'username-modal',
        title: 'Welcome to AP Statistics Consensus Quiz',
        content: `
            <div class="username-prompt-content">
                <p>Your generated username:</p>
                <div class="username-suggestion">${suggestedName}</div>
                <button data-action="accept-username" data-param="${suggestedName}" class="start-button">
                    Use This Name
                </button>
                <button data-action="reroll-username" class="start-button btn-secondary">
                    Generate New Name
                </button>
            </div>
        `,
        className: 'welcome-modal'
    });

    DOMUtils.safeSetHTML(container, promptHTML);
}

/**
 * Show main quiz interface
 */
function showMainInterface() {
    const container = DOMUtils.safeGetElement('questionsContainer');
    if (!container) return;

    // Show unit selector or continue where left off
    const progress = StorageModule.getUserProgress();
    const lastUnit = progress.lastUnit;

    if (lastUnit) {
        loadUnit(lastUnit);
    } else {
        showUnitSelector();
    }
}

/**
 * Show unit selector interface
 */
function showUnitSelector() {
    const container = DOMUtils.safeGetElement('questionsContainer');
    if (!container) return;

    let unitsHTML = '<div class="unit-selector"><h2>Select a Unit</h2><div class="unit-buttons">';

    Object.entries(UNIT_STRUCTURE).forEach(([unitId, unitData]) => {
        unitsHTML += Components.createButton({
            text: `Unit ${unitId}: ${unitData.name}`,
            action: 'select-unit',
            param: unitId,
            className: 'unit-btn',
            icon: 'fas fa-book'
        });
    });

    unitsHTML += '</div></div>';
    DOMUtils.safeSetHTML(container, unitsHTML);
}

/**
 * Load a specific unit
 * @param {number} unitId - Unit to load
 */
async function loadUnit(unitId) {
    const unitData = await StorageModule.loadUnit(unitId);
    if (!unitData) {
        console.error(`Failed to load unit ${unitId}`);
        return;
    }

    // Display unit lessons
    showUnitLessons(unitId, unitData);
}

/**
 * Generate random username
 * @returns {string} Random username
 */
function generateRandomUsername() {
    const fruits = USERNAME_DATA.fruits;
    const animals = USERNAME_DATA.animals;
    const fruit = fruits[Math.floor(Math.random() * fruits.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${fruit}_${animal}`;
}

/**
 * Set up event delegation for dynamic content
 */
function setupEventDelegation() {
    const body = document.body;

    // Handle all button clicks
    DOMUtils.delegateEvent(body, 'click', '[data-action]', function(event) {
        event.preventDefault();
        const action = this.dataset.action;
        const param = this.dataset.param;
        handleAction(action, param, this);
    });

    // Handle form submissions
    DOMUtils.delegateEvent(body, 'submit', 'form', function(event) {
        event.preventDefault();
        const formData = new FormData(this);
        handleFormSubmit(this.id, formData);
    });
}

/**
 * Handle actions from event delegation
 * @param {string} action - Action to perform
 * @param {string} param - Action parameter
 * @param {Element} element - Element that triggered the action
 */
function handleAction(action, param, element) {
    switch(action) {
        case 'accept-username':
            StorageModule.setCurrentUsername(param);
            showMainInterface();
            break;

        case 'reroll-username':
            showUsernamePrompt();
            break;

        case 'select-unit':
            loadUnit(parseInt(param));
            break;

        case 'select-lesson':
            loadLesson(param);
            break;

        case 'submit-answer':
            submitAnswer(param, element.dataset.questionType);
            break;

        case 'toggle-theme':
            toggleTheme();
            break;

        default:
            console.warn(`Unhandled action: ${action}`);
    }
}

/**
 * Initialize theme system
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = savedTheme === 'dark' ? 'dark-theme' : '';
}

/**
 * Toggle between light and dark theme
 */
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update theme toggle button
    const themeBtn = DOMUtils.safeQuery('.theme-toggle');
    if (themeBtn) {
        themeBtn.textContent = isDark ? '☀️' : '🌙';
    }
}

/**
 * Set up development tools
 */
function setupDevTools() {
    window.DevTools = {
        storage: StorageModule,
        config: CONFIG,
        components: Components,
        dom: DOMUtils,

        // Utility functions for debugging
        clearAllData: () => {
            if (confirm('Clear all local storage data?')) {
                localStorage.clear();
                location.reload();
            }
        },

        exportData: () => {
            const data = {
                username: StorageModule.getCurrentUsername(),
                classData: StorageModule.getClassData(),
                progress: StorageModule.getUserProgress()
            };
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quiz_data.json';
            a.click();
            URL.revokeObjectURL(url);
        },

        getStats: () => {
            const stats = StorageModule.getStorageStats();
            console.table(stats);
            return stats;
        }
    };

    console.log('🛠️ DevTools available: window.DevTools');
}

// Placeholder functions for features not yet implemented
function showUnitLessons(unitId, unitData) {
    console.log('Show lessons for unit', unitId, unitData);
    // Implementation needed
}

function loadLesson(lessonId) {
    console.log('Load lesson', lessonId);
    // Implementation needed
}

function submitAnswer(questionId, questionType) {
    console.log('Submit answer for', questionId, questionType);
    // Implementation needed
}

function handleFormSubmit(formId, formData) {
    console.log('Form submitted', formId, formData);
    // Implementation needed
}

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadModules);
} else {
    loadModules();
}

// Export for testing
export {
    initializeApp,
    showUsernamePrompt,
    showMainInterface,
    generateRandomUsername,
    handleAction
};