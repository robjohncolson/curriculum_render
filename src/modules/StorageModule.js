/**
 * Storage Module - Handles all data persistence
 * @module StorageModule
 */

export const StorageModule = (function() {
    class DataService {
        constructor() {
            this.cache = new Map();
            this.storagePrefix = 'apstats_';
        }

        // ========== Unit and Lesson Data ==========

        /**
         * Load unit data from external source
         * @param {number} unitId - Unit identifier
         * @returns {Promise<Object>} Unit data
         */
        async loadUnit(unitId) {
            const cacheKey = `unit_${unitId}`;
            if (this.cache.has(cacheKey)) {
                return this.cache.get(cacheKey);
            }

            try {
                // Check if data is available in global scope
                if (typeof allUnitsData !== 'undefined' && allUnitsData[unitId]) {
                    const data = allUnitsData[unitId];
                    this.cache.set(cacheKey, data);
                    return data;
                }

                // Future: Load from API
                throw new Error(`Unit ${unitId} not found`);
            } catch (error) {
                console.error('Error loading unit:', error);
                return null;
            }
        }

        /**
         * Load all quiz questions
         * @returns {Array} Array of quiz questions
         */
        loadQuestions() {
            if (this.cache.has('all_questions')) {
                return this.cache.get('all_questions');
            }

            // Access global EMBEDDED_CURRICULUM if available
            if (typeof EMBEDDED_CURRICULUM !== 'undefined') {
                const questions = EMBEDDED_CURRICULUM.questions || EMBEDDED_CURRICULUM || [];
                this.cache.set('all_questions', questions);
                return questions;
            }

            return [];
        }

        /**
         * Get questions for a specific lesson
         * @param {string} lessonId - Lesson identifier
         * @returns {Array} Filtered questions for the lesson
         */
        getLessonQuestions(lessonId) {
            const allQuestions = this.loadQuestions();
            return allQuestions.filter(q => q.id && q.id.startsWith(lessonId));
        }

        // ========== User Data Management ==========

        /**
         * Get current username
         * @returns {string|null} Current username
         */
        getCurrentUsername() {
            return this.getLocalData('consensusUsername');
        }

        /**
         * Set current username
         * @param {string} username - Username to set
         */
        setCurrentUsername(username) {
            this.setLocalData('consensusUsername', username);
        }

        /**
         * Get user answers
         * @param {string} username - Username (optional, defaults to current)
         * @returns {Object} User's answers
         */
        getUserAnswers(username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return {};
            return this.getLocalData(`answers_${user}`, {});
        }

        /**
         * Save user answer
         * @param {string} questionId - Question ID
         * @param {*} answer - User's answer
         * @param {string} username - Username (optional)
         */
        saveUserAnswer(questionId, answer, username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return;

            const answers = this.getUserAnswers(user);
            answers[questionId] = answer;
            this.setLocalData(`answers_${user}`, answers);
        }

        /**
         * Get user progress
         * @param {string} username - Username (optional)
         * @returns {Object} User's progress data
         */
        getUserProgress(username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return {};
            return this.getLocalData(`progress_${user}`, {});
        }

        /**
         * Update user progress
         * @param {string} lessonId - Lesson ID
         * @param {Object} progressData - Progress information
         * @param {string} username - Username (optional)
         */
        updateUserProgress(lessonId, progressData, username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return;

            const progress = this.getUserProgress(user);
            progress[lessonId] = { ...progress[lessonId], ...progressData };
            this.setLocalData(`progress_${user}`, progress);
        }

        // ========== Class Data Management ==========

        /**
         * Get class-wide data
         * @returns {Object} Class data including all users' responses
         */
        getClassData() {
            const defaultStructure = {
                users: {},
                metadata: {
                    totalUsers: 0,
                    lastMerge: null,
                    version: '2.0'
                }
            };
            const data = this.getLocalData('classData', defaultStructure);

            // Ensure structure exists for backward compatibility
            if (!data.users) data.users = {};
            if (!data.metadata) data.metadata = defaultStructure.metadata;

            return data;
        }

        /**
         * Save class data
         * @param {Object} data - Class data to save
         */
        saveClassData(data) {
            // Update metadata
            if (data.users) {
                data.metadata = data.metadata || {};
                data.metadata.totalUsers = Object.keys(data.users).length;
                data.metadata.lastUpdate = new Date().toISOString();
            }
            this.setLocalData('classData', data);
        }

        /**
         * Add or update user in class data
         * @param {string} username - Username
         * @param {Object} userData - User's data (answers, reasons, attempts, timestamps)
         */
        updateUserInClassData(username, userData) {
            const classData = this.getClassData();

            if (!classData.users[username]) {
                classData.users[username] = {
                    answers: {},
                    reasons: {},
                    attempts: {},
                    timestamps: {},
                    firstSeen: new Date().toISOString()
                };
            }

            // Merge new data with existing
            Object.assign(classData.users[username], userData);
            classData.users[username].lastUpdate = new Date().toISOString();

            this.saveClassData(classData);
            return classData.users[username];
        }

        /**
         * Get specific user from class data
         * @param {string} username - Username to retrieve
         * @returns {Object} User data or empty structure
         */
        getUserFromClassData(username) {
            const classData = this.getClassData();
            return classData.users[username] || {
                answers: {},
                reasons: {},
                attempts: {},
                timestamps: {}
            };
        }

        /**
         * Save answer with peer tracking
         * @param {string} questionId - Question ID
         * @param {*} answer - Answer value
         * @param {string} reason - Optional explanation
         * @param {string} username - Username (optional)
         */
        saveAnswerWithPeerData(questionId, answer, reason = '', username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return false;

            // Save to individual user data (existing functionality)
            this.saveUserAnswer(questionId, answer, user);

            // Also save to class data structure
            const userData = this.getUserFromClassData(user);
            userData.answers[questionId] = answer;
            if (reason) userData.reasons[questionId] = reason;
            userData.timestamps[questionId] = new Date().toISOString();
            userData.attempts[questionId] = (userData.attempts[questionId] || 0) + 1;

            this.updateUserInClassData(user, userData);
            return true;
        }

        /**
         * Get consensus responses
         * @returns {Object} All consensus voting data
         */
        getConsensusData() {
            return this.getLocalData('consensusResponses', {});
        }

        /**
         * Save consensus response
         * @param {string} questionId - Question ID
         * @param {Object} voteData - Voting data
         */
        saveConsensusVote(questionId, voteData) {
            const consensus = this.getConsensusData();
            consensus[questionId] = voteData;
            this.setLocalData('consensusResponses', consensus);
        }

        // ========== Storage Helpers ==========

        /**
         * Get data from localStorage with fallback
         * @private
         * @param {string} key - Storage key
         * @param {*} defaultValue - Default value if not found
         * @returns {*} Stored value or default
         */
        getLocalData(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                if (item === null) return defaultValue;

                // Try to parse as JSON, fallback to raw value
                try {
                    return JSON.parse(item);
                } catch {
                    return item;
                }
            } catch (error) {
                console.error('Error reading from localStorage:', error);
                return defaultValue;
            }
        }

        /**
         * Set data in localStorage
         * @private
         * @param {string} key - Storage key
         * @param {*} value - Value to store
         */
        setLocalData(key, value) {
            try {
                const item = typeof value === 'string' ? value : JSON.stringify(value);
                localStorage.setItem(key, item);
            } catch (error) {
                console.error('Error writing to localStorage:', error);
                // Could implement quota exceeded handling here
            }
        }

        /**
         * Remove data from localStorage
         * @param {string} key - Storage key
         */
        removeLocalData(key) {
            try {
                localStorage.removeItem(key);
            } catch (error) {
                console.error('Error removing from localStorage:', error);
            }
        }

        /**
         * Get storage usage statistics
         * @returns {Object} Storage usage info
         */
        getStorageStats() {
            let totalSize = 0;
            let itemCount = 0;

            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    totalSize += localStorage[key].length + key.length;
                    itemCount++;
                }
            }

            return {
                totalSize: totalSize,
                itemCount: itemCount,
                estimatedMB: (totalSize / 1024 / 1024).toFixed(2)
            };
        }

        /**
         * Clear all data for a user
         * @param {string} username - Username to clear
         */
        clearUserData(username = null) {
            const user = username || this.getCurrentUsername();
            if (!user) return;

            this.removeLocalData(`answers_${user}`);
            this.removeLocalData(`progress_${user}`);
        }
    }

    // Create singleton instance
    const dataService = new DataService();

    // Public API for Storage Module
    return {
        // Core data methods
        getCurrentUsername: () => dataService.getCurrentUsername(),
        setCurrentUsername: (username) => dataService.setCurrentUsername(username),
        getUserAnswers: (username) => dataService.getUserAnswers(username),
        saveUserAnswer: (questionId, answer, username) => dataService.saveUserAnswer(questionId, answer, username),
        getUserProgress: (username) => dataService.getUserProgress(username),
        updateUserProgress: (lessonId, progressData, username) => dataService.updateUserProgress(lessonId, progressData, username),

        // Class data methods
        getClassData: () => dataService.getClassData(),
        saveClassData: (data) => dataService.saveClassData(data),
        updateUserInClassData: (username, userData) => dataService.updateUserInClassData(username, userData),
        getUserFromClassData: (username) => dataService.getUserFromClassData(username),
        saveAnswerWithPeerData: (questionId, answer, reason, username) => dataService.saveAnswerWithPeerData(questionId, answer, reason, username),
        getConsensusData: () => dataService.getConsensusData(),
        saveConsensusVote: (questionId, voteData) => dataService.saveConsensusVote(questionId, voteData),

        // Quiz data methods
        loadQuestions: () => dataService.loadQuestions(),
        getLessonQuestions: (lessonId) => dataService.getLessonQuestions(lessonId),
        loadUnit: (unitId) => dataService.loadUnit(unitId),

        // Utility methods
        clearUserData: (username) => dataService.clearUserData(username),
        getStorageStats: () => dataService.getStorageStats(),

        // Direct access to internal methods if needed
        setLocalData: (key, value) => dataService.setLocalData(key, value),
        getLocalData: (key, defaultValue) => dataService.getLocalData(key, defaultValue),

        // Cache access
        cache: dataService.cache
    };
})();

// For backwards compatibility with global namespace
if (typeof window !== 'undefined') {
    window.StorageModule = StorageModule;
}