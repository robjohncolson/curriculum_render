/**
 * Configuration Module - Centralized app configuration
 * @module Config
 */

export const CONFIG = {
    // Quiz Settings
    MAX_ATTEMPTS: 3,
    MIN_ATTEMPTS_FOR_BADGES: 5,

    // Badge Thresholds
    BADGES: {
        ACTIVE_LEARNER_MIN: 5,
        KNOWLEDGE_SEEKER_MIN: 10,
        QUIZ_MASTER_MIN: 20,
        PROBLEM_SOLVER_MIN: 5,
        STATISTICS_PRO_MIN: 10,
        ACCURACY_EXPERT_PERCENT: 80,
        PERFECT_SCORE_MIN: 3,
        OUTLIER_THRESHOLD: 0.5,
        EXPLORER_THRESHOLD: 0.3
    },

    // UI Settings
    CHART: {
        DEFAULT_HEIGHT: 400,
        DOTPLOT_WIDTH: 400,
        DOTPLOT_HEIGHT: 200,
        MAX_TICKS_LIMIT: 10,
        LEGEND_PADDING: 20,
        ANIMATION_DURATION: 300
    },

    // Timing (in milliseconds)
    DELAYS: {
        CHART_RENDER: 100,
        MESSAGE_DISPLAY: 3000,
        SCROLL_DELAY: 100,
        DEBOUNCE_SAVE: 500,
        THROTTLE_SCROLL: 16,
        ANIMATION_FRAME: 16,
        ANSWER_REVEAL: 60 * 60 * 1000, // 1 hour
        TEACHER_MODE_TIMEOUT: 30 * 60 * 1000 // 30 minutes
    },

    // Text Area Settings
    TEXTAREA: {
        MIN_HEIGHT: 200,
        DEFAULT_PADDING: 10,
        MAX_LENGTH: 5000
    },

    // Random Username Generation
    RANDOM_NUMBER_MAX: 1000,

    // Chart Colors
    CHART_COLORS: [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
        '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
    ],

    // Storage Settings
    STORAGE: {
        PREFIX: 'apstats_',
        MAX_SIZE_MB: 10,
        CACHE_DURATION: 24 * 60 * 60 * 1000 // 24 hours
    },

    // Validation Rules
    VALIDATION: {
        MIN_USERNAME_LENGTH: 3,
        MAX_USERNAME_LENGTH: 50,
        MIN_EXPLANATION_LENGTH: 10,
        REQUIRED_EXPLANATION_ATTEMPTS: 3
    },

    // UI Layout
    LAYOUT: {
        QUESTION_PANEL_WIDTH: 900,
        PEER_PANEL_MIN_WIDTH: 400,
        RESPONSIVE_BREAKPOINT: 1400,
        MAX_VISIBLE_PEERS: 20,
        ITEMS_PER_PAGE: 10
    },

    // Performance
    PERFORMANCE: {
        VIRTUAL_SCROLL_BUFFER: 3,
        LAZY_LOAD_THRESHOLD: 0.1,
        MAX_CHART_INSTANCES: 10,
        BATCH_UPDATE_SIZE: 50
    },

    // API Settings (for future use)
    API: {
        BASE_URL: '/api',
        TIMEOUT: 10000,
        RETRY_ATTEMPTS: 3
    },

    // Feature Flags
    FEATURES: {
        ENABLE_PEER_DATA: true,
        ENABLE_CONSENSUS: true,
        ENABLE_BADGES: true,
        ENABLE_DARK_MODE: true,
        ENABLE_EXPORT_IMPORT: true,
        ENABLE_TEACHER_MODE: true
    },

    // Development Settings
    DEV: {
        DEBUG_MODE: window.location.hostname === 'localhost',
        LOG_LEVEL: window.location.hostname === 'localhost' ? 'debug' : 'error',
        SHOW_DEVTOOLS: window.location.hostname === 'localhost'
    }
};

// Unit Structure Configuration
export const UNIT_STRUCTURE = {
    1: { name: 'Exploring One-Variable Data', lessons: 5 },
    2: { name: 'Exploring Two-Variable Data', lessons: 4 },
    3: { name: 'Collecting Data', lessons: 3 },
    4: { name: 'Probability & Random Variables', lessons: 5 },
    5: { name: 'Sampling Distributions', lessons: 4 },
    6: { name: 'Inference for Proportions', lessons: 4 },
    7: { name: 'Inference for Means', lessons: 4 },
    8: { name: 'Chi-Square Tests', lessons: 3 },
    9: { name: 'Linear Regression', lessons: 4 }
};

// Username Generation Data
export const USERNAME_DATA = {
    fruits: [
        'Apple', 'Banana', 'Cherry', 'Grape', 'Lemon',
        'Mango', 'Orange', 'Peach', 'Pear', 'Plum',
        'Berry', 'Melon', 'Kiwi', 'Lime', 'Papaya',
        'Guava', 'Apricot', 'Date', 'Fig', 'Coconut'
    ],
    animals: [
        'Bear', 'Cat', 'Dog', 'Eagle', 'Fox',
        'Goat', 'Horse', 'Iguana', 'Jaguar', 'Koala',
        'Lion', 'Monkey', 'Newt', 'Owl', 'Panda',
        'Quail', 'Rabbit', 'Snake', 'Tiger', 'Wolf'
    ]
};

// Export for global namespace if needed
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.UNIT_STRUCTURE = UNIT_STRUCTURE;
    window.USERNAME_DATA = USERNAME_DATA;
}