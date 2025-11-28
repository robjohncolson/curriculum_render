// data_manager.js - Data management, import/export, and storage functions
// Part of AP Statistics Consensus Quiz
// Dependencies: Requires global variables (currentUsername, classData, allCurriculumData)
//               Requires functions from other modules (showMessage, renderUnitMenu, detectUnitAndLessons)
//               Requires js/db.js for IndexedDB operations (AppDB)
// This module handles "what is their data" - import, export, merging, and persistence

// ========================================
// CORE DATA MANAGEMENT (Priority 1)
// ========================================

/**
 * Initializes or loads class data structure from IndexedDB
 * Creates user entry if it doesn't exist for current username
 * NOTE: This function assumes initDB() has already been called (in startApp)
 * @returns {Promise<void>}
 */
async function initClassData() {
    // Load all users from IndexedDB into memory
    await AppDB.loadAllUsers();

    // Ensure current user exists
    if (currentUsername && !classData.users[currentUsername]) {
        classData.users[currentUsername] = {
            answers: {},
            reasons: {},
            timestamps: {},
            attempts: {},
            charts: {},
            // Real-time activity tracking for sprite system
            currentActivity: {
                state: 'idle',
                questionId: null,
                lastUpdate: Date.now()
            }
        };
        await saveClassData();
    } else if (currentUsername && classData.users[currentUsername]) {
        // Migrate existing users to have required fields
        let needsSave = false;

        if (!classData.users[currentUsername].charts) {
            classData.users[currentUsername].charts = {};
            needsSave = true;
        }
        if (!classData.users[currentUsername].currentActivity) {
            classData.users[currentUsername].currentActivity = {
                state: 'idle',
                questionId: null,
                lastUpdate: Date.now()
            };
            console.log(`✅ Migrated ${currentUsername} to include currentActivity field`);
            needsSave = true;
        }

        if (needsSave) {
            await saveClassData();
        }
    }
}

/**
 * Saves current user's data to IndexedDB
 * Only writes the current user's record, not all users
 * @returns {Promise<void>}
 */
async function saveClassData() {
    if (!currentUsername) {
        console.warn('saveClassData called but no currentUsername set');
        return;
    }

    try {
        // Update sync status to "saving"
        if (window.SyncStatus) {
            SyncStatus.setState('saving');
        }

        await AppDB.saveUserData(currentUsername);

        // Update sync status to "saved"
        if (window.SyncStatus) {
            SyncStatus.setState('saved-local');
        }

        // Show toast on save (but not too frequently)
        if (window._lastSaveToast && Date.now() - window._lastSaveToast < 2000) {
            // Skip toast if we just showed one
        } else if (window.showToast) {
            // Only show toast for explicit saves, not automatic ones
            // This is controlled by the caller
        }
    } catch (e) {
        console.error('Failed to save data:', e);
        if (window.SyncStatus) {
            SyncStatus.setState('error', 'Save failed');
        }
        if (typeof showMessage === 'function') {
            showMessage('Warning: Failed to save data. Please try again.', 'error');
        }
    }
}

/**
 * Saves current user's data and shows a toast notification
 * Use this for explicit user-triggered saves
 * @returns {Promise<void>}
 */
async function saveClassDataWithToast() {
    await saveClassData();
    window._lastSaveToast = Date.now();
    if (window.showToast) {
        showToast('Progress saved', 'success');
    }
}

/**
 * Saves a specific user's data to IndexedDB
 * @param {string} username - The username to save
 * @returns {Promise<void>}
 */
async function saveUserData(username) {
    if (!username || !classData.users[username]) {
        console.warn('saveUserData called with invalid username:', username);
        return;
    }
    await AppDB.saveUserData(username);
}

/**
 * Saves multiple users' data to IndexedDB
 * @param {string[]} usernames - Array of usernames to save
 * @returns {Promise<void>}
 */
async function saveMultipleUsers(usernames) {
    await AppDB.saveMultipleUsers(usernames);
}

/**
 * Initializes progress tracking for current user session
 * Handles pending imports from before page refresh
 */
function initializeProgressTracking() {
    if (!currentUsername) return;

    // Set session start time
    const now = new Date().toISOString();
    localStorage.setItem(`sessionStart_${currentUsername}`, now);

    // Clear any previous temporary progress markers
    localStorage.removeItem(`tempProgress_${currentUsername}`);

    console.log(`Progress tracking initialized for ${currentUsername} at ${now}`);

    // Check for import debug info from before page refresh
    const importDebug = localStorage.getItem('import_debug');
    if (importDebug) {
        const debugInfo = JSON.parse(importDebug);
        console.log('=== IMPORT DEBUG INFO (from before refresh) ===');
        console.log('Data keys:', debugInfo.dataKeys);
        console.log('Is personal file:', debugInfo.isPersonal);
        console.log('Is master file:', debugInfo.isMaster);
        console.log('Import timestamp:', debugInfo.timestamp);
        console.log('=== END IMPORT DEBUG ===');

        // Clear the debug info
        localStorage.removeItem('import_debug');
    }

    // Check for pending imports from before page refresh
    const pendingMaster = localStorage.getItem('pending_master_import');
    const pendingPersonal = localStorage.getItem('pending_personal_import');

    if (pendingMaster) {
        console.log('Processing pending master import...');
        try {
            const data = JSON.parse(pendingMaster);
            importMasterData(data);
            console.log('✅ Master import completed after refresh');
        } catch (error) {
            console.error('Error processing pending master import:', error);
        }
        localStorage.removeItem('pending_master_import');
    }

    if (pendingPersonal) {
        console.log('Processing pending personal import...');
        try {
            const data = JSON.parse(pendingPersonal);
            importPersonalData(data);
            console.log('✅ Personal import completed after refresh');
        } catch (error) {
            console.error('Error processing pending personal import:', error);
        }
        localStorage.removeItem('pending_personal_import');
    }
}

/**
 * Initializes curriculum data from embedded EMBEDDED_CURRICULUM
 * Parses and groups questions by unit, then renders unit menu
 */
function initializeFromEmbeddedData() {
    // Parse embedded curriculum
    allCurriculumData = {};
    const allQuestions = EMBEDDED_CURRICULUM.questions || EMBEDDED_CURRICULUM;

    // Group by units
    const unitGroups = {};
    allQuestions.forEach(question => {
        const unitMatch = question.id.match(/U(\d+)/i);
        if (unitMatch) {
            const unitNum = parseInt(unitMatch[1]);
            if (!unitGroups[unitNum]) {
                unitGroups[unitNum] = [];
            }
            unitGroups[unitNum].push(question);
        }
    });

    // Process each unit
    Object.keys(unitGroups).forEach(unitNum => {
        const unitQuestions = unitGroups[unitNum];
        const unitInfo = detectUnitAndLessons(unitQuestions);
        if (unitInfo) {
            allCurriculumData[unitNum] = {
                questions: unitQuestions,
                unitInfo: unitInfo,
                fileName: `Unit ${unitNum}`
            };
        }
    });

    // Go straight to unit menu
    renderUnitMenu();
}

// ========================================
// DATA EXPORT FUNCTIONS (Priority 2)
// ========================================

async function computeSha256Hex(text) {
    if (!text || !window.crypto || !window.crypto.subtle) {
        return null;
    }
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (error) {
        console.warn('RECOVERY: Failed to compute SHA-256 checksum', error);
        return null;
    }
}

window.buildRecoveryPack = async function(username = currentUsername) {
    if (!username) {
        throw new Error('No username available for Recovery Pack export.');
    }

    // Ensure we have the latest data loaded
    if (typeof AppDB !== 'undefined' && AppDB.loadAllUsers) {
        try {
            await AppDB.loadAllUsers();
        } catch (error) {
            console.warn('RECOVERY: Failed to load from IndexedDB, using in-memory data', error);
        }
    }

    const nowISO = new Date().toISOString();
    // Use in-memory classData which is now backed by IndexedDB
    const userSlice = (classData && classData.users && classData.users[username]) || {};

    const userState = {
        answers: JSON.parse(localStorage.getItem(`answers_${username}`) || '{}'),
        reasons: JSON.parse(localStorage.getItem(`reasons_${username}`) || '{}'),
        progress: JSON.parse(localStorage.getItem(`progress_${username}`) || '{}'),
        timestamps: JSON.parse(localStorage.getItem(`timestamps_${username}`) || '{}'),
        attempts: JSON.parse(localStorage.getItem(`attempts_${username}`) || '{}'),
        badges: JSON.parse(localStorage.getItem(`badges_${username}`) || '{}'),
        charts: JSON.parse(localStorage.getItem(`charts_${username}`) || '{}'),
        preferences: JSON.parse(localStorage.getItem(`preferences_${username}`) || '{}'),
        classDataUser: userSlice || {}
    };

    const localStorageMirror = {};
    const mirrorPrefixes = [
        'answers_',
        'reasons_',
        'progress_',
        'timestamps_',
        'attempts_',
        'badges_',
        'charts_',
        'preferences_',
        'sessionStart_',
        'tempProgress_'
    ];
    mirrorPrefixes.forEach(prefix => {
        const key = `${prefix}${username}`;
        const value = localStorage.getItem(key);
        if (value !== null) {
            localStorageMirror[key] = value;
        }
    });

    const dataPayload = Object.assign({}, userState, {
        localStorageMirror,
        meta: {
            createdAt: nowISO,
            answerCount: Object.keys(userState.answers || {}).length,
            username
        }
    });

    const manifest = {
        version: 'student-recovery-pack',
        schemaVersion: '1.0.0',
        username,
        timestampISO: nowISO,
        appBuild: window.APP_BUILD || 'curriculum-web',
        turboCompatible: !!window.turboModeActive
    };

    const integrity = {};
    const checksum = await computeSha256Hex(JSON.stringify(dataPayload));
    if (checksum) {
        integrity.checksumSha256 = checksum;
    }

    return {
        manifest,
        data: dataPayload,
        integrity
    };
};

window.validateRecoveryPack = async function(pack) {
    const warnings = [];
    let ok = true;

    if (!pack || typeof pack !== 'object') {
        return { ok: false, warnings: ['Invalid Recovery Pack structure.'], checksum: null };
    }

    if (!pack.manifest || typeof pack.manifest !== 'object') {
        warnings.push('Missing manifest section.');
        ok = false;
    }

    const username = pack.manifest?.username;
    if (!username || typeof username !== 'string') {
        warnings.push('Manifest username missing or invalid.');
        ok = false;
    }

    if (!pack.data || typeof pack.data !== 'object') {
        warnings.push('Data payload missing.');
        ok = false;
    }

    let computedChecksum = null;
    const providedChecksum = pack.integrity && pack.integrity.checksumSha256;
    if (providedChecksum) {
        if (window.crypto && window.crypto.subtle) {
            try {
                computedChecksum = await computeSha256Hex(JSON.stringify(pack.data));
                if (computedChecksum && computedChecksum !== providedChecksum) {
                    warnings.push('Checksum mismatch detected.');
                }
            } catch (error) {
                warnings.push('Checksum verification failed.');
            }
        } else {
            warnings.push('Checksum provided but browser cannot verify it.');
        }
    }

    return { ok, warnings, checksum: computedChecksum };
};

window.exportPersonal = async function() {
    if (!currentUsername) {
        showMessage('Please select a username before exporting.', 'error');
        return;
    }

    try {
        const pack = await window.buildRecoveryPack(currentUsername);
        const fileName = `recovery_pack_${currentUsername}_${new Date().toISOString().split('T')[0]}.json`;
        const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showMessage('Recovery Pack exported successfully!', 'success');
        if (window.recoveryAutoExport) {
            window.recoveryAutoExport.queue('manual-export');
        }
    } catch (error) {
        console.error('RECOVERY: Failed to export Recovery Pack', error);
        showMessage('Failed to export Recovery Pack.', 'error');
    }
};

window.generateClassPacks = async function() {
    if (!window.FEATURE_FLAGS || !window.FEATURE_FLAGS.classPacks) {
        showMessage('Class pack generation is not enabled yet.', 'info');
        return;
    }

    // Ensure we have the latest data loaded from IndexedDB
    if (typeof AppDB !== 'undefined' && AppDB.loadAllUsers) {
        try {
            await AppDB.loadAllUsers();
        } catch (error) {
            console.warn('RECOVERY: Failed to load from IndexedDB', error);
        }
    }

    const usernames = Object.keys(classData.users || {});
    if (usernames.length === 0) {
        showMessage('No class data available for pack generation.', 'error');
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    let successCount = 0;

    for (const username of usernames) {
        try {
            const pack = await window.buildRecoveryPack(username);
            const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recovery_pack_${username}_${today}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            successCount++;
            await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
            console.warn('RECOVERY: Failed to build Recovery Pack for', username, error);
        }
    }

    if (successCount > 0) {
        showMessage(`Generated ${successCount} Recovery Pack${successCount === 1 ? '' : 's'}.`, 'success');
    } else {
        showMessage('No Recovery Packs were generated.', 'error');
    }

    if (successCount !== usernames.length) {
        console.info(`RECOVERY: Class pack generation completed with ${successCount}/${usernames.length} successes.`);
    }
};

/**
 * Exports complete master database with all users' data to JSON file
 * Exposed to window for onclick handlers
 */
window.exportMasterData = async function() {
    // Ensure we have the latest data from IndexedDB
    if (typeof AppDB !== 'undefined' && AppDB.loadAllUsers) {
        try {
            await AppDB.loadAllUsers();
        } catch (error) {
            console.warn('Failed to load from IndexedDB, using in-memory data', error);
        }
    }

    // Build master data from in-memory classData (backed by IndexedDB)
    const masterData = {
        timestamp: new Date().toISOString(),
        exportType: 'master_database',
        allUsers: Object.keys(classData.users || {}),

        // Get all class data
        classData: { users: classData.users || {} },

        // Get all answers from all users (extracted from classData for compatibility)
        allAnswers: {},

        // Get all progress from all users
        allProgress: {},

        // Consensus data if available
        consensusData: JSON.parse(localStorage.getItem('consensusResponses') || '{}')
    };

    // Extract answers and progress from classData for backward compatibility
    Object.entries(classData.users || {}).forEach(([username, userData]) => {
        if (userData.answers) {
            masterData.allAnswers[username] = userData.answers;
        }
        if (userData.progress) {
            masterData.allProgress[username] = userData.progress;
        }
    });

    // Create and download the file
    const blob = new Blob([JSON.stringify(masterData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master_database_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('Master database exported successfully!', 'success');
}

// ========================================
// DATA MERGING & MIGRATION (Priority 4)
// ========================================

/**
 * Converts legacy answer format (strings) to standardized object format with timestamps
 * This is a critical migration function called in 14+ locations
 * @param {Object} answers - Answers object to migrate
 * @returns {Object} Migrated answers with proper structure
 */
function migrateAnswersToStandardFormat(answers) {
    if (!answers || typeof answers !== 'object') {
        return {};
    }

    const migrated = {};
    for (const questionId in answers) {
        const answer = answers[questionId];

        // If it's already in the new format (object with value/timestamp), keep it
        if (answer && typeof answer === 'object' && 'value' in answer) {
            migrated[questionId] = answer;
        } else {
            // Convert old format (string) to new format (object)
            migrated[questionId] = {
                value: answer,
                timestamp: Date.now() // Add current timestamp for legacy data
            };
        }
    }
    return migrated;
}

/**
 * Merges two user data objects with non-destructive timestamp-based logic.
 * This function implements the approved merge rules for handling multiple personal backup imports.
 *
 * @param {Object} existingUserData - The current user's data from classData.users[username]
 * @param {Object} newUserData - The incoming user data from an imported file
 * @returns {Object} The merged user data object with the most recent/relevant information
 */
function mergePersonalData(existingUserData, newUserData) {
    try {
        console.log('=== Starting mergePersonalData ===');

        // 1. Initialization and Edge Cases
        // If no existing data, return the new data immediately
        if (!existingUserData || Object.keys(existingUserData).length === 0) {
            console.log('No existing data found, returning new data as-is');
            return newUserData || {};
        }

        // If no new data, return existing data
        if (!newUserData || Object.keys(newUserData).length === 0) {
            console.log('No new data to merge, returning existing data');
            return existingUserData;
        }

        // Create a deep copy of existingUserData to avoid mutations
        let mergedUserData = JSON.parse(JSON.stringify(existingUserData));

        // Ensure all primary keys exist on mergedUserData
        mergedUserData.answers = mergedUserData.answers || {};
        mergedUserData.reasons = mergedUserData.reasons || {};
        mergedUserData.timestamps = mergedUserData.timestamps || {};
        mergedUserData.attempts = mergedUserData.attempts || {};
        mergedUserData.progress = mergedUserData.progress || {};
        mergedUserData.badges = mergedUserData.badges || {};
        mergedUserData.preferences = mergedUserData.preferences || {};

        // Also ensure newUserData has these structures for safe access
        newUserData.answers = newUserData.answers || {};
        newUserData.reasons = newUserData.reasons || {};
        newUserData.timestamps = newUserData.timestamps || {};
        newUserData.attempts = newUserData.attempts || {};
        newUserData.progress = newUserData.progress || {};

        // 2. Merge Answers, Timestamps, and Reasons
        console.log('Merging answers based on timestamps...');
        let answersUpdated = 0;

        for (const questionId in newUserData.answers) {
            try {
                const newAnswer = newUserData.answers[questionId];
                const existingAnswer = mergedUserData.answers[questionId];

                // Extract timestamps - handle both direct timestamps and answer objects with timestamp property
                let newTimestamp = null;
                let existingTimestamp = null;

                // Check for timestamp in various possible locations
                if (newAnswer && typeof newAnswer === 'object' && newAnswer.timestamp) {
                    newTimestamp = newAnswer.timestamp;
                } else if (newUserData.timestamps && newUserData.timestamps[questionId]) {
                    newTimestamp = newUserData.timestamps[questionId];
                }

                if (existingAnswer && typeof existingAnswer === 'object' && existingAnswer.timestamp) {
                    existingTimestamp = existingAnswer.timestamp;
                } else if (mergedUserData.timestamps && mergedUserData.timestamps[questionId]) {
                    existingTimestamp = mergedUserData.timestamps[questionId];
                }

                // Convert timestamps to numbers for comparison
                newTimestamp = Number(newTimestamp) || 0;
                existingTimestamp = Number(existingTimestamp) || 0;

                // Rule: If new answer is more recent (or no existing answer), update all related fields
                if (!existingAnswer || newTimestamp > existingTimestamp) {
                    mergedUserData.answers[questionId] = newAnswer;
                    mergedUserData.timestamps[questionId] = newTimestamp || newUserData.timestamps[questionId];

                    // Update reason if it exists for this question
                    if (newUserData.reasons && newUserData.reasons[questionId]) {
                        mergedUserData.reasons[questionId] = newUserData.reasons[questionId];
                    }

                    answersUpdated++;
                    console.log(`  Updated ${questionId}: timestamp ${newTimestamp} > ${existingTimestamp}`);
                } else if (newTimestamp === existingTimestamp && existingTimestamp > 0) {
                    // Edge Case: If timestamps are identical, preserve existing data
                    console.log(`  Preserved ${questionId}: timestamps identical (${existingTimestamp})`);
                }

            } catch (answerError) {
                console.error(`Error merging answer for ${questionId}:`, answerError);
                // Continue processing other answers
            }
        }

        console.log(`Updated ${answersUpdated} answers based on timestamps`);

        // 3. Merge Attempts
        console.log('Merging attempt counts...');
        let attemptsUpdated = 0;

        for (const questionId in newUserData.attempts) {
            const existingAttempts = Number(mergedUserData.attempts[questionId]) || 0;
            const newAttempts = Number(newUserData.attempts[questionId]) || 0;

            // Rule: Keep the highest attempt count
            const maxAttempts = Math.max(existingAttempts, newAttempts);

            if (maxAttempts !== existingAttempts) {
                mergedUserData.attempts[questionId] = maxAttempts;
                attemptsUpdated++;
                console.log(`  Updated attempts for ${questionId}: ${existingAttempts} -> ${maxAttempts}`);
            }
        }

        // Also check for attempts in existing data that aren't in new data
        for (const questionId in mergedUserData.attempts) {
            if (!(questionId in newUserData.attempts)) {
                // Keep existing attempts for questions not in new data
                console.log(`  Preserved attempts for ${questionId}: ${mergedUserData.attempts[questionId]}`);
            }
        }

        console.log(`Updated ${attemptsUpdated} attempt counts`);

        // 4. Merge Progress
        console.log('Merging progress indicators...');
        let progressUpdated = 0;

        for (const key in newUserData.progress) {
            const existingProgress = Number(mergedUserData.progress[key]) || 0;
            const newProgress = Number(newUserData.progress[key]) || 0;

            // Rule: Keep the maximum progress value
            const maxProgress = Math.max(existingProgress, newProgress);

            if (maxProgress !== existingProgress) {
                mergedUserData.progress[key] = maxProgress;
                progressUpdated++;
                console.log(`  Updated progress.${key}: ${existingProgress} -> ${maxProgress}`);
            }
        }

        console.log(`Updated ${progressUpdated} progress indicators`);

        // 5. Merge Badges (bonus: merge unique badges, keeping earliest timestamp)
        if (newUserData.badges) {
            console.log('Merging badges...');
            mergedUserData.badges = mergedUserData.badges || {};

            for (const badge in newUserData.badges) {
                if (!mergedUserData.badges[badge]) {
                    // New badge not in existing data
                    mergedUserData.badges[badge] = newUserData.badges[badge];
                    console.log(`  Added new badge: ${badge}`);
                } else {
                    // Badge exists - keep the one with earlier timestamp (first earned)
                    const existingBadgeTime = mergedUserData.badges[badge].earnedAt || 0;
                    const newBadgeTime = newUserData.badges[badge].earnedAt || 0;

                    if (newBadgeTime && (!existingBadgeTime || newBadgeTime < existingBadgeTime)) {
                        mergedUserData.badges[badge] = newUserData.badges[badge];
                        console.log(`  Updated badge ${badge} with earlier timestamp`);
                    }
                }
            }
        }

        // 6. Merge Preferences (use most recent)
        if (newUserData.preferences) {
            // For preferences, we'll take the entire new preferences object if it exists
            // as preferences are typically set as a complete unit
            mergedUserData.preferences = newUserData.preferences;
            console.log('Updated user preferences with latest values');
        }

        console.log('=== Merge complete ===');
        console.log(`Final merged data contains ${Object.keys(mergedUserData.answers).length} answers`);

        return mergedUserData;

    } catch (error) {
        console.error('Fatal error in mergePersonalData:', error);
        console.error('Stack trace:', error.stack);

        // In case of catastrophic failure, preserve existing data
        console.log('Returning existing data due to merge error');
        return existingUserData || {};
    }
}

// ========================================
// DATA IMPORT FUNCTIONS (Priority 3)
// ========================================

/**
 * Imports personal data for current user with standardization
 * @param {Object} data - Personal data file contents
 * @returns {Promise<void>}
 */
async function importPersonalData(data) {
    if (!currentUsername) {
        showMessage('❌ Please select a username first.', 'error');
        return;
    }

    // Ensure user exists in classData
    if (!classData.users[currentUsername]) {
        classData.users[currentUsername] = {
            answers: {},
            reasons: {},
            timestamps: {},
            attempts: {},
            charts: {},
            currentActivity: { state: 'idle', questionId: null, lastUpdate: Date.now() }
        };
    }

    // Import answers with standardization
    if (data.answers) {
        const standardizedAnswers = migrateAnswersToStandardFormat(data.answers);
        Object.assign(classData.users[currentUsername].answers, standardizedAnswers);
        console.log(`✓ Imported personal answers for ${currentUsername} (standardized format)`);
    }

    // Import other fields
    if (data.reasons) {
        Object.assign(classData.users[currentUsername].reasons, data.reasons);
    }
    if (data.timestamps) {
        Object.assign(classData.users[currentUsername].timestamps, data.timestamps);
    }
    if (data.attempts) {
        Object.assign(classData.users[currentUsername].attempts, data.attempts);
    }
    if (data.charts) {
        Object.assign(classData.users[currentUsername].charts, data.charts);
    }

    // Save to IndexedDB
    await saveClassData();

    // Show success toast
    if (window.showToast) {
        showToast('Data imported successfully', 'success');
    }

    // Reinitialize to show imported data
    if (typeof renderUnitMenu === 'function') {
        renderUnitMenu();
    }
}

/**
 * Imports master database with intelligent merging
 * Handles both single-user restoration and multi-user peer import
 * @param {Object} data - Master database file contents
 * @param {string} targetUsername - Optional username for single-user restoration
 * @returns {Promise<void>}
 */
async function importMasterData(data, targetUsername = null) {
    console.log('=== importMasterData called ===');
    console.log('Target username for restoration:', targetUsername);

    // Try different possible structures for user data
    let userData = null;
    if (data.classData && data.classData.users) {
        userData = data.classData.users;
        console.log('Using data.classData.users');
    } else if (data.students) {
        userData = data.students;
        console.log('Using data.students');
    } else if (data.users) {
        userData = data.users;
        console.log('Using data.users');
    }

    if (!userData) {
        console.warn('❌ No user data found in import file');
        console.log('Available data keys:', Object.keys(data));
        showMessage('Invalid import file format', 'error');
        return;
    }

    // Single-user restoration
    if (targetUsername && userData[targetUsername]) {
        console.log(`SINGLE-USER RESTORATION: Importing only data for ${targetUsername}`);
        const userInfo = userData[targetUsername];

        // Ensure user exists in classData
        if (!classData.users[targetUsername]) {
            classData.users[targetUsername] = {
                answers: {},
                reasons: {},
                timestamps: {},
                attempts: {},
                charts: {},
                currentActivity: { state: 'idle', questionId: null, lastUpdate: Date.now() }
            };
        }

        // Merge in the imported data
        if (userInfo.answers) {
            const standardizedAnswers = migrateAnswersToStandardFormat(userInfo.answers);
            Object.assign(classData.users[targetUsername].answers, standardizedAnswers);
            console.log(`✓ Restored answers for ${targetUsername}`);
        }
        if (userInfo.reasons) {
            Object.assign(classData.users[targetUsername].reasons, userInfo.reasons);
        }
        if (userInfo.timestamps) {
            Object.assign(classData.users[targetUsername].timestamps, userInfo.timestamps);
        }
        if (userInfo.attempts) {
            Object.assign(classData.users[targetUsername].attempts, userInfo.attempts);
        }
        if (userInfo.charts) {
            Object.assign(classData.users[targetUsername].charts, userInfo.charts);
        }

        // Save to IndexedDB
        await AppDB.saveUserData(targetUsername);
        console.log(`=== Single-user restoration completed for ${targetUsername} ===`);

        if (window.showToast) {
            showToast('Data restored successfully', 'success');
        }
        return;
    }

    // Multi-user peer import
    console.log('MULTI-USER PEER IMPORT: Importing data for', Object.keys(userData).length, 'students');
    const importedUsernames = [];

    for (const [username, userInfo] of Object.entries(userData)) {
        // Ensure user exists in classData
        if (!classData.users[username]) {
            classData.users[username] = {
                answers: {},
                reasons: {},
                timestamps: {},
                attempts: {},
                charts: {},
                currentActivity: { state: 'idle', questionId: null, lastUpdate: Date.now() }
            };
        }

        // Merge in the imported data
        if (userInfo.answers) {
            const standardizedAnswers = migrateAnswersToStandardFormat(userInfo.answers);
            Object.assign(classData.users[username].answers, standardizedAnswers);
        }
        if (userInfo.reasons) {
            Object.assign(classData.users[username].reasons, userInfo.reasons);
        }
        if (userInfo.timestamps) {
            Object.assign(classData.users[username].timestamps, userInfo.timestamps);
        }
        if (userInfo.attempts) {
            Object.assign(classData.users[username].attempts, userInfo.attempts);
        }
        if (userInfo.charts) {
            Object.assign(classData.users[username].charts, userInfo.charts);
        }

        importedUsernames.push(username);
    }

    // Save all imported users to IndexedDB
    await saveMultipleUsers(importedUsernames);
    console.log(`✓ Imported ${importedUsernames.length} users to IndexedDB`);

    // Reinitialize to show imported data
    if (typeof renderUnitMenu === 'function') {
        renderUnitMenu();
    }

    if (window.showToast) {
        showToast(`Imported ${importedUsernames.length} students`, 'success');
    }

    console.log('=== Master data import completed ===');
}
