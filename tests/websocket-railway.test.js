/**
 * WebSocket & Railway Tests
 *
 * Tests for STATE_MACHINES.md Sections 4 & 5:
 * - Railway WebSocket connection states
 * - Turbo Mode states
 * - Message handling
 * - Reconnection logic
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * WebSocket States
 */
const WebSocketState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting'
};

/**
 * Turbo Mode States
 */
const TurboModeState = {
    DISABLED: 'disabled',      // TURBO_MODE = false
    ENABLED: 'enabled',        // TURBO_MODE = true, direct Supabase
    WITH_RAILWAY: 'railway'    // TURBO_MODE = true, USE_RAILWAY = true
};

/**
 * Mock WebSocket Manager
 */
class MockWebSocketManager {
    constructor() {
        this.state = WebSocketState.DISCONNECTED;
        this.wsConnected = false;
        this.onlineUsers = new Set();
        this.messageHandlers = {};
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pingInterval = null;
        this.reconnectTimer = null;
    }

    connect() {
        if (this.state === WebSocketState.CONNECTED) return true;

        this.state = WebSocketState.CONNECTING;

        // Simulate connection
        return new Promise((resolve) => {
            setTimeout(() => {
                this.state = WebSocketState.CONNECTED;
                this.wsConnected = true;
                this.reconnectAttempts = 0;
                this.startPingInterval();
                resolve(true);
            }, 100);
        });
    }

    disconnect() {
        this.state = WebSocketState.DISCONNECTED;
        this.wsConnected = false;
        this.stopPingInterval();
        this.onlineUsers.clear();
    }

    simulateDisconnect() {
        this.state = WebSocketState.DISCONNECTED;
        this.wsConnected = false;
        this.stopPingInterval();
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            return false;
        }

        this.state = WebSocketState.RECONNECTING;
        this.reconnectAttempts++;

        // In real implementation, this would be setTimeout with exponential backoff
        this.reconnectTimer = setTimeout(() => {
            this.connect();
        }, 5000);

        return true;
    }

    cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    startPingInterval() {
        // In real implementation, sends ping every 30s
        this.pingInterval = true;
    }

    stopPingInterval() {
        this.pingInterval = false;
    }

    handleMessage(message) {
        switch (message.type) {
            case 'presence_snapshot':
                this.onlineUsers = new Set(message.users);
                break;
            case 'user_online':
                this.onlineUsers.add(message.username);
                break;
            case 'user_offline':
                this.onlineUsers.delete(message.username);
                break;
            case 'answer_submitted':
                // Would cache to IDB and dispatch event
                return { action: 'cache_peer_answer', data: message };
            case 'batch_submitted':
                // Would trigger pullPeerDataFromRailway
                return { action: 'pull_peer_data' };
            case 'pong':
                // Keep-alive acknowledgment
                return { action: 'pong_received' };
            default:
                return null;
        }
    }

    identify(username) {
        if (this.state !== WebSocketState.CONNECTED) return false;
        // Would send: {type: 'identify', username}
        return true;
    }

    sendHeartbeat(username) {
        if (this.state !== WebSocketState.CONNECTED) return false;
        // Would send: {type: 'heartbeat', username}
        return true;
    }
}

/**
 * Mock Turbo Mode Manager
 */
class MockTurboModeManager {
    constructor(config) {
        this.turboMode = config.TURBO_MODE ?? false;
        this.useRailway = config.USE_RAILWAY ?? false;
        this.railwayUrl = config.RAILWAY_SERVER_URL ?? '';
        this.state = this.determineState();
        this.wsManager = null;
    }

    determineState() {
        if (!this.turboMode) {
            return TurboModeState.DISABLED;
        }
        if (this.useRailway) {
            return TurboModeState.WITH_RAILWAY;
        }
        return TurboModeState.ENABLED;
    }

    async initialize() {
        if (this.state === TurboModeState.DISABLED) {
            return { success: true, mode: 'offline' };
        }

        if (this.state === TurboModeState.WITH_RAILWAY) {
            // Check Railway health
            const healthy = await this.checkRailwayHealth();
            if (healthy) {
                this.wsManager = new MockWebSocketManager();
                await this.wsManager.connect();
                return { success: true, mode: 'railway' };
            } else {
                // Fall back to direct Supabase
                this.state = TurboModeState.ENABLED;
                return { success: true, mode: 'supabase_fallback' };
            }
        }

        return { success: true, mode: 'supabase_direct' };
    }

    async checkRailwayHealth() {
        // In real implementation, GET /health
        // Simulating health check
        return this.railwayUrl && this.railwayUrl.length > 0;
    }

    async pushAnswer(username, questionId, value, timestamp) {
        if (this.state === TurboModeState.DISABLED) {
            return { success: false, reason: 'turbo_disabled' };
        }

        if (this.state === TurboModeState.WITH_RAILWAY) {
            return await this.pushViaRailway(username, questionId, value, timestamp);
        }

        return await this.pushDirectSupabase(username, questionId, value, timestamp);
    }

    async pushViaRailway(username, questionId, value, timestamp) {
        // POST /api/submit-answer
        // Simulating
        return { success: true, via: 'railway' };
    }

    async pushDirectSupabase(username, questionId, value, timestamp) {
        // Direct Supabase insert
        // Simulating
        return { success: true, via: 'supabase' };
    }
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt, baseDelay = 1000, maxDelay = 30000) {
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    // Add jitter
    return delay + Math.random() * 1000;
}

// ============================================
// TESTS
// ============================================

describe('WebSocket Connection', () => {
    describe('Connection States', () => {
        let ws;

        beforeEach(() => {
            ws = new MockWebSocketManager();
        });

        it('should start in DISCONNECTED state', () => {
            expect(ws.state).toBe(WebSocketState.DISCONNECTED);
            expect(ws.wsConnected).toBe(false);
        });

        it('should transition to CONNECTING then CONNECTED', async () => {
            const connectPromise = ws.connect();
            expect(ws.state).toBe(WebSocketState.CONNECTING);

            await connectPromise;
            expect(ws.state).toBe(WebSocketState.CONNECTED);
            expect(ws.wsConnected).toBe(true);
        });

        it('should start ping interval on connect', async () => {
            await ws.connect();
            expect(ws.pingInterval).toBe(true);
        });

        it('should disconnect correctly', async () => {
            await ws.connect();
            ws.disconnect();

            expect(ws.state).toBe(WebSocketState.DISCONNECTED);
            expect(ws.wsConnected).toBe(false);
            expect(ws.pingInterval).toBe(false);
        });

        it('should clear online users on disconnect', async () => {
            await ws.connect();
            ws.handleMessage({ type: 'presence_snapshot', users: ['user1', 'user2'] });
            expect(ws.onlineUsers.size).toBe(2);

            ws.disconnect();
            expect(ws.onlineUsers.size).toBe(0);
        });
    });

    describe('Reconnection Logic', () => {
        let ws;

        beforeEach(() => {
            ws = new MockWebSocketManager();
        });

        it('should schedule reconnect on disconnect', async () => {
            await ws.connect();
            ws.simulateDisconnect();

            expect(ws.state).toBe(WebSocketState.RECONNECTING);
            expect(ws.reconnectAttempts).toBe(1);
        });

        it('should track reconnect attempts', async () => {
            await ws.connect();

            ws.simulateDisconnect();
            expect(ws.reconnectAttempts).toBe(1);

            ws.cancelReconnect();
            ws.simulateDisconnect();
            expect(ws.reconnectAttempts).toBe(2);
        });

        it('should stop reconnecting after max attempts', () => {
            ws.reconnectAttempts = ws.maxReconnectAttempts;
            const result = ws.scheduleReconnect();
            expect(result).toBe(false);
        });

        it('should reset reconnect attempts on successful connect', async () => {
            ws.reconnectAttempts = 3;
            await ws.connect();
            expect(ws.reconnectAttempts).toBe(0);
        });
    });

    describe('Message Handling', () => {
        let ws;

        beforeEach(async () => {
            ws = new MockWebSocketManager();
            await ws.connect();
        });

        it('should handle presence_snapshot', () => {
            ws.handleMessage({ type: 'presence_snapshot', users: ['user1', 'user2', 'user3'] });

            expect(ws.onlineUsers.size).toBe(3);
            expect(ws.onlineUsers.has('user1')).toBe(true);
            expect(ws.onlineUsers.has('user2')).toBe(true);
            expect(ws.onlineUsers.has('user3')).toBe(true);
        });

        it('should handle user_online', () => {
            ws.handleMessage({ type: 'user_online', username: 'newUser' });
            expect(ws.onlineUsers.has('newUser')).toBe(true);
        });

        it('should handle user_offline', () => {
            ws.handleMessage({ type: 'presence_snapshot', users: ['user1', 'user2'] });
            ws.handleMessage({ type: 'user_offline', username: 'user1' });

            expect(ws.onlineUsers.has('user1')).toBe(false);
            expect(ws.onlineUsers.has('user2')).toBe(true);
        });

        it('should return cache action for answer_submitted', () => {
            const result = ws.handleMessage({
                type: 'answer_submitted',
                username: 'peer1',
                questionId: 'Q1',
                value: 'A'
            });

            expect(result.action).toBe('cache_peer_answer');
        });

        it('should return pull action for batch_submitted', () => {
            const result = ws.handleMessage({ type: 'batch_submitted' });
            expect(result.action).toBe('pull_peer_data');
        });

        it('should handle pong message', () => {
            const result = ws.handleMessage({ type: 'pong' });
            expect(result.action).toBe('pong_received');
        });
    });

    describe('Identify and Heartbeat', () => {
        let ws;

        beforeEach(async () => {
            ws = new MockWebSocketManager();
        });

        it('should not identify when disconnected', () => {
            const result = ws.identify('testUser');
            expect(result).toBe(false);
        });

        it('should identify when connected', async () => {
            await ws.connect();
            const result = ws.identify('testUser');
            expect(result).toBe(true);
        });

        it('should not send heartbeat when disconnected', () => {
            const result = ws.sendHeartbeat('testUser');
            expect(result).toBe(false);
        });

        it('should send heartbeat when connected', async () => {
            await ws.connect();
            const result = ws.sendHeartbeat('testUser');
            expect(result).toBe(true);
        });
    });
});

describe('Turbo Mode', () => {
    describe('State Determination', () => {
        it('should be DISABLED when TURBO_MODE is false', () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: false });
            expect(manager.state).toBe(TurboModeState.DISABLED);
        });

        it('should be ENABLED when TURBO_MODE true but USE_RAILWAY false', () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: true, USE_RAILWAY: false });
            expect(manager.state).toBe(TurboModeState.ENABLED);
        });

        it('should be WITH_RAILWAY when both enabled', () => {
            const manager = new MockTurboModeManager({
                TURBO_MODE: true,
                USE_RAILWAY: true,
                RAILWAY_SERVER_URL: 'https://railway.app'
            });
            expect(manager.state).toBe(TurboModeState.WITH_RAILWAY);
        });
    });

    describe('Initialization', () => {
        it('should return offline mode when disabled', async () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: false });
            const result = await manager.initialize();

            expect(result.success).toBe(true);
            expect(result.mode).toBe('offline');
        });

        it('should connect WebSocket when Railway mode', async () => {
            const manager = new MockTurboModeManager({
                TURBO_MODE: true,
                USE_RAILWAY: true,
                RAILWAY_SERVER_URL: 'https://railway.app'
            });

            const result = await manager.initialize();

            expect(result.success).toBe(true);
            expect(result.mode).toBe('railway');
            expect(manager.wsManager).not.toBeNull();
        });

        it('should fall back to Supabase if Railway unhealthy', async () => {
            const manager = new MockTurboModeManager({
                TURBO_MODE: true,
                USE_RAILWAY: true,
                RAILWAY_SERVER_URL: '' // Empty URL simulates unhealthy
            });

            const result = await manager.initialize();

            expect(result.success).toBe(true);
            expect(result.mode).toBe('supabase_fallback');
            expect(manager.state).toBe(TurboModeState.ENABLED);
        });

        it('should use direct Supabase when enabled but no Railway', async () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: true, USE_RAILWAY: false });
            const result = await manager.initialize();

            expect(result.success).toBe(true);
            expect(result.mode).toBe('supabase_direct');
        });
    });

    describe('Answer Push Routing', () => {
        it('should fail when turbo disabled', async () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: false });
            const result = await manager.pushAnswer('user', 'Q1', 'A', Date.now());

            expect(result.success).toBe(false);
            expect(result.reason).toBe('turbo_disabled');
        });

        it('should push via Railway when configured', async () => {
            const manager = new MockTurboModeManager({
                TURBO_MODE: true,
                USE_RAILWAY: true,
                RAILWAY_SERVER_URL: 'https://railway.app'
            });
            await manager.initialize();

            const result = await manager.pushAnswer('user', 'Q1', 'A', Date.now());

            expect(result.success).toBe(true);
            expect(result.via).toBe('railway');
        });

        it('should push direct to Supabase when no Railway', async () => {
            const manager = new MockTurboModeManager({ TURBO_MODE: true, USE_RAILWAY: false });
            await manager.initialize();

            const result = await manager.pushAnswer('user', 'Q1', 'A', Date.now());

            expect(result.success).toBe(true);
            expect(result.via).toBe('supabase');
        });
    });
});

describe('Exponential Backoff', () => {
    it('should increase delay with each attempt', () => {
        const delay0 = calculateBackoff(0, 1000, 30000);
        const delay1 = calculateBackoff(1, 1000, 30000);
        const delay2 = calculateBackoff(2, 1000, 30000);

        // Account for jitter
        expect(delay1).toBeGreaterThanOrEqual(delay0);
        expect(delay2).toBeGreaterThanOrEqual(delay1);
    });

    it('should cap at max delay', () => {
        const delay = calculateBackoff(100, 1000, 30000);
        // Max delay plus max jitter (1000ms)
        expect(delay).toBeLessThanOrEqual(31000);
    });

    it('should include jitter', () => {
        const delays = [];
        for (let i = 0; i < 10; i++) {
            delays.push(calculateBackoff(0, 1000, 30000));
        }

        // Check that not all delays are the same (jitter effect)
        const uniqueDelays = new Set(delays);
        expect(uniqueDelays.size).toBeGreaterThan(1);
    });
});
