// toast.js - Toast notification system
// Part of AP Statistics Consensus Quiz
// Dependencies: None (standalone)
// Shows brief, non-intrusive notifications for save/sync events

// ========================================
// TOAST NOTIFICATIONS
// ========================================

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} [type='info'] - Type: 'success', 'info', 'warning', 'error'
 * @param {number} [duration=3000] - Duration in milliseconds
 */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) {
    console.warn('Toast container not found');
    return;
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    info: 'ℹ',
    warning: '⚠',
    error: '✕'
  };

  const icon = icons[type] || icons.info;

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger reflow for animation
  toast.offsetHeight;

  // Remove after duration
  setTimeout(() => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300); // Match CSS animation duration
  }, duration);

  // Allow manual dismiss by clicking
  toast.addEventListener('click', () => {
    toast.classList.add('toast-hiding');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 300);
  });

  return toast;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Clear all toasts
 */
function clearAllToasts() {
  const container = document.getElementById('toastContainer');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Show a success toast (convenience wrapper)
 * @param {string} message - The message to display
 */
function showSuccessToast(message) {
  showToast(message, 'success');
}

/**
 * Show an error toast (convenience wrapper)
 * @param {string} message - The message to display
 */
function showErrorToast(message) {
  showToast(message, 'error', 5000); // Errors stay longer
}

// Export for global access
window.showToast = showToast;
window.clearAllToasts = clearAllToasts;
window.showSuccessToast = showSuccessToast;
window.showErrorToast = showErrorToast;
