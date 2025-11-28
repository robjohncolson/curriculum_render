/**
 * ExitDoor - A door that takes you back to lesson select
 *
 * Visual: Dark grey arch (flat bottom, flat sides, half-circle top)
 * Like a mouse hole from Piko Park
 */
class ExitDoor {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 50;
    this.height = 68;
    this.archRadius = this.width / 2;

    // Door color (semi-transparent dark)
    this.color = 'rgba(10, 10, 10, 0.8)';
    this.outlineColor = 'rgba(80, 80, 80, 0.9)';

    // Reference to engine (set when added)
    this.engine = null;

    // Optional: show gold star above door
    this.showStar = false;

    // If true, door is fixed to screen position (doesn't scroll with camera)
    this.screenFixed = true;
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
   * Check if a sprite is overlapping with the door (to trigger exit)
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

  update(deltaTime) {
    // Door is static, no physics
  }

  render(ctx) {
    // If screen-fixed, don't apply camera offset (door stays in place on screen)
    const cameraX = this.screenFixed ? 0 : (this.engine?.room?.cameraX || 0);
    const drawX = this.x - cameraX;

    ctx.save();

    // Draw door outline/frame first (slightly larger)
    ctx.fillStyle = this.outlineColor;
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

    // Draw the arch door shape (inner dark part)
    ctx.fillStyle = this.color;
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

    // Draw gold star above door if progress check completed
    if (this.showStar) {
      this.drawStar(ctx, drawX + this.width / 2, this.y - 15, 14, 5, 0.5);
    }

    ctx.restore();
  }

  /**
   * Draw a 5-pointed star
   */
  drawStar(ctx, cx, cy, outerRadius, points, innerRatio) {
    const innerRadius = outerRadius * innerRatio;
    const step = Math.PI / points;

    ctx.fillStyle = '#FFD700'; // Gold
    ctx.beginPath();

    for (let i = 0; i < 2 * points; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.fill();

    // Add slight outline
    ctx.strokeStyle = '#B8860B';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.ExitDoor = ExitDoor;
}
