// auth.js - User authentication and management functions
// Part of AP Statistics Consensus Quiz
// Dependencies: Must be loaded after storage modules and data_manager.js
// This module handles "who is the user" - username generation, prompting, and session management
//
// Storage Migration Note: This module now uses the storage adapter (IDB primary, localStorage fallback)
// All storage operations are async and use waitForStorage()

// ========================================
// USERNAME GENERATION
// ========================================

// Arrays for generating random usernames
const fruits = [
    'Ackee', 'Apple', 'Apricot', 'Avocado', 'Banana', 
    'Bilberry', 'Blackberry', 'Blackcurrant', 'Blueberry', 'Boysenberry', 
    'Breadfruit', 'Cantaloupe', 'Carambola', 'Cherimoya', 'Cherry', 
    'Clementine', 'Cloudberry', 'Coconut', 'Cranberry', 'Damson', 
    'Date', 'Dragonfruit', 'Durian', 'Elderberry', 'Feijoa', 
    'Fig', 'Goji', 'Gooseberry', 'Grape', 'Grapefruit', 
    'Guava', 'Honeyberry', 'Honeydew', 'Huckleberry', 'Imbe', 
    'Jackfruit', 'Jabuticaba', 'Jostaberry', 'Jujube', 'Kiwano', 
    'Kiwi', 'Kumquat', 'Lemon', 'Lime', 'Lingonberry', 
    'Loganberry', 'Longan', 'Loquat', 'Lychee', 'Mamey', 
    'Mango', 'Mangosteen', 'Marionberry', 'Melon', 'Miracle', 
    'Mulberry', 'Nance', 'Nectarine', 'Olive', 'Orange', 
    'Papaya', 'Passionfruit', 'Pawpaw', 'Peach', 'Pear', 
    'Pepino', 'Persimmon', 'Pineapple', 'Pineberry', 'Pitaya', 
    'Plantain', 'Plum', 'Pluot', 'Pomegranate', 'Pomelo', 
    'Quince', 'Rambutan', 'Raspberry', 'Redcurrant', 'Salak', 
    'Salmonberry', 'Sapodilla', 'Sapote', 'Soursop', 'Starfruit', 
    'Strawberry', 'Tamarillo', 'Tamarind', 'Tangelo', 'Tangerine', 
    'Tayberry', 'Ugli', 'Watermelon', 'Whitecurrant', 'Yuzu'
];
const animals = [
    'Aardvark', 'Albatross', 'Alligator', 'Alpaca', 'Antelope', 
    'Armadillo', 'Axolotl', 'Badger', 'Barracuda', 'Bat', 
    'Beaver', 'Bison', 'Bobcat', 'Buffalo', 'Camel', 
    'Capybara', 'Caribou', 'Cassowary', 'Chameleon', 'Cheetah', 
    'Chinchilla', 'Cobra', 'Condor', 'Cougar', 'Coyote', 
    'Crane', 'Crocodile', 'Dingo', 'Dolphin', 'Donkey', 
    'Eagle', 'Echidna', 'Elephant', 'Emu', 'Falcon', 
    'Ferret', 'Finch', 'Flamingo', 'Gazelle', 'Gecko', 
    'Gibbon', 'Giraffe', 'Gopher', 'Gorilla', 'Grizzly', 
    'Hedgehog', 'Heron', 'Hippo', 'Hornet', 'Hyena', 
    'Impala', 'Jackal', 'Jaguar', 'Jellyfish', 'Kangaroo', 
    'Kingfisher', 'Kookaburra', 'Lemur', 'Leopard', 'Llama', 
    'Lobster', 'Macaw', 'Manatee', 'Meerkat', 'Mongoose', 
    'Narwhal', 'Ocelot', 'Octopus', 'Okapi', 'Opossum', 
    'Ostrich', 'Otter', 'Panther', 'Parrot', 'Pelican', 
    'Penguin', 'Platypus', 'Porcupine', 'Quokka', 'Raccoon', 
    'Raven', 'Reindeer', 'Rhino', 'Roadrunner', 'Salamander', 
    'Scorpion', 'Seahorse', 'Seal', 'Serval', 'Shark', 
    'Sloth', 'Stingray', 'Tapir', 'Toucan', 'Vulture'
];

/**
 * Generates a random username in the format "Fruit_Animal"
 * @returns {string} Random username
 */
function generateRandomUsername() {
    const fruit = fruits[Math.floor(Math.random() * fruits.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${fruit}_${animal}`;
}

// ========================================
// USERNAME PROMPTING & SESSION MANAGEMENT
// ========================================

/**
 * Main entry point for username workflow
 * Checks for saved username or shows prompt
 * Now async to support IndexedDB storage
 */
async function promptUsername() {
    // Wait for storage to be ready
    const storage = await waitForStorage();

    // Try to get username from IDB first, fall back to localStorage
    let savedUsername = await storage.getMeta('username');

    // Fallback: check localStorage directly (for pre-migration users)
    if (!savedUsername) {
        try {
            savedUsername = localStorage.getItem('consensusUsername');
            // If found in localStorage but not IDB, migrate it
            if (savedUsername && savedUsername !== 'null') {
                await storage.setMeta('username', savedUsername);
            }
        } catch (e) {
            // localStorage may be blocked by tracking prevention
            console.log('localStorage fallback unavailable');
        }
    }

    if (savedUsername && savedUsername !== 'null') {
        currentUsername = savedUsername;
        await initClassData();
        initializeProgressTracking(); // Initialize progress tracking for returning user
        showUsernameWelcome();
        initializeFromEmbeddedData(); // Initialize from embedded data
        updateCurrentUsernameDisplay();

        // Request persistent storage after user gesture (returning user)
        if (storage.requestPersistence) {
            storage.requestPersistence().then(granted => {
                if (granted) console.log('Persistent storage granted');
            });
        }
    } else {
        showUsernamePrompt();
    }
}

/**
 * LEGACY: Old combined prompt - now replaced by progressive disclosure
 * Kept for backward compatibility, but redirects to new flow
 */
function showUsernamePrompt() {
    showWelcomeScreen();
}

/**
 * NEW: Simplified welcome screen with student dropdown
 * Fetches student list from Supabase and shows a dropdown to select name
 */
async function showWelcomeScreen() {
    const questionsContainer = document.getElementById('questionsContainer');

    // Show loading state while fetching students
    questionsContainer.innerHTML = `
        <div class="welcome-wizard">
            <div class="welcome-header">
                <h1>📊 AP Statistics Consensus Quiz</h1>
                <p class="subtitle">Collaborative Learning Platform</p>
            </div>
            <div class="welcome-message">
                <p>Loading student list...</p>
            </div>
        </div>
    `;

    // Try to fetch student list from Supabase (force refresh to get latest)
    let students = [];
    if (typeof window.fetchStudentList === 'function') {
        students = await window.fetchStudentList(true); // Force refresh
    }

    if (students.length > 0) {
        // Show dropdown of student names as PRIMARY option
        questionsContainer.innerHTML = `
            <div class="welcome-wizard">
                <div class="welcome-header">
                    <h1>📊 AP Statistics Consensus Quiz</h1>
                    <p class="subtitle">Collaborative Learning Platform</p>
                </div>

                <div class="welcome-message">
                    <p>Welcome! Select your name to get started.</p>
                </div>

                <div class="student-select-container">
                    <label for="studentSelect" class="select-label">I am:</label>
                    <select id="studentSelect" class="student-dropdown">
                        <option value="">-- Select your name --</option>
                        ${students.map(s => `<option value="${s.username}">${s.real_name}</option>`).join('')}
                    </select>
                    <button id="confirmStudentBtn" class="action-button primary large" disabled>
                        ✅ Let's Go!
                    </button>
                </div>

                <div class="new-user-link" style="margin-top: 30px; text-align: center;">
                    <small style="color: var(--text-muted, #888);">
                        Not on the list?
                        <a href="#" id="newUserLink" style="color: var(--accent-primary, #3498db);">Create new account</a>
                    </small>
                </div>
            </div>
        `;

        // Enable button when selection is made
        const select = document.getElementById('studentSelect');
        const btn = document.getElementById('confirmStudentBtn');

        select.addEventListener('change', () => {
            btn.disabled = !select.value;
        });

        btn.addEventListener('click', () => {
            const username = select.value;
            if (username) {
                acceptUsername(username);
            }
        });

        // Handle "new user" link - show the random username generator
        const newUserLink = document.getElementById('newUserLink');
        if (newUserLink) {
            newUserLink.addEventListener('click', (e) => {
                e.preventDefault();
                showNewStudentFlow();
            });
        }
    } else {
        // Fallback: No students found or offline - show legacy flow
        showWelcomeScreenFallback();
    }
}

/**
 * Fallback welcome screen when student list is unavailable
 * Shows the original two-button choice for new/returning students
 */
function showWelcomeScreenFallback() {
    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.innerHTML = `
        <div class="welcome-wizard">
            <div class="welcome-header">
                <h1>📊 AP Statistics Consensus Quiz</h1>
                <p class="subtitle">Collaborative Learning Platform</p>
            </div>

            <div class="welcome-message">
                <p>Welcome! Let's get you started.</p>
                <p class="offline-notice" style="color: var(--text-muted); font-size: 0.9em;">
                    (Offline mode - class roster not available)
                </p>
            </div>

            <div class="wizard-choices">
                <button onclick="showNewStudentFlow()" class="wizard-button primary">
                    <div class="button-icon-large">🆕</div>
                    <div class="button-content">
                        <div class="button-title">I'm a New Student</div>
                        <div class="button-description">Get started quickly</div>
                    </div>
                </button>

                <button onclick="showReturningStudentFlow()" class="wizard-button secondary">
                    <div class="button-icon-large">📂</div>
                    <div class="button-content">
                        <div class="button-title">I'm Returning</div>
                        <div class="button-description">I have a backup file</div>
                    </div>
                </button>
            </div>

            <!-- Show recent usernames if any exist -->
            <div id="recentUsernamesWelcome" style="display: none; margin-top: 30px;">
                <p class="recent-label">Recently used on this device:</p>
                <div id="recentUsernamesListWelcome" class="recent-usernames-compact"></div>
            </div>
        </div>
    `;

    // Check for recently used usernames and display them
    loadRecentUsernamesOnWelcome();
}

/**
 * NEW: Flow for new students - simple username generation
 */
window.showNewStudentFlow = function() {
    const suggestedName = generateRandomUsername();
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="new-student-flow">
            <div class="flow-header">
                <button onclick="showWelcomeScreen()" class="back-button">← Back</button>
                <h2>Welcome, New Student!</h2>
            </div>

            <div class="username-reveal">
                <p class="reveal-label">Your username is:</p>
                <div class="username-display-large" id="generatedNameLarge">
                    ${suggestedName}
                </div>
                <p class="username-hint">💡 Write this down - you'll need it to restore your progress later!</p>
            </div>

            <div class="flow-actions">
                <button onclick="acceptUsername('${suggestedName}')" class="action-button primary extra-large">
                    ✅ Let's Go!
                </button>
                <button onclick="rerollUsernameInFlow()" class="action-button secondary large">
                    🎲 Try Another Name
                </button>
            </div>
        </div>
    `;
}

/**
 * NEW: Flow for returning students - import/restore options
 */
window.showReturningStudentFlow = function() {
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="returning-student-flow">
            <div class="flow-header">
                <button onclick="showWelcomeScreen()" class="back-button">← Back</button>
                <h2>Welcome Back!</h2>
            </div>

            <div class="restore-options">
                <p class="restore-intro">How would you like to restore your progress?</p>

                <div class="restore-methods">
                    <div class="restore-method-card">
                        <div class="method-icon">🗂️</div>
                        <h3>From Class Backup</h3>
                        <p>Your teacher shared a master file with everyone's data</p>
                        <button onclick="showRestoreOptionsModal()" class="action-button primary">
                            Restore from Backup
                        </button>
                    </div>

                    <!-- Show recent usernames if available -->
                    <div id="recentUsernamesReturning" style="display: none;" class="restore-method-card">
                        <div class="method-icon">⏱️</div>
                        <h3>Recent Usernames</h3>
                        <p>Pick up where you left off on this device</p>
                        <div id="recentUsernamesListReturning" class="recent-usernames-list"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Load recent usernames for returning students
    loadRecentUsernamesForReturning();
}

/**
 * Helper: Reroll username within the new student flow
 */
window.rerollUsernameInFlow = function() {
    const newName = generateRandomUsername();
    const displayElement = document.getElementById('generatedNameLarge');

    if (displayElement) {
        // Add animation class for smooth transition
        displayElement.style.opacity = '0';
        setTimeout(() => {
            displayElement.textContent = newName;
            displayElement.style.opacity = '1';
        }, 150);

        // Update the accept button
        const acceptButton = document.querySelector('.action-button.primary.extra-large');
        if (acceptButton) {
            acceptButton.onclick = () => acceptUsername(newName);
        }
    } else {
        // Fallback
        showNewStudentFlow();
    }
}

/**
 * Helper: Load recent usernames on welcome screen
 * Now async to support IDB storage
 */
async function loadRecentUsernamesOnWelcome() {
    const recentUsers = await getRecentUsernames();

    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernamesWelcome');
        const list = document.getElementById('recentUsernamesListWelcome');

        if (container && list) {
            container.style.display = 'block';
            list.innerHTML = recentUsers.slice(0, 3).map(u => `
                <button onclick="checkExistingData('${u}')" class="recent-username-chip">
                    ${u}
                </button>
            `).join('');
        }
    }
}

/**
 * Helper: Load recent usernames for returning student flow
 * Now async to support IDB storage
 */
async function loadRecentUsernamesForReturning() {
    const recentUsers = await getRecentUsernames();

    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernamesReturning');
        const list = document.getElementById('recentUsernamesListReturning');

        if (container && list) {
            container.style.display = 'block';
            list.innerHTML = recentUsers.map(u => `
                <button onclick="checkExistingData('${u}')" class="recent-username-btn-large">
                    ${u}
                </button>
            `).join('');
        }
    }
}

/**
 * Helper: Get recent usernames from storage
 * Now async and uses IDB with localStorage fallback
 * @returns {Promise<Array<string>>} Array of recent usernames
 */
async function getRecentUsernames() {
    const recentUsers = new Set();

    try {
        const storage = await waitForStorage();

        // First, get the saved recent usernames list
        const savedRecent = await storage.getMeta('recentUsernames');
        if (Array.isArray(savedRecent)) {
            savedRecent.forEach(u => recentUsers.add(u));
        }

        // Also check IDB for any users with answers
        const allAnswers = await storage.getAll('answers');
        const usersWithAnswers = new Set(allAnswers.map(a => a.username));
        usersWithAnswers.forEach(u => {
            if (u && u !== 'undefined' && u !== 'null') {
                recentUsers.add(u);
            }
        });

    } catch (e) {
        console.log('Error getting recent usernames from IDB:', e);
    }

    // Fallback: also check localStorage for any stored usernames
    try {
        for (let key in localStorage) {
            if (key.startsWith('answers_')) {
                const username = key.replace('answers_', '');
                if (username && username !== 'undefined' && username !== 'null') {
                    recentUsers.add(username);
                }
            }
        }

        // Also check class data in localStorage
        const classData = JSON.parse(localStorage.getItem('classData') || '{}');
        if (classData.users) {
            Object.keys(classData.users).forEach(u => {
                if (u && u !== 'undefined' && u !== 'null') {
                    recentUsers.add(u);
                }
            });
        }
    } catch (e) {
        // localStorage may be blocked
    }

    return Array.from(recentUsers);
}

/**
 * Synchronous version for backward compatibility with existing onclick handlers
 * Uses cached data or falls back to localStorage
 */
function getRecentUsernamesSync() {
    const recentUsers = [];

    try {
        // Check localStorage for any stored usernames
        for (let key in localStorage) {
            if (key.startsWith('answers_')) {
                const username = key.replace('answers_', '');
                if (username && username !== 'undefined' && username !== 'null') {
                    recentUsers.push(username);
                }
            }
        }

        // Also check class data
        const classData = JSON.parse(localStorage.getItem('classData') || '{}');
        if (classData.users) {
            Object.keys(classData.users).forEach(u => {
                if (!recentUsers.includes(u) && u !== 'undefined' && u !== 'null') {
                    recentUsers.push(u);
                }
            });
        }
    } catch (e) {
        // localStorage may be blocked
    }

    return recentUsers;
}

/**
 * Generates a new random username and updates the display
 * Exposed to window for onclick handlers
 */
window.rerollUsername = function() {
    const newName = generateRandomUsername();
    const generatedNameElement = document.getElementById('generatedName');
    if (generatedNameElement) {
        generatedNameElement.textContent = newName;
        // Update the accept button to use the new name
        const acceptButton = generatedNameElement.closest('.name-generator').querySelector('.action-button.primary.large');
        if (acceptButton) {
            acceptButton.onclick = () => acceptUsername(newName);
        }
    } else {
        // Fallback to full refresh if element not found
        showUsernamePrompt();
    }
}

/**
 * Accepts a username and initializes user session
 * Exposed to window for onclick handlers
 * Now async to support IndexedDB storage
 * @param {string} name - The username to accept
 */
window.acceptUsername = async function(name) {
    currentUsername = name;

    // Save to storage adapter (IDB + localStorage dual-write)
    const storage = await waitForStorage();
    await storage.setMeta('username', currentUsername);

    // Also write to localStorage for backward compatibility during transition
    try {
        localStorage.setItem('consensusUsername', currentUsername);
    } catch (e) {
        console.log('localStorage write failed (tracking prevention?)');
    }

    // Save to recent usernames list
    let recentUsernames = await storage.getMeta('recentUsernames') || [];
    if (!Array.isArray(recentUsernames)) recentUsernames = [];
    if (!recentUsernames.includes(name)) {
        recentUsernames.unshift(name);
        // Keep only last 5 usernames
        recentUsernames = recentUsernames.slice(0, 5);
        await storage.setMeta('recentUsernames', recentUsernames);

        // Also write to localStorage for backward compatibility
        try {
            localStorage.setItem('recentUsernames', JSON.stringify(recentUsernames));
        } catch (e) {
            // Ignore localStorage failures
        }
    }

    await initClassData();
    initializeProgressTracking(); // Initialize progress tracking for new session
    showUsernameWelcome();
    initializeFromEmbeddedData();
    updateCurrentUsernameDisplay();

    // Request persistent storage after user gesture (new user accepting username)
    if (storage.requestPersistence) {
        storage.requestPersistence().then(granted => {
            if (granted) console.log('Persistent storage granted for new user');
        });
    }

    // Initialize multiplayer pig system
    if (typeof PigManager !== 'undefined' && !window.pigManager) {
        window.pigManager = new PigManager();
    }
}

/**
 * Allows manual username input for recovery
 * Exposed to window for onclick handlers
 */
window.recoverUsername = function() {
    const input = document.getElementById('manualUsername');
    const username = input.value.trim();

    if (!username) {
        showMessage('Please enter a username', 'error');
        return;
    }

    // Validate username format (optional)
    if (!username.match(/^[A-Za-z]+_[A-Za-z]+$/)) {
        if (!confirm('This username doesn\'t match the standard format (Fruit_Animal). Use it anyway?')) {
            return;
        }
    }

    // Check if this username has existing data
    checkExistingData(username);
}

/**
 * Checks if a username has existing data in storage
 * Now async and checks IDB first, then localStorage
 * @param {string} username - Username to check
 */
async function checkExistingData(username) {
    let hasData = false;

    try {
        const storage = await waitForStorage();

        // Check IDB for answers
        const answers = await storage.getAllForUser('answers', username);
        if (answers && answers.length > 0) {
            hasData = true;
        }
    } catch (e) {
        console.log('Error checking IDB for existing data:', e);
    }

    // Also check localStorage as fallback
    if (!hasData) {
        try {
            const existingData = localStorage.getItem(`answers_${username}`);
            const classData = JSON.parse(localStorage.getItem('classData') || '{}');
            hasData = existingData || (classData.users && classData.users[username]);
        } catch (e) {
            // localStorage may be blocked
        }
    }

    if (hasData) {
        if (confirm(`Found existing data for ${username}. Would you like to continue with this username and restore your progress?`)) {
            await acceptUsername(username);
            showMessage('Welcome back! Your progress has been restored.', 'success');
        }
    } else {
        if (confirm(`No existing data found for ${username}. Would you like to start fresh with this username?`)) {
            await acceptUsername(username);
            showMessage('Username set! Starting fresh.', 'info');
        }
    }
}

// Expose to window for onclick handlers
window.checkExistingData = checkExistingData;

// ========================================
// USER DISPLAY & RECENT USERNAMES
// ========================================

/**
 * Updates the UI to show current username
 * Reinitializes pig sprite with user's saved color
 */
function updateCurrentUsernameDisplay() {
    // Reinitialize pig sprite with user's saved color
    if (typeof initializePigSprite === 'function') {
        initializePigSprite();
    }
}

/**
 * Loads and displays recently used usernames from storage
 * Now async and uses IDB with localStorage fallback
 */
async function loadRecentUsernames() {
    const recentUsers = await getRecentUsernames();

    // Display recent usernames if any found
    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernames');
        const list = document.getElementById('recentUsernamesList');

        if (container && list) {
            container.style.display = 'block';
            list.innerHTML = recentUsers.map(u => `
                <button onclick="checkExistingData('${u}')" class="recent-username-btn">
                    ${u}
                </button>
            `).join('');
        }
    }
}

/**
 * Displays a welcome message for the logged-in user
 */
function showUsernameWelcome() {
    const container = document.querySelector('.container');
    if (!container) return;
    const existingWelcome = document.querySelector('.username-welcome');
    if (existingWelcome) existingWelcome.remove();

    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'username-welcome';
    welcomeDiv.textContent = `Welcome ${currentUsername}!`;
    container.insertBefore(welcomeDiv, container.firstChild.nextSibling);
}

/**
 * Exports username to JSON file for recovery
 * Exposed to window for onclick handlers
 */
window.exportUsername = function() {
    if (!currentUsername) {
        showMessage('No username to export', 'error');
        return;
    }

    const exportData = {
        username: currentUsername,
        exportDate: new Date().toISOString(),
        version: '1.0'
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentUsername}_identity.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showMessage('Username exported successfully!', 'success');
}
