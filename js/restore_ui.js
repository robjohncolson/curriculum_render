// restore_ui.js - Restore progress modal controller
// Part of AP Statistics Consensus Quiz
// Dependencies: None (standalone)
// Shows progress when restoring data from cloud after local storage loss

// ========================================
// RESTORE UI CONTROLLER
// ========================================

const RestoreUI = {
  _isVisible: false,

  /**
   * Show the restore modal
   */
  show() {
    const modal = document.getElementById('restoreModal');
    if (modal) {
      modal.style.display = 'flex';
      this._isVisible = true;

      // Reset to initial state
      this.setProgress(0, 'Preparing to restore your data...');
      const icon = modal.querySelector('.restore-icon');
      if (icon) icon.textContent = '🔄';
    }
  },

  /**
   * Hide the restore modal
   */
  hide() {
    const modal = document.getElementById('restoreModal');
    if (modal) {
      modal.style.display = 'none';
      this._isVisible = false;
    }
  },

  /**
   * Check if the modal is currently visible
   * @returns {boolean}
   */
  isVisible() {
    return this._isVisible;
  },

  /**
   * Update the progress bar and message
   * @param {number} percent - Progress percentage (0-100)
   * @param {string} [message] - Optional message to display
   */
  setProgress(percent, message = null) {
    const fill = document.querySelector('.restore-progress-fill');
    const text = document.querySelector('.restore-progress-text');
    const msg = document.querySelector('.restore-message');

    if (fill) {
      fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }

    if (text) {
      text.textContent = `${Math.round(percent)}%`;
    }

    if (msg && message) {
      msg.textContent = message;
    }
  },

  /**
   * Show completion state and auto-hide
   * @param {number} answerCount - Number of answers restored
   */
  complete(answerCount) {
    const icon = document.querySelector('#restoreModal .restore-icon');
    if (icon) icon.textContent = '✅';

    const plural = answerCount === 1 ? 'answer' : 'answers';
    this.setProgress(100, `Restored ${answerCount} ${plural}!`);

    // Auto-hide after a short delay
    setTimeout(() => this.hide(), 1500);
  },

  /**
   * Show an error state
   * @param {string} [message] - Error message to display
   */
  error(message) {
    const icon = document.querySelector('#restoreModal .restore-icon');
    if (icon) icon.textContent = '⚠️';

    const fill = document.querySelector('.restore-progress-fill');
    if (fill) {
      fill.style.width = '100%';
      fill.style.background = '#ef4444'; // Red
    }

    this.setProgress(0, message || 'Could not restore data. You may need to import manually.');

    // Don't auto-hide on error - let user read the message
    // They can click elsewhere or refresh to dismiss
  },

  /**
   * Show a "no data found" state (not an error, just empty)
   */
  noData() {
    const icon = document.querySelector('#restoreModal .restore-icon');
    if (icon) icon.textContent = 'ℹ️';

    this.setProgress(100, 'No previous data found. Starting fresh!');

    setTimeout(() => this.hide(), 2000);
  }
};

// Export for global access
window.RestoreUI = RestoreUI;
