/**
 * NetworkManager - Multi-tier network architecture for AP Stats Consensus Quiz
 *
 * Tiers:
 * - TURBO: Railway server + Groq AI + Supabase (full internet)
 * - LAN: Teacher's local Qwen tutor for tutoring + grading
 * - OFFLINE: Pattern-based auto-grading, sync when online
 */

const NetworkManager = {
    // State
    currentTier: 'offline',  // 'turbo' | 'lan' | 'offline'
    lanIP: null,
    lanCode: null,           // Short code like "1-42"
    checkInterval: null,
    _initialized: false,

    // Constants
    TURBO_TIMEOUT: 3000,
    LAN_TIMEOUT: 2000,
    CHECK_INTERVAL: 30000,
    LAN_PORT: 8765,

    // Subnet prefixes to try when resolving short code
    SUBNET_PREFIXES: ['192.168.', '10.0.', '172.16.'],

    // localStorage keys
    STORAGE_KEYS: {
        LAN_CODE: 'LAN_TUTOR_CODE',
        LAN_IP: 'LAN_TUTOR_IP'
    },

    /**
     * Initialize NetworkManager on app load
     */
    async initialize() {
        if (this._initialized) {
            console.log('NetworkManager already initialized');
            return;
        }

        console.log('NetworkManager: Initializing...');

        // Load saved LAN code from localStorage
        this.loadSavedLANConfig();

        // Detect initial tier
        await this.detectTier();

        // Start periodic check
        this.startPeriodicCheck();

        // Add network event listeners
        this.addNetworkListeners();

        this._initialized = true;
        console.log(`NetworkManager: Initialized, tier=${this.currentTier}`);
    },

    /**
     * Load saved LAN configuration from localStorage
     */
    loadSavedLANConfig() {
        try {
            this.lanCode = localStorage.getItem(this.STORAGE_KEYS.LAN_CODE);
            this.lanIP = localStorage.getItem(this.STORAGE_KEYS.LAN_IP);
            if (this.lanCode) {
                console.log(`NetworkManager: Loaded saved LAN code: ${this.lanCode}`);
            }
        } catch (e) {
            console.warn('NetworkManager: Failed to load saved LAN config:', e);
        }
    },

    /**
     * Save LAN code to localStorage
     */
    saveLANCode(code, ip) {
        try {
            localStorage.setItem(this.STORAGE_KEYS.LAN_CODE, code);
            localStorage.setItem(this.STORAGE_KEYS.LAN_IP, ip);
            this.lanCode = code;
            this.lanIP = ip;
            console.log(`NetworkManager: Saved LAN code: ${code}, IP: ${ip}`);
        } catch (e) {
            console.warn('NetworkManager: Failed to save LAN code:', e);
        }
    },

    /**
     * Clear saved LAN configuration
     */
    clearLANCode() {
        try {
            localStorage.removeItem(this.STORAGE_KEYS.LAN_CODE);
            localStorage.removeItem(this.STORAGE_KEYS.LAN_IP);
            this.lanCode = null;
            this.lanIP = null;
            console.log('NetworkManager: Cleared LAN configuration');
        } catch (e) {
            console.warn('NetworkManager: Failed to clear LAN code:', e);
        }
    },

    /**
     * Get saved LAN code
     */
    getLANCode() {
        return this.lanCode;
    },

    /**
     * Parse LAN short code (e.g., "1-42" -> {third: "1", fourth: "42"})
     */
    parseLANCode(code) {
        if (!code) return null;

        // Parse "1-42" or "0-105"
        const match = code.match(/^(\d{1,3})-(\d{1,3})$/);
        if (!match) return null;

        const [_, third, fourth] = match;
        if (parseInt(third) > 255 || parseInt(fourth) > 255) return null;

        return { third, fourth };
    },

    /**
     * Try to connect to a specific LAN IP
     */
    async tryLANIP(ip) {
        const url = `http://${ip}:${this.LAN_PORT}/health`;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.LAN_TIMEOUT);

            const response = await fetch(url, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                console.log(`NetworkManager: LAN server found at ${ip}`);
                return ip;
            }
        } catch (e) {
            // Silently fail - expected for non-existent servers
        }
        return null;
    },

    /**
     * Resolve LAN short code to full IP address
     */
    async resolveLANCode(code) {
        const octets = this.parseLANCode(code);
        if (!octets) {
            console.log('NetworkManager: Invalid LAN code format:', code);
            return null;
        }

        const { third, fourth } = octets;
        console.log(`NetworkManager: Resolving code ${code} to IP...`);

        // Try common subnets in parallel
        const attempts = this.SUBNET_PREFIXES.map(prefix =>
            this.tryLANIP(`${prefix}${third}.${fourth}`)
        );

        const results = await Promise.allSettled(attempts);
        const success = results.find(r => r.status === 'fulfilled' && r.value);

        if (success) {
            return success.value;
        }

        console.log('NetworkManager: Could not resolve LAN code to any valid IP');
        return null;
    },

    /**
     * Check if Turbo mode (Railway server) is available
     */
    async checkTurbo() {
        const serverUrl = window.RAILWAY_SERVER_URL;
        if (!serverUrl) return false;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.TURBO_TIMEOUT);

            const response = await fetch(`${serverUrl}/health`, {
                method: 'GET',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch (e) {
            return false;
        }
    },

    /**
     * Check if LAN tutor server is available
     */
    async checkLAN() {
        if (!this.lanIP) return false;

        const ip = await this.tryLANIP(this.lanIP);
        return ip !== null;
    },

    /**
     * Detect current network tier
     */
    async detectTier() {
        const oldTier = this.currentTier;

        // Always try Turbo first (best experience)
        if (await this.checkTurbo()) {
            this.setTier('turbo');
            return;
        }

        // Try LAN if code is saved
        if (this.lanIP && await this.checkLAN()) {
            this.setTier('lan');
            return;
        }

        // Fall back to offline
        this.setTier('offline');

        // If we just lost internet, prompt for LAN code
        if (oldTier === 'turbo' && this.currentTier === 'offline' && !this.lanCode) {
            this.promptForLANCode();
        }
    },

    /**
     * Set current network tier
     */
    setTier(tier) {
        const oldTier = this.currentTier;
        if (oldTier === tier) return;

        this.currentTier = tier;
        console.log(`NetworkManager: Tier changed: ${oldTier} -> ${tier}`);

        // Dispatch tier change event
        this.dispatchTierChange(tier, oldTier);

        // Update UI elements
        this.updateUI(tier);
    },

    /**
     * Dispatch tier change event
     */
    dispatchTierChange(newTier, oldTier) {
        window.dispatchEvent(new CustomEvent('networkTierChanged', {
            detail: { newTier, oldTier }
        }));
    },

    /**
     * Update UI elements based on current tier
     */
    updateUI(tier) {
        // Update body class for CSS styling
        document.body.classList.remove('network-tier-turbo', 'network-tier-lan', 'network-tier-offline');
        document.body.classList.add(`network-tier-${tier}`);

        // Show/hide tutor panel (LAN only)
        const tutorPanel = document.getElementById('tutorPanel');
        if (tutorPanel) {
            tutorPanel.style.display = tier === 'lan' ? 'flex' : 'none';
        }

        // Update sync status indicator if function exists
        if (typeof updateSyncStatusIndicator === 'function') {
            updateSyncStatusIndicator();
        }
    },

    /**
     * Get AI endpoint based on current tier
     * Returns { url, type } or null if no AI available
     */
    getAIEndpoint() {
        if (this.currentTier === 'turbo') {
            const serverUrl = window.RAILWAY_SERVER_URL || 'https://curriculumrender-production.up.railway.app';
            return {
                url: `${serverUrl}/api/ai/grade`,
                type: 'groq'
            };
        }

        if (this.currentTier === 'lan' && this.lanIP) {
            return {
                url: `http://${this.lanIP}:${this.LAN_PORT}`,
                type: 'qwen'
            };
        }

        return null; // Offline - no AI
    },

    /**
     * Get tutor endpoint (LAN only)
     * Returns URL or null
     */
    getTutorEndpoint() {
        if (this.currentTier === 'lan' && this.lanIP) {
            return `http://${this.lanIP}:${this.LAN_PORT}`;
        }
        return null;
    },

    /**
     * Prompt user to enter LAN code when internet fails
     */
    promptForLANCode() {
        console.log('NetworkManager: Prompting for LAN code...');
        // Show the LAN setup modal
        const modal = document.getElementById('lanSetupModal');
        if (modal) {
            modal.style.display = 'block';
        }
    },

    /**
     * Start periodic tier checking
     */
    startPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(() => {
            this.detectTier();
        }, this.CHECK_INTERVAL);
    },

    /**
     * Add network event listeners
     */
    addNetworkListeners() {
        window.addEventListener('online', () => {
            console.log('NetworkManager: Network online event');
            this.detectTier();
        });

        window.addEventListener('offline', () => {
            console.log('NetworkManager: Network offline event');
            this.setTier('offline');
        });

        // Check on tab focus
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('NetworkManager: Tab focused, checking tier');
                this.detectTier();
            }
        });
    },

    /**
     * Test LAN connection with a given code
     */
    async testLANConnection(code) {
        const ip = await this.resolveLANCode(code);
        if (ip) {
            this.saveLANCode(code, ip);
            await this.detectTier();
            return { success: true, ip };
        }
        return { success: false };
    },

    /**
     * Disconnect from LAN
     */
    disconnectLAN() {
        this.clearLANCode();
        this.detectTier();
    }
};

// Expose globally
window.NetworkManager = NetworkManager;
