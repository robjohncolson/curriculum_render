/**
 * Configuration Module - Centralized app configuration
 * Traditional JavaScript - No ES6 modules
 */

(function(global) {
    'use strict';

    var CONFIG = {
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

        // Chart Colors
        CHART_COLORS: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384'
        ]
    };

    // Expose to global namespace
    global.CONFIG = CONFIG;

})(window);