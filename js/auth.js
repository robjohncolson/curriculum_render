// auth.js - User authentication and management functions
// Part of AP Statistics Consensus Quiz
// Dependencies: Must be loaded after data_manager.js (for initClassData, initializeProgressTracking)
// This module handles "who is the user" - username generation, prompting, and session management

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
 */
function promptUsername() {
    const savedUsername = localStorage.getItem('consensusUsername');
    if (savedUsername) {
        currentUsername = savedUsername;
        initClassData();
        initializeProgressTracking(); // Initialize progress tracking for returning user
        showUsernameWelcome();
        initializeFromEmbeddedData(); // Initialize from embedded data
        updateCurrentUsernameDisplay();
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
 * NEW: Initial welcome screen with two-button choice (progressive disclosure)
 * This is the entry point for the wizard-style onboarding
 */
function showWelcomeScreen() {
    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.innerHTML = `
        <div class="welcome-wizard">
            <div class="welcome-header">
                <h1>📊 AP Statistics Consensus Quiz</h1>
                <p class="subtitle">Collaborative Learning Platform</p>
            </div>

            <div class="welcome-message">
                <p>Welcome! Let's get you started.</p>
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
 */
function loadRecentUsernamesOnWelcome() {
    const recentUsers = getRecentUsernames();

    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernamesWelcome');
        const list = document.getElementById('recentUsernamesListWelcome');

        container.style.display = 'block';
        list.innerHTML = recentUsers.slice(0, 3).map(u => `
            <button onclick="checkExistingData('${u}')" class="recent-username-chip">
                ${u}
            </button>
        `).join('');
    }
}

/**
 * Helper: Load recent usernames for returning student flow
 */
function loadRecentUsernamesForReturning() {
    const recentUsers = getRecentUsernames();

    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernamesReturning');
        const list = document.getElementById('recentUsernamesListReturning');

        container.style.display = 'block';
        list.innerHTML = recentUsers.map(u => `
            <button onclick="checkExistingData('${u}')" class="recent-username-btn-large">
                ${u}
            </button>
        `).join('');
    }
}

/**
 * Helper: Get recent usernames from localStorage
 * @returns {Array<string>} Array of recent usernames
 */
function getRecentUsernames() {
    const recentUsers = [];

    // Check localStorage for any stored usernames
    for (let key in localStorage) {
        if (key.startsWith('answers_')) {
            const username = key.replace('answers_', '');
            if (username && username !== 'undefined') {
                recentUsers.push(username);
            }
        }
    }

    // Also check class data
    const classData = JSON.parse(localStorage.getItem('classData') || '{}');
    if (classData.users) {
        Object.keys(classData.users).forEach(u => {
            if (!recentUsers.includes(u)) {
                recentUsers.push(u);
            }
        });
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
 * @param {string} name - The username to accept
 */
window.acceptUsername = function(name) {
    currentUsername = name;
    localStorage.setItem('consensusUsername', currentUsername);

    // Save to recent usernames list
    let recentUsernames = JSON.parse(localStorage.getItem('recentUsernames') || '[]');
    if (!recentUsernames.includes(name)) {
        recentUsernames.unshift(name);
        // Keep only last 5 usernames
        recentUsernames = recentUsernames.slice(0, 5);
        localStorage.setItem('recentUsernames', JSON.stringify(recentUsernames));
    }

    initClassData();
    initializeProgressTracking(); // Initialize progress tracking for new session
    showUsernameWelcome();
    initializeFromEmbeddedData();
    updateCurrentUsernameDisplay();

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
 * Checks if a username has existing data in localStorage
 * @param {string} username - Username to check
 */
function checkExistingData(username) {
    const existingData = localStorage.getItem(`answers_${username}`);
    const classData = JSON.parse(localStorage.getItem('classData') || '{}');
    const hasData = existingData || (classData.users && classData.users[username]);

    if (hasData) {
        if (confirm(`Found existing data for ${username}. Would you like to continue with this username and restore your progress?`)) {
            acceptUsername(username);
            showMessage('Welcome back! Your progress has been restored.', 'success');
        }
    } else {
        if (confirm(`No existing data found for ${username}. Would you like to start fresh with this username?`)) {
            acceptUsername(username);
            showMessage('Username set! Starting fresh.', 'info');
        }
    }
}

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
 * Loads and displays recently used usernames from localStorage
 * Checks both answers_ keys and classData for all users on this device
 */
function loadRecentUsernames() {
    const recentUsers = [];

    // Check localStorage for any stored usernames
    for (let key in localStorage) {
        if (key.startsWith('answers_')) {
            const username = key.replace('answers_', '');
            if (username && username !== 'undefined') {
                recentUsers.push(username);
            }
        }
    }

    // Also check class data
    const classData = JSON.parse(localStorage.getItem('classData') || '{}');
    if (classData.users) {
        Object.keys(classData.users).forEach(u => {
            if (!recentUsers.includes(u)) {
                recentUsers.push(u);
            }
        });
    }

    // Display recent usernames if any found
    if (recentUsers.length > 0) {
        const container = document.getElementById('recentUsernames');
        const list = document.getElementById('recentUsernamesList');

        container.style.display = 'block';
        list.innerHTML = recentUsers.map(u => `
            <button onclick="checkExistingData('${u}')" class="recent-username-btn">
                ${u}
            </button>
        `).join('');
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
