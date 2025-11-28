class CanvasEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.entities = new Map(); // Map<entityId, entity>
    this.running = false;
    this.lastTime = 0;
    this.labelFont = '12px Arial';
    this.labelColor = '#FFFFFF';
    this.labelGoldColor = '#FFD700';
    this.labelYOffset = 6;

    // Study Buddy room reference (set by StudyBuddyRoom)
    this.room = null;

    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize);
  }

  // Ground plane: from room if available, otherwise 50px from bottom
  get groundY() {
    if (this.room) {
      return this.room.groundY;
    }
    const dpr = window.devicePixelRatio || 1;
    return (this.canvas.height / dpr) - 50;
  }

  // Camera X offset (from room)
  get cameraX() {
    return this.room?.cameraX || 0;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = window.innerWidth;
    const cssHeight = window.innerHeight;
    this.canvas.style.width = cssWidth + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.canvas.width = Math.floor(cssWidth * dpr);
    this.canvas.height = Math.floor(cssHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.entities.forEach((e) => e.onResize && e.onResize());
  }
  addEntity(id, entity) {
    this.entities.set(id, entity);
    entity.engine = this;
    entity.onAdded && entity.onAdded();
  }
  removeEntity(id) {
    const entity = this.entities.get(id);
    this.entities.delete(id);
    entity && entity.onRemoved && entity.onRemoved();
  }
  start() {
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.gameLoop();
    }
  }
  stop() { this.running = false; }
  gameLoop(currentTime = 0) {
    if (!this.running) return;
    const deltaTime = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;
    this.update(deltaTime);
    this.render();
    requestAnimationFrame((t) => this.gameLoop(t));
  }
  update(deltaTime) {
    this.entities.forEach((entity) => {
      if (entity.update) entity.update(deltaTime);
    });
  }
  render() {
    const dpr = window.devicePixelRatio || 1;
    const viewportWidth = this.canvas.width / dpr;
    const viewportHeight = this.canvas.height / dpr;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Render room environment first (ground, platform, walls)
    // Background stays transparent so website shows through
    if (this.room) {
      this.room.render(this.ctx);
    }

    // Render all entities
    this.entities.forEach((entity) => {
      if (entity.render) entity.render(this.ctx);
    });

    // Render labels on top
    this.ctx.save();
    this.ctx.font = this.labelFont;
    this.ctx.textAlign = 'center';
    this.entities.forEach((entity) => {
      if (!entity.getLabelSpec) return;
      const spec = entity.getLabelSpec();
      if (!spec) return;
      this.ctx.fillStyle = spec.isGold ? this.labelGoldColor : this.labelColor;

      // Apply camera offset to label position
      const labelX = spec.x - this.cameraX;
      this.ctx.fillText(spec.text, labelX, spec.y - this.labelYOffset);
    });
    this.ctx.restore();
  }
}