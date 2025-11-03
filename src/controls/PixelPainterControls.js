/*
 * Controls for 2D canvases
 *
 * keycodes:
 * https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key/Key_Values
 *
 */

import {
  setHover,
  unsetHover,
  selectColor,
} from '../store/actions';
import pixelTransferController from '../ui/PixelTransferController';
import {
  screenToWorld,
  getChunkOfPixel,
  getOffsetOfPixel,
  getTapOrClickCenter,
} from '../core/utils';
import {
  HOLD_PAINT,
} from '../core/constants';
import templateLoader from '../ui/templateLoader';

class PixelPainterControls {
  store;
  renderer;
  viewport;
  //
  clickTapStartView = [0, 0];
  clickTapStartTime = 0;
  tapStartDist = 50;
  // screen coords of where a tap/click started
  clickTapStartCoords = [0, 0];
  // stored speed for acceleration
  speedScalar = 0;
  // on mouse: true as long as left mouse button is pressed
  isClicking = false;
  // on touch: true if more than one finger on screen
  isMultiTap = false;
  // on touch: true if current tab was ever more than one figher at any time
  wasEverMultiTap = false;
  // on touch: when painting with holdPaint is active
  isTapPainting = false;
  // on touch: timeout to detect long-press
  tapTimeout = null;
  // time of last tick
  prevTime = Date.now();
  // if we are waiting before placing pixel via holdPaint again
  coolDownDelta = false;
  // Smooth zoom and movement properties
  zoomVelocity = 0;
  lastZoomTime = 0;
  // Smooth movement properties
  moveVelocity = [0, 0];
  moveTarget = [0, 0];
  moveMomentum = 0.95; // How quickly movement slows down
  // Zoom limits
  minZoom = 0.1;
  maxZoom = 100;

  constructor(renderer, viewport, store) {
    this.store = store;
    this.renderer = renderer;
    this.viewport = viewport;
    // Initialize zoom target with current scale
    this.zoomTarget = Math.max(this.minZoom, Math.min(this.maxZoom, renderer.view[2]));
    this.moveTarget = [renderer.view[0], renderer.view[1]];

    this.onMouseDown = this.onMouseDown.bind(this);
    this.onAuxClick = this.onAuxClick.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);

    viewport.addEventListener('auxclick', this.onAuxClick, false);
    viewport.addEventListener('mousedown', this.onMouseDown, false);
    viewport.addEventListener('mousemove', this.onMouseMove, false);
    viewport.addEventListener('mouseup', this.onMouseUp, false);
    viewport.addEventListener('wheel', this.onWheel, false);
    viewport.addEventListener('touchstart', this.onTouchStart, false);
    viewport.addEventListener('touchend', this.onTouchEnd, false);
    viewport.addEventListener('touchmove', this.onTouchMove, false);
    viewport.addEventListener('mouseout', this.onMouseOut, false);
    viewport.addEventListener('touchcancel', this.onMouseOut, false);
  }

  // eslint-disable-next-line class-methods-use-this
  dispose() {}

  gotCoolDownDelta(delta) {
    this.coolDownDelta = true;
    setTimeout(() => {
      this.coolDownDelta = false;
    }, delta * 1000);
  }

  onMouseDown(event) {
    event.preventDefault();
    document.activeElement.blur();

    if (event.button === 0) {
      this.renderer.cancelStoreViewInState();
      this.isClicking = true;
      const { clientX, clientY } = event;
      this.clickTapStartTime = Date.now();
      this.clickTapStartCoords = [clientX, clientY];
      this.clickTapStartView = this.renderer.view;
      const { viewport } = this;
      setTimeout(() => {
        if (this.isClicking) {
          viewport.style.cursor = 'move';
        }
      }, 300);
    }
  }

  onMouseUp(event) {
    event.preventDefault();

    const { store, renderer } = this;
    if (event.button === 0) {
      this.isClicking = false;
      const { clientX, clientY } = event;
      const { clickTapStartCoords, clickTapStartTime } = this;
      const coordsDiff = [
        clickTapStartCoords[0] - clientX,
        clickTapStartCoords[1] - clientY,
      ].map(Math.abs);
      // thresholds for single click / holding
      if (clickTapStartTime > Date.now() - 250
        && coordsDiff[0] < 6 && coordsDiff[1] < 6
      ) {
        PixelPainterControls.placePixel(
          store,
          renderer,
          this.screenToWorld([clientX, clientY]),
        );
      }
      this.viewport.style.cursor = 'auto';
    }
    renderer.storeViewInState();
  }

  static getTouchCenter(event) {
    let x = 0;
    let y = 0;
    for (const { pageX, pageY } of event.touches) {
      x += pageX;
      y += pageY;
    }
    const { length } = event.touches;
    return [x / length, y / length];
  }

  /*
   * place pixel
   * either with given colorIndex or with selected color if none is given
   */
  static placePixel(store, renderer, cell, colorIndex = null) {
    const state = store.getState();
    if (state.canvas.isHistoricalView) {
      return;
    }
    const brushSize = state.gui.brushSize || 1;
    const brushShape = state.gui.brushShape || 'square';
    const currentShape = state.gui.brushShapes[brushShape] || state.gui.brushShapes.square;
    
    // Only allow one brush action per cooldown (handled by cooldown logic)
    // If brushSize is 1, this is the same as before (single pixel)
    if (brushSize === 1) {
      PixelPainterControls._placeSinglePixel(store, renderer, cell, colorIndex);
      return;
    }
    
    // For brush sizes > 1, apply the selected brush shape
    const [cx, cy] = cell;
    const placed = [];
    const half = Math.floor(5 / 2); // 5x5 grid center
    const sizeScale = Math.max(1, Math.floor(brushSize / 5)); // Scale the shape based on brush size
    
    // Apply the brush shape pattern
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        if (currentShape[row][col]) {
          // Scale the pattern for larger brush sizes
          for (let sy = 0; sy < sizeScale; sy++) {
            for (let sx = 0; sx < sizeScale; sx++) {
              const dx = (col - half) * sizeScale + sx;
              const dy = (row - half) * sizeScale + sy;
              const px = cx + dx;
              const py = cy + dy;
              PixelPainterControls._placeSinglePixel(store, renderer, [px, py], colorIndex, placed);
            }
          }
        }
      }
    }
  }

  // Helper for placing a single pixel, with all the checks from the original logic
  static _placeSinglePixel(store, renderer, cell, colorIndex = null, placed = undefined) {
    const state = store.getState();
    const selectedColor = colorIndex
      ?? PixelPainterControls.getWantedColor(state, renderer, cell);
    if (selectedColor === null) {
      return;
    }
    const { viewscale: scale } = renderer;
    if (state.gui.autoZoomIn && scale < 8) {
      renderer.updateView([cell[0], cell[1], 12]);
      return;
    }
    if (scale < 3) {
      return;
    }
    const curColor = renderer.getColorIndexOfPixel(...cell);
    if (selectedColor === curColor) {
      return;
    }
    if (selectedColor < state.canvas.clrIgnore) {
      const { palette } = state.canvas;
      const { rgb } = palette;
      let clrOffset = selectedColor * 3;
      const r = rgb[clrOffset++];
      const g = rgb[clrOffset++];
      const b = rgb[clrOffset];
      if (palette.getIndexOfColor(r, g, b) === curColor) {
        return;
      }
    }
    const { canvasSize } = state.canvas;
    const [x, y] = cell;
    const maxCoords = canvasSize / 2;
    if (x < -maxCoords || x >= maxCoords || y < -maxCoords || y >= maxCoords) {
      return;
    }
    const [i, j] = getChunkOfPixel(canvasSize, x, y);
    const offset = getOffsetOfPixel(canvasSize, x, y);
    pixelTransferController.tryPlacePixel(
      i, j, offset, selectedColor, curColor,
    );
    if (placed) placed.push([i, j, offset, selectedColor, curColor]);
  }

  static getMultiTouchDistance(event) {
    if (event.touches.length < 2) {
      return 1;
    }
    const a = event.touches[0];
    const b = event.touches[1];
    return Math.sqrt(
      (b.pageX - a.pageX) ** 2 + (b.pageY - a.pageY) ** 2,
    );
  }

  onTouchStart(event) {
    event.preventDefault();
    document.activeElement.blur();

    this.renderer.cancelStoreViewInState();
    this.clearTabTimeout();
    this.isTapPainting = false;
    this.clickTapStartTime = Date.now();
    this.clickTapStartCoords = getTapOrClickCenter(event);
    this.clickTapStartView = this.renderer.view;

    if (event.touches.length > 1) {
      this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      this.isMultiTap = true;
      this.wasEverMultiTap = true;
    } else {
      this.isMultiTap = false;
      this.wasEverMultiTap = false;
      const state = this.store.getState();
      if (state.gui.holdPaint) {
        this.tapTimeout = setTimeout(() => {
          this.isTapPainting = true;
          PixelPainterControls.placePixel(
            this.store,
            this.renderer,
            this.screenToWorld(this.clickTapStartCoords),
          );
        }, 200);
      } else {
        this.tapTimeout = setTimeout(() => {
          // check for longer tap to select taped color
          this.selectColorFromScreen(this.clickTapStartCoords);
        }, 600);
      }
    }
  }

  onTouchEnd(event) {
    event.preventDefault();
    if (event.touches.length) {
      return;
    }

    const { store, renderer } = this;
    if (!this.wasEverMultiTap) {
      const [clientX, clientY] = getTapOrClickCenter(event);
      const { clickTapStartCoords, clickTapStartTime } = this;
      const coordsDiff = [
        clickTapStartCoords[0] - clientX,
        clickTapStartCoords[1] - clientY,
      ].map(Math.abs);
      // thresholds for single click / holding
      if (clickTapStartTime > Date.now() - 580
        && coordsDiff[0] < 6 && coordsDiff[1] < 6
      ) {
        PixelPainterControls.placePixel(
          store,
          this.renderer,
          this.screenToWorld([clientX, clientY]),
        );
        setTimeout(() => {
          store.dispatch(unsetHover());
        }, 500);
      }
    }
    renderer.storeViewInState();
    this.clearTabTimeout();
  }

  onTouchMove(event) {
    event.preventDefault();
    event.stopPropagation();

    const multiTouch = (event.touches.length > 1);
    const state = this.store.getState();

    const [clientX, clientY] = getTapOrClickCenter(event);
    if (this.isMultiTap !== multiTouch) {
      this.wasEverMultiTap = true;
      // if one finger got lifted or added, reset clickTabStart
      this.isMultiTap = multiTouch;
      this.clickTapStartCoords = [clientX, clientY];
      this.clickTapStartView = this.renderer.view;
      this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      return;
    }
    const { clickTapStartView, clickTapStartCoords } = this;
    // pinch
    if (multiTouch) {
      this.clearTabTimeout();
      const a = event.touches[0];
      const b = event.touches[1];
      const dist = Math.sqrt(
        (b.pageX - a.pageX) ** 2 + (b.pageY - a.pageY) ** 2,
      );
      const pinchScale = dist / this.tapStartDist;
      const [x, y] = this.renderer.view;
      this.renderer.updateView([x, y, clickTapStartView[2] * pinchScale]);
    }
    // pan
    if (!state.gui.holdPaint || multiTouch) {
      const [lastPosX, lastPosY] = clickTapStartView;
      const deltaX = clientX - clickTapStartCoords[0];
      const deltaY = clientY - clickTapStartCoords[1];
      if (deltaX > 5 || deltaY > 5) {
        this.clearTabTimeout();
      }
      const { viewscale: scale } = this.renderer;
      this.renderer.updateView([
        lastPosX - (deltaX / scale),
        lastPosY - (deltaY / scale),
      ]);
    } else if (!this.wasEverMultiTap && !this.coolDownDelta) {
      // hold paint
      if (this.isTapPainting) {
        PixelPainterControls.placePixel(
          this.store,
          this.renderer,
          this.screenToWorld([clientX, clientY]),
        );
      } else {
        // while we are waiting for isTapPainting to trigger track coordinates
        this.clickTapStartCoords = [clientX, clientY];
        this.clickTapStartView = this.renderer.view;
        this.tapStartDist = PixelPainterControls.getMultiTouchDistance(event);
      }
    }
  }

  clearTabTimeout() {
    if (this.tapTimeout) {
      clearTimeout(this.tapTimeout);
      this.tapTimeout = null;
    }
  }

  zoom(direction, origin) {
    const [x, y, scale] = this.renderer.view;
    const { legacyZoom } = this.store.getState().gui;

    if (legacyZoom) {
    const [x, y, scale] = this.renderer.view;
    const deltaScale = scale >= 1.0 ? 1.1 : 1.04;
    const newScale = (direction > 0) ? scale * deltaScale : scale / deltaScale;
    this.renderer.updateView([x, y, newScale], origin);
    this.renderer.storeViewInState();

    } else {
      // Smooth zoom: adjust zoom velocity for gradual scaling
      const zoomFactor = scale >= 1.0 ? 0.1 : 0.04;
      this.moveVelocity[2] = direction * zoomFactor;
    }
  }

  step(direction) {
    const [x, y, scale] = this.renderer.view;
    const [dx, dy] = direction.map((z) => z * 100.0 / scale);
    this.renderer.updateView([x + dx, y + dy]);
    this.renderer.storeViewInState();
  }

  holdPaintStarted(immediate) {
    // if hold painting is started by keyboard,
    // we immeidately have to place, and not just when mousemove starts
    if (!immediate) {
      return;
    }
    const { hover } = this.store.getState().canvas;
    if (hover) {
      PixelPainterControls.placePixel(
        this.store,
        this.renderer,
        hover,
      );
    }
  }

  onWheel(event) {
    event.preventDefault();
    event.stopPropagation();
    document.activeElement.blur();

    const { deltaY } = event;
    const { store } = this;
    const { hover } = store.getState().canvas;
    const origin = hover || null;
    if (deltaY < 0) {
      this.zoom(1, origin);
    }
    if (deltaY > 0) {
      this.zoom(-1, origin);
    }
  }

  static getWantedColor(state, renderer, cell) {
    if (state.gui.holdPaint === HOLD_PAINT.HISTORY) {
      return renderer.getColorIndexOfPixel(...cell, true);
    }
    if (state.gui.holdPaint === HOLD_PAINT.OVERLAY) {
      const { canvasId } = state.canvas;
      const rgb = templateLoader.getColorOfPixel(canvasId, ...cell);
      if (!rgb) {
        return null;
      }
      return state.canvas.palette.getClosestIndexOfColor(...rgb);
    }
    return state.canvas.selectedColor;
  }

  screenToWorld(screenCoor) {
    return screenToWorld(
      this.renderer.view,
      this.renderer.viewscale,
      this.viewport,
      screenCoor,
    );
  }

  /*
   * set hover from screen coordinates
   * @param [x, y] screen coordinates
   * @return null if hover didn't changed,
   *         hover if it changed
   */
  setHoverFromScrrenCoor(screenCoor) {
    const { store } = this;
    const state = store.getState();
    const { hover: prevHover } = state.canvas;
    const hover = this.screenToWorld(screenCoor);
    const [x, y] = hover;

    /* out of bounds check */
    const { canvasSize } = state.canvas;
    const maxCoords = canvasSize / 2;
    if (x < -maxCoords || x >= maxCoords
      || y < -maxCoords || y >= maxCoords
    ) {
      if (prevHover) {
        store.dispatch(unsetHover());
      }
      return null;
    }

    if (!prevHover || prevHover[0] !== x || prevHover[1] !== y) {
      store.dispatch(setHover(hover));
      return hover;
    }
    return null;
  }

  onMouseMove(event) {
    event.preventDefault();

    const { clientX, clientY } = event;
    const { renderer, isClicking } = this;
    const { viewscale } = renderer;
    const { legacyZoom } = this.store.getState().gui;

    if (isClicking) {
      if (Date.now() < this.clickTapStartTime + 100) {
        // 100ms threshold till starting to pan
        return;
      }
      const { clickTapStartView, clickTapStartCoords } = this;
      const [lastPosX, lastPosY] = clickTapStartView;
      const deltaX = clientX - clickTapStartCoords[0];
      const deltaY = clientY - clickTapStartCoords[1];

      if (legacyZoom) {
        this.renderer.updateView([
          lastPosX - (deltaX / viewscale),
          lastPosY - (deltaY / viewscale),
        ]);
      } else {
        // Update movement target for smooth panning
        this.moveTarget = [
          lastPosX - (deltaX / viewscale),
          lastPosY - (deltaY / viewscale),
        ];
        // Add some velocity based on mouse movement
        this.moveVelocity = [
          -deltaX / viewscale * 0.1,
          -deltaY / viewscale * 0.1,
        ];
      }
    } else {
      const hover = this.setHoverFromScrrenCoor([clientX, clientY]);
      if (!hover) {
        return;
      }
      const state = this.store.getState();
      if (!this.coolDownDelta && state.gui.holdPaint) {
        /* hold paint */
        PixelPainterControls.placePixel(
          this.store,
          this.renderer,
          hover,
        );
      }
    }
  }

  onMouseOut() {
    const { store, viewport } = this;
    viewport.style.cursor = 'auto';
    store.dispatch(unsetHover());
    this.isClicking = false;
    this.clearTabTimeout();
  }

  selectColorFromScreen(center) {
    const { renderer, store } = this;
    if (this.renderer.viewscale < 3) {
      return;
    }
    const coords = this.screenToWorld(center);
    const clrIndex = renderer.getColorIndexOfPixel(...coords);
    if (clrIndex !== null) {
      store.dispatch(selectColor(clrIndex));
    }
  }

  onAuxClick(event) {
    const { which, clientX, clientY } = event;
    // middle mouse button
    if (which !== 2) {
      return;
    }
    event.preventDefault();
    this.selectColorFromScreen([clientX, clientY]);
  }

  update() {
    let time = Date.now();
    const { moveU, moveV, moveW, legacyZoom } = this.store.getState().gui;
    const isAccelerating = (moveU || moveV || moveW);

    // Skip update if nothing is moving and velocities are very small
    if (!isAccelerating && 
        Math.abs(this.moveVelocity[0]) < 0.0001 && 
        Math.abs(this.moveVelocity[1]) < 0.0001 &&
        Math.abs(this.moveVelocity[2]) < 0.0001) {
      this.prevTime = time;
      this.speedScalar = 0;
      return false;
    }

    // set to time since last tick
    time = Math.min(time - this.prevTime, 32); // Cap at 32ms
    this.prevTime += time;

    this.speedScalar = Math.min(1, this.speedScalar + 0.025);

    const [x, y, scale] = this.renderer.view;

    // Handle movement
    const directionalStep = time * 0.4 / scale * this.speedScalar;
    let scaleFactor = scale >= 1.0 ? 1.0005 : 1.0003;
    scaleFactor **= moveW * this.speedScalar;

    // Calculate new position
    let newX = x;
    let newY = y;
    let newScale = scale;

    if (!legacyZoom) {
      // Smooth movement
      if (isAccelerating) {
        // Add keyboard movement to velocity
        this.moveVelocity[0] += moveU * directionalStep * 0.1;
        this.moveVelocity[1] += moveV * directionalStep * 0.1;
      }

      // Apply movement velocity
      newX += this.moveVelocity[0];
      newY += this.moveVelocity[1];

      // Apply zoom velocity
      if (this.moveVelocity[2] !== 0) {
        newScale = scale * (1 + this.moveVelocity[2]);
      }

      // Apply momentum to all velocities
      this.moveVelocity[0] *= this.moveMomentum;
      this.moveVelocity[1] *= this.moveMomentum;
      this.moveVelocity[2] *= this.moveMomentum;

      // Stop if velocities are very small
      if (Math.abs(this.moveVelocity[0]) < 0.0001) this.moveVelocity[0] = 0;
      if (Math.abs(this.moveVelocity[1]) < 0.0001) this.moveVelocity[1] = 0;
      if (Math.abs(this.moveVelocity[2]) < 0.0001) this.moveVelocity[2] = 0;

      // Handle keyboard zoom
      if (moveW !== 0) {
        newScale = scale * scaleFactor ** time;
      }
    } else {
      // Legacy behavior
      newX += directionalStep * moveU;
      newY += directionalStep * moveV;
      newScale = scale * scaleFactor ** time;
    }

    // Update view
    this.renderer.updateView([newX, newY, newScale]);
    return true;
  }
}

export default PixelPainterControls;
