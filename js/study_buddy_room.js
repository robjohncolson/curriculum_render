/**
 * StudyBuddyRoom - Manages the room for a student's current lesson
 *
 * Features:
 * - Scrolling camera that follows the player
 * - Exit door floating at height based on unit number (only visible in own room)
 * - Unit blocks spawned in pyramid formation (must stack to reach door)
 * - Invisible incline for pushing blocks up
 * - Peer sprites overlay: when peers join same lesson, their sprite + blocks appear
 *
 * The room is always present while a student works. Canvas size = browser screen.
 * Peers appear as overlays with their own sprite and block positions synced.
 */
class StudyBuddyRoom {
  constructor(engine, options = {}) {
    this.engine = engine;

    // Room dimensions - canvas is always browser screen size
    this.roomWidth = options.roomWidth || 1200;
    this.groundHeight = 50;

    // Camera
    this.cameraX = 0;
    this.cameraSmoothing = 0.1; // Lerp factor for smooth camera

    // Walls
    this.wallLeft = 0;
    this.wallRight = this.roomWidth;

    // Floating door (no platform - must stack blocks to reach)
    // Door is only visible in player's own room, not when viewing peers
    this.door = null;
    this.showDoor = true; // Set to false when rendering peer view

    // Menu door on the left side (opens FAB menu)
    this.menuDoor = null;

    // Unit blocks (player's own blocks)
    this.blocks = [];

    // Peer data (other players on same lesson)
    // Each peer has: { username, sprite, blocks[], x, y, hue }
    this.peers = new Map(); // username -> { sprite, blocks, x, y, hue, completedUnits }

    // Current lesson info
    this.currentLessonId = null;
    this.currentUnitNumber = 1;

    // Reference back to engine
    engine.room = this;
  }

  /**
   * Get the ground Y position (top of ground)
   */
  get groundY() {
    const dpr = window.devicePixelRatio || 1;
    const viewportHeight = this.engine.canvas.height / dpr;
    return viewportHeight - this.groundHeight;
  }

  /**
   * Get viewport width
   */
  get viewportWidth() {
    const dpr = window.devicePixelRatio || 1;
    return this.engine.canvas.width / dpr;
  }

  /**
   * Initialize the room for a specific lesson
   * @param {string} lessonId - The lesson ID (e.g., "U2-L3")
   * @param {number} unitNumber - Which unit this lesson is in
   * @param {Array} completedUnits - Array of unit numbers the player has completed
   * @param {number} playerHue - The player's sprite hue
   */
  initialize(lessonId, unitNumber, completedUnits, playerHue) {
    this.currentLessonId = lessonId;
    this.currentUnitNumber = unitNumber;

    // Block dimensions
    const blockHeight = 48;
    const blockWidth = 40;

    // How many blocks needed to reach door
    const blocksNeeded = Math.max(0, unitNumber - 1);
    this.blocksNeededForDoor = blocksNeeded;

    // Get viewport dimensions for positioning doors relative to screen
    const viewportWidth = this.viewportWidth;

    // Load level configuration from STUDY_BUDDY_LEVELS (data/levels.js)
    // Falls back to defaults if not found
    const levelKey = `unit${unitNumber}`;
    const levelConfig = (window.STUDY_BUDDY_LEVELS && window.STUDY_BUDDY_LEVELS[levelKey]) || null;

    if (levelConfig) {
      // Use level editor configuration
      this.roomWidth = levelConfig.roomWidth || 1200;
      this.wallRight = this.roomWidth;

      if (levelConfig.incline) {
        // Has incline/cliff - Unit 2+
        const inclineStartX = levelConfig.incline.startX;
        const inclineEndX = levelConfig.incline.endX;
        const inclineHeight = levelConfig.incline.height;

        this.cliffEdgeX = inclineEndX;
        this.cliffHeight = inclineHeight;
        this.cliffTopY = this.groundY - inclineHeight;

        // Create the incline ramp with configurable start position
        this.createIncline(inclineStartX, inclineEndX, inclineHeight);

        // Door position from config
        const doorElevation = blocksNeeded * blockHeight + (levelConfig.door.elevation || 30);
        const doorBottomY = this.groundY - doorElevation;
        this.door = new ExitDoor(levelConfig.door.x, doorBottomY - 68);
        this.door.engine = this.engine;

        // Create unit blocks at independent spawn position
        if (levelConfig.blockSpawn) {
          const spawnX = levelConfig.blockSpawn.x;
          const spawnY = this.groundY - levelConfig.blockSpawn.y;
          this.createUnitBlocks(completedUnits, playerHue, spawnX, spawnY, blockWidth, blockHeight);
        }
      } else {
        // No incline - Unit 1
        this.cliffEdgeX = null;
        this.cliffHeight = 0;
        this.cliffTopY = null;
        this.incline = null;

        // For flat levels with screen-fixed doors, limit room to viewport width
        // so player can actually reach the door
        this.roomWidth = viewportWidth;
        this.wallRight = viewportWidth;

        // Exit door positioned relative to viewport - always visible on right side
        const exitDoorX = viewportWidth - 70; // 70px from right edge (door width ~50px + margin)
        this.door = new ExitDoor(exitDoorX, this.groundY - 68);
        this.door.engine = this.engine;
      }
    } else {
      // Fallback to hardcoded defaults (in case levels.js isn't loaded)
      console.warn(`No level config found for ${levelKey}, using defaults`);
      this.initializeDefaults(unitNumber, completedUnits, playerHue, blockWidth, blockHeight, blocksNeeded);
    }

    // Check if this is a progress check (show star)
    this.door.showStar = lessonId.includes('Progress') || lessonId.includes('PC');

    // Create menu door on the left side (opens FAB menu)
    // Position it at ground level on the far left - always visible
    this.menuDoor = new MenuDoor(20, this.groundY - 68);
    this.menuDoor.engine = this.engine;

    // Reset camera
    this.cameraX = 0;
  }

  /**
   * Fallback initialization when level config is not available
   */
  initializeDefaults(unitNumber, completedUnits, playerHue, blockWidth, blockHeight, blocksNeeded) {
    const viewportWidth = this.viewportWidth;
    const exitDoorX = viewportWidth - 70; // Always visible on right side

    if (blocksNeeded === 0) {
      this.cliffEdgeX = null;
      this.cliffHeight = 0;
      this.cliffTopY = null;
      this.incline = null;

      // For flat levels with screen-fixed doors, limit room to viewport width
      this.roomWidth = viewportWidth;
      this.wallRight = viewportWidth;

      this.door = new ExitDoor(exitDoorX, this.groundY - 68);
      this.door.engine = this.engine;
    } else {
      const doorElevation = blocksNeeded * blockHeight + 30;
      const cliffHeight = 250;
      const cliffEdgeX = this.roomWidth - 400;

      this.cliffEdgeX = cliffEdgeX;
      this.cliffHeight = cliffHeight;
      this.cliffTopY = this.groundY - cliffHeight;

      const doorBottomY = this.groundY - doorElevation;
      this.door = new ExitDoor(exitDoorX, doorBottomY - 68);
      this.door.engine = this.engine;

      // Default incline starts at x=50
      this.createIncline(50, cliffEdgeX, cliffHeight);
      this.createUnitBlocks(completedUnits, playerHue, cliffEdgeX - 150, this.cliffTopY, blockWidth, blockHeight);
    }
  }

  /**
   * Create an incline/ramp from a configurable start position up to the cliff edge
   * The cliff has a sheer drop on the right side into the "pit" where the door is
   * @param {number} startX - Where the incline starts (bottom of ramp)
   * @param {number} endX - Where the incline ends (top of cliff / drop-off point)
   * @param {number} height - How tall the cliff is
   */
  createIncline(startX, endX, height) {
    this.incline = {
      startX: startX,
      endX: endX,
      startY: this.groundY, // Ground level at start
      endY: this.groundY - height, // Cliff top at end
      width: endX - startX,
      height: height
    };
  }

  /**
   * Get the Y position at a given X on the incline/cliff ramp
   * Returns null if X is not on the incline
   */
  getInclineY(x) {
    if (!this.incline) return null;
    if (x < this.incline.startX || x > this.incline.endX) return null;

    // Linear interpolation from ground to cliff top
    const t = (x - this.incline.startX) / this.incline.width;
    return this.incline.startY - (t * this.incline.height);
  }

  /**
   * Check if position is in the "pit" area (right of cliff)
   * Used for collision - blocks in pit can't go back left past the cliff wall
   */
  isInPit(x) {
    if (!this.cliffEdgeX) return false;
    return x >= this.cliffEdgeX;
  }

  /**
   * Create unit blocks in pyramid formation on top of the cliff
   * @param {Array} completedUnits - Array of unit numbers
   * @param {number} playerHue - Owner's hue
   * @param {number} spawnX - X position for block spawn center
   * @param {number} cliffTopY - Y position of cliff top
   * @param {number} blockWidth - Width of blocks
   * @param {number} blockHeight - Height of blocks
   */
  createUnitBlocks(completedUnits, playerHue, spawnX, cliffTopY, blockWidth, blockHeight) {
    // Clear existing blocks
    this.blocks.forEach((block, i) => {
      this.engine.removeEntity(`block_${i}`);
    });
    this.blocks = [];

    if (!completedUnits || completedUnits.length === 0) return;

    // Sort units
    const units = [...completedUnits].sort((a, b) => a - b);

    // Calculate pyramid layout
    const rows = this.calculatePyramidRows(units.length);

    const blockGap = 8;

    // Spawn blocks on top of the cliff at the specified spawn position
    const startX = spawnX;
    const baseY = cliffTopY - blockHeight; // On top of cliff

    let unitIndex = 0;

    rows.forEach((rowCount, rowIndex) => {
      // Center each row around spawn point
      const rowWidth = rowCount * blockWidth + (rowCount - 1) * blockGap;
      const rowStartX = startX + (rows[0] * (blockWidth + blockGap) - rowWidth) / 2;
      const rowY = baseY - rowIndex * (blockHeight + 4); // Stack with small gap

      for (let col = 0; col < rowCount && unitIndex < units.length; col++) {
        const block = new UnitBlock(
          units[unitIndex],
          playerHue,
          rowStartX + col * (blockWidth + blockGap),
          rowY
        );
        block.engine = this.engine;
        this.blocks.push(block);
        this.engine.addEntity(`block_${this.blocks.length - 1}`, block);
        unitIndex++;
      }
    });
  }

  /**
   * Calculate pyramid row distribution
   * e.g., 6 blocks = [3, 2, 1]
   * @param {number} count - Number of blocks
   * @returns {Array} - Array of counts per row (bottom to top)
   */
  calculatePyramidRows(count) {
    if (count === 0) return [];
    if (count === 1) return [1];
    if (count === 2) return [2];

    // Find the base width that can hold all blocks in a pyramid
    // Sum of 1+2+...+base = base*(base+1)/2
    let base = 1;
    while ((base * (base + 1)) / 2 < count) {
      base++;
    }

    // Distribute blocks into rows
    const rows = [];
    let remaining = count;

    for (let row = base; row >= 1 && remaining > 0; row--) {
      const rowCount = Math.min(row, remaining);
      rows.push(rowCount);
      remaining -= rowCount;
    }

    return rows;
  }

  /**
   * Add a peer to the room (another player on the same lesson)
   * Peer sprites and blocks are rendered as overlays - they don't interact with player's physics
   * @param {string} username - Peer's username
   * @param {Object} spriteSheet - Sprite sheet reference
   * @param {number} hue - Peer's sprite hue
   * @param {Array} completedUnits - Peer's completed units (for their blocks)
   * @param {Object} position - Peer's current position { x, y }
   * @param {Array} blockPositions - Peer's block positions [{ x, y, unitNumber }, ...]
   */
  addPeer(username, spriteSheet, hue, completedUnits, position, blockPositions) {
    // Remove existing peer if present
    if (this.peers.has(username)) {
      this.removePeer(username);
    }

    // Create peer sprite (smaller scale, non-interactive)
    const peerSprite = new PeerSprite(
      spriteSheet,
      username,
      position?.x || 100,
      position?.y || (this.groundY - spriteSheet.frameHeight * 0.25)
    );
    peerSprite.hue = hue;
    peerSprite.scale = 0.25; // Smaller peer sprites
    this.engine.addEntity(`peer_${username}`, peerSprite);

    // Create peer's blocks (visual only, no physics interaction with player)
    const peerBlocks = [];
    if (blockPositions && blockPositions.length > 0) {
      blockPositions.forEach((blockPos, i) => {
        const block = new UnitBlock(
          blockPos.unitNumber,
          hue,
          blockPos.x,
          blockPos.y
        );
        block.engine = this.engine;
        block.ownerUsername = username;
        block.isPeerBlock = true; // Mark as peer block (no physics interaction)
        peerBlocks.push(block);
        this.engine.addEntity(`peerblock_${username}_${i}`, block);
      });
    }

    // Store peer data
    this.peers.set(username, {
      username,
      sprite: peerSprite,
      blocks: peerBlocks,
      hue,
      completedUnits: completedUnits || []
    });
  }

  /**
   * Update a peer's position and block positions (called when receiving sync data)
   * @param {string} username - Peer's username
   * @param {Object} position - New position { x, y }
   * @param {Array} blockPositions - New block positions [{ x, y, unitNumber }, ...]
   */
  updatePeer(username, position, blockPositions) {
    const peer = this.peers.get(username);
    if (!peer) return;

    // Update sprite position
    if (position && peer.sprite) {
      peer.sprite.x = position.x;
      peer.sprite.y = position.y;
    }

    // Update block positions
    if (blockPositions && peer.blocks) {
      blockPositions.forEach((blockPos, i) => {
        if (peer.blocks[i]) {
          peer.blocks[i].x = blockPos.x;
          peer.blocks[i].y = blockPos.y;
        }
      });
    }
  }

  /**
   * Remove a peer from the room
   * @param {string} username - Peer's username
   */
  removePeer(username) {
    const peer = this.peers.get(username);
    if (!peer) return;

    // Remove sprite
    this.engine.removeEntity(`peer_${username}`);

    // Remove blocks
    peer.blocks.forEach((block, i) => {
      this.engine.removeEntity(`peerblock_${username}_${i}`);
    });

    this.peers.delete(username);
  }

  /**
   * Get current player position and block positions for syncing to peers
   * @param {Object} playerSprite - The player sprite
   * @returns {Object} { position: {x, y}, blockPositions: [{x, y, unitNumber}, ...] }
   */
  getSyncData(playerSprite) {
    const position = playerSprite ? { x: playerSprite.x, y: playerSprite.y } : null;

    // Get player's own block positions (not peer blocks)
    const blockPositions = this.blocks
      .filter(block => !block.isPeerBlock && !block.ownerUsername)
      .map(block => ({
        x: block.x,
        y: block.y,
        unitNumber: block.unitNumber
      }));

    return { position, blockPositions };
  }

  /**
   * Update camera to follow player
   * @param {Object} player - Player sprite with x position
   */
  updateCamera(player) {
    if (!player) return;

    const viewportWidth = this.viewportWidth;
    const targetX = player.x - viewportWidth / 2;

    // Clamp target to room bounds
    const maxCameraX = Math.max(0, this.roomWidth - viewportWidth);
    const clampedTarget = Math.max(0, Math.min(targetX, maxCameraX));

    // Smooth camera movement
    this.cameraX += (clampedTarget - this.cameraX) * this.cameraSmoothing;
  }

  /**
   * Check collision between sprite and all blocks
   * Returns the block the sprite is standing on, if any
   */
  checkBlockCollisions(sprite) {
    const spriteBottom = sprite.y + (sprite.height || sprite.spriteSheet.frameHeight * sprite.scale);
    const spriteWidth = sprite.width || sprite.spriteSheet.frameWidth * sprite.scale;

    let standingOn = null;

    for (const block of this.blocks) {
      // Check if standing on block
      if (block.isPointOnTop(sprite.x, spriteBottom, spriteWidth)) {
        standingOn = block;
      }

      // Check horizontal collision for pushing
      // (simplified - full collision would be more complex)
    }

    return standingOn;
  }

  /**
   * Check if player reached the door
   */
  checkDoorCollision(player) {
    if (!this.door) return false;

    const playerWidth = player.spriteSheet.frameWidth * player.scale;
    const playerHeight = player.spriteSheet.frameHeight * player.scale;

    return this.door.isOverlapping({
      x: player.x,
      y: player.y,
      width: playerWidth,
      height: playerHeight
    });
  }

  /**
   * Check if player entered the menu door
   * Returns true only on first entry (not while staying inside)
   */
  checkMenuDoorCollision(player) {
    if (!this.menuDoor) return false;

    return this.menuDoor.checkPlayerEnter(player);
  }

  /**
   * Render the room environment
   * Background is transparent - only render door (incline is invisible but functional)
   */
  render(ctx) {
    // Incline is invisible but still functional for collision
    // No platform rendered - player must stack blocks to reach door

    // Render menu door (on left side of room)
    if (this.menuDoor) {
      this.menuDoor.render(ctx);
    }

    // Render exit door (on right side of room) - only if showDoor is true
    // Door is hidden when viewing peer's room or in shared view
    if (this.door && this.showDoor) {
      this.door.render(ctx);
    }

    // Debug info
    if (window.debugStudyBuddy) {
      ctx.fillStyle = '#333';
      ctx.font = '12px monospace';
      ctx.fillText(`Unit ${this.currentUnitNumber}: Need ${this.blocksNeededForDoor} blocks + jump to reach door`, 10, 20);
      ctx.fillText(`Cliff edge: ${this.cliffEdgeX}px, Blocks: ${this.blocks.length}, Peers: ${this.peers.size}`, 10, 36);

      // Show cliff ramp in debug mode only
      if (this.incline) {
        ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(this.incline.startX - this.cameraX, this.incline.startY);
        ctx.lineTo(this.incline.endX - this.cameraX, this.incline.endY);
        // Draw vertical cliff edge
        ctx.lineTo(this.incline.endX - this.cameraX, this.groundY);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /**
   * Clean up room
   */
  destroy() {
    // Remove player's blocks
    this.blocks.forEach((block, i) => {
      this.engine.removeEntity(`block_${i}`);
    });
    this.blocks = [];

    // Remove all peers
    this.peers.forEach((peer, username) => {
      this.removePeer(username);
    });
    this.peers.clear();

    this.door = null;
    this.menuDoor = null;
    this.engine.room = null;
  }

  /**
   * Remove all peers (e.g., when leaving lesson)
   */
  clearPeers() {
    this.peers.forEach((peer, username) => {
      this.removePeer(username);
    });
    this.peers.clear();
  }
}

// Export
if (typeof window !== 'undefined') {
  window.StudyBuddyRoom = StudyBuddyRoom;
}
