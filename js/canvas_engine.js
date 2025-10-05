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
    this.resize = this.resize.bind(this);
    this.resize();
    window.addEventListener('resize', this.resize);
  }
  // Ground plane: 50px from bottom, in CSS pixel space
  get groundY() {
    const dpr = window.devicePixelRatio || 1;
    return (this.canvas.height / dpr) - 50;
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
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.entities.forEach((entity) => {
      if (entity.render) entity.render(this.ctx);
    });
    this.ctx.save();
    this.ctx.font = this.labelFont;
    this.ctx.textAlign = 'center';
    this.entities.forEach((entity) => {
      if (!entity.getLabelSpec) return;
      const spec = entity.getLabelSpec();
      if (!spec) return;
      this.ctx.fillStyle = spec.isGold ? this.labelGoldColor : this.labelColor;
      this.ctx.fillText(spec.text, spec.x, spec.y - this.labelYOffset);
    });
    this.ctx.restore();
  }
}