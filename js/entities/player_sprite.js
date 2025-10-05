class PlayerSprite {
  constructor(spriteSheet, x, y) {
    this.spriteSheet = spriteSheet;
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.speed = 200;
    this.scale = 0.5;
    this.hue = parseInt(localStorage.getItem('spriteColorHue') || '0', 10);
    // Start with idle frame
    this.baseFrameIndex = 0; // Primary idle frame
    this.frameIndex = 0;
    this.animationTimer = 0;
    this.animationSpeed = 0.12; // Slightly slower for better visibility

    // Animation frame definitions (0-based indices)
    this.animations = {
      idle: { frames: [0, 10], speed: 3.0 }, // Blink every 3 seconds
      walk: { frames: [2, 3, 4, 5], speed: 0.12 },
      jump: { frames: [5], speed: 0 }, // Static frame
      push: { frames: [6, 7, 8, 9], speed: 0.15 }, // Not used yet
      death: { frames: [1], speed: 0 } // Not used yet
    };

    this.idleTimer = 0; // For idle blink animation
    this.currentIdleFrame = 0;
    this.currentWalkFrame = 0; // Track walk frame index
    this.facingRight = true;
    this.keys = {};
    this.prevState = 'idle'; // Track previous state for transitions
    this.maxSpeed = 220;
    this.gravity = 1800;
    this.jumpForce = 700;
    this.isOnGround = false;
    this.state = 'idle';
    this._handleKeyDown = this._handleKeyDown.bind(this);
    this._handleKeyUp = this._handleKeyUp.bind(this);
    this.setupKeyboardControls();
  }
  setupKeyboardControls() {
    window.addEventListener('keydown', this._handleKeyDown, { passive: false });
    window.addEventListener('keyup', this._handleKeyUp, { passive: true });
  }
  isTypingInInput(e) {
    const target = e.target;
    if (!target) return false;
    const tag = (target.tagName || '').toLowerCase();
    const editable = target.getAttribute && target.getAttribute('contenteditable');
    return tag === 'input' || tag === 'textarea' || tag === 'select' || editable === 'true';
  }
  _handleKeyDown(e) {
    if (this.isTypingInInput(e)) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
      e.preventDefault();
      this.keys[e.key] = true;
    }
  }
  _handleKeyUp(e) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
      this.keys[e.key] = false;
    }
  }
  onRemoved() {
    window.removeEventListener('keydown', this._handleKeyDown);
    window.removeEventListener('keyup', this._handleKeyUp);
  }
  update(deltaTime) {
    // Horizontal input
    this.vx = 0;
    if (this.keys['ArrowLeft'] || this.keys['a']) {
      this.vx = -this.maxSpeed;
      this.facingRight = false;
    }
    if (this.keys['ArrowRight'] || this.keys['d']) {
      this.vx = this.maxSpeed;
      this.facingRight = true;
    }

    // Jump input (trigger only when on ground)
    const wantsJump = this.keys['ArrowUp'] || this.keys['w'];
    if (wantsJump && this.isOnGround) {
      this.vy = -this.jumpForce;
      this.isOnGround = false;
    }

    // Apply gravity
    this.vy += this.gravity * deltaTime;

    // Integrate position
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;

    // Clamp to world bounds
    const width = this.spriteSheet.frameWidth * this.scale;
    const height = this.spriteSheet.frameHeight * this.scale;
    const dpr = window.devicePixelRatio || 1;
    const maxX = (this.engine.canvas.width / dpr) - width;
    const groundY = this.engine.groundY - height;

    // Horizontal clamp
    if (this.x < 0) this.x = 0;
    if (this.x > maxX) this.x = maxX;

    // Ground collision
    if (this.y >= groundY) {
      this.y = groundY;
      this.vy = 0;
      this.isOnGround = true;
    } else {
      this.isOnGround = false;
    }

    // Animation state
    if (!this.isOnGround) {
      this.state = 'jump';
    } else if (this.vx !== 0) {
      this.state = 'walk';
    } else {
      this.state = 'idle';
    }

    // Reset animation when state changes
    if (this.prevState !== this.state) {
      this.animationTimer = 0;
      if (this.state === 'walk') {
        this.currentWalkFrame = 0; // Reset walk cycle
        this.baseFrameIndex = this.animations.walk.frames[0];
      } else if (this.state === 'idle') {
        this.currentIdleFrame = 0;
        this.idleTimer = 0;
        this.baseFrameIndex = this.animations.idle.frames[0];
      } else if (this.state === 'jump') {
        this.baseFrameIndex = this.animations.jump.frames[0];
      }
    }

    // Advance animation based on current state
    const anim = this.animations[this.state] || this.animations.idle;

    if (this.state === 'walk') {
      this.animationTimer += deltaTime;
      if (this.animationTimer >= anim.speed) {
        // Cycle through walk frames using index
        this.currentWalkFrame = (this.currentWalkFrame + 1) % anim.frames.length;
        this.baseFrameIndex = anim.frames[this.currentWalkFrame];
        this.animationTimer = 0;
      } else {
        // Keep current walk frame
        this.baseFrameIndex = anim.frames[this.currentWalkFrame];
      }
    } else if (this.state === 'idle') {
      // Idle with blink animation
      this.idleTimer += deltaTime;
      if (this.idleTimer >= anim.speed) {
        // Toggle between normal and blink frame
        this.currentIdleFrame = (this.currentIdleFrame + 1) % 2;
        this.baseFrameIndex = anim.frames[this.currentIdleFrame];
        this.idleTimer = 0;
        // Make blink brief
        if (this.currentIdleFrame === 1) {
          this.idleTimer = anim.speed - 0.15; // Blink lasts only 0.15 seconds
        }
      } else {
        this.baseFrameIndex = anim.frames[this.currentIdleFrame];
      }
    } else if (this.state === 'jump') {
      this.baseFrameIndex = anim.frames[0];
    }

    // Set final frame index with direction offset
    this.frameIndex = this.baseFrameIndex;
    if (!this.facingRight) {
      this.frameIndex += 11; // Move to bottom row (11 columns per row)
    }

    // Save state for next frame
    this.prevState = this.state;
  }
  render(ctx) {
    // Debug: Show frame info (remove this after testing)
    if (window.debugSprites) {
      ctx.fillStyle = 'white';
      ctx.font = '12px monospace';
      ctx.fillText(`State: ${this.state}`, this.x, this.y - 20);
      ctx.fillText(`Frame: ${this.frameIndex} (base: ${this.baseFrameIndex})`, this.x, this.y - 5);
    }

    this.spriteSheet.drawFrame(ctx, this.frameIndex, this.x, this.y, this.scale, this.hue);
  }
  setHue(hue) {
    this.hue = hue;
    localStorage.setItem('spriteColorHue', hue.toString());
  }
}