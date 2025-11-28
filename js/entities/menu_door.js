/**
 * MenuDoor - A door on the left side that opens the settings/FAB menu
 *
 * Visual: Arch door shape like ExitDoor, but pink (light mode) or green (dark mode)
 * Shows a menu icon (☰) above it
 */
class MenuDoor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 50;
    this.height = 68;
    this.archRadius = this.width / 2;

    // Reference to engine (set when added)
    this.engine = null;

    // Track if player is inside (to prevent repeated triggers)
    this.playerInside = false;

    // If true, door is fixed to screen position (doesn't scroll with camera)
    this.screenFixed = true;
  }

  /**
   * Get door colors based on current theme
   */
  get colors() {
    const isDarkMode = document.body.classList.contains('dark-mode');
    if (isDarkMode) {
      return {
        fill: 'rgba(34, 197, 94, 0.85)',      // Green
        outline: 'rgba(22, 163, 74, 0.95)',   // Darker green
        icon: '#166534'                        // Dark green for icon
      };
    } else {
      return {
        fill: 'rgba(236, 72, 153, 0.85)',     // Pink
        outline: 'rgba(219, 39, 119, 0.95)',  // Darker pink
        icon: '#9d174d'                        // Dark pink for icon
      };
    }
  }

  get bounds() {
    return {
      left: this.x,
      right: this.x + this.width,
      top: this.y,
      bottom: this.y + this.height
    };
  }

  /**
   * Check if a sprite is overlapping with the door
   * @param {Object} sprite - Sprite with x, y, width, height
   * @returns {boolean}
   */
  isOverlapping(sprite) {
    // For screen-fixed doors, compare against sprite's screen position
    const cameraX = this.screenFixed ? (this.engine?.room?.cameraX || 0) : 0;
    const spriteScreenX = sprite.x - cameraX;

    const spriteRight = spriteScreenX + (sprite.width || 30);
    const spriteBottom = sprite.y + (sprite.height || 40);
    const doorCenterX = this.x + this.width / 2;

    // Check if sprite center is within door bounds
    const spriteCenterX = spriteScreenX + (sprite.width || 30) / 2;
    const withinX = Math.abs(spriteCenterX - doorCenterX) < this.width / 2;
    const withinY = sprite.y < this.y + this.height && spriteBottom > this.y;

    return withinX && withinY;
  }

  /**
   * Check collision and trigger menu if player enters
   * @param {Object} player - Player sprite
   * @returns {boolean} True if player just entered the door
   */
  checkPlayerEnter(player) {
    const isOverlapping = this.isOverlapping({
      x: player.x,
      y: player.y,
      width: player.spriteSheet.frameWidth * player.scale,
      height: player.spriteSheet.frameHeight * player.scale
    });

    if (isOverlapping && !this.playerInside) {
      this.playerInside = true;
      return true; // Player just entered
    } else if (!isOverlapping) {
      this.playerInside = false;
    }

    return false;
  }

  update(deltaTime) {
    // Door is static, no physics
  }

  render(ctx) {
    // If screen-fixed, don't apply camera offset (door stays in place on screen)
    const cameraX = this.screenFixed ? 0 : (this.engine?.room?.cameraX || 0);
    const drawX = this.x - cameraX;
    const colors = this.colors;

    ctx.save();

    // Draw door outline/frame first (slightly larger)
    ctx.fillStyle = colors.outline;
    ctx.beginPath();
    ctx.moveTo(drawX - 3, this.y + this.height + 3);
    ctx.lineTo(drawX - 3, this.y + this.archRadius);
    ctx.arc(
      drawX + this.archRadius,
      this.y + this.archRadius,
      this.archRadius + 3,
      Math.PI,
      0,
      false
    );
    ctx.lineTo(drawX + this.width + 3, this.y + this.height + 3);
    ctx.closePath();
    ctx.fill();

    // Draw the arch door shape (inner part)
    ctx.fillStyle = colors.fill;
    ctx.beginPath();

    // Start at bottom left
    ctx.moveTo(drawX, this.y + this.height);

    // Left side up
    ctx.lineTo(drawX, this.y + this.archRadius);

    // Arch at top (half circle)
    ctx.arc(
      drawX + this.archRadius,
      this.y + this.archRadius,
      this.archRadius,
      Math.PI,
      0,
      false
    );

    // Right side down
    ctx.lineTo(drawX + this.width, this.y + this.height);

    // Close the path
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.MenuDoor = MenuDoor;
}
