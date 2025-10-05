class SpriteSheet {
  constructor(imagePath, frameWidth, frameHeight, options = {}) {
    this.image = new Image();
    this.image.src = imagePath;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    const { columns = 11, rows = 2, paddingX = 4, paddingY = 4 } = options;
    this.columns = columns;
    this.rows = rows;
    this.paddingX = paddingX;
    this.paddingY = paddingY;
    this.loaded = false;
    this.image.onload = () => { this.loaded = true; };
  }
  indexToGrid(index) {
    const col = index % this.columns;
    const row = Math.floor(index / this.columns);
    return { col, row };
  }
  getSourceRect(col, row) {
    const sx = col * (this.frameWidth + this.paddingX);
    const sy = row * (this.frameHeight + this.paddingY);
    return { sx, sy, sw: this.frameWidth, sh: this.frameHeight };
  }
  drawFrame(ctx, frameIndex, x, y, scale = 1, hueDegrees = 0) {
    if (!this.loaded) return;
    const { col, row } = this.indexToGrid(frameIndex);
    const { sx, sy, sw, sh } = this.getSourceRect(col, row);
    ctx.save();
    if (hueDegrees !== 0) {
      ctx.filter = `hue-rotate(${hueDegrees}deg)`;
    }
    ctx.drawImage(this.image, sx, sy, sw, sh, x, y, sw * scale, sh * scale);
    ctx.restore();
  }
}