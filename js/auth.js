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

/**
 * Normalizes a username to Title_Case format
 * Converts "apple_monkey" or "APPLE_MONKEY" to "Apple_Monkey"
 * This prevents case-sensitivity orphans (same user, different casing)
 * @param {string} username - The username to normalize
 * @returns {string} Normalized username in Title_Case
 */
function normalizeUsername(username) {
    if (!username || typeof username !== 'string') return username;

    // Split by underscore or space, title-case each part, rejoin with underscore
    return username
        .split(/[_\s]+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('_');
}

// Expose for use in other modules
window.normalizeUsername = normalizeUsername;

// ========================================
// USERNAME PROMPTING & SESSION MANAGEMENT
// ========================================

/**
 * Main entry point for username workflow
 * Checks for saved username or shows prompt
 * Now async to support IndexedDB storage
 */
async function promptUsername() {
    // Wait for storage to be ready (acceptUsername also awaits it; harmless).
    await waitForStorage();

    // ROSTER-ONLY identity (hard cutover, 2026-06): the roster account is the
    // SINGLE source of truth, shared cross-app via the apstats_roster.v1 key.
    // curriculum_render and the Roadmap are the SAME ORIGIN
    // (robjohncolson.github.io), so a Desk sign-in is already visible here.
    // If a roster session exists, adopt its username automatically; otherwise
    // require roster sign-in. The legacy manual / random / dropdown
    // consensusUsername onboarding is retired (this year's ad-hoc usernames are
    // deprecated -- the roster name is now the only identity).
    const roster = (window.rosterClient && typeof window.rosterClient.current === 'function')
        ? window.rosterClient.current()
        : null;

    if (roster && roster.username) {
        // acceptUsername sets currentUsername + consensusUsername + IDB meta and
        // boots the session (initClassData / progress / smartSync / persistence).
        // It overwrites any stale local consensusUsername with the authoritative
        // roster username, so the displayed identity always matches the Roadmap.
        await acceptUsername(roster.username);
        return;
    }

    showRosterSignIn();
}

/**
 * LEGACY: Old combined prompt - now replaced by progressive disclosure
 * Kept for backward compatibility, but redirects to new flow
 */
function showUsernamePrompt() {
    // Hard cutover: the only way in is the roster sign-in.
    showRosterSignIn();
}

// ROSTER-ONLY entry screen: sign in with the roster account (same credentials
// as the Roadmap). On success, acceptUsername adopts the roster username as the
// single cr identity. Replaces the retired manual/random/dropdown welcome.
window.showRosterSignIn = function showRosterSignIn() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="welcome-wizard">
            <div class="welcome-header">
                <h1>📊 AP Statistics Consensus Quiz</h1>
                <p class="subtitle">Sign in with your class account</p>
            </div>
            <div class="welcome-message">
                <p>Use the <strong>same username and password</strong> you use on the Roadmap.</p>
            </div>
            <div class="roster-signin-entry" style="max-width:340px;margin:0 auto;text-align:left">
                <label for="rs-username" style="display:block;font-weight:600;margin-bottom:2px">Username</label>
                <input id="rs-username" type="text" autocomplete="username" autocapitalize="none"
                       autocorrect="off" spellcheck="false"
                       style="width:100%;padding:10px;margin:0 0 12px;font-size:16px;box-sizing:border-box" />
                <label for="rs-password" style="display:block;font-weight:600;margin-bottom:2px">Password</label>
                <input id="rs-password" type="password" autocomplete="current-password"
                       style="width:100%;padding:10px;margin:0 0 14px;font-size:16px;box-sizing:border-box" />
                <button id="rs-submit" class="action-button primary extra-large" style="width:100%">Sign in</button>
                <p id="rs-error" role="alert" style="color:#c0392b;min-height:1.2em;margin:8px 0 0"></p>
            </div>
        </div>
    `;

    const userEl = document.getElementById('rs-username');
    const passEl = document.getElementById('rs-password');
    const btnEl = document.getElementById('rs-submit');
    const errEl = document.getElementById('rs-error');

    // Roster dropdown (matches the Desk's typed sign-in): type a name/username ->
    // pick your classmate from the class list -> the input fills with your username.
    if (userEl && window.RosterDropdown) {
        window.RosterDropdown.attach(userEl, { onPick: function () { if (passEl) passEl.focus(); } });
    }

    async function submit() {
        const username = (userEl && userEl.value || '').trim();
        // Password intentionally NOT trimmed -- edge whitespace can be valid.
        const password = (passEl && passEl.value || '');
        if (!username || !password) {
            if (errEl) errEl.textContent = 'Enter both your username and password.';
            return;
        }
        if (!(window.rosterClient && typeof window.rosterClient.signIn === 'function')) {
            if (errEl) errEl.textContent = 'Sign-in is unavailable right now. Please refresh and try again.';
            return;
        }
        if (btnEl) btnEl.disabled = true;
        if (errEl) errEl.textContent = 'Signing in…';
        let result;
        try {
            result = await window.rosterClient.signIn(username, password);
        } catch (e) {
            result = { ok: false, error: (e && e.message) || 'Network error' };
        }
        if (!result || !result.ok) {
            if (errEl) errEl.textContent = (result && result.error) || 'Sign-in failed.';
            if (btnEl) btnEl.disabled = false;
            return;
        }
        // The roster identity IS the cr identity (hard cutover). acceptUsername
        // sets currentUsername + consensusUsername + IDB meta and boots the
        // session, transitioning out of this sign-in screen into the quiz.
        await acceptUsername(result.username || username);
    }

    if (btnEl) btnEl.addEventListener('click', submit);
    if (passEl) passEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    if (userEl) userEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && passEl) passEl.focus(); });
    if (userEl) { try { userEl.focus(); } catch (_) {} }

    // Guests are retired (2026-06-25): the guest off-ramp link is removed — the quiz
    // app requires a real roster sign-in (typed form / dropdown / name dial).
    // Off-roster students self-sign-up at the Desk (real name), then sign in here.

    // PRIMARY sign-in: open the roster-aligned name-finder dial (↑ ← → ↓) on top
    // of the typed form above, identical to the Desk's Name Finder. The typed
    // form is the FALLBACK — reached via "Type my username instead", closing the
    // dial, or an empty/offline roster (RosterNameFinder.open calls onTypeUsername
    // then). On success, acceptUsername adopts the roster name + boots the quiz
    // (the same transition the typed Sign-in button does). The guest off-ramp
    // stays on the form underneath.
    if (window.RosterNameFinder && window.rosterClient && typeof window.rosterClient.signIn === 'function') {
        const base = window.ROSTER_SERVICE_URL || '';
        window.RosterNameFinder.open({
            rosterUrl: base ? (base + '/roster/section/PeriodX') : '',
            signIn: function (u, p) { return window.rosterClient.signIn(u, p); },
            onSuccess: async function (result, username) { await acceptUsername((result && result.username) || username); },
            onTypeUsername: function () { try { if (userEl) userEl.focus(); } catch (_) {} }
        });
    }
};

/**
 * NEW: Simplified welcome screen with student dropdown
 * Fetches student list from Supabase and shows a dropdown to select name
 */
async function showWelcomeScreen() {
    // Hard cutover (2026-06): the manual welcome / student-picker / random-
    // username onboarding is RETIRED. Any legacy caller routes to the roster
    // sign-in so a non-roster identity can never be minted. (The dead manual
    // flow below is kept to avoid a large, risky deletion; it is unreachable.)
    if (typeof showRosterSignIn === 'function') return showRosterSignIn();

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
 * NEW: Flow for new students - asks for real name first, then generates username
 */
window.showNewStudentFlow = function() {
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="new-student-flow">
            <div class="flow-header">
                <button onclick="showWelcomeScreen()" class="back-button">← Back</button>
                <h2>Create New Account</h2>
            </div>

            <div class="real-name-input-section">
                <p class="input-label">What's your name?</p>
                <input type="text" id="realNameInput" class="real-name-input"
                       placeholder="Enter your first name (e.g., John)"
                       autocomplete="off">
                <p class="input-hint">This helps your teacher identify your work.</p>
            </div>

            <div class="flow-actions">
                <button id="continueWithNameBtn" class="action-button primary large" disabled>
                    Continue →
                </button>
            </div>
        </div>
    `;

    // Set up event listeners
    const nameInput = document.getElementById('realNameInput');
    const continueBtn = document.getElementById('continueWithNameBtn');

    nameInput.addEventListener('input', () => {
        continueBtn.disabled = !nameInput.value.trim();
    });

    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && nameInput.value.trim()) {
            checkNameAndProceed(nameInput.value.trim());
        }
    });

    continueBtn.addEventListener('click', () => {
        const realName = nameInput.value.trim();
        if (realName) {
            checkNameAndProceed(realName);
        }
    });

    // Focus the input
    nameInput.focus();
};

/**
 * Check if the entered name matches an existing student, offer to resume or continue
 */
async function checkNameAndProceed(realName) {
    // Get student list to check for matches
    let students = [];
    if (typeof window.fetchStudentList === 'function') {
        students = await window.fetchStudentList(true);
    }

    // Check for name match (case-insensitive)
    const normalizedInput = realName.toLowerCase().trim();
    const matches = students.filter(s =>
        s.real_name.toLowerCase().trim() === normalizedInput
    );

    if (matches.length > 0) {
        // Found a match - ask if they want to resume or create new
        showNameMatchDialog(realName, matches[0]);
    } else {
        // No match - proceed to username generation
        showUsernameGeneration(realName);
    }
}

/**
 * Show dialog when entered name matches an existing account
 */
function showNameMatchDialog(enteredName, matchedStudent) {
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="new-student-flow">
            <div class="flow-header">
                <button onclick="showNewStudentFlow()" class="back-button">← Back</button>
                <h2>Account Found!</h2>
            </div>

            <div class="name-match-section">
                <p class="match-message">
                    We found an existing account for <strong>"${matchedStudent.real_name}"</strong>.
                </p>
                <p class="match-question">Is this you?</p>
            </div>

            <div class="match-options">
                <button class="action-button primary large" id="resumeAccountBtn">
                    ✅ Yes, resume my account
                </button>
                <button class="action-button secondary large" id="differentPersonBtn">
                    ❌ No, I'm a different ${enteredName}
                </button>
            </div>

            <p class="match-hint" style="margin-top: 20px; text-align: center; color: var(--text-muted, #888);">
                <small>If you're a different person with the same first name, add your last name or initial.</small>
            </p>
        </div>
    `;

    // Set up event listeners
    document.getElementById('resumeAccountBtn').addEventListener('click', () => {
        acceptUsername(matchedStudent.username);
    });

    document.getElementById('differentPersonBtn').addEventListener('click', () => {
        showDifferentNameEntry(enteredName);
    });
}

/**
 * Show form to enter a more specific name (add last name, etc.)
 */
function showDifferentNameEntry(originalName) {
    const questionsContainer = document.getElementById('questionsContainer');

    questionsContainer.innerHTML = `
        <div class="new-student-flow">
            <div class="flow-header">
                <button onclick="showNewStudentFlow()" class="back-button">← Back</button>
                <h2>Add More Detail</h2>
            </div>

            <div class="real-name-input-section">
                <p class="input-label">Please add your last name or initial:</p>
                <input type="text" id="fullNameInput" class="real-name-input"
                       value="${originalName} "
                       placeholder="e.g., ${originalName} Smith or ${originalName} S"
                       autocomplete="off">
                <p class="input-hint">This will help distinguish you from other students with the same first name.</p>
            </div>

            <div class="flow-actions">
                <button id="continueWithFullNameBtn" class="action-button primary large">
                    Continue →
                </button>
            </div>
        </div>
    `;

    const nameInput = document.getElementById('fullNameInput');
    const continueBtn = document.getElementById('continueWithFullNameBtn');

    // Position cursor at end
    nameInput.focus();
    nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);

    continueBtn.addEventListener('click', () => {
        const fullName = nameInput.value.trim();
        if (fullName && fullName !== originalName) {
            // Re-check with the new name
            checkNameAndProceed(fullName);
        } else {
            showMessage('Please add more detail to your name.', 'error');
        }
    });

    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            continueBtn.click();
        }
    });
}

/**
 * Show the username generation screen after name is confirmed
 */
function showUsernameGeneration(realName) {
    const suggestedName = generateRandomUsername();
    const questionsContainer = document.getElementById('questionsContainer');

    // Store the real name for when we create the account
    window._pendingRealName = realName;

    questionsContainer.innerHTML = `
        <div class="new-student-flow">
            <div class="flow-header">
                <button onclick="showNewStudentFlow()" class="back-button">← Back</button>
                <h2>Welcome, ${realName}!</h2>
            </div>

            <div class="username-reveal">
                <p class="reveal-label">Your username is:</p>
                <div class="username-display-large" id="generatedNameLarge">
                    ${suggestedName}
                </div>
                <p class="username-hint">💡 Write this down - you'll need it to restore your progress later!</p>
            </div>

            <div class="flow-actions">
                <button id="acceptUsernameBtn" class="action-button primary extra-large">
                    ✅ Let's Go!
                </button>
                <button onclick="rerollUsernameInFlow()" class="action-button secondary large">
                    🎲 Try Another Name
                </button>
            </div>
        </div>
    `;

    document.getElementById('acceptUsernameBtn').addEventListener('click', () => {
        createNewStudentAccount(suggestedName, realName);
    });
}

/**
 * Create new student account with username and real name
 */
async function createNewStudentAccount(username, realName) {
    // First, add to Supabase users table
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('users')
                .insert([{
                    username: username,
                    real_name: realName,
                    user_type: 'student'
                }]);

            if (error) {
                console.error('Failed to create user in Supabase:', error);
                // Continue anyway - they can still use the app locally
            } else {
                console.log(`✅ Created new user: ${username} (${realName})`);
            }
        } catch (e) {
            console.error('Error creating user:', e);
        }
    }

    // Clear the pending real name
    window._pendingRealName = null;

    // Accept the username and proceed
    acceptUsername(username);
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
    const realName = window._pendingRealName;

    if (displayElement) {
        // Add animation class for smooth transition
        displayElement.style.opacity = '0';
        setTimeout(() => {
            displayElement.textContent = newName;
            displayElement.style.opacity = '1';
        }, 150);

        // Update the accept button to use createNewStudentAccount with the real name
        const acceptButton = document.querySelector('.action-button.primary.extra-large');
        if (acceptButton) {
            acceptButton.onclick = () => createNewStudentAccount(newName, realName);
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
    // Capture the prior identity BEFORE reassigning, to detect a genuine in-session
    // identity SWITCH (HOLE 5, cr identity cheap-win). On a fresh load currentUsername
    // is null (index.html), so this only trips on a real switch — never a same-user reload.
    const _prevUsername = currentUsername;
    // Normalize username to Title_Case to prevent case-sensitivity orphans
    currentUsername = normalizeUsername(name);
    const _identitySwitched = !!(_prevUsername && _prevUsername !== currentUsername);

    // Guests are retired (2026-06-25): a real roster sign-in is the only path that
    // reaches acceptUsername, so always CLEAR any stale cross-app guest flag — never
    // re-set it. (Belt-and-suspenders: no caller supplies a Guest_ username anymore.)
    try { localStorage.removeItem('apstats_guest_active'); } catch (e) {}

    // Save to storage adapter (IDB + localStorage dual-write)
    const storage = await waitForStorage();

    // HOLE 5 (cr identity cheap-win): on a genuine in-session identity SWITCH, evict the
    // stale peer cache. Peers are cached per the PREVIOUS student's perspective (self-
    // filtered for them — omitting their own answers, including the new student's), so the
    // new student must NOT inherit it. Peers live in the 'peerCache' STORE: an IDB object
    // store on the primary / dual-write path (rebuildClassDataView reads it via
    // getAll('peerCache')), mapped to the localStorage 'classData' key only on the
    // localStorage-only adapter. So clear the STORE (the dual-write facade covers both
    // backends) AND remove the raw localStorage 'classData' blob. The new user's OWN answers
    // are durable in the IDB 'answers' store (keyed by username) and are untouched.
    // initClassData() below then rebuilds an empty peer view; pullPeerDataFromSupabase
    // re-pulls fresh. Gated on an actual switch so a normal same-user reload keeps its cache.
    if (_identitySwitched) {
        try { if (typeof storage.clear === 'function') await storage.clear('peerCache'); } catch (e) {}
        try { localStorage.removeItem('classData'); } catch (e) {}
    }
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

    // Restore this student's OWN prior quiz answers from the authoritative roster
    // ledger — the normal sign-in path never hydrates own answers into classData
    // (peer-data self-filters + is turbo-only), so a fresh device / storage wipe
    // showed none of their quiz work. Fire-and-forget; runs on sign-in AND reload.
    if (typeof window.restoreOwnAnswersFromLedger === 'function') {
        window.restoreOwnAnswersFromLedger().catch(function () {});
    }

    // Trigger smart sync to restore from cloud if local is empty
    // This runs AFTER login so currentUsername is set
    if (typeof smartSyncWithSupabase === 'function') {
        smartSyncWithSupabase().catch(err => {
            console.warn('Smart sync after login failed:', err);
        });
    }

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
