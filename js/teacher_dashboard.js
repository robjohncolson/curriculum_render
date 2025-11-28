// teacher_dashboard.js - Teacher Dashboard
// Part of AP Statistics Consensus Quiz
// Dependencies: Railway client, user_management.js
// Provides teacher-only features: roster management, password reset, data export

// ========================================
// CONSTANTS
// ========================================

// MASTER_PASSWORD is defined in user_management.js
// Using window reference to avoid duplicate declaration
const TD_MASTER_PASSWORD = window.MASTER_PASSWORD || 'googly231';

// ========================================
// STATE
// ========================================

let teacherDashboardState = {
  users: [],
  selectedUser: null,
  isLoading: false
};

// ========================================
// MODAL MANAGEMENT
// ========================================

/**
 * Show the Teacher Dashboard modal
 */
function showTeacherDashboard() {
  // Verify teacher mode
  if (!window.isTeacherMode) {
    if (window.showToast) {
      showToast('Teacher access required', 'error');
    }
    return;
  }

  const modal = document.getElementById('teacherDashboardModal');
  if (modal) {
    modal.style.display = 'flex';
    loadTeacherDashboardData();
  }
}

/**
 * Close the Teacher Dashboard modal
 */
function closeTeacherDashboard() {
  const modal = document.getElementById('teacherDashboardModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

/**
 * Load data for the teacher dashboard
 */
async function loadTeacherDashboardData() {
  const content = document.getElementById('teacherDashboardContent');
  if (!content) return;

  content.innerHTML = `
    <div class="td-loading">
      <p>Loading class roster...</p>
    </div>
  `;

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users`);

    if (!response.ok) {
      throw new Error('Failed to fetch users');
    }

    const data = await response.json();
    teacherDashboardState.users = data.users || [];

    renderTeacherDashboard();
  } catch (error) {
    console.error('Failed to load teacher dashboard:', error);
    content.innerHTML = `
      <div class="td-error">
        <p>Failed to load class roster. Please check your internet connection.</p>
        <button class="td-btn td-btn-secondary" onclick="loadTeacherDashboardData()">Retry</button>
      </div>
    `;
  }
}

// ========================================
// RENDERING
// ========================================

/**
 * Render the main teacher dashboard view
 */
function renderTeacherDashboard() {
  const content = document.getElementById('teacherDashboardContent');
  if (!content) return;

  const students = teacherDashboardState.users.filter(u => u.userType === 'student');
  const teachers = teacherDashboardState.users.filter(u => u.userType === 'teacher');

  content.innerHTML = `
    <div class="td-main">
      <div class="td-header">
        <h2>Teacher Dashboard</h2>
        <p>${students.length} students registered</p>
      </div>

      <div class="td-tabs">
        <button class="td-tab td-tab-active" onclick="showTeacherTab('roster')">Class Roster</button>
        <button class="td-tab" onclick="showTeacherTab('data')">Data Management</button>
        <button class="td-tab" onclick="showTeacherTab('import')">Import Roster</button>
      </div>

      <div class="td-tab-content" id="teacherTabContent">
        ${renderRosterTab(students)}
      </div>

      <div class="td-footer">
        <button class="td-btn td-btn-secondary" onclick="closeTeacherDashboard()">Close</button>
        <button class="td-btn td-btn-danger" onclick="exitTeacherMode()">Exit Teacher Mode</button>
      </div>
    </div>
  `;
}

/**
 * Show a specific tab in the dashboard
 */
function showTeacherTab(tabName) {
  // Update tab buttons
  const tabs = document.querySelectorAll('.td-tab');
  tabs.forEach(tab => tab.classList.remove('td-tab-active'));
  event.target.classList.add('td-tab-active');

  // Render tab content
  const tabContent = document.getElementById('teacherTabContent');
  if (!tabContent) return;

  const students = teacherDashboardState.users.filter(u => u.userType === 'student');

  switch (tabName) {
    case 'roster':
      tabContent.innerHTML = renderRosterTab(students);
      break;
    case 'data':
      tabContent.innerHTML = renderDataTab();
      break;
    case 'import':
      tabContent.innerHTML = renderImportTab();
      break;
  }
}

/**
 * Render the class roster tab
 */
function renderRosterTab(students) {
  if (students.length === 0) {
    return `
      <div class="td-empty">
        <p>No students registered yet.</p>
        <p>Students will appear here after they sign in.</p>
      </div>
    `;
  }

  const rows = students.map(student => `
    <tr>
      <td>${escapeHtml(student.realName)}</td>
      <td><code>${student.username}</code></td>
      <td>
        <span class="td-password-status ${student.hasPassword ? 'has-password' : 'no-password'}">
          ${student.hasPassword ? 'Set' : 'Not set'}
        </span>
      </td>
      <td class="td-actions">
        <button class="td-btn-small" onclick="viewStudentPassword('${student.username}')" title="View Password">
          👁
        </button>
        <button class="td-btn-small" onclick="resetStudentPassword('${student.username}')" title="Reset Password">
          🔄
        </button>
        <button class="td-btn-small td-btn-danger-small" onclick="deleteStudent('${student.username}')" title="Delete Student">
          🗑
        </button>
      </td>
    </tr>
  `).join('');

  return `
    <div class="td-roster">
      <table class="td-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Password</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render the data management tab
 */
function renderDataTab() {
  return `
    <div class="td-data">
      <div class="td-data-section">
        <h3>Export Class Data</h3>
        <p>Download all student progress and answers as a backup file.</p>
        <button class="td-btn td-btn-primary" onclick="exportClassDataTeacher()">
          Export Class Data
        </button>
      </div>

      <div class="td-data-section">
        <h3>Import Class Data</h3>
        <p>Restore class data from a previous backup.</p>
        <input type="file" id="importClassDataFile" accept=".json" style="display: none;" onchange="importClassDataTeacher(this.files[0])">
        <button class="td-btn td-btn-secondary" onclick="document.getElementById('importClassDataFile').click()">
          Import Class Data
        </button>
      </div>

      <div class="td-data-section">
        <h3>Sync Status</h3>
        <p>View synchronization status with the cloud server.</p>
        <button class="td-btn td-btn-secondary" onclick="showSyncStatus()">
          View Sync Status
        </button>
      </div>
    </div>
  `;
}

/**
 * Render the import roster tab
 */
function renderImportTab() {
  return `
    <div class="td-import">
      <div class="td-import-section">
        <h3>Import Student Roster</h3>
        <p>Upload a CSV file with student names and usernames.</p>
        <p class="td-hint">Format: <code>real_name,username</code> (one per line)</p>

        <div class="td-import-preview" id="importPreview" style="display: none;">
          <h4>Preview</h4>
          <div id="importPreviewContent"></div>
        </div>

        <input type="file" id="importRosterFile" accept=".csv" style="display: none;" onchange="previewRosterImport(this.files[0])">

        <div class="td-import-actions">
          <button class="td-btn td-btn-secondary" onclick="document.getElementById('importRosterFile').click()">
            Select CSV File
          </button>
          <button class="td-btn td-btn-primary" id="confirmImportBtn" onclick="confirmRosterImport()" style="display: none;">
            Import Students
          </button>
        </div>
      </div>

      <div class="td-import-section">
        <h3>Manual Add Student</h3>
        <div class="td-form-inline">
          <input type="text" id="manualStudentName" placeholder="Student's name">
          <input type="text" id="manualStudentUsername" placeholder="username (optional)">
          <button class="td-btn td-btn-primary" onclick="addStudentManually()">Add</button>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// PASSWORD MANAGEMENT
// ========================================

/**
 * View a student's password
 */
async function viewStudentPassword(username) {
  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users/${username}/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterPassword: TD_MASTER_PASSWORD })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to get password');
    }

    const student = teacherDashboardState.users.find(u => u.username === username);

    alert(`Password for ${student?.realName || username}:\n\n${data.password}`);
  } catch (error) {
    console.error('Failed to view password:', error);
    if (window.showToast) {
      showToast('Failed to view password', 'error');
    }
  }
}

/**
 * Reset a student's password
 */
async function resetStudentPassword(username) {
  const student = teacherDashboardState.users.find(u => u.username === username);
  const newPassword = prompt(`Enter new password for ${student?.realName || username}:`);

  if (newPassword === null) return; // Cancelled

  if (!newPassword.trim()) {
    alert('Password cannot be empty');
    return;
  }

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users/${username}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }

    if (window.showToast) {
      showToast(`Password reset for ${student?.realName}`, 'success');
    }

    // Refresh the roster
    loadTeacherDashboardData();
  } catch (error) {
    console.error('Failed to reset password:', error);
    if (window.showToast) {
      showToast('Failed to reset password', 'error');
    }
  }
}

/**
 * Delete a student
 */
async function deleteStudent(username) {
  const student = teacherDashboardState.users.find(u => u.username === username);

  if (!confirm(`Are you sure you want to delete ${student?.realName || username}?\n\nThis will NOT delete their quiz answers, only their login credentials.`)) {
    return;
  }

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    // Note: We'd need to add a DELETE endpoint for this
    // For now, we'll just show a message
    if (window.showToast) {
      showToast('Delete functionality coming soon', 'info');
    }
  } catch (error) {
    console.error('Failed to delete student:', error);
  }
}

// ========================================
// DATA MANAGEMENT
// ========================================

/**
 * Export class data (teacher version)
 */
async function exportClassDataTeacher() {
  try {
    if (typeof exportMasterData === 'function') {
      await exportMasterData();
    } else {
      throw new Error('Export function not available');
    }
  } catch (error) {
    console.error('Failed to export class data:', error);
    if (window.showToast) {
      showToast('Failed to export class data', 'error');
    }
  }
}

/**
 * Import class data (teacher version)
 */
async function importClassDataTeacher(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (typeof importMasterData === 'function') {
      await importMasterData(data);
      if (window.showToast) {
        showToast('Class data imported successfully', 'success');
      }
    } else {
      throw new Error('Import function not available');
    }
  } catch (error) {
    console.error('Failed to import class data:', error);
    if (window.showToast) {
      showToast('Failed to import class data', 'error');
    }
  }
}

/**
 * Show sync status
 */
function showSyncStatus() {
  if (typeof showSyncModal === 'function') {
    closeTeacherDashboard();
    showSyncModal();
  }
}

// ========================================
// ROSTER IMPORT
// ========================================

let pendingRosterImport = [];

/**
 * Preview roster import from CSV
 */
async function previewRosterImport(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());

    pendingRosterImport = [];
    const previewRows = [];

    for (const line of lines) {
      const parts = line.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        const realName = parts[0];
        const username = parts[1].toLowerCase();

        // Skip header row
        if (realName.toLowerCase() === 'student name' || realName.toLowerCase() === 'name') {
          continue;
        }

        pendingRosterImport.push({ realName, username });
        previewRows.push(`<tr><td>${escapeHtml(realName)}</td><td><code>${escapeHtml(username)}</code></td></tr>`);
      }
    }

    const preview = document.getElementById('importPreview');
    const previewContent = document.getElementById('importPreviewContent');
    const confirmBtn = document.getElementById('confirmImportBtn');

    if (preview && previewContent) {
      previewContent.innerHTML = `
        <table class="td-table td-table-small">
          <thead><tr><th>Name</th><th>Username</th></tr></thead>
          <tbody>${previewRows.slice(0, 10).join('')}</tbody>
        </table>
        ${pendingRosterImport.length > 10 ? `<p>... and ${pendingRosterImport.length - 10} more</p>` : ''}
        <p><strong>Total: ${pendingRosterImport.length} students</strong></p>
      `;
      preview.style.display = 'block';
    }

    if (confirmBtn) {
      confirmBtn.style.display = 'inline-block';
    }
  } catch (error) {
    console.error('Failed to parse CSV:', error);
    if (window.showToast) {
      showToast('Failed to parse CSV file', 'error');
    }
  }
}

/**
 * Confirm and execute roster import
 */
async function confirmRosterImport() {
  if (pendingRosterImport.length === 0) {
    if (window.showToast) {
      showToast('No students to import', 'warning');
    }
    return;
  }

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        users: pendingRosterImport,
        masterPassword: TD_MASTER_PASSWORD
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to import roster');
    }

    if (window.showToast) {
      showToast(`Imported ${data.imported} students`, 'success');
    }

    // Clear preview and refresh
    pendingRosterImport = [];
    document.getElementById('importPreview').style.display = 'none';
    document.getElementById('confirmImportBtn').style.display = 'none';

    loadTeacherDashboardData();
  } catch (error) {
    console.error('Failed to import roster:', error);
    if (window.showToast) {
      showToast('Failed to import roster', 'error');
    }
  }
}

/**
 * Add a student manually
 */
async function addStudentManually() {
  const nameInput = document.getElementById('manualStudentName');
  const usernameInput = document.getElementById('manualStudentUsername');

  const realName = nameInput.value.trim();
  let username = usernameInput.value.trim().toLowerCase();

  if (!realName) {
    if (window.showToast) {
      showToast('Please enter a name', 'warning');
    }
    return;
  }

  // Generate username if not provided
  if (!username) {
    username = generateRandomUsername();
  }

  try {
    const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculum-render-production.up.railway.app';
    const response = await fetch(`${serverUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        realName,
        userType: 'student'
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to add student');
    }

    if (window.showToast) {
      showToast(`Added ${realName} (${username})`, 'success');
    }

    // Clear inputs and refresh
    nameInput.value = '';
    usernameInput.value = '';
    loadTeacherDashboardData();
  } catch (error) {
    console.error('Failed to add student:', error);
    if (window.showToast) {
      showToast(error.message || 'Failed to add student', 'error');
    }
  }
}

// ========================================
// TEACHER MODE
// ========================================

/**
 * Exit teacher mode
 */
function exitTeacherMode() {
  if (confirm('Exit teacher mode? You will need to enter the password again to access teacher features.')) {
    window.isTeacherMode = false;
    userManagementState.isTeacher = false;
    closeTeacherDashboard();
    updateFabMenuForUserType();

    if (window.showToast) {
      showToast('Exited teacher mode', 'info');
    }
  }
}

// ========================================
// HELPERS
// ========================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ========================================
// EXPORTS
// ========================================

window.showTeacherDashboard = showTeacherDashboard;
window.closeTeacherDashboard = closeTeacherDashboard;
window.showTeacherTab = showTeacherTab;
window.viewStudentPassword = viewStudentPassword;
window.resetStudentPassword = resetStudentPassword;
window.deleteStudent = deleteStudent;
window.exportClassDataTeacher = exportClassDataTeacher;
window.importClassDataTeacher = importClassDataTeacher;
window.previewRosterImport = previewRosterImport;
window.confirmRosterImport = confirmRosterImport;
window.addStudentManually = addStudentManually;
window.exitTeacherMode = exitTeacherMode;
window.teacherDashboardState = teacherDashboardState;
