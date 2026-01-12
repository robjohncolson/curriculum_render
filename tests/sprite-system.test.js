/**
 * Sprite System Tests
 *
 * Tests for STATE_MACHINES.md Section 8:
 * - Sprite animation states
 * - Jump/suspend/fall physics
 * - Peer sprite management
 * - Hue/color resolution
 */
import { describe, it, expect, beforeEach } from 'vitest';

// ============================================
// MOCK IMPLEMENTATIONS
// ============================================

/**
 * Sprite Animation States
 */
const SpriteState = {
    IDLE: 'idle',
    JUMPING: 'jumping',
    SUSPENDED: 'suspended',
    FALLING: 'falling'
};

/**
 * Mock Sprite (Player or Peer)
 */
class MockSprite {
    constructor(options = {}) {
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.groundY = options.groundY ?? 400;
        this.scale = options.scale ?? 1.0;
        this.hue = options.hue ?? 0;

        this.state = SpriteState.IDLE;
        this.jumpVelocity = 0;
        this.jumpPower = -400;
        this.gravity = 1200;
        this.suspensionTime = 5;
        this.suspensionTimer = 0;
        this.goldTimer = 0;

        this.y = this.groundY;
    }

    jump() {
        if (this.state !== SpriteState.IDLE) return false;

        this.state = SpriteState.JUMPING;
        this.jumpVelocity = this.jumpPower;
        return true;
    }

    update(deltaTime) {
        switch (this.state) {
            case SpriteState.IDLE:
                // No physics, just animation
                break;

            case SpriteState.JUMPING:
                this.y += this.jumpVelocity * deltaTime;
                this.jumpVelocity += this.gravity * deltaTime;

                // Check for apex (velocity crosses zero)
                if (this.jumpVelocity >= 0) {
                    this.state = SpriteState.SUSPENDED;
                    this.suspensionTimer = this.suspensionTime;
                }
                break;

            case SpriteState.SUSPENDED:
                this.suspensionTimer -= deltaTime;
                if (this.suspensionTimer <= 0) {
                    this.state = SpriteState.FALLING;
                }
                break;

            case SpriteState.FALLING:
                this.y += this.jumpVelocity * deltaTime;
                this.jumpVelocity += this.gravity * deltaTime;

                // Check for landing
                if (this.y >= this.groundY) {
                    this.y = this.groundY;
                    this.jumpVelocity = 0;
                    this.state = SpriteState.IDLE;
                }
                break;
        }

        // Update gold timer
        if (this.goldTimer > 0) {
            this.goldTimer -= deltaTime;
            if (this.goldTimer < 0) this.goldTimer = 0;
        }
    }

    setCorrect() {
        this.goldTimer = 3; // 3 seconds of gold effect
    }

    isGold() {
        return this.goldTimer > 0;
    }

    reset() {
        this.state = SpriteState.IDLE;
        this.y = this.groundY;
        this.jumpVelocity = 0;
        this.suspensionTimer = 0;
        this.goldTimer = 0;
    }
}

/**
 * Hash string to hue (0-359)
 */
function hashStringToHue(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash) % 360;
}

/**
 * Resolve sprite hue from multiple sources
 */
function resolveSpriteHue(username, localStorage = {}) {
    // Priority 1: pigColor_${username}
    const pigColor = localStorage[`pigColor_${username}`];
    if (pigColor !== undefined) {
        return parseInt(pigColor, 10);
    }

    // Priority 2: spriteColorHue_${username}
    const spriteHue = localStorage[`spriteColorHue_${username}`];
    if (spriteHue !== undefined) {
        return parseInt(spriteHue, 10);
    }

    // Fallback: hash username
    return hashStringToHue(username);
}

/**
 * Mock Sprite Manager
 */
class MockSpriteManager {
    constructor(groundY = 400) {
        this.groundY = groundY;
        this.playerSprite = null;
        this.peerSprites = new Map();
        this.positionedUsernames = [];
        this.viewportWidth = 800;
    }

    init(playerUsername, hue) {
        this.playerSprite = new MockSprite({
            groundY: this.groundY,
            hue: hue,
            scale: 1.0
        });
        return this.playerSprite;
    }

    ensurePeerSprite(username, hue) {
        if (this.peerSprites.has(username)) {
            return this.peerSprites.get(username);
        }

        const sprite = new MockSprite({
            groundY: this.groundY,
            hue: hue,
            scale: 0.25 // Smaller than player
        });

        this.peerSprites.set(username, sprite);
        this.positionedUsernames.push(username);
        this.repositionPeers();

        return sprite;
    }

    removePeerSprite(username) {
        if (!this.peerSprites.has(username)) return false;

        this.peerSprites.delete(username);
        this.positionedUsernames = this.positionedUsernames.filter(u => u !== username);
        this.repositionPeers();

        return true;
    }

    updateOnlinePeers(users, currentUsername) {
        const desired = new Set(users.filter(u => u !== currentUsername));

        // Add new peers
        for (const user of desired) {
            if (!this.peerSprites.has(user)) {
                const hue = hashStringToHue(user);
                this.ensurePeerSprite(user, hue);
            }
        }

        // Remove offline peers
        for (const [user] of this.peerSprites) {
            if (!desired.has(user)) {
                this.removePeerSprite(user);
            }
        }
    }

    repositionPeers() {
        const count = this.positionedUsernames.length;
        if (count === 0) return;

        const leftMargin = this.viewportWidth * 0.10;
        const rightMargin = this.viewportWidth * 0.10;
        const usable = this.viewportWidth - leftMargin - rightMargin;

        if (count === 1) {
            const sprite = this.peerSprites.get(this.positionedUsernames[0]);
            sprite.x = this.viewportWidth / 2;
        } else {
            const gap = usable / (count - 1);

            for (let i = 0; i < count; i++) {
                const username = this.positionedUsernames[i];
                const sprite = this.peerSprites.get(username);
                sprite.x = leftMargin + (i * gap);
            }
        }
    }

    clearAllPeerSprites() {
        this.peerSprites.clear();
        this.positionedUsernames = [];
    }

    getPeerCount() {
        return this.peerSprites.size;
    }

    update(deltaTime) {
        if (this.playerSprite) {
            this.playerSprite.update(deltaTime);
        }

        for (const sprite of this.peerSprites.values()) {
            sprite.update(deltaTime);
        }
    }
}

// ============================================
// TESTS
// ============================================

describe('Sprite Animation', () => {
    describe('State Machine', () => {
        let sprite;

        beforeEach(() => {
            sprite = new MockSprite({ groundY: 400 });
        });

        it('should start in IDLE state', () => {
            expect(sprite.state).toBe(SpriteState.IDLE);
            expect(sprite.y).toBe(400);
        });

        it('should transition IDLE -> JUMPING on jump()', () => {
            sprite.jump();
            expect(sprite.state).toBe(SpriteState.JUMPING);
            expect(sprite.jumpVelocity).toBe(-400);
        });

        it('should not jump if not IDLE', () => {
            sprite.jump();
            expect(sprite.state).toBe(SpriteState.JUMPING);

            const result = sprite.jump();
            expect(result).toBe(false);
            expect(sprite.state).toBe(SpriteState.JUMPING);
        });

        it('should transition JUMPING -> SUSPENDED at apex', () => {
            sprite.jump();

            // Simulate updates until apex
            for (let i = 0; i < 100; i++) {
                sprite.update(0.016); // ~60fps
                if (sprite.state === SpriteState.SUSPENDED) break;
            }

            expect(sprite.state).toBe(SpriteState.SUSPENDED);
            expect(sprite.suspensionTimer).toBe(5);
        });

        it('should transition SUSPENDED -> FALLING after timer', () => {
            sprite.jump();

            // Get to suspended state
            while (sprite.state !== SpriteState.SUSPENDED) {
                sprite.update(0.016);
            }

            // Wait for suspension timer
            for (let i = 0; i < 350; i++) { // ~5.5 seconds at 60fps
                sprite.update(0.016);
                if (sprite.state === SpriteState.FALLING) break;
            }

            expect(sprite.state).toBe(SpriteState.FALLING);
        });

        it('should transition FALLING -> IDLE on landing', () => {
            sprite.jump();

            // Complete full jump cycle
            for (let i = 0; i < 1000; i++) {
                sprite.update(0.016);
                if (sprite.state === SpriteState.IDLE && i > 10) break;
            }

            expect(sprite.state).toBe(SpriteState.IDLE);
            expect(sprite.y).toBe(400);
            expect(sprite.jumpVelocity).toBe(0);
        });
    });

    describe('Physics', () => {
        let sprite;

        beforeEach(() => {
            sprite = new MockSprite({ groundY: 400 });
        });

        it('should move upward when jumping (negative velocity)', () => {
            sprite.jump();
            const startY = sprite.y;
            sprite.update(0.016);

            expect(sprite.y).toBeLessThan(startY);
        });

        it('should apply gravity during jump', () => {
            sprite.jump();
            const startVelocity = sprite.jumpVelocity;
            sprite.update(0.016);

            expect(sprite.jumpVelocity).toBeGreaterThan(startVelocity);
        });

        it('should snap to ground on landing', () => {
            sprite.jump();

            // Complete jump
            for (let i = 0; i < 1000; i++) {
                sprite.update(0.016);
                if (sprite.state === SpriteState.IDLE) break;
            }

            expect(sprite.y).toBe(sprite.groundY);
        });
    });

    describe('Gold Effect', () => {
        let sprite;

        beforeEach(() => {
            sprite = new MockSprite();
        });

        it('should not be gold initially', () => {
            expect(sprite.isGold()).toBe(false);
        });

        it('should be gold after setCorrect()', () => {
            sprite.setCorrect();
            expect(sprite.isGold()).toBe(true);
            expect(sprite.goldTimer).toBe(3);
        });

        it('should decrement gold timer over time', () => {
            sprite.setCorrect();
            sprite.update(1.0); // 1 second
            expect(sprite.goldTimer).toBe(2);
        });

        it('should stop being gold after timer expires', () => {
            sprite.setCorrect();

            for (let i = 0; i < 200; i++) {
                sprite.update(0.016);
            }

            expect(sprite.isGold()).toBe(false);
        });
    });

    describe('Reset', () => {
        it('should reset all state', () => {
            const sprite = new MockSprite({ groundY: 400 });
            sprite.jump();
            sprite.setCorrect();

            sprite.reset();

            expect(sprite.state).toBe(SpriteState.IDLE);
            expect(sprite.y).toBe(400);
            expect(sprite.jumpVelocity).toBe(0);
            expect(sprite.goldTimer).toBe(0);
        });
    });
});

describe('Sprite Hue Resolution', () => {
    describe('hashStringToHue', () => {
        it('should return value between 0-359', () => {
            const usernames = ['Apple_Tiger', 'Banana_Lion', 'Cherry_Bear', 'test123'];

            for (const username of usernames) {
                const hue = hashStringToHue(username);
                expect(hue).toBeGreaterThanOrEqual(0);
                expect(hue).toBeLessThan(360);
            }
        });

        it('should return consistent values for same input', () => {
            const hue1 = hashStringToHue('Apple_Tiger');
            const hue2 = hashStringToHue('Apple_Tiger');
            expect(hue1).toBe(hue2);
        });

        it('should return different values for different inputs', () => {
            const hue1 = hashStringToHue('Apple_Tiger');
            const hue2 = hashStringToHue('Banana_Lion');
            expect(hue1).not.toBe(hue2);
        });

        it('should handle empty string', () => {
            const hue = hashStringToHue('');
            expect(hue).toBe(0);
        });
    });

    describe('resolveSpriteHue', () => {
        it('should prioritize pigColor', () => {
            const ls = {
                'pigColor_user1': '120',
                'spriteColorHue_user1': '240'
            };

            const hue = resolveSpriteHue('user1', ls);
            expect(hue).toBe(120);
        });

        it('should use spriteColorHue if no pigColor', () => {
            const ls = {
                'spriteColorHue_user1': '240'
            };

            const hue = resolveSpriteHue('user1', ls);
            expect(hue).toBe(240);
        });

        it('should fall back to hash if no stored value', () => {
            const hue = resolveSpriteHue('user1', {});
            const expectedHue = hashStringToHue('user1');
            expect(hue).toBe(expectedHue);
        });
    });
});

describe('Sprite Manager', () => {
    describe('Initialization', () => {
        it('should create player sprite', () => {
            const manager = new MockSpriteManager(400);
            const player = manager.init('playerUser', 180);

            expect(manager.playerSprite).not.toBeNull();
            expect(player.hue).toBe(180);
            expect(player.scale).toBe(1.0);
        });
    });

    describe('Peer Sprite Management', () => {
        let manager;

        beforeEach(() => {
            manager = new MockSpriteManager(400);
        });

        it('should create peer sprite', () => {
            const sprite = manager.ensurePeerSprite('peer1', 90);

            expect(manager.peerSprites.has('peer1')).toBe(true);
            expect(sprite.hue).toBe(90);
            expect(sprite.scale).toBe(0.25);
        });

        it('should return existing sprite if already created', () => {
            const sprite1 = manager.ensurePeerSprite('peer1', 90);
            const sprite2 = manager.ensurePeerSprite('peer1', 180);

            expect(sprite1).toBe(sprite2);
            expect(sprite1.hue).toBe(90); // Original hue preserved
        });

        it('should remove peer sprite', () => {
            manager.ensurePeerSprite('peer1', 90);
            expect(manager.peerSprites.size).toBe(1);

            manager.removePeerSprite('peer1');
            expect(manager.peerSprites.size).toBe(0);
            expect(manager.positionedUsernames).not.toContain('peer1');
        });

        it('should return false when removing non-existent sprite', () => {
            const result = manager.removePeerSprite('nonexistent');
            expect(result).toBe(false);
        });

        it('should clear all peer sprites', () => {
            manager.ensurePeerSprite('peer1', 90);
            manager.ensurePeerSprite('peer2', 180);
            manager.ensurePeerSprite('peer3', 270);

            manager.clearAllPeerSprites();

            expect(manager.peerSprites.size).toBe(0);
            expect(manager.positionedUsernames.length).toBe(0);
        });
    });

    describe('Online Peers Update', () => {
        let manager;

        beforeEach(() => {
            manager = new MockSpriteManager(400);
        });

        it('should add new online peers', () => {
            manager.updateOnlinePeers(['peer1', 'peer2'], 'currentUser');

            expect(manager.peerSprites.size).toBe(2);
            expect(manager.peerSprites.has('peer1')).toBe(true);
            expect(manager.peerSprites.has('peer2')).toBe(true);
        });

        it('should filter out current user', () => {
            manager.updateOnlinePeers(['peer1', 'currentUser', 'peer2'], 'currentUser');

            expect(manager.peerSprites.size).toBe(2);
            expect(manager.peerSprites.has('currentUser')).toBe(false);
        });

        it('should remove offline peers', () => {
            manager.updateOnlinePeers(['peer1', 'peer2', 'peer3'], 'currentUser');
            expect(manager.peerSprites.size).toBe(3);

            manager.updateOnlinePeers(['peer1'], 'currentUser');
            expect(manager.peerSprites.size).toBe(1);
            expect(manager.peerSprites.has('peer1')).toBe(true);
            expect(manager.peerSprites.has('peer2')).toBe(false);
        });
    });

    describe('Positioning', () => {
        let manager;

        beforeEach(() => {
            manager = new MockSpriteManager(400);
            manager.viewportWidth = 800;
        });

        it('should center single peer', () => {
            manager.ensurePeerSprite('peer1', 90);

            const sprite = manager.peerSprites.get('peer1');
            expect(sprite.x).toBe(400); // Center of 800px viewport
        });

        it('should distribute multiple peers evenly', () => {
            manager.ensurePeerSprite('peer1', 90);
            manager.ensurePeerSprite('peer2', 180);
            manager.ensurePeerSprite('peer3', 270);

            const leftMargin = 80; // 10% of 800
            const positions = manager.positionedUsernames.map(u =>
                manager.peerSprites.get(u).x
            );

            expect(positions[0]).toBe(leftMargin);
            expect(positions[2]).toBe(800 - leftMargin);
        });

        it('should reposition when peer removed', () => {
            manager.ensurePeerSprite('peer1', 90);
            manager.ensurePeerSprite('peer2', 180);
            manager.ensurePeerSprite('peer3', 270);

            manager.removePeerSprite('peer2');

            // After removal, remaining 2 peers should be repositioned
            const positions = manager.positionedUsernames.map(u =>
                manager.peerSprites.get(u).x
            );

            expect(positions.length).toBe(2);
        });
    });

    describe('Update Loop', () => {
        it('should update player sprite', () => {
            const manager = new MockSpriteManager(400);
            manager.init('player', 0);
            manager.playerSprite.jump();

            const startY = manager.playerSprite.y;
            manager.update(0.016);

            expect(manager.playerSprite.y).not.toBe(startY);
        });

        it('should update all peer sprites', () => {
            const manager = new MockSpriteManager(400);
            manager.ensurePeerSprite('peer1', 90);
            manager.ensurePeerSprite('peer2', 180);

            manager.peerSprites.get('peer1').jump();
            manager.peerSprites.get('peer2').jump();

            manager.update(0.016);

            expect(manager.peerSprites.get('peer1').state).toBe(SpriteState.JUMPING);
            expect(manager.peerSprites.get('peer2').state).toBe(SpriteState.JUMPING);
        });
    });
});
