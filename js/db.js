// db.js - IndexedDB layer using Dexie
// Part of AP Statistics Consensus Quiz
// Dependencies: Dexie.js must be loaded before this file
// This module handles persistent storage with per-user sharding

// ========================================
// GLOBAL STATE INITIALIZATION
// ========================================

// Initialize classData if it doesn't exist
// This must happen before any other code tries to access it
if (typeof classData === 'undefined') {
  var classData = { users: {} };
}
// Also expose on window for other modules
window.classData = classData;

// Initialize currentUsername if it doesn't exist
if (typeof currentUsername === 'undefined') {
  var currentUsername = null;
}
window.currentUsername = currentUsername;

// ========================================
// DATABASE SCHEMA
// ========================================

const db = new Dexie('APStatsConsensusQuiz');

db.version(1).stores({
  // Primary store: one record per user
  // Key: username (string)
  // Value: { answers: {}, charts: {}, currentActivity: {}, reasons: {}, timestamps: {}, attempts: {} }
  users: 'username',

  // Metadata store for app-level state
  // Key: arbitrary string ('schema', 'sync', 'identity')
  // Value: varies by key
  meta: 'key'
});

// ========================================
// INITIALIZATION
// ========================================

let dbInitialized = false;

// Track if we're in fallback mode (IndexedDB unavailable)
let storageUnavailable = false;

/**
 * Initialize database and run migration from localStorage
 * Should be called once at app startup before any data operations
 * Falls back gracefully if IndexedDB is blocked by privacy settings
 */
async function initDB() {
  if (dbInitialized) {
    console.log('DB already initialized, skipping');
    return;
  }

  try {
    // Open the database
    await db.open();

    // Run migration from localStorage if needed
    await migrateFromLocalStorage();

    // Request persistent storage (prevents browser from evicting data)
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        console.log(`Storage persistence: ${isPersisted ? 'granted' : 'not granted'}`);
      } catch (persistError) {
        console.warn('Could not request persistent storage:', persistError);
      }
    }

    dbInitialized = true;
    console.log('IndexedDB initialized successfully');
  } catch (e) {
    console.error('Failed to initialize IndexedDB:', e);
    console.warn('Falling back to in-memory storage. Data will NOT persist across page refreshes.');

    // Mark that storage is unavailable
    storageUnavailable = true;
    dbInitialized = true; // Mark as "initialized" so app continues

    // Show user a warning if toast system is available
    if (window.showToast) {
      setTimeout(() => {
        showToast('Storage blocked by browser. Data won\'t be saved.', 'warning', 8000);
      }, 1000);
    }

    // Don't throw - let the app continue with in-memory data
  }
}

// ========================================
// MIGRATION FROM LOCALSTORAGE
// ========================================

/**
 * Migrates existing data from localStorage to IndexedDB
 * Runs only once, idempotent
 */
async function migrateFromLocalStorage() {
  const migrationStatus = await db.meta.get('schema');

  if (migrationStatus?.migratedFromLocalStorage) {
    return; // Already migrated
  }

  const oldData = localStorage.getItem('classData');
  if (!oldData) {
    // No old data to migrate, just mark as "migrated" (fresh install)
    await db.meta.put({
      key: 'schema',
      version: 1,
      migratedFromLocalStorage: true,
      migratedAt: Date.now()
    });
    console.log('Fresh install - no localStorage data to migrate');
    return;
  }

  try {
    const parsed = JSON.parse(oldData);
    const users = parsed.users || {};

    // Bulk insert all users
    const userRecords = Object.entries(users).map(([username, userData]) => ({
      username,
      ...userData
    }));

    if (userRecords.length > 0) {
      await db.users.bulkPut(userRecords);
    }

    // Migrate current username
    const currentUsername = localStorage.getItem('consensusUsername');
    if (currentUsername) {
      await db.meta.put({ key: 'identity', currentUsername });
    }

    // Mark migration complete
    await db.meta.put({
      key: 'schema',
      version: 1,
      migratedFromLocalStorage: true,
      migratedAt: Date.now()
    });

    // Keep localStorage as emergency backup for 30 days
    // Don't clear immediately in case something goes wrong
    localStorage.setItem('classData_backup', oldData);
    localStorage.setItem('classData_backup_date', Date.now().toString());
    localStorage.removeItem('classData');

    console.log(`Migrated ${userRecords.length} users from localStorage to IndexedDB`);
  } catch (e) {
    console.error('Migration failed:', e);
    // Don't mark as migrated - will retry next load
    throw e;
  }
}

// ========================================
// USER DATA OPERATIONS
// ========================================

/**
 * Load all users from IndexedDB into the in-memory classData object
 * @returns {Object} The populated classData object
 */
async function loadAllUsers() {
  // Defensive initialization in case classData was reset
  if (!classData) {
    classData = { users: {} };
    window.classData = classData;
  }
  if (!classData.users) {
    classData.users = {};
  }

  // If storage is unavailable, just return the in-memory data
  if (storageUnavailable) {
    console.log('Storage unavailable - using in-memory data only');
    return classData;
  }

  try {
    const users = await db.users.toArray();
    classData.users = {};

    for (const user of users) {
      const { username, ...userData } = user;
      classData.users[username] = userData;
    }

    console.log(`Loaded ${users.length} users from IndexedDB`);
  } catch (e) {
    console.warn('Failed to load users from IndexedDB:', e);
    // Keep whatever is in classData.users
  }

  return classData;
}

/**
 * Save a single user's data to IndexedDB
 * @param {string} username - The username to save
 */
async function saveUserData(username) {
  const userData = classData.users[username];
  if (!userData) {
    console.warn(`saveUserData: No data found for user ${username}`);
    return;
  }

  // If storage is unavailable, skip but don't error
  if (storageUnavailable) {
    console.log('Storage unavailable - data only in memory');
    return;
  }

  try {
    await db.users.put({ username, ...userData });
    await updateSyncMeta('lastLocalSave', Date.now());
  } catch (e) {
    console.warn('Failed to save user data to IndexedDB:', e);
  }
}

/**
 * Save multiple users' data to IndexedDB in a single transaction
 * @param {string[]} usernames - Array of usernames to save
 */
async function saveMultipleUsers(usernames) {
  const records = usernames
    .filter(username => classData.users[username])
    .map(username => ({
      username,
      ...classData.users[username]
    }));

  if (records.length > 0) {
    await db.users.bulkPut(records);
    await updateSyncMeta('lastLocalSave', Date.now());
  }
}

/**
 * Delete a user from IndexedDB
 * @param {string} username - The username to delete
 */
async function deleteUserData(username) {
  await db.users.delete(username);
}

/**
 * Check if a user exists in IndexedDB
 * @param {string} username - The username to check
 * @returns {boolean} True if user exists
 */
async function userExists(username) {
  const user = await db.users.get(username);
  return !!user;
}

// ========================================
// IDENTITY MANAGEMENT
// ========================================

/**
 * Get the current username from IndexedDB (with localStorage fallback)
 * @returns {string|null} The current username or null
 */
async function getStoredUsername() {
  // If storage unavailable, try localStorage as fallback
  if (storageUnavailable) {
    return localStorage.getItem('consensusUsername') || null;
  }

  try {
    const identity = await db.meta.get('identity');
    return identity?.currentUsername || localStorage.getItem('consensusUsername') || null;
  } catch (e) {
    console.warn('Failed to get username from IndexedDB:', e);
    return localStorage.getItem('consensusUsername') || null;
  }
}

/**
 * Set the current username in IndexedDB (with localStorage fallback)
 * @param {string} username - The username to set
 */
async function setStoredUsername(username) {
  // Always save to localStorage as backup
  try {
    localStorage.setItem('consensusUsername', username);
  } catch (e) {
    console.warn('Failed to save username to localStorage:', e);
  }

  // If storage unavailable, we're done
  if (storageUnavailable) {
    return;
  }

  try {
    await db.meta.put({ key: 'identity', currentUsername: username });
  } catch (e) {
    console.warn('Failed to save username to IndexedDB:', e);
  }
}

// ========================================
// SYNC METADATA
// ========================================

/**
 * Update a sync metadata field
 * @param {string} field - The field to update ('lastLocalSave', 'lastCloudSync')
 * @param {*} value - The value to set
 */
async function updateSyncMeta(field, value) {
  const existing = await db.meta.get('sync') || { key: 'sync' };
  existing[field] = value;
  await db.meta.put(existing);
}

/**
 * Get all sync metadata
 * @returns {Object} The sync metadata
 */
async function getSyncMeta() {
  return await db.meta.get('sync') || {
    key: 'sync',
    lastLocalSave: null,
    lastCloudSync: null
  };
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get the count of answers for a specific user
 * @param {string} username - The username to check
 * @returns {number} The number of answers
 */
async function getUserAnswerCount(username) {
  const user = await db.users.get(username);
  if (!user || !user.answers) return 0;
  return Object.keys(user.answers).length;
}

/**
 * Clear all data from IndexedDB (for testing/reset)
 */
async function clearAllData() {
  await db.users.clear();
  await db.meta.clear();
  console.log('All IndexedDB data cleared');
}

/**
 * Export all data as JSON (for backup)
 * @returns {Object} All data in the old classData format
 */
async function exportAllData() {
  const users = await db.users.toArray();
  const exportData = { users: {} };

  for (const user of users) {
    const { username, ...userData } = user;
    exportData.users[username] = userData;
  }

  return exportData;
}

/**
 * Import data from JSON (for restore)
 * @param {Object} data - Data in classData format
 */
async function importAllData(data) {
  if (!data || !data.users) {
    throw new Error('Invalid import data format');
  }

  const userRecords = Object.entries(data.users).map(([username, userData]) => ({
    username,
    ...userData
  }));

  await db.users.bulkPut(userRecords);
  await updateSyncMeta('lastLocalSave', Date.now());

  console.log(`Imported ${userRecords.length} users`);
}

// ========================================
// EXPORTS (for use by other modules)
// ========================================

// These functions are available globally since we're not using ES modules
window.AppDB = {
  init: initDB,
  loadAllUsers,
  saveUserData,
  saveMultipleUsers,
  deleteUserData,
  userExists,
  getStoredUsername,
  setStoredUsername,
  updateSyncMeta,
  getSyncMeta,
  getUserAnswerCount,
  clearAllData,
  exportAllData,
  importAllData,
  // Expose db for advanced use cases
  _db: db
};
