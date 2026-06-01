class SpriteManager {
  constructor(engine, spriteSheet) {
    this.engine = engine;
    this.spriteSheet = spriteSheet;
    this.peerSprites = new Map();
    this.positionedUsernames = [];
    this.isTurboActive = false; // Add this line
    this.peerScale = 0.25;

    // Listen for turbo mode changes instead of checking global flag
    window.addEventListener('turboModeChanged', (e) => {
      this.isTurboActive = !!(e.detail && e.detail.enabled);
      if (this.isTurboActive) {
        // Preload peers so they are visible before they answer
        this.preloadKnownPeers();
      } else {
        this.clearAllPeerSprites();
      }
    });

    this._handleResize = this._handleResize.bind(this);
    window.addEventListener('resize', this._handleResize);

    // Listen for presence changes and update displayed peers
    window.addEventListener('presenceChanged', (e) => {
      if (!this.isTurboActive) return;
      const users = (e.detail && Array.isArray(e.detail.users)) ? e.detail.users : [];
      this.updateOnlinePeers(users);
    });
  }
  // True if `username` is the current (signed-in) user. Case/whitespace-robust:
  // roster usernames are lowercase (apple_monkey) but cr normalizes
  // currentUsername to Title_Case (Apple_Monkey), so an exact !== match would let
  // SELF slip through and render as a phantom "peer" sprite. Compare normalized
  // (trim + lowercase) forms so case can never matter.
  _isSelf(username) {
    const norm = (n) => String(n == null ? '' : n).trim().toLowerCase();
    let current = window.currentUsername || '';
    try { current = current || localStorage.getItem('consensusUsername') || ''; }
    catch (e) { /* localStorage may be blocked */ }
    return norm(username) === norm(current);
  }
  ensurePeerSprite(username) {
    if (this.peerSprites.has(username)) return this.peerSprites.get(username);
    const y = this.engine.groundY - this.spriteSheet.frameHeight * this.peerScale;
    const peerSprite = new PeerSprite(this.spriteSheet, username, 0, y);
    peerSprite.hue = this.resolvePeerHue(username);
    this.peerSprites.set(username, peerSprite);
    if (!this.positionedUsernames.includes(username)) this.positionedUsernames.push(username);
    this.engine.addEntity(`peer_${username}`, peerSprite);
    this.repositionPeers();
    return peerSprite;
  }
  preloadPeers(usernames = []) {
    if (!Array.isArray(usernames) || usernames.length === 0) return;
    usernames
      .filter((u) => u && !this._isSelf(u))
      .forEach((u) => this.ensurePeerSprite(u));
  }
  getKnownPeerUsernames() {
    const set = new Set();
    // Prefer classData.users if available
    try {
      const usersObj = (window.classData && window.classData.users) || null;
      if (usersObj && typeof usersObj === 'object') {
        Object.keys(usersObj).forEach((u) => set.add(u));
      }
    } catch {}
    // Fallback: scan localStorage for answers_* and progress_*
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (key.startsWith('answers_')) set.add(key.replace('answers_', ''));
        if (key.startsWith('progress_')) set.add(key.replace('progress_', ''));
      }
    } catch {}
    return Array.from(set);
  }
  preloadKnownPeers() {
    if (!this.isTurboActive) return;
    // Only show peers that are currently online; no offline fallback
    const online = (window.onlineUsers && Array.from(window.onlineUsers)) || [];
    this.updateOnlinePeers(online);
  }
  updateOnlinePeers(onlineUsernames) {
    const desired = new Set((onlineUsernames || []).filter((u) => u && !this._isSelf(u)));

    // Add missing peers
    desired.forEach((u) => {
      if (!this.peerSprites.has(u)) this.ensurePeerSprite(u);
    });

    // Remove peers no longer online
    Array.from(this.peerSprites.keys()).forEach((u) => {
      if (!desired.has(u)) this.removePeerSprite(u);
    });
  }
  _handleResize() { this.repositionPeers(); }
  resolvePeerHue(username) {
    // Try localStorage first (sync, may be blocked)
    try {
      const legacyKey = `pigColor_${username}`;
      const altKey = `spriteColorHue_${username}`;
      const vals = [localStorage.getItem(legacyKey), localStorage.getItem(altKey)];
      for (const v of vals) {
        const n = v == null ? NaN : parseInt(v, 10);
        if (!Number.isNaN(n)) return ((n % 360) + 360) % 360;
      }
    } catch (e) {
      // localStorage may be blocked
    }
    // Fall back to hash-based hue
    return this.hashStringToHue(username);
  }
  hashStringToHue(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash) % 360;
  }
  computeSlots(count, spriteWidth) {
    const viewportWidth = this.engine.canvas.width / (window.devicePixelRatio || 1);
    if (count <= 0) return [];
    const leftMargin = viewportWidth * 0.10;
    const usable = viewportWidth - (leftMargin * 2);
    if (count === 1) return [leftMargin + usable / 2 - spriteWidth / 2];
    const gap = usable / (count - 1);
    return Array.from({ length: count }, (_, i) => leftMargin + i * gap - spriteWidth / 2);
  }
  repositionPeers() {
    const list = this.positionedUsernames;
    if (!list.length) return;
    const spriteWidth = this.spriteSheet.frameWidth * this.peerScale; // Peer scale
    const xs = this.computeSlots(list.length, spriteWidth);
    const y = this.engine.groundY - this.spriteSheet.frameHeight * this.peerScale;
    list.forEach((username, i) => {
      const sprite = this.peerSprites.get(username);
      if (sprite) {
        sprite.x = Math.max(0, xs[i]);
        sprite.y = y;
      }
    });
  }
  handlePeerAnswer(username, isCorrect) {
    if (!this.isTurboActive) return; // Changed from window.turboModeActive
    if (this._isSelf(username)) return; // never render self as a peer (self-echo guard)
    const peerSprite = this.ensurePeerSprite(username);
    if (isCorrect) {
      peerSprite.celebrate();
    } else {
      peerSprite.jump();
    }
  }
  removePeerSprite(username) {
    if (!this.peerSprites.has(username)) return;
    this.engine.removeEntity(`peer_${username}`);
    this.peerSprites.delete(username);
    this.positionedUsernames = this.positionedUsernames.filter((u) => u !== username);
    this.repositionPeers();
  }
  clearAllPeerSprites() {
    this.peerSprites.forEach((_, username) => this.engine.removeEntity(`peer_${username}`));
    this.peerSprites.clear();
    this.positionedUsernames = [];
  }
}