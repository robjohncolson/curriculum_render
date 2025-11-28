/**
 * UnitBlock - A pushable, jumpable block representing a completed unit
 *
 * Visual: Slightly taller than square rectangle with thick border
 * - Border color matches owner's sprite hue
 * - Number inside indicates unit number (1-9)
 * - Can be pushed by sprites
 * - Can be stood on by sprites
 */
class UnitBlock {
  constructor(unitNumber, ownerHue, x, y) {
    this.unitNumber = unitNumber;
    this.ownerHue = ownerHue;
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 48;
    this.borderWidth = 5;

    // Physics
    this.vx = 0;
    this.vy = 0;
    this.gravity = 1200;
    this.friction = 0.7; // Higher friction = stops faster
    this.isOnGround = false;
    this.isBeingPushed = false;

    // Peer block flag - if true, skip physics (position synced from peer)
    this.isPeerBlock = false;

    // Reference to engine (set when added)
    this.engine = null;
  }

  get bounds() {
    return {
      left: this.x,
      right: this.x + this.width,
      top: this.y,
      bottom: this.y + this.height
    };
  }

  update(deltaTime) {
    // Peer blocks don't have physics - their position is synced from the peer
    if (this.isPeerBlock) return;

    // Apply gravity
    this.vy += this.gravity * deltaTime;

    // Apply friction to horizontal movement
    if (!this.isBeingPushed) {
      this.vx *= this.friction;
      if (Math.abs(this.vx) < 1) this.vx = 0;
    }
    this.isBeingPushed = false;

    // Store previous position for collision resolution
    const prevX = this.x;
    const prevY = this.y;

    // Integrate position
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Ground collision
    if (this.engine && this.engine.room) {
      const groundY = this.engine.room.groundY;
      this.isOnGround = false;

      // Check collision with other blocks FIRST
      const room = this.engine.room;
      for (const other of room.blocks) {
        if (other === this) continue;

        // Check if overlapping
        if (this.overlaps(other)) {
          // Determine collision direction based on previous position
          const wasAbove = prevY + this.height <= other.y + 4;
          const wasBelow = prevY >= other.y + other.height - 4;
          const wasLeft = prevX + this.width <= other.x + 4;
          const wasRight = prevX >= other.x + other.width - 4;

          if (wasAbove && this.vy >= 0) {
            // Landing on top of another block
            this.y = other.y - this.height;
            this.vy = 0;
            this.isOnGround = true;
          } else if (wasBelow && this.vy < 0) {
            // Hit from below
            this.y = other.y + other.height;
            this.vy = 0;
          } else if (wasLeft && this.vx > 0) {
            // Hit from left - push the other block gently
            this.x = other.x - this.width;
            other.push(this.vx * 0.3);
            this.vx = 0;
          } else if (wasRight && this.vx < 0) {
            // Hit from right - push the other block gently
            this.x = other.x + other.width;
            other.push(this.vx * 0.3);
            this.vx = 0;
          } else {
            // Fallback: separate horizontally
            const overlapX = Math.min(this.x + this.width, other.x + other.width) - Math.max(this.x, other.x);
            const overlapY = Math.min(this.y + this.height, other.y + other.height) - Math.max(this.y, other.y);

            if (overlapX < overlapY) {
              // Separate horizontally
              if (this.x < other.x) {
                this.x = other.x - this.width;
              } else {
                this.x = other.x + other.width;
              }
              this.vx = 0;
            } else {
              // Separate vertically
              if (this.y < other.y) {
                this.y = other.y - this.height;
                this.isOnGround = true;
              } else {
                this.y = other.y + other.height;
              }
              this.vy = 0;
            }
          }
        }
      }

      // Incline collision (blocks can roll up/down ramp)
      let onIncline = false;
      if (room.incline && this.vy >= 0) {
        const blockCenterX = this.x + this.width / 2;
        const inclineY = room.getInclineY(blockCenterX);
        if (inclineY !== null) {
          const blockBottom = this.y + this.height;
          if (blockBottom >= inclineY) {
            this.y = inclineY - this.height;
            this.vy = 0;
            this.isOnGround = true;
            onIncline = true;
          }
        }
      }

      // Ground collision
      if (!onIncline && this.y + this.height >= groundY) {
        this.y = groundY - this.height;
        this.vy = 0;
        this.isOnGround = true;
      }

      // Wall collision
      if (this.x < room.wallLeft) {
        this.x = room.wallLeft;
        this.vx = 0;
      }
      if (this.x + this.width > room.wallRight) {
        this.x = room.wallRight - this.width;
        this.vx = 0;
      }

      // Cliff wall collision - blocks in pit can't go back left past the cliff edge
      // This creates a one-way drop: blocks fall into pit but can't be pushed back up
      if (room.cliffEdgeX && room.isInPit(this.x + this.width)) {
        // Block is in the pit (right side of cliff)
        // If trying to go left past the cliff wall, stop it
        if (this.x < room.cliffEdgeX) {
          this.x = room.cliffEdgeX;
          this.vx = 0;
        }
      }
    }
  }

  /**
   * Check if this block overlaps another block
   */
  overlaps(other) {
    return this.x < other.x + other.width &&
           this.x + this.width > other.x &&
           this.y < other.y + other.height &&
           this.y + this.height > other.y;
  }

  /**
   * Push the block horizontally
   * @param {number} force - Horizontal force to apply
   */
  push(force) {
    this.vx += force;
    this.isBeingPushed = true;
  }

  /**
   * Check if a point is on top of this block (for standing)
   * @param {number} px - Point x
   * @param {number} py - Point y (bottom of sprite)
   * @param {number} pwidth - Width of sprite
   * @returns {boolean}
   */
  isPointOnTop(px, py, pwidth) {
    const tolerance = 4;
    const onTopY = Math.abs(py - this.y) < tolerance;
    const withinX = (px + pwidth > this.x) && (px < this.x + this.width);
    return onTopY && withinX;
  }

  /**
   * Get the top Y position (for sprites to stand on)
   */
  get topY() {
    return this.y;
  }

  render(ctx) {
    const cameraX = this.engine?.room?.cameraX || 0;
    const drawX = this.x - cameraX;

    // Convert hue to HSL color
    const borderColor = `hsl(${this.ownerHue}, 70%, 45%)`;
    const fillColor = '#f5f5f0'; // Solid off-white
    const textColor = `hsl(${this.ownerHue}, 80%, 30%)`;
    const cornerRadius = 6;

    // Draw rounded rectangle with off-white fill
    ctx.beginPath();
    ctx.roundRect(drawX, this.y, this.width, this.height, cornerRadius);
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Draw thick colored border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = this.borderWidth;
    ctx.stroke();

    // Draw unit number
    ctx.fillStyle = textColor;
    ctx.font = 'bold 16px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this.unitNumber.toString(),
      drawX + this.width / 2,
      this.y + this.height / 2 + 2
    );
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.UnitBlock = UnitBlock;
}
