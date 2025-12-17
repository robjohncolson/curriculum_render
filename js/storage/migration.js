// migration.js - localStorage to IndexedDB migration
// Part of AP Statistics Consensus Quiz
// Handles one-time migration of existing data to IDB

/**
 * Migrates data from localStorage to IndexedDB
 * Should be called once during app initialization
 */
class StorageMigration {
    static MIGRATION_KEY = 'migratedFromLocalStorageAt';

    constructor(idbAdapter) {
        this.idb = idbAdapter;
    }

    /**
     * Check if migration has already been completed
     * @returns {Promise<boolean>}
     */
    async isMigrated() {
        const meta = await this.idb.get('meta', 'schemaVersion');
        return !!(meta && meta[StorageMigration.MIGRATION_KEY]);
    }

    /**
     * Run the full migration process
     * @returns {Promise<{migrated: boolean, itemCount: number, errors: string[]}>}
     */
    async migrate() {
        const result = { migrated: false, itemCount: 0, errors: [] };

        try {
            // Check if already migrated
            if (await this.isMigrated()) {
                console.log('Migration already completed');
                return result;
            }

            // Check if localStorage is available
            let storageAvailable = false;
            try {
                localStorage.setItem('__migration_test__', '1');
                localStorage.removeItem('__migration_test__');
                storageAvailable = true;
            } catch (e) {
                console.log('localStorage not available, skipping migration');
                // Still mark as migrated so we don't keep trying
                await this._markMigrationComplete();
                return result;
            }

            // Get the current username
            const username = localStorage.getItem('consensusUsername');
            // Handle falsy values and the string "null" (which can happen if null was serialized)
            if (!username || username === 'null' || username === 'undefined') {
                console.log('No valid username found, creating fresh IDB without migration');
                await this._markMigrationComplete();
                return result;
            }

            console.log(`Starting migration for user: ${username}`);

            // Migrate username and recent usernames
            await this._migrateMeta(username, result);

            // Migrate user data stores
            await this._migrateUserData(username, 'answers', result);
            await this._migrateUserData(username, 'reasons', result);
            await this._migrateUserData(username, 'progress', result);
            await this._migrateUserData(username, 'attempts', result);
            await this._migrateUserData(username, 'badges', result);
            await this._migrateUserData(username, 'charts', result);
            await this._migratePreferences(username, result);

            // Migrate peer cache from classData
            await this._migratePeerCache(username, result);

            // Migrate sprite color
            await this._migrateSpriteColor(username, result);

            // Mark migration complete
            await this._markMigrationComplete();

            result.migrated = true;
            console.log(`Migration complete: ${result.itemCount} items migrated`);

        } catch (e) {
            console.error('Migration failed:', e);
            result.errors.push(e.message);
        }

        return result;
    }

    /**
     * Migrate meta information (username, recent usernames)
     */
    async _migrateMeta(username, result) {
        try {
            // Migrate current username
            await this.idb.setMeta('username', username);
            result.itemCount++;

            // Migrate recent usernames
            const recentRaw = localStorage.getItem('recentUsernames');
            if (recentRaw) {
                const recent = JSON.parse(recentRaw);
                await this.idb.setMeta('recentUsernames', recent);
                result.itemCount++;
            }

            // Generate a client ID for this device
            const clientId = 'client_' + Math.random().toString(36).substr(2, 9);
            await this.idb.setMeta('clientId', clientId);

            // Migrate auto-export settings
            const autoExportEnabled = localStorage.getItem('recoveryAutoExportEnabled');
            if (autoExportEnabled) {
                await this.idb.setMeta('autoBackupEnabled', autoExportEnabled === 'true');
            }

            const autoExportFolder = localStorage.getItem('recoveryAutoExportFolderName');
            if (autoExportFolder) {
                await this.idb.setMeta('autoBackupFolderName', autoExportFolder);
            }

        } catch (e) {
            result.errors.push(`Meta migration failed: ${e.message}`);
        }
    }

    /**
     * Migrate a user data store (answers, reasons, etc.)
     */
    async _migrateUserData(username, storeName, result) {
        try {
            const key = `${storeName}_${username}`;
            const raw = localStorage.getItem(key);
            if (!raw) return;

            const data = JSON.parse(raw);
            if (!data || typeof data !== 'object') return;

            for (const [itemId, value] of Object.entries(data)) {
                // Normalize the value structure
                const record = this._normalizeRecord(username, storeName, itemId, value);
                await this.idb.set(storeName, [username, itemId], record);
                result.itemCount++;
            }

            console.log(`Migrated ${Object.keys(data).length} ${storeName} records`);
        } catch (e) {
            result.errors.push(`${storeName} migration failed: ${e.message}`);
        }
    }

    /**
     * Normalize a record to the expected IDB format
     */
    _normalizeRecord(username, storeName, itemId, value) {
        const now = Date.now();

        switch (storeName) {
            case 'answers':
                // Handle both old format (string) and new format (object with value/timestamp)
                if (typeof value === 'object' && value !== null) {
                    return {
                        username,
                        questionId: itemId,
                        value: value.value,
                        timestamp: value.timestamp || now,
                        updatedAt: now,
                        sourceClientId: null // Unknown for migrated data
                    };
                }
                return {
                    username,
                    questionId: itemId,
                    value: value,
                    timestamp: now,
                    updatedAt: now,
                    sourceClientId: null
                };

            case 'reasons':
                return {
                    username,
                    questionId: itemId,
                    value: typeof value === 'object' ? value.value : value,
                    updatedAt: now
                };

            case 'attempts':
                return {
                    username,
                    questionId: itemId,
                    count: typeof value === 'number' ? value : (value?.count || 1),
                    updatedAt: now
                };

            case 'progress':
                return {
                    username,
                    lessonKey: itemId,
                    value: typeof value === 'object' ? value.value : value,
                    updatedAt: now
                };

            case 'badges':
                if (typeof value === 'object' && value !== null) {
                    return {
                        username,
                        badgeId: itemId,
                        ...value,
                        updatedAt: now
                    };
                }
                return {
                    username,
                    badgeId: itemId,
                    earned: true,
                    earnedAt: now,
                    updatedAt: now
                };

            case 'charts':
                return {
                    username,
                    chartId: itemId,
                    data: value,
                    updatedAt: now
                };

            default:
                return { username, itemId, value, updatedAt: now };
        }
    }

    /**
     * Migrate user preferences
     */
    async _migratePreferences(username, result) {
        try {
            const key = `preferences_${username}`;
            const raw = localStorage.getItem(key);
            if (!raw) return;

            const prefs = JSON.parse(raw);
            await this.idb.set('preferences', username, {
                username,
                ...prefs,
                updatedAt: Date.now()
            });
            result.itemCount++;

        } catch (e) {
            result.errors.push(`Preferences migration failed: ${e.message}`);
        }
    }

    /**
     * Migrate peer data from classData into peerCache
     */
    async _migratePeerCache(currentUsername, result) {
        try {
            const raw = localStorage.getItem('classData');
            if (!raw) return;

            const classData = JSON.parse(raw);
            if (!classData?.users) return;

            let peerCount = 0;
            for (const [peerUsername, userData] of Object.entries(classData.users)) {
                // Skip the current user (their data is in the main stores)
                if (peerUsername === currentUsername) continue;

                if (userData.answers) {
                    for (const [questionId, answer] of Object.entries(userData.answers)) {
                        const record = {
                            peerUsername,
                            questionId,
                            value: answer.value ?? answer,
                            timestamp: answer.timestamp || null,
                            seenAt: Date.now()
                        };
                        await this.idb.set('peerCache', [peerUsername, questionId], record);
                        peerCount++;
                    }
                }
            }

            if (peerCount > 0) {
                console.log(`Migrated ${peerCount} peer cache records`);
                result.itemCount += peerCount;
            }

        } catch (e) {
            result.errors.push(`Peer cache migration failed: ${e.message}`);
        }
    }

    /**
     * Migrate sprite color preference
     */
    async _migrateSpriteColor(username, result) {
        try {
            const hue = localStorage.getItem('spriteColorHue');
            if (hue !== null) {
                await this.idb.set('sprites', username, {
                    username,
                    hue: parseInt(hue, 10),
                    updatedAt: Date.now()
                });
                result.itemCount++;
            }
        } catch (e) {
            result.errors.push(`Sprite color migration failed: ${e.message}`);
        }
    }

    /**
     * Mark migration as complete
     */
    async _markMigrationComplete() {
        await this.idb.set('meta', 'schemaVersion', {
            key: 'schemaVersion',
            value: 1,
            [StorageMigration.MIGRATION_KEY]: new Date().toISOString(),
            updatedAt: Date.now()
        });
    }

    /**
     * Get migration status and details
     */
    async getMigrationStatus() {
        const meta = await this.idb.get('meta', 'schemaVersion');
        if (!meta) {
            return { status: 'pending', migratedAt: null };
        }

        const migratedAt = meta[StorageMigration.MIGRATION_KEY];
        if (migratedAt) {
            return { status: 'complete', migratedAt };
        }

        return { status: 'pending', migratedAt: null };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageMigration };
}
