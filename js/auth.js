// auth.js - User authentication and management functions
// Part of AP Statistics Consensus Quiz
// Dependencies: Must be loaded after db.js and data_manager.js
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
 * NOTE: This is now called from startApp() after initDB()
 * @returns {Promise<void>}
 */
async function promptUsername() {
    // Get username from IndexedDB
    const savedUsername = await AppDB.getStoredUsername();

    if (savedUsername) {
        currentUsername = savedUsername;

        // Check if we have local data
        const localAnswerCount = await AppDB.getUserAnswerCount(currentUsername);

        // If local data is empty, try cloud restore
        if (localAnswerCount === 0 && window.USE_RAILWAY && window.RestoreUI) {
            await attemptCloudRestore(currentUsername);
        }

        await initClassData();
        initializeProgressTracking();
        showUsernameWelcome();
        initializeFromEmbeddedData();
        updateCurrentUsernameDisplay();
    } else {
        showUsernamePrompt();
    }
}

/**
 * Attempts to restore user data from Railway/cloud
 * Shows restore modal with progress
 * @param {string} username - Username to restore data for
 * @returns {Promise<boolean>} True if restore succeeded
 */
async function attemptCloudRestore(username) {
    if (!window.railwayClient || typeof window.railwayClient.fetchUserData !== 'function') {
        console.log('Railway client not available for cloud restore');
        return false;
    }

    RestoreUI.show();
    RestoreUI.setProgress(10, 'Connecting to cloud...');

    try {
        const cloudData = await window.railwayClient.fetchUserData(username);

        if (cloudData && Object.keys(cloudData.answers || {}).length > 0) {
            RestoreUI.setProgress(50, 'Restoring your answers...');

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

            // Merge cloud data
            Object.assign(classData.users[username], cloudData);

            // Save to IndexedDB
            await AppDB.saveUserData(username);

            const answerCount = Object.keys(cloudData.answers || {}).length;
            RestoreUI.complete(answerCount);

            if (window.showToast) {
                showToast('Your data has been restored!', 'success');
            }

            return true;
        } else {
            RestoreUI.noData();
            return false;
        }
    } catch (e) {
        console.warn('Cloud restore failed:', e);
        RestoreUI.error('Could not reach cloud. Your data may sync later.');
        setTimeout(() => RestoreUI.hide(), 3000);
        return false;
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
 * NEW: Initial welcome screen with three-button choice
 * Styled to match the user management modal
 */
function showWelcomeScreen() {
    // Ensure no Study Buddy room is active on the welcome/onboarding screen
    if (typeof destroyStudyBuddyRoom === 'function') {
        destroyStudyBuddyRoom();
    }

    const questionsContainer = document.getElementById('questionsContainer');
    questionsContainer.innerHTML = `
        <div class="onboarding-container">
            <div class="onboarding-card">
                <div class="onboarding-header">
                    <h1><img src="img/icons/icon_stats.png" alt="" class="header-icon"> AP Statistics Consensus Quiz</h1>
                    <p class="onboarding-subtitle">Collaborative Learning Platform</p>
                </div>

                <div class="onboarding-content">
                    <p class="onboarding-prompt">Welcome! How would you like to get started?</p>

                    <div class="onboarding-options">
                        <button onclick="showNewStudentFlow()" class="onboarding-option-btn">
                            <span class="option-icon"><img src="img/icons/icon_new_student.png" alt="New"></span>
                            <span class="option-text">
                                <strong>I'm a New Student</strong>
                                <small>Create a new account</small>
                            </span>
                        </button>

                        <button onclick="showReturningStudentFlow()" class="onboarding-option-btn">
                            <span class="option-icon"><img src="img/icons/icon_switch_user.png" alt="Returning"></span>
                            <span class="option-text">
                                <strong>I'm a Returning Student</strong>
                                <small>Sign in to my account</small>
                            </span>
                        </button>

                        <button onclick="showTeacherLoginFlow()" class="onboarding-option-btn teacher-option">
                            <span class="option-icon"><img src="img/icons/icon_teacher_account.png" alt="Teacher"></span>
                            <span class="option-text">
                                <strong>I'm a Teacher</strong>
                                <small>Access teacher dashboard</small>
                            </span>
                        </button>
                    </div>
                </div>

                <div class="onboarding-footer">
                    <p class="onboarding-hint">Your progress is saved automatically</p>
                </div>
            </div>
        </div>
    `;
}

/**
 * NEW: Flow for new students - username generation + real name + password
 */
window.showNewStudentFlow = function() {
    const suggestedName = generateRandomUsername();
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="onboarding-container">
            <div class="onboarding-card">
                <div class="onboarding-header">
                    <button onclick="showWelcomeScreen()" class="onboarding-back-btn">← Back</button>
                    <h2>New Student Registration</h2>
                </div>

                <div class="onboarding-content">
                    <div class="onboarding-form-section">
                        <label class="onboarding-label">Your Username</label>
                        <div class="username-generator-row">
                            <div class="generated-username" id="generatedNameLarge">${suggestedName}</div>
                            <button type="button" onclick="rerollUsernameInFlow()" class="reroll-btn" title="Generate new username">🎲</button>
                        </div>
                        <p class="onboarding-field-hint">This is your unique ID - write it down!</p>
                    </div>

                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="newStudentRealName">Your Real Name</label>
                        <input type="text" id="newStudentRealName" class="onboarding-input" placeholder="e.g., John Smith" autocomplete="name">
                        <p class="onboarding-field-hint">Only visible to your teacher</p>
                    </div>

                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="newStudentPassword">Create a Password</label>
                        <input type="password" id="newStudentPassword" class="onboarding-input" placeholder="Choose a password" autocomplete="new-password">
                        <p class="onboarding-field-hint">You'll need this to sign in on other devices</p>
                    </div>

                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="newStudentPasswordConfirm">Confirm Password</label>
                        <input type="password" id="newStudentPasswordConfirm" class="onboarding-input" placeholder="Confirm your password" autocomplete="new-password">
                    </div>

                    <div id="newStudentError" class="onboarding-error" style="display: none;"></div>

                    <button onclick="submitNewStudentRegistration()" class="onboarding-submit-btn">
                        Create Account
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * NEW: Flow for returning students - sign in with username + password
 */
window.showReturningStudentFlow = async function() {
    const questionsContainer = document.getElementById('questionsContainer');

    // Get list of known users from cloud
    let knownUsers = [];
    try {
        if (window.USE_RAILWAY && window.RAILWAY_SERVER_URL) {
            const response = await fetch(`${window.RAILWAY_SERVER_URL}/api/users`);
            if (response.ok) {
                const data = await response.json();
                knownUsers = data.users || [];
            }
        }
    } catch (e) {
        console.log('Could not fetch user list from server');
    }

    // Build user options HTML
    let userOptionsHtml = '<option value="">-- Select your username --</option>';
    if (knownUsers.length > 0) {
        knownUsers.sort((a, b) => a.username.localeCompare(b.username));
        knownUsers.forEach(user => {
            userOptionsHtml += `<option value="${user.username}">${user.username}</option>`;
        });
    }

    questionsContainer.innerHTML = `
        <div class="onboarding-container">
            <div class="onboarding-card">
                <div class="onboarding-header">
                    <button onclick="showWelcomeScreen()" class="onboarding-back-btn">← Back</button>
                    <h2>Welcome Back!</h2>
                </div>

                <div class="onboarding-content">
                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="returningUsername">Your Username</label>
                        ${knownUsers.length > 0 ? `
                            <select id="returningUsername" class="onboarding-select">
                                ${userOptionsHtml}
                            </select>
                            <p class="onboarding-field-hint">Or type your username below if not listed</p>
                            <input type="text" id="returningUsernameManual" class="onboarding-input" placeholder="Type username manually..." style="margin-top: 8px;">
                        ` : `
                            <input type="text" id="returningUsernameManual" class="onboarding-input" placeholder="Enter your username (e.g., Apple_Tiger)">
                        `}
                    </div>

                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="returningPassword">Password</label>
                        <input type="password" id="returningPassword" class="onboarding-input" placeholder="Enter your password" autocomplete="current-password">
                    </div>

                    <div id="returningStudentError" class="onboarding-error" style="display: none;"></div>

                    <button onclick="submitReturningStudentLogin()" class="onboarding-submit-btn">
                        Sign In
                    </button>

                    <div class="onboarding-divider">
                        <span>or</span>
                    </div>

                    <button onclick="showRestoreOptionsModal()" class="onboarding-secondary-btn">
                        Restore from Backup File
                    </button>
                </div>
            </div>
        </div>
    `;
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
    } else {
        // Fallback
        showNewStudentFlow();
    }
}

/**
 * Submit new student registration
 */
window.submitNewStudentRegistration = async function() {
    const username = document.getElementById('generatedNameLarge').textContent.trim();
    const realName = document.getElementById('newStudentRealName').value.trim();
    const password = document.getElementById('newStudentPassword').value;
    const passwordConfirm = document.getElementById('newStudentPasswordConfirm').value;
    const errorDiv = document.getElementById('newStudentError');

    // Validation
    if (!realName) {
        errorDiv.textContent = 'Please enter your real name';
        errorDiv.style.display = 'block';
        return;
    }

    if (!password) {
        errorDiv.textContent = 'Please create a password';
        errorDiv.style.display = 'block';
        return;
    }

    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }

    if (password.length < 4) {
        errorDiv.textContent = 'Password must be at least 4 characters';
        errorDiv.style.display = 'block';
        return;
    }

    errorDiv.style.display = 'none';

    try {
        // Register user with Railway server
        if (window.USE_RAILWAY && window.RAILWAY_SERVER_URL) {
            const response = await fetch(`${window.RAILWAY_SERVER_URL}/api/users`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    real_name: realName,
                    password: password,
                    user_type: 'student'
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Registration failed');
            }
        }

        // Store password locally
        localStorage.setItem(`password_${username}`, password);
        localStorage.setItem('currentUserRealName', realName);

        // Accept the username (this sets up the session)
        await acceptUsername(username);

        if (window.showToast) {
            showToast(`Welcome, ${realName}!`, 'success');
        }

    } catch (error) {
        console.error('Registration error:', error);
        errorDiv.textContent = error.message || 'Registration failed. Please try again.';
        errorDiv.style.display = 'block';
    }
}

/**
 * Submit returning student login
 */
window.submitReturningStudentLogin = async function() {
    const selectEl = document.getElementById('returningUsername');
    const manualInput = document.getElementById('returningUsernameManual');
    const password = document.getElementById('returningPassword').value;
    const errorDiv = document.getElementById('returningStudentError');

    // Get username from select or manual input
    let username = '';
    if (selectEl && selectEl.value) {
        username = selectEl.value;
    } else if (manualInput && manualInput.value.trim()) {
        username = manualInput.value.trim();
    }

    // Validation
    if (!username) {
        errorDiv.textContent = 'Please select or enter your username';
        errorDiv.style.display = 'block';
        return;
    }

    if (!password) {
        errorDiv.textContent = 'Please enter your password';
        errorDiv.style.display = 'block';
        return;
    }

    errorDiv.style.display = 'none';

    try {
        // Verify password with Railway server
        if (window.USE_RAILWAY && window.RAILWAY_SERVER_URL) {
            const response = await fetch(`${window.RAILWAY_SERVER_URL}/api/users/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok || !data.valid) {
                throw new Error('Invalid username or password');
            }

            // Store real name if returned
            if (data.user && data.user.real_name) {
                localStorage.setItem('currentUserRealName', data.user.real_name);
            }
        } else {
            // Fallback: check local password
            const storedPassword = localStorage.getItem(`password_${username}`);
            if (storedPassword && storedPassword !== password) {
                throw new Error('Invalid password');
            }
        }

        // Store password locally
        localStorage.setItem(`password_${username}`, password);

        // Accept the username (this sets up the session)
        await acceptUsername(username);

        if (window.showToast) {
            showToast(`Welcome back!`, 'success');
        }

    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed. Please try again.';
        errorDiv.style.display = 'block';
    }
}

/**
 * Teacher login flow from onboarding
 */
window.showTeacherLoginFlow = function() {
    const questionsContainer = document.getElementById('questionsContainer');
    const MASTER_PASSWORD = window.MASTER_PASSWORD || 'googly231';

    questionsContainer.innerHTML = `
        <div class="onboarding-container">
            <div class="onboarding-card">
                <div class="onboarding-header">
                    <button onclick="showWelcomeScreen()" class="onboarding-back-btn">← Back</button>
                    <h2>Teacher Login</h2>
                </div>

                <div class="onboarding-content">
                    <div class="onboarding-form-section">
                        <label class="onboarding-label" for="teacherPassword">Teacher Password</label>
                        <input type="password" id="teacherPassword" class="onboarding-input" placeholder="Enter teacher password" autocomplete="current-password">
                    </div>

                    <div id="teacherLoginError" class="onboarding-error" style="display: none;"></div>

                    <button onclick="submitTeacherLoginFromOnboarding()" class="onboarding-submit-btn">
                        Access Dashboard
                    </button>
                </div>
            </div>
        </div>
    `;

    // Focus password field
    setTimeout(() => {
        const passwordField = document.getElementById('teacherPassword');
        if (passwordField) passwordField.focus();
    }, 100);
}

/**
 * Submit teacher login from onboarding
 */
window.submitTeacherLoginFromOnboarding = async function() {
    const password = document.getElementById('teacherPassword').value;
    const errorDiv = document.getElementById('teacherLoginError');
    const MASTER_PASSWORD = window.MASTER_PASSWORD || 'googly231';

    if (!password) {
        errorDiv.textContent = 'Please enter the teacher password';
        errorDiv.style.display = 'block';
        return;
    }

    if (password !== MASTER_PASSWORD) {
        errorDiv.textContent = 'Invalid teacher password';
        errorDiv.style.display = 'block';
        return;
    }

    errorDiv.style.display = 'none';

    // Set teacher mode
    window.isTeacherMode = true;
    if (window.userManagementState) {
        window.userManagementState.isTeacher = true;
    }

    // Create a teacher username if none exists
    const teacherUsername = 'Teacher_Admin';
    await acceptUsername(teacherUsername);

    // Update UI for teacher mode
    if (typeof updateFabMenuForUserType === 'function') {
        updateFabMenuForUserType();
    }

    if (window.showToast) {
        showToast('Welcome, Teacher!', 'success');
    }

    // Show the teacher dashboard
    if (typeof showTeacherDashboard === 'function') {
        setTimeout(() => showTeacherDashboard(), 500);
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
 * Helper: Get recent usernames from in-memory classData and localStorage
 * @returns {Array<string>} Array of recent usernames
 */
function getRecentUsernames() {
    const recentUsers = [];

    // First check in-memory classData (backed by IndexedDB)
    if (classData && classData.users) {
        Object.keys(classData.users).forEach(u => {
            if (u && u !== 'undefined' && !recentUsers.includes(u)) {
                recentUsers.push(u);
            }
        });
    }

    // Also check localStorage for legacy data (answers_ keys)
    for (let key in localStorage) {
        if (key.startsWith('answers_')) {
            const username = key.replace('answers_', '');
            if (username && username !== 'undefined' && !recentUsers.includes(username)) {
                recentUsers.push(username);
            }
        }
    }

    // Also check saved recent usernames list
    try {
        const savedRecent = JSON.parse(localStorage.getItem('recentUsernames') || '[]');
        savedRecent.forEach(u => {
            if (u && !recentUsers.includes(u)) {
                recentUsers.push(u);
            }
        });
    } catch (e) {
        // Ignore parse errors
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
window.acceptUsername = async function(name) {
    currentUsername = name;

    // Save to IndexedDB
    await AppDB.setStoredUsername(currentUsername);

    // Also keep in localStorage for backward compatibility / quick access
    localStorage.setItem('consensusUsername', currentUsername);

    // Save to recent usernames list (kept in localStorage for simplicity)
    let recentUsernames = JSON.parse(localStorage.getItem('recentUsernames') || '[]');
    if (!recentUsernames.includes(name)) {
        recentUsernames.unshift(name);
        // Keep only last 5 usernames
        recentUsernames = recentUsernames.slice(0, 5);
        localStorage.setItem('recentUsernames', JSON.stringify(recentUsernames));
    }

    await initClassData();
    initializeProgressTracking();
    showUsernameWelcome();
    initializeFromEmbeddedData();
    updateCurrentUsernameDisplay();

    // Show success toast
    if (window.showToast) {
        showToast(`Welcome, ${name}!`, 'success');
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
 * Checks if a username has existing data in IndexedDB or in-memory classData
 * @param {string} username - Username to check
 */
async function checkExistingData(username) {
    // Check IndexedDB for existing user
    const hasData = await AppDB.userExists(username) ||
                   (classData.users && classData.users[username]);

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
