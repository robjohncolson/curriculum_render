// data_manager.js - Data management, import/export, and storage functions
// Part of AP Statistics Consensus Quiz
// Dependencies: Requires global variables (currentUsername, classData, allCurriculumData)
//               Requires functions from other modules (showMessage, renderUnitMenu, detectUnitAndLessons)
// This module handles "what is their data" - import, export, merging, and persistence

// ========================================
// CORE DATA MANAGEMENT (Priority 1)
// ========================================

/**
 * Initializes or loads class data structure from localStorage
 * Creates user entry if it doesn't exist for current username
 */
function initClassData() {
    let classDataStr = localStorage.getItem('classData');
    classData = classDataStr ? JSON.parse(classDataStr) : {users: {}};

    if (!classData.users[currentUsername]) {
        classData.users[currentUsername] = {
            answers: {},
            reasons: {},
            timestamps: {},
            attempts: {},
            charts: {},
            // TASK 3.3: Real-time activity tracking for pig system
            currentActivity: {
                state: 'idle',        // idle, viewing, answering, submitted
                questionId: null,     // Current question being viewed/answered
                lastUpdate: Date.now() // Timestamp of last activity change
            }
        };
    } else {
        // TASK 4.1: Migrate existing users to have currentActivity field
        if (!classData.users[currentUsername].charts) {
            classData.users[currentUsername].charts = {};
        }
        if (!classData.users[currentUsername].currentActivity) {
            classData.users[currentUsername].currentActivity = {
                state: 'idle',
                questionId: null,
                lastUpdate: Date.now()
            };
            console.log(`✅ Migrated ${currentUsername} to include currentActivity field`);
        }
    }

    saveClassData();
}

/**
 * Saves class data to localStorage with error handling
 */
function saveClassData() {
    try {
        localStorage.setItem('classData', JSON.stringify(classData));
    } catch(e) {
        console.log("Storage quota exceeded");
        showMessage("Warning: Local storage is full. Some data may not be saved.", 'error');
    }
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

    if (typeof initClassData === 'function') {
        try {
            initClassData();
        } catch (error) {
            console.warn('RECOVERY: initClassData failed during buildRecoveryPack', error);
        }
    }

    const nowISO = new Date().toISOString();
    const classDataSnapshot = JSON.parse(localStorage.getItem('classData') || '{"users":{}}');
    const userSlice = (classDataSnapshot.users && classDataSnapshot.users[username])
        || (classData && classData.users && classData.users[username])
        || {};

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

    if (typeof initClassData === 'function') {
        try {
            initClassData();
        } catch (error) {
            console.warn('RECOVERY: initClassData failed during class pack generation', error);
        }
    }

    const classDataSnapshot = JSON.parse(localStorage.getItem('classData') || '{"users":{}}');
    const usernames = Object.keys(classDataSnapshot.users || {});
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
window.exportMasterData = function() {
    // Get ALL data from localStorage, not filtered by user
    const masterData = {
        timestamp: new Date().toISOString(),
        exportType: 'master_database',
        allUsers: Object.keys(localStorage)
            .filter(key => key.includes('_username') || key.includes('answers_'))
            .map(key => key.split('_')[1])
            .filter((v, i, a) => a.indexOf(v) === i), // unique usernames

        // Get all class data without filtering
        classData: JSON.parse(localStorage.getItem('classData') || '{}'),

        // Get all answers from all users
        allAnswers: {},

        // Get all progress from all users
        allProgress: {},

        // Get any other data structures you have
        consensusData: JSON.parse(localStorage.getItem('consensusResponses') || '{}'),

        // Include raw localStorage for complete backup
        rawLocalStorage: {}
    };

    // Collect all answers for all users
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('answers_')) {
            const username = key.replace('answers_', '');
            masterData.allAnswers[username] = JSON.parse(localStorage.getItem(key) || '{}');
        }
        if (key.startsWith('progress_')) {
            const username = key.replace('progress_', '');
            masterData.allProgress[username] = JSON.parse(localStorage.getItem(key) || '{}');
        }

        // Store everything in raw format too
        masterData.rawLocalStorage[key] = localStorage.getItem(key);
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
 */
function importPersonalData(data) {
    if (!currentUsername) {
        showMessage('❌ Please select a username first.', 'error');
        return;
    }

    // Import answers with standardization
    if (data.answers) {
        const standardizedAnswers = migrateAnswersToStandardFormat(data.answers);
        localStorage.setItem(`answers_${currentUsername}`, JSON.stringify(standardizedAnswers));
        console.log(`✓ Imported personal answers for ${currentUsername} (standardized format)`);
    }

    // Import progress
    if (data.progress) {
        localStorage.setItem(`progress_${currentUsername}`, JSON.stringify(data.progress));
    }

    // Reinitialize to show imported data
    initClassData();
    if (typeof renderUnitMenu === 'function') {
        renderUnitMenu();
    }
}

/**
 * Imports master database with intelligent merging
 * Handles both single-user restoration and multi-user peer import
 * @param {Object} data - Master database file contents
 * @param {string} targetUsername - Optional username for single-user restoration
 */
function importMasterData(data, targetUsername = null) {
    console.log('=== importMasterData called ===');
    console.log('Data passed to importMasterData:', data);
    console.log('Target username for restoration:', targetUsername);

    // Use existing master data import functionality
    if (typeof mergeMasterData === 'function') {
        console.log('Found mergeMasterData function, using it');
        mergeMasterData(data);
    } else {
        console.warn('No mergeMasterData function found, attempting basic import...');
        console.log('Import data structure:', data);
        console.log('Data keys:', Object.keys(data));
        console.log('Has students property:', !!data.students);
        console.log('Has allUsers property:', !!data.allUsers);
        console.log('Has users property:', !!data.users);

        // Try different possible structures
        let userData = null;
        if (data.students) {
            userData = data.students;
            console.log('Using data.students:', userData);
        } else if (data.allUsers) {
            userData = data.allUsers;
            console.log('Using data.allUsers:', userData);
        } else if (data.users) {
            userData = data.users;
            console.log('Using data.users:', userData);
        }

        if (userData) {
            // Check if this is single-user restoration (from username screen)
            if (targetUsername && userData[targetUsername]) {
                console.log(`SINGLE-USER RESTORATION: Importing only data for ${targetUsername}`);
                const userInfo = userData[targetUsername];

                if (userInfo.answers) {
                    // STANDARDIZATION FIX: Use migration function for consistency
                    const standardizedAnswers = migrateAnswersToStandardFormat(userInfo.answers);
                    localStorage.setItem(`answers_${targetUsername}`, JSON.stringify(standardizedAnswers));
                    console.log(`✓ Restored answers for ${targetUsername} (standardized format)`);
                }
                if (userInfo.progress) {
                    localStorage.setItem(`progress_${targetUsername}`, JSON.stringify(userInfo.progress));
                    console.log(`✓ Restored progress for ${targetUsername}`);
                }
                if (userInfo.reasons) {
                    localStorage.setItem(`reasons_${targetUsername}`, JSON.stringify(userInfo.reasons));
                    console.log(`✓ Restored reasons for ${targetUsername}`);
                }
                if (userInfo.timestamps) {
                    localStorage.setItem(`timestamps_${targetUsername}`, JSON.stringify(userInfo.timestamps));
                    console.log(`✓ Restored timestamps for ${targetUsername}`);
                }
                if (userInfo.attempts) {
                    localStorage.setItem(`attempts_${targetUsername}`, JSON.stringify(userInfo.attempts));
                    console.log(`✓ Restored attempts for ${targetUsername}`);
                }

                console.log(`=== Single-user restoration completed for ${targetUsername} ===`);
                return;
            }

            // Otherwise, do multi-user peer import
            console.log('MULTI-USER PEER IMPORT: Importing data for', Object.keys(userData).length, 'students');
            console.log('Student usernames:', Object.keys(userData));

            // Get or create classData structure for peer display
            const classData = JSON.parse(localStorage.getItem('classData') || '{}');
            if (!classData.users) classData.users = {};

            Object.entries(userData).forEach(([username, userInfo]) => {
                console.log(`Processing user: ${username}`, userInfo);

                if (userInfo.answers) {
                    // STANDARDIZATION FIX: Use migration function for consistency
                    const standardizedAnswers = migrateAnswersToStandardFormat(userInfo.answers);

                    // Store individual keys (for existing functionality)
                    const key = `answers_${username}`;
                    localStorage.setItem(key, JSON.stringify(standardizedAnswers));
                    console.log(`✓ Stored answers for ${username} in ${key} (standardized format)`);

                    // ALSO store in classData structure (for peer display)
                    if (!classData.users[username]) {
                        classData.users[username] = { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} };
                    } else if (!classData.users[username].charts) {
                        classData.users[username].charts = {};
                    }
                    Object.assign(classData.users[username].answers, standardizedAnswers);
                    console.log(`✓ Added ${username} to classData structure`);
                } else {
                    console.log(`⚠ No answers found for ${username}`);
                }

                if (userInfo.progress) {
                    const key = `progress_${username}`;
                    localStorage.setItem(key, JSON.stringify(userInfo.progress));
                    console.log(`✓ Stored progress for ${username} in ${key}`);
                }

                if (userInfo.reasons) {
                    localStorage.setItem(`reasons_${username}`, JSON.stringify(userInfo.reasons));
                    if (classData.users[username]) {
                        Object.assign(classData.users[username].reasons, userInfo.reasons);
                    }
                }

                if (userInfo.timestamps) {
                    localStorage.setItem(`timestamps_${username}`, JSON.stringify(userInfo.timestamps));
                    if (classData.users[username]) {
                        Object.assign(classData.users[username].timestamps, userInfo.timestamps);
                    }
                }

                if (userInfo.attempts) {
                    localStorage.setItem(`attempts_${username}`, JSON.stringify(userInfo.attempts));
                    if (classData.users[username]) {
                        Object.assign(classData.users[username].attempts, userInfo.attempts);
                    }
                }

                if (userInfo.charts) {
                    if (!classData.users[username]) {
                        classData.users[username] = { answers: {}, reasons: {}, timestamps: {}, attempts: {}, charts: {} };
                    }
                    if (!classData.users[username].charts) {
                        classData.users[username].charts = {};
                    }
                    Object.assign(classData.users[username].charts, userInfo.charts);
                }
            });

            // Save the updated classData structure
            localStorage.setItem('classData', JSON.stringify(classData));
            console.log(`✓ Updated classData with ${Object.keys(classData.users).length} users`);

            // CRITICAL: Refresh the global classData variable
            window.classData = classData;

            // Reinitialize to show imported data
            if (typeof initClassData === 'function') {
                console.log('Calling initClassData()');
                initClassData();
            }
            if (typeof renderUnitMenu === 'function') {
                console.log('Calling renderUnitMenu()');
                renderUnitMenu();
            }
            console.log('=== Master data import completed ===');
        } else {
            console.warn('❌ No students data found in import file');
            console.log('Available data keys:', Object.keys(data));
        }
    }
}
