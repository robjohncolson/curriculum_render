class PeerSprite {
  constructor(spriteSheet, username, x, y) {
    this.spriteSheet = spriteSheet;
    this.username = username;
    this.x = x;
    this.y = y;
    this.scale = 0.25; // Smaller scale for peers
    this.hue = 0;
    this.state = 'idle';
    this.prevState = 'idle';
    this.jumpVelocity = 0;
    this.jumpPower = -400; // Increased jump power
    this.gravity = 980;
    this.isGold = false;
    this.goldTimer = 0;
    this.suspensionTimer = 0;
    this.deferGoldUntilSuspended = false;
    this.baseFrameIndex = 0;
    this.frameIndex = 0;
    this.idleTimer = 0;
    this.currentIdleFrame = 0;

    // Animation frame definitions matching player sprite
    this.animations = {
      idle: { frames: [0, 10], speed: 3.0 },  // Blink occasionally
      jump: { frames: [5], speed: 0 }         // Static frame during air time
    };
  }
  get size() {
    return {
      width: this.spriteSheet.frameWidth * this.scale,
      height: this.spriteSheet.frameHeight * this.scale
    };
  }
  get groundY() { return this.engine.groundY; }
  jump() {
    if (this.state === 'idle') {
      this.state = 'jumping';
      this.jumpVelocity = this.jumpPower;
    }
  }
  celebrate() {
    this.jump();
    this.goldTimer = 3;
    this.deferGoldUntilSuspended = true;
  }
  update(deltaTime) {
    // Physics/state
    const groundTopY = this.groundY - this.size.height;
    switch (this.state) {
      case 'jumping': {
        this.jumpVelocity += this.gravity * deltaTime;
        this.y += this.jumpVelocity * deltaTime;
        // Reached apex when upward velocity crosses zero
        if (this.jumpVelocity >= 0) {
          this.state = 'suspended';
          this.suspensionTimer = 5;
          this.jumpVelocity = 0;
          // Begin gold only during suspension window
          if (this.deferGoldUntilSuspended && this.goldTimer > 0) {
            this.deferGoldUntilSuspended = false;
          }
        }
        break;
      }
      case 'suspended': {
        // Hold at apex; decrement timers
        if (this.goldTimer > 0) {
          this.goldTimer -= deltaTime;
          if (this.goldTimer < 0) this.goldTimer = 0;
        }
        this.suspensionTimer -= deltaTime;
        if (this.suspensionTimer <= 0) {
          this.state = 'falling';
          this.jumpVelocity = 0;
        }
        break;
      }
      case 'falling': {
        this.jumpVelocity += this.gravity * deltaTime;
        this.y += this.jumpVelocity * deltaTime;
        if (this.y >= groundTopY) {
          this.y = groundTopY;
          this.jumpVelocity = 0;
          this.state = 'idle';
          this.deferGoldUntilSuspended = false;
        }
        break;
      }
      case 'idle':
      default: {
        // no-op
        break;
      }
    }
    // Reset timers on state change
    if (this.prevState !== this.state) {
      if (this.state === 'idle') {
        this.currentIdleFrame = 0;
        this.idleTimer = 0;
        this.baseFrameIndex = this.animations.idle.frames[0];
      } else {
        this.baseFrameIndex = this.animations.jump.frames[0];
      }
    }

    // Animate based on state (idle blinks, air is static)
    if (this.state === 'idle') {
      const anim = this.animations.idle;
      this.idleTimer += deltaTime;
      if (this.idleTimer >= anim.speed) {
        this.currentIdleFrame = (this.currentIdleFrame + 1) % 2;
        this.baseFrameIndex = anim.frames[this.currentIdleFrame];
        this.idleTimer = 0;
        if (this.currentIdleFrame === 1) {
          this.idleTimer = anim.speed - 0.15; // brief blink
        }
      } else {
        this.baseFrameIndex = anim.frames[this.currentIdleFrame];
      }
    } else {
      // jumping / suspended / falling display a static air frame
      this.baseFrameIndex = this.animations.jump.frames[0];
    }

    // Final frame to render
    this.frameIndex = this.baseFrameIndex;

    // Save for next frame
    this.prevState = this.state;
    // Horizontal clamp
    const maxX = (this.engine.canvas.width / (window.devicePixelRatio || 1)) - this.size.width;
    this.x = Math.max(0, Math.min(this.x, maxX));
  }
  render(ctx) {
    const hue = (this.goldTimer > 0 && !this.deferGoldUntilSuspended) ? 45 : this.hue;
    if (window.debugSprites) {
      ctx.fillStyle = 'white';
      ctx.font = '12px monospace';
      ctx.fillText(`State: ${this.state}`, this.x, this.y - 20);
      ctx.fillText(`Frame: ${this.frameIndex} (base: ${this.baseFrameIndex})`, this.x, this.y - 5);
    }
    this.spriteSheet.drawFrame(ctx, this.frameIndex, this.x, this.y, this.scale, hue);
  }
  getLabelSpec() {
    const centerX = this.x + this.size.width / 2;
    const topY = this.y;
    return {
      text: this.username,
      x: centerX,
      y: topY,
      isGold: (this.goldTimer > 0 && !this.deferGoldUntilSuspended)
    };
  }
}