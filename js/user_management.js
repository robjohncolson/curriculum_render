// user_management.js - User Management Modal
// Part of AP Statistics Consensus Quiz
// Dependencies: Railway client must be available for API calls
// Handles user authentication, registration, and password management

// ========================================
// CONSTANTS
// ========================================

const MASTER_PASSWORD = 'googly231';

// ========================================
// STATE
// ========================================

let userManagementState = {
  users: [],           // Cached list of users from server
  selectedUser: null,  // Currently selected user
  isTeacher: false,    // Whether current session is teacher
  currentStep: 'choice' // 'choice', 'existing', 'new', 'teacher', 'password-setup'
};

// ========================================
// MODAL MANAGEMENT
// ========================================

/**
 * Show the User Management modal
 */
function showUserManagementModal() {
  const modal = document.getElementById('userManagementModal');
  if (modal) {
    modal.style.display = 'flex';
    userManagementState.currentStep = 'choice';
    renderUserManagementStep();
    loadUsersList();
  }
}

/**
 * Close the User Management modal
 */
function closeUserManagementModal() {
  const modal = document.getElementById('userManagementModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load the list of users from the server
 */
async function loadUsersList() {
  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users`);

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    userManagementState.users = data.users || [];

    // Re-render if we're on a step that needs the user list
    if (userManagementState.currentStep === 'existing') {
      renderExistingUserStep();
    }
  } catch (error) {
    console.error('Failed to load users list:', error);
    // Show error in the modal
    const content = document.getElementById('userManagementContent');
    if (content && userManagementState.currentStep === 'existing') {
      content.innerHTML = `
        <div class="um-error">
          <p>Failed to load user list. Please check your internet connection.</p>
          <button class="um-btn um-btn-secondary" onclick="loadUsersList()">Retry</button>
          <button class="um-btn um-btn-secondary" onclick="userManagementState.currentStep = 'choice'; renderUserManagementStep();">Back</button>
        </div>
      `;
    }
  }
}

// ========================================
// STEP RENDERING
// ========================================

/**
 * Render the current step of the user management flow
 */
function renderUserManagementStep() {
  switch (userManagementState.currentStep) {
    case 'choice':
      renderChoiceStep();
      break;
    case 'existing':
      renderExistingUserStep();
      break;
    case 'new':
      renderNewUserStep();
      break;
    case 'teacher':
      renderTeacherStep();
      break;
    case 'password-setup':
      renderPasswordSetupStep();
      break;
    default:
      renderChoiceStep();
  }
}

/**
 * Render the initial choice step
 */
function renderChoiceStep() {
  const content = document.getElementById('userManagementContent');
  if (!content) return;

  // Check if user is currently logged in
  const currentUser = window.currentUsername || localStorage.getItem('consensusUsername');
  const isLoggedIn = !!currentUser;

  content.innerHTML = `
    <div class="um-choice-step">
      <h2>${isLoggedIn ? 'Account' : 'Welcome!'}</h2>
      ${isLoggedIn ? `<p class="um-current-user">Signed in as: <strong>${currentUser}</strong></p>` : '<p>How would you like to sign in?</p>'}

      <div class="um-options">
        <button class="um-option-btn" onclick="selectUserType('existing')">
          <span class="um-option-icon"><img src="img/icons/icon_switch_user.png" alt="Switch"></span>
          <span class="um-option-text">${isLoggedIn ? 'Switch User' : 'I\'m an existing student'}</span>
          <span class="um-option-desc">${isLoggedIn ? 'Sign in as a different user' : 'I\'ve used this app before'}</span>
        </button>

        <button class="um-option-btn" onclick="selectUserType('new')">
          <span class="um-option-icon"><img src="img/icons/icon_new_student.png" alt="New"></span>
          <span class="um-option-text">I'm a new student</span>
          <span class="um-option-desc">Create a new account</span>
        </button>

        <button class="um-option-btn um-option-teacher" onclick="selectUserType('teacher')">
          <span class="um-option-icon"><img src="img/icons/icon_teacher_account.png" alt="Teacher"></span>
          <span class="um-option-text">I'm the teacher</span>
          <span class="um-option-desc">Access teacher dashboard</span>
        </button>
      </div>

      <div class="um-bottom-actions">
        ${isLoggedIn ? '<button class="um-btn um-btn-danger" onclick="logoutUser()">Log Out</button>' : ''}
        <button class="um-btn um-btn-text" onclick="closeUserManagementModal()">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Handle user type selection
 */
function selectUserType(type) {
  userManagementState.currentStep = type;
  renderUserManagementStep();
}

/**
 * Render the existing user step (dropdown + password)
 */
function renderExistingUserStep() {
  const content = document.getElementById('userManagementContent');
  if (!content) return;

  const users = userManagementState.users.filter(u => u.userType === 'student');

  const userOptions = users.length > 0
    ? users.map(u => `<option value="${u.username}">${u.realName}</option>`).join('')
    : '<option value="">Loading...</option>';

  content.innerHTML = `
    <div class="um-existing-step">
      <h2>Welcome Back!</h2>
      <p>Select your name and enter your password</p>

      <div class="um-form">
        <div class="um-field">
          <label for="existingUserSelect">Your Name</label>
          <select id="existingUserSelect" onchange="onExistingUserSelect(this.value)">
            <option value="">-- Select your name --</option>
            ${userOptions}
          </select>
        </div>

        <div class="um-field" id="passwordField" style="display: none;">
          <label for="existingPassword">Password</label>
          <input type="password" id="existingPassword" placeholder="Enter your password">
          <p class="um-hint" id="passwordHint"></p>
        </div>

        <div class="um-error" id="existingError" style="display: none;"></div>

        <div class="um-actions">
          <button class="um-btn um-btn-secondary" onclick="selectUserType('choice')">Back</button>
          <button class="um-btn um-btn-primary" id="existingSubmitBtn" onclick="submitExistingUser()" disabled>Sign In</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Handle selection of existing user from dropdown
 */
function onExistingUserSelect(username) {
  const passwordField = document.getElementById('passwordField');
  const submitBtn = document.getElementById('existingSubmitBtn');
  const passwordHint = document.getElementById('passwordHint');

  if (!username) {
    passwordField.style.display = 'none';
    submitBtn.disabled = true;
    userManagementState.selectedUser = null;
    return;
  }

  const user = userManagementState.users.find(u => u.username === username);
  userManagementState.selectedUser = user;

  passwordField.style.display = 'block';
  submitBtn.disabled = false;

  if (user && !user.hasPassword) {
    passwordHint.textContent = "You haven't set a password yet. You'll create one now.";
    passwordHint.style.display = 'block';
  } else {
    passwordHint.style.display = 'none';
  }
}

/**
 * Submit existing user login
 */
async function submitExistingUser() {
  const username = document.getElementById('existingUserSelect').value;
  const password = document.getElementById('existingPassword').value;
  const errorDiv = document.getElementById('existingError');
  const submitBtn = document.getElementById('existingSubmitBtn');

  if (!username) {
    errorDiv.textContent = 'Please select your name';
    errorDiv.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';
  errorDiv.style.display = 'none';

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Authentication failed');
    }

    if (data.needsPasswordSetup) {
      // User needs to set up a password
      userManagementState.currentStep = 'password-setup';
      renderUserManagementStep();
      return;
    }

    // Success! Log the user in
    await loginAsUser(data.user);

  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
}

/**
 * Render the new user registration step
 */
function renderNewUserStep() {
  const content = document.getElementById('userManagementContent');
  if (!content) return;

  // Generate a random username
  const suggestedUsername = generateRandomUsername();

  content.innerHTML = `
    <div class="um-new-step">
      <h2>Create Your Account</h2>
      <p>Your unique username has been generated</p>

      <div class="um-form">
        <div class="um-field">
          <label>Your Username</label>
          <div class="um-username-generator">
            <div class="um-generated-username" id="umGeneratedUsername">${suggestedUsername}</div>
            <button type="button" class="um-reroll-btn" onclick="rerollUsernameInModal()" title="Generate new username">🎲</button>
          </div>
          <p class="um-hint">This is your unique ID - write it down!</p>
        </div>

        <div class="um-field">
          <label for="newUserName">Your Real Name</label>
          <input type="text" id="newUserName" placeholder="e.g., John Smith" autocomplete="name">
          <p class="um-hint">Only visible to your teacher</p>
        </div>

        <div class="um-field">
          <label for="newUserPassword">Create a Password</label>
          <input type="password" id="newUserPassword" placeholder="Choose a password" autocomplete="new-password">
        </div>

        <div class="um-field">
          <label for="newUserPasswordConfirm">Confirm Password</label>
          <input type="password" id="newUserPasswordConfirm" placeholder="Confirm your password" autocomplete="new-password">
        </div>

        <div class="um-error" id="newError" style="display: none;"></div>

        <div class="um-actions">
          <button class="um-btn um-btn-secondary" onclick="selectUserType('choice')">Back</button>
          <button class="um-btn um-btn-primary" onclick="submitNewUser()">Create Account</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Reroll username in the modal
 */
function rerollUsernameInModal() {
  const usernameEl = document.getElementById('umGeneratedUsername');
  if (usernameEl) {
    usernameEl.style.opacity = '0';
    setTimeout(() => {
      usernameEl.textContent = generateRandomUsername();
      usernameEl.style.opacity = '1';
    }, 150);
  }
}

window.rerollUsernameInModal = rerollUsernameInModal;

/**
 * Submit new user registration
 */
async function submitNewUser() {
  const usernameEl = document.getElementById('umGeneratedUsername');
  const realName = document.getElementById('newUserName').value.trim();
  const password = document.getElementById('newUserPassword').value;
  const passwordConfirm = document.getElementById('newUserPasswordConfirm').value;
  const errorDiv = document.getElementById('newError');

  // Get the username from the display (user may have rerolled it)
  const username = usernameEl ? usernameEl.textContent.trim() : generateRandomUsername();

  // Validation
  if (!realName) {
    errorDiv.textContent = 'Please enter your name';
    errorDiv.style.display = 'block';
    return;
  }

  if (realName.length < 2) {
    errorDiv.textContent = 'Name must be at least 2 characters';
    errorDiv.style.display = 'block';
    return;
  }

  if (!password) {
    errorDiv.textContent = 'Please create a password';
    errorDiv.style.display = 'block';
    return;
  }

  if (password.length < 4) {
    errorDiv.textContent = 'Password must be at least 4 characters';
    errorDiv.style.display = 'block';
    return;
  }

  if (password !== passwordConfirm) {
    errorDiv.textContent = 'Passwords do not match';
    errorDiv.style.display = 'block';
    return;
  }

  errorDiv.style.display = 'none';

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        realName,
        password,
        userType: 'student'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create account');
    }

    // Success! Log the user in
    await loginAsUser(data.user);

    if (window.showToast) {
      showToast(`Welcome, ${realName}! Your username is ${username}`, 'success', 5000);
    }

  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

/**
 * Render the password setup step (for existing users without password)
 */
function renderPasswordSetupStep() {
  const content = document.getElementById('userManagementContent');
  if (!content) return;

  const user = userManagementState.selectedUser;

  content.innerHTML = `
    <div class="um-password-setup-step">
      <h2>Set Up Your Password</h2>
      <p>Hi ${user?.realName || 'there'}! Create a password to secure your account.</p>

      <div class="um-form">
        <div class="um-field">
          <label for="setupPassword">Create a Password</label>
          <input type="password" id="setupPassword" placeholder="Choose a password you'll remember">
        </div>

        <div class="um-field">
          <label for="setupPasswordConfirm">Confirm Password</label>
          <input type="password" id="setupPasswordConfirm" placeholder="Type your password again">
        </div>

        <div class="um-error" id="setupError" style="display: none;"></div>

        <div class="um-actions">
          <button class="um-btn um-btn-secondary" onclick="selectUserType('existing')">Back</button>
          <button class="um-btn um-btn-primary" onclick="submitPasswordSetup()">Set Password</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Submit password setup for existing user
 */
async function submitPasswordSetup() {
  const password = document.getElementById('setupPassword').value;
  const passwordConfirm = document.getElementById('setupPasswordConfirm').value;
  const errorDiv = document.getElementById('setupError');

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

  errorDiv.style.display = 'none';

  const user = userManagementState.selectedUser;
  if (!user) {
    errorDiv.textContent = 'No user selected';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users/${user.username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to set password');
    }

    // Success! Log the user in
    await loginAsUser(data.user);

  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

/**
 * Render the teacher login step
 */
function renderTeacherStep() {
  const content = document.getElementById('userManagementContent');
  if (!content) return;

  content.innerHTML = `
    <div class="um-teacher-step">
      <h2>Teacher Access</h2>
      <p>Enter the teacher password to continue</p>

      <div class="um-form">
        <div class="um-field">
          <label for="teacherPassword">Teacher Password</label>
          <input type="password" id="teacherPassword" placeholder="Enter teacher password">
        </div>

        <div class="um-error" id="teacherError" style="display: none;"></div>

        <div class="um-actions">
          <button class="um-btn um-btn-secondary" onclick="selectUserType('choice')">Back</button>
          <button class="um-btn um-btn-primary" onclick="submitTeacherLogin()">Access Dashboard</button>
        </div>
      </div>
    </div>
  `;

  // Focus the password field
  setTimeout(() => {
    document.getElementById('teacherPassword')?.focus();
  }, 100);
}

/**
 * Submit teacher login
 */
function submitTeacherLogin() {
  const password = document.getElementById('teacherPassword').value;
  const errorDiv = document.getElementById('teacherError');

  if (password !== MASTER_PASSWORD) {
    errorDiv.textContent = 'Invalid teacher password';
    errorDiv.style.display = 'block';
    return;
  }

  // Success! Set teacher mode and show dashboard
  userManagementState.isTeacher = true;
  window.isTeacherMode = true;

  closeUserManagementModal();
  showTeacherDashboard();

  if (window.showToast) {
    showToast('Teacher mode activated', 'success');
  }

  // Update FAB menu to show teacher options
  updateFabMenuForUserType();
}

// ========================================
// LOGIN & SESSION
// ========================================

/**
 * Log in as a specific user
 */
async function loginAsUser(user) {
  // Set the current username globally
  currentUsername = user.username;
  window.currentUsername = user.username;

  // Store in IndexedDB and localStorage
  await AppDB.setStoredUsername(user.username);

  // Store user info for display
  localStorage.setItem('currentUserRealName', user.realName);
  localStorage.setItem('currentUserType', user.userType);

  // Initialize class data
  await initClassData();
  initializeProgressTracking();

  // Update UI
  updateCurrentUsernameDisplay();
  closeUserManagementModal();

  // Refresh the page content
  if (typeof initializeFromEmbeddedData === 'function') {
    initializeFromEmbeddedData();
  }

  if (window.showToast) {
    showToast(`Welcome, ${user.realName}!`, 'success');
  }

  // Update FAB menu
  updateFabMenuForUserType();
}

/**
 * Update the FAB menu and sync modal based on user type
 */
function updateFabMenuForUserType() {
  const teacherDashboardBtn = document.getElementById('fabTeacherDashboard');
  const teacherActionsSection = document.getElementById('teacherActionsSection');

  if (teacherDashboardBtn) {
    if (window.isTeacherMode) {
      teacherDashboardBtn.style.display = 'flex';
    } else {
      teacherDashboardBtn.style.display = 'none';
    }
  }

  // Also show/hide teacher actions in sync modal
  if (teacherActionsSection) {
    if (window.isTeacherMode) {
      teacherActionsSection.style.display = 'block';
    } else {
      teacherActionsSection.style.display = 'none';
    }
  }
}

/**
 * Get the current user's real name
 */
function getCurrentUserRealName() {
  return localStorage.getItem('currentUserRealName') || currentUsername || 'Student';
}

/**
 * Log out the current user and return to onboarding screen
 */
async function logoutUser() {
  // Confirm logout
  if (!confirm('Are you sure you want to log out? You will need to sign in again.')) {
    return;
  }

  // Clear username from storage
  localStorage.removeItem('consensusUsername');
  localStorage.removeItem('currentUserRealName');
  localStorage.removeItem('currentUserType');

  // Clear from IndexedDB
  if (window.AppDB && typeof AppDB.setStoredUsername === 'function') {
    await AppDB.setStoredUsername(null);
  }

  // Reset global state
  window.currentUsername = null;
  if (typeof currentUsername !== 'undefined') {
    currentUsername = null;
  }

  // Reset teacher mode
  window.isTeacherMode = false;
  userManagementState.isTeacher = false;

  // Close the modal
  closeUserManagementModal();

  // Show the onboarding/welcome screen
  if (typeof showWelcomeScreen === 'function') {
    showWelcomeScreen();
  } else {
    // Fallback: reload the page
    window.location.reload();
  }

  if (window.showToast) {
    showToast('You have been logged out', 'info');
  }
}

window.logoutUser = logoutUser;

// ========================================
// EXPORTS
// ========================================

window.showUserManagementModal = showUserManagementModal;
window.closeUserManagementModal = closeUserManagementModal;
window.selectUserType = selectUserType;
window.onExistingUserSelect = onExistingUserSelect;
window.submitExistingUser = submitExistingUser;
window.submitNewUser = submitNewUser;
window.submitPasswordSetup = submitPasswordSetup;
window.submitTeacherLogin = submitTeacherLogin;
window.updateFabMenuForUserType = updateFabMenuForUserType;
window.getCurrentUserRealName = getCurrentUserRealName;
window.userManagementState = userManagementState;
