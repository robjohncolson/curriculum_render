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

    // Door interaction
    this.isAtDoor = false;
    this.isDissolving = false;
    this.dissolveProgress = 0;
    this.dissolveSpeed = 1.5; // Complete dissolve in ~0.67 seconds
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
    // Handle dissolve animation
    if (this.isDissolving) {
      this.dissolveProgress += this.dissolveSpeed * deltaTime;
      if (this.dissolveProgress >= 1) {
        this.dissolveProgress = 1;
        // Trigger door enter after dissolve completes
        this.onDoorEnter();
      }
      // Don't process movement while dissolving
      return;
    }

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

    // Get dimensions
    const width = this.spriteSheet.frameWidth * this.scale;
    const height = this.spriteSheet.frameHeight * this.scale;
    const dpr = window.devicePixelRatio || 1;

    // Check if we're in a Study Buddy room
    const room = this.engine.room;

    if (room) {
      // Room-based collision
      const groundY = room.groundY - height;

      // Wall collision
      if (this.x < room.wallLeft) this.x = room.wallLeft;
      if (this.x + width > room.wallRight) this.x = room.wallRight - width;

      // Player dimensions for collision
      const playerBottom = this.y + height;
      const playerRight = this.x + width;

      // No platform collision - player must stack blocks to reach door

      // Block collision - check standing on blocks AND horizontal collision
      // Skip peer blocks (they're just visual overlays)
      let onBlock = false;
      for (const block of room.blocks) {
        // Skip peer blocks - they don't interact with player physics
        if (block.isPeerBlock) continue;

        // Check if overlapping with block
        const playerLeft = this.x;
        const playerTop = this.y;
        const isOverlapping = playerRight > block.x &&
                              playerLeft < block.x + block.width &&
                              playerBottom > block.y &&
                              playerTop < block.y + block.height;

        if (isOverlapping) {
          // Determine collision direction based on overlap amounts
          const overlapLeft = playerRight - block.x;
          const overlapRight = (block.x + block.width) - playerLeft;
          const overlapTop = playerBottom - block.y;
          const overlapBottom = (block.y + block.height) - playerTop;

          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);

          if (minOverlapY < minOverlapX) {
            // Vertical collision
            if (overlapTop < overlapBottom && this.vy >= 0) {
              // Landing on top of block
              this.y = block.y - height;
              this.vy = 0;
              this.isOnGround = true;
              onBlock = true;
            } else if (overlapBottom < overlapTop && this.vy < 0) {
              // Hit block from below
              this.y = block.y + block.height;
              this.vy = 0;
            }
          } else {
            // Horizontal collision - stop player and push block
            if (overlapLeft < overlapRight) {
              // Player hit block from left
              this.x = block.x - width;
              if (this.vx > 0) {
                block.push(this.vx * 0.5);
              }
            } else {
              // Player hit block from right
              this.x = block.x + block.width;
              if (this.vx < 0) {
                block.push(this.vx * 0.5);
              }
            }
          }
        }
      }

      // Incline collision
      let onIncline = false;
      if (room.incline && this.vy >= 0) {
        const playerCenterX = this.x + width / 2;
        const inclineY = room.getInclineY(playerCenterX);
        if (inclineY !== null) {
          const playerBottom = this.y + height;
          if (playerBottom >= inclineY) {
            this.y = inclineY - height;
            this.vy = 0;
            this.isOnGround = true;
            onIncline = true;
          }
        }
      }

      // Ground collision (if not on block or incline)
      if (!onBlock && !onIncline) {
        if (this.y >= groundY) {
          this.y = groundY;
          this.vy = 0;
          this.isOnGround = true;
        } else {
          this.isOnGround = false;
        }
      }

      // Update camera to follow player
      room.updateCamera(this);

      // Check exit door collision - auto-enter on contact
      this.isAtDoor = room.checkDoorCollision(this);
      if (this.isAtDoor && !this.isDissolving) {
        this.startDissolve();
      }

      // Check menu door collision - opens FAB menu
      if (room.checkMenuDoorCollision(this)) {
        window.dispatchEvent(new CustomEvent('studyBuddyMenuDoorEnter'));
      }
    } else {
      // Legacy behavior (no room)
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
  /**
   * Check if player is pushing a block
   */
  checkBlockPush(block, playerWidth, playerHeight) {
    const playerBottom = this.y + playerHeight;
    const playerTop = this.y;
    const playerLeft = this.x;
    const playerRight = this.x + playerWidth;

    const blockBottom = block.y + block.height;
    const blockTop = block.y;
    const blockLeft = block.x;
    const blockRight = block.x + block.width;

    // Check vertical overlap (must be beside the block, not above/below)
    const verticalOverlap = playerBottom > blockTop + 8 && playerTop < blockBottom - 4;

    // Check horizontal proximity
    const pushingRight = this.vx > 0 && playerRight >= blockLeft && playerRight <= blockLeft + 10;
    const pushingLeft = this.vx < 0 && playerLeft <= blockRight && playerLeft >= blockRight - 10;

    return verticalOverlap && (pushingRight || pushingLeft);
  }

  /**
   * Start the dissolve animation when entering door
   */
  startDissolve() {
    if (this.isDissolving) return;
    this.isDissolving = true;
    this.dissolveProgress = 0;
    this.vx = 0;
    this.vy = 0;
    console.log('Player dissolving into door...');
  }

  /**
   * Called when player enters the exit door (after dissolve completes)
   */
  onDoorEnter() {
    // Dispatch event for the app to handle navigation
    if (!this._doorEnterDebounce) {
      this._doorEnterDebounce = true;
      console.log('Player entered door - transitioning to white screen');

      // Dispatch custom event with dissolve flag for white screen transition
      window.dispatchEvent(new CustomEvent('studyBuddyDoorEnter', {
        detail: {
          lessonId: this.engine.room?.currentLessonId,
          withTransition: true
        }
      }));

      // Reset debounce after a short delay
      setTimeout(() => {
        this._doorEnterDebounce = false;
        this.isDissolving = false;
        this.dissolveProgress = 0;
      }, 1500);
    }
  }

  render(ctx) {
    // Apply camera offset if in a room
    const cameraX = this.engine.room?.cameraX || 0;
    const drawX = this.x - cameraX;

    // Debug: Show frame info (remove this after testing)
    if (window.debugSprites) {
      ctx.fillStyle = 'white';
      ctx.font = '12px monospace';
      ctx.fillText(`State: ${this.state}`, drawX, this.y - 20);
      ctx.fillText(`Frame: ${this.frameIndex} (base: ${this.baseFrameIndex})`, drawX, this.y - 5);
    }

    // Apply dissolve effect
    if (this.isDissolving) {
      ctx.save();
      ctx.globalAlpha = 1 - this.dissolveProgress;
    }

    this.spriteSheet.drawFrame(ctx, this.frameIndex, drawX, this.y, this.scale, this.hue);

    if (this.isDissolving) {
      ctx.restore();
    }
  }

  setHue(hue) {
    this.hue = hue;
    localStorage.setItem('spriteColorHue', hue.toString());
  }

  /**
   * Get label spec for name display (with camera offset)
   */
  getLabelSpec() {
    if (!window.currentUsername) return null;
    const width = this.spriteSheet.frameWidth * this.scale;
    const centerX = this.x + width / 2;
    return {
      text: window.currentUsername,
      x: centerX,
      y: this.y,
      isGold: false
    };
  }
}