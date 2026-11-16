// SUNFALL YARD — keyboard/mouse input with pointer lock. Edge-triggered
// presses are consumed once per simulation step by the main loop.
export class Input {
  constructor(el) {
    this.el = el;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.leftPressed = false;
    this.rightPressed = false;
    this.locked = false;
    this.onLockChange = null;
    el.addEventListener('click', () => { if (!this.locked) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    });
    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseLeft = true; this.leftPressed = true; }
      if (e.button === 2) { this.mouseRight = true; this.rightPressed = true; }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedKeys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseLeft = false; this.mouseRight = false; });
  }
  requestLock() {
    try { this.el.requestPointerLock(); } catch (e) { /* user gesture required */ }
  }
  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedKeys.has(code); }
  consumeLook() {
    const dx = this.lookDX, dy = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return [dx, dy];
  }
  endFrame() {
    this.pressedKeys.clear();
    this.leftPressed = false;
    this.rightPressed = false;
  }
}
