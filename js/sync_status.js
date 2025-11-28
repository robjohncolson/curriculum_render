// sync_status.js - Sync status badge controller
// Part of AP Statistics Consensus Quiz
// Dependencies: None (standalone)
// Displays sync status in header bar and detailed stats in Data Management modal

// ========================================
// SYNC STATUS CONTROLLER
// ========================================

const SyncStatus = {
  // State
  currentState: 'saved-local',
  isConnected: false,

  // Timing
  lastCloudSync: null,
  sessionStartTime: Date.now(),

  // Counters
  answersReceived: 0,      // Total answers pulled from cloud this session
  answersSent: 0,          // Total answers pushed to cloud this session
  peersDiscovered: 0,      // Number of unique peers seen

  // Activity tracking for live updates
  recentActivity: [],      // Array of {type, count, timestamp}
  activityRate: 0,         // Answers per minute (rolling average)

  // Intervals
  _timeInterval: null,
  _statsInterval: null,
  _activityInterval: null,

  /**
   * Valid states:
   * - 'saved-local': Data saved to IndexedDB
   * - 'saving': Currently writing to IndexedDB
   * - 'syncing-cloud': Uploading/downloading to/from Railway/Supabase
   * - 'synced-cloud': Successfully synced to cloud
   * - 'offline': No network connection
   * - 'error': Save or sync failed
   */
  setState(state, detail = null) {
    this.currentState = state;

    // Update the unified peer data timestamp display with state info
    this.updateUnifiedDisplay();

    switch (state) {
      case 'saved-local':
        // Normal state, no special action needed
        break;

      case 'saving':
        // Brief state, display updates handled in updateUnifiedDisplay
        break;

      case 'syncing-cloud':
        // Brief state, display updates handled in updateUnifiedDisplay
        break;

      case 'synced-cloud':
        this.lastCloudSync = Date.now();
        this.startRelativeTimeUpdates();
        this.updateSyncStats();
        break;

      case 'offline':
        // Display updates handled in updateUnifiedDisplay
        break;

      case 'error':
        // Auto-recover to saved-local after 5 seconds
        setTimeout(() => {
          if (this.currentState === 'error') {
            this.setState('saved-local');
          }
        }, 5000);
        break;

      default:
        console.warn('Unknown sync state:', state);
    }
  },

  /**
   * Update the unified peer data / sync status display
   */
  updateUnifiedDisplay() {
    const display = document.getElementById('peerDataTimestamp');
    if (!display) return;

    // Build status indicator based on current state
    let stateIndicator = '';
    switch (this.currentState) {
      case 'saving':
        stateIndicator = '<span style="color: var(--accent-warning);">[SAVING...]</span>';
        break;
      case 'syncing-cloud':
        stateIndicator = '<span style="color: var(--accent-info);">[SYNCING...]</span>';
        break;
      case 'synced-cloud':
        stateIndicator = '<span style="color: var(--accent-success);">[LIVE]</span>';
        break;
      case 'offline':
        stateIndicator = '<span style="color: var(--accent-danger);">[OFFLINE]</span>';
        break;
      case 'error':
        stateIndicator = '<span style="color: var(--accent-danger);">[ERROR]</span>';
        break;
      case 'saved-local':
      default:
        // Check if we have cloud connection
        if (this.isConnected) {
          stateIndicator = '<span style="color: var(--accent-success);">[LIVE]</span>';
        } else {
          stateIndicator = '<span style="color: var(--text-tertiary);">[LOCAL]</span>';
        }
        break;
    }

    // Build the time display
    let timeText = '';
    if (this.lastCloudSync) {
      timeText = this.relativeTime(this.lastCloudSync);
    } else {
      timeText = 'AWAITING DATA...';
    }

    display.innerHTML = `SYNC: <strong>${timeText}</strong> ${stateIndicator}`;
  },

  /**
   * Record a pull operation (receiving answers from cloud)
   * @param {number} answerCount - Number of answers received
   * @param {number} peerCount - Number of unique peers in this pull
   */
  recordPull(answerCount, peerCount) {
    this.answersReceived += answerCount;
    this.peersDiscovered = Math.max(this.peersDiscovered, peerCount);
    this.lastCloudSync = Date.now();

    // Track activity
    this.recentActivity.push({
      type: 'pull',
      count: answerCount,
      timestamp: Date.now()
    });

    // Keep only last 5 minutes of activity
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    this.recentActivity = this.recentActivity.filter(a => a.timestamp > fiveMinutesAgo);

    // Calculate activity rate
    this.calculateActivityRate();

    // Update display
    this.updateSyncStats();
  },

  /**
   * Record a push operation (sending answers to cloud)
   * @param {number} count - Number of answers sent
   */
  recordPush(count = 1) {
    this.answersSent += count;
    this.lastCloudSync = Date.now();

    // Track activity
    this.recentActivity.push({
      type: 'push',
      count: count,
      timestamp: Date.now()
    });

    // Keep only last 5 minutes of activity
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    this.recentActivity = this.recentActivity.filter(a => a.timestamp > fiveMinutesAgo);

    // Calculate activity rate
    this.calculateActivityRate();

    // Update display
    this.updateSyncStats();
  },

  /**
   * Calculate the rolling activity rate (answers per minute)
   */
  calculateActivityRate() {
    if (this.recentActivity.length === 0) {
      this.activityRate = 0;
      return;
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentItems = this.recentActivity.filter(a => a.timestamp > oneMinuteAgo);

    const totalCount = recentItems.reduce((sum, a) => sum + a.count, 0);
    this.activityRate = totalCount;
  },

  /**
   * Start updating the "Synced X ago" text every 10 seconds
   */
  startRelativeTimeUpdates() {
    if (this._timeInterval) {
      clearInterval(this._timeInterval);
    }

    this._timeInterval = setInterval(() => {
      if (!this.lastCloudSync) {
        return;
      }

      // Update the unified display
      this.updateUnifiedDisplay();

      // Also update modal stats
      this.updateSyncStats();
    }, 10000); // Update every 10 seconds for more responsive display
  },

  /**
   * Format a timestamp as relative time
   * @param {number} timestamp - Unix timestamp in milliseconds
   * @returns {string} Relative time string
   */
  relativeTime(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  },

  /**
   * Format session duration
   * @returns {string} Duration string
   */
  getSessionDuration() {
    const seconds = Math.floor((Date.now() - this.sessionStartTime) / 1000);

    if (seconds < 60) return `${seconds}s`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    return `${hours}h ${remainingMins}m`;
  },

  /**
   * Initialize the status badge (call on page load)
   */
  init() {
    this.sessionStartTime = Date.now();

    // Set initial state based on network status
    if (!navigator.onLine) {
      this.setState('offline');
    } else {
      this.setState('saved-local');
    }

    // Listen for online/offline events
    window.addEventListener('online', () => {
      if (this.currentState === 'offline') {
        this.setState('saved-local');
        if (typeof showToast === 'function') {
          showToast('Back online', 'info');
        }
      }
    });

    window.addEventListener('offline', () => {
      this.setState('offline');
      this.setConnected(false);
      if (typeof showToast === 'function') {
        showToast('You\'re offline - data saved locally', 'warning');
      }
    });

    // Start activity rate decay (recalculate every 10 seconds)
    this._activityInterval = setInterval(() => {
      this.calculateActivityRate();
    }, 10000);
  },

  /**
   * Get the current state
   * @returns {string} Current state
   */
  getState() {
    return this.currentState;
  },

  /**
   * Check if we're in a "safe" state (data is saved somewhere)
   * @returns {boolean}
   */
  isSafe() {
    return ['saved-local', 'synced-cloud'].includes(this.currentState);
  },

  /**
   * Update the sync stats display in the Data Management modal
   */
  updateSyncStats() {
    // Update last sync time
    const lastTimeEl = document.getElementById('syncLastTime');
    if (lastTimeEl) {
      if (this.lastCloudSync) {
        lastTimeEl.textContent = this.relativeTime(this.lastCloudSync);
      } else {
        lastTimeEl.textContent = 'Never';
      }
    }

    // Update answer count - show total activity
    const answerCountEl = document.getElementById('syncAnswerCount');
    if (answerCountEl) {
      const total = this.answersReceived + this.answersSent;
      if (total > 0) {
        // Show breakdown if we have both
        if (this.answersReceived > 0 && this.answersSent > 0) {
          answerCountEl.textContent = `↓${this.answersReceived} ↑${this.answersSent}`;
        } else if (this.answersReceived > 0) {
          answerCountEl.textContent = `↓${this.answersReceived}`;
        } else {
          answerCountEl.textContent = `↑${this.answersSent}`;
        }
      } else {
        answerCountEl.textContent = '0';
      }
    }

    // Update connection status with activity indicator
    const connectionEl = document.getElementById('syncConnectionStatus');
    if (connectionEl) {
      if (this.isConnected) {
        if (this.activityRate > 0) {
          connectionEl.textContent = `Active (${this.activityRate}/min)`;
          connectionEl.className = 'sync-stat-value connected active';
        } else {
          connectionEl.textContent = 'Connected';
          connectionEl.className = 'sync-stat-value connected';
        }
      } else {
        connectionEl.textContent = 'Disconnected';
        connectionEl.className = 'sync-stat-value disconnected';
      }
    }

    // Update the pulse animation based on activity
    const pulse = document.querySelector('.turbo-mode-notice .sync-pulse');
    if (pulse) {
      if (this.activityRate > 0) {
        pulse.classList.add('active');
      } else {
        pulse.classList.remove('active');
      }
    }
  },

  /**
   * Set the connection status
   * @param {boolean} connected
   */
  setConnected(connected) {
    this.isConnected = connected;
    this.updateSyncStats();
  },

  /**
   * Increment the synced answer count (for backwards compatibility)
   * @param {number} count - Number of answers synced (default 1)
   */
  incrementSyncCount(count = 1) {
    this.recordPush(count);
  },

  /**
   * Set the total synced answer count (for backwards compatibility)
   * @param {number} count
   */
  setSyncCount(count) {
    this.answersSent = count;
    this.updateSyncStats();
  },

  /**
   * Start the stats update interval
   */
  startStatsUpdates() {
    if (this._statsInterval) {
      clearInterval(this._statsInterval);
    }
    // Update stats every 5 seconds for more responsive UI
    this._statsInterval = setInterval(() => {
      this.updateSyncStats();
    }, 5000);
    // Also update immediately
    this.updateSyncStats();
  },

  /**
   * Get a summary of sync activity for display
   * @returns {object} Summary object
   */
  getSummary() {
    return {
      state: this.currentState,
      connected: this.isConnected,
      lastSync: this.lastCloudSync,
      lastSyncRelative: this.lastCloudSync ? this.relativeTime(this.lastCloudSync) : null,
      answersReceived: this.answersReceived,
      answersSent: this.answersSent,
      totalActivity: this.answersReceived + this.answersSent,
      peersDiscovered: this.peersDiscovered,
      activityRate: this.activityRate,
      sessionDuration: this.getSessionDuration()
    };
  }
};

// ========================================
// INITIALIZATION
// ========================================

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SyncStatus.init());
} else {
  SyncStatus.init();
}

// Export for global access
window.SyncStatus = SyncStatus;
