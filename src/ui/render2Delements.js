/*
 * placeholder that shows underneath cursor
 *
 */

import templateLoader from './templateLoader';
import { screenToWorld, worldToScreen } from '../core/utils';
import { TILE_SIZE } from '../core/constants';

const PLACEHOLDER_SIZE = 1.2;
const PLACEHOLDER_BORDER = 1;

export function renderPlaceholder(
  state,
  $viewport,
  view,
  scale,
) {
  const viewportCtx = $viewport.getContext('2d');
  const { hover, palette, selectedColor } = state.canvas;
  const brushSize = state.gui?.brushSize || 1;
  const brushShape = state.gui?.brushShape || 'square';
  const currentShape = state.gui?.brushShapes?.[brushShape] || state.gui?.brushShapes?.square;
  const showGrid = state.gui?.showGrid;
  if (!hover) return;

  const [centerX, centerY] = hover;

  if (brushSize === 1) {
    // Single pixel - render as before
    const [sx, sy] = worldToScreen(view, scale, $viewport, hover);
    let color = palette.colors[selectedColor];
    if (state.templates?.ovEnabled && templateLoader.ready) {
      const templateColor = templateLoader.getColorOfPixel(state.canvas.canvasId, centerX, centerY);
      if (templateColor) {
        color = `rgba(${templateColor[0]},${templateColor[1]},${templateColor[2]},0.7)`;
      }
    }
    
    if (showGrid) {
      viewportCtx.save();
      viewportCtx.strokeStyle = '#000';
      viewportCtx.lineWidth = Math.max(1, scale * 0.08);
      viewportCtx.strokeRect(
        Math.round(sx),
        Math.round(sy),
        Math.ceil(scale),
        Math.ceil(scale),
      );
      viewportCtx.restore();
    }
    
    viewportCtx.save();
    viewportCtx.globalAlpha = 0.5;
    viewportCtx.fillStyle = color;
    viewportCtx.fillRect(
      Math.round(sx),
      Math.round(sy),
      Math.ceil(scale),
      Math.ceil(scale),
    );
    viewportCtx.restore();
    return;
  }

  // For brush sizes > 1, use custom brush shapes
  if (!currentShape) return;
  
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
            const px = centerX + dx;
            const py = centerY + dy;
            
            // Get screen coordinates for this cell
            const [screenX, screenY] = worldToScreen(view, scale, $viewport, [px, py]);
            
            // Determine color: template overlay or selected
            let color = palette.colors[selectedColor];
            if (state.templates?.ovEnabled && templateLoader.ready) {
              const templateColor = templateLoader.getColorOfPixel(state.canvas.canvasId, px, py);
              if (templateColor) {
                color = `rgba(${templateColor[0]},${templateColor[1]},${templateColor[2]},0.7)`;
              }
            }
            
            // Draw border (grid) if enabled
            if (showGrid) {
              viewportCtx.save();
              viewportCtx.strokeStyle = '#000';
              viewportCtx.lineWidth = Math.max(1, scale * 0.08);
              viewportCtx.strokeRect(
                Math.round(screenX),
                Math.round(screenY),
                Math.ceil(scale),
                Math.ceil(scale),
              );
              viewportCtx.restore();
            }
            
            // Draw the cell (slightly transparent)
            viewportCtx.save();
            viewportCtx.globalAlpha = 0.5;
            viewportCtx.fillStyle = color;
            viewportCtx.fillRect(
              Math.round(screenX),
              Math.round(screenY),
              Math.ceil(scale),
              Math.ceil(scale),
            );
            viewportCtx.restore();
          }
        }
      }
    }
  }
}


export function renderPotatoPlaceholder(
  state,
  $viewport,
  view,
  scale,
) {
  const viewportCtx = $viewport.getContext('2d');
  const { palette, selectedColor, hover } = state.canvas;
  const brushSize = state.gui?.brushSize || 1;
  const brushShape = state.gui?.brushShape || 'square';
  const currentShape = state.gui?.brushShapes?.[brushShape] || state.gui?.brushShapes?.square;
  if (!hover) return;

  const [centerX, centerY] = hover;

  if (brushSize === 1) {
    // Single pixel - render as before
    const [sx, sy] = worldToScreen(view, scale, $viewport, hover);
    // Draw potato cross for this cell
    viewportCtx.save();
    viewportCtx.fillStyle = '#000';
    viewportCtx.fillRect(sx - 1, sy - 1, 4, scale + 2);
    viewportCtx.fillRect(sx - 1, sy - 1, scale + 2, 4);
    viewportCtx.fillRect(sx + scale - 2, sy - 1, 4, scale + 2);
    viewportCtx.fillRect(sx - 1, sy + scale - 2, scale + 1, 4);
    viewportCtx.fillStyle = palette.colors[selectedColor];
    viewportCtx.fillRect(sx, sy, 2, scale);
    viewportCtx.fillRect(sx, sy, scale, 2);
    viewportCtx.fillRect(sx + scale - 1, sy, 2, scale);
    viewportCtx.fillRect(sx, sy + scale - 1, scale, 2);
    viewportCtx.restore();
    return;
  }

  // For brush sizes > 1, use custom brush shapes
  if (!currentShape) return;
  
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
            const px = centerX + dx;
            const py = centerY + dy;
            
            // Get screen coordinates for this cell
            const [screenX, screenY] = worldToScreen(view, scale, $viewport, [px, py]);
            
            // Draw potato cross for this cell
            viewportCtx.save();
            viewportCtx.fillStyle = '#000';
            viewportCtx.fillRect(screenX - 1, screenY - 1, 4, scale + 2);
            viewportCtx.fillRect(screenX - 1, screenY - 1, scale + 2, 4);
            viewportCtx.fillRect(screenX + scale - 2, screenY - 1, 4, scale + 2);
            viewportCtx.fillRect(screenX - 1, screenY + scale - 2, scale + 1, 4);
            viewportCtx.fillStyle = palette.colors[selectedColor];
            viewportCtx.fillRect(screenX, screenY, 2, scale);
            viewportCtx.fillRect(screenX, screenY, scale, 2);
            viewportCtx.fillRect(screenX + scale - 1, screenY, 2, scale);
            viewportCtx.fillRect(screenX, screenY + scale - 1, scale, 2);
            viewportCtx.restore();
          }
        }
      }
    }
  }
}


export function renderGrid(
  state,
  $viewport,
  view,
  scale,
  isLightGrid,
) {
  const { width, height } = $viewport;

  const viewportCtx = $viewport.getContext('2d');
  if (!viewportCtx) return;

  viewportCtx.globalAlpha = 0.5;
  viewportCtx.fillStyle = (isLightGrid) ? '#DDDDDD' : '#222222';

  let [xoff, yoff] = screenToWorld(view, scale, $viewport, [0, 0]);
  let [x, y] = worldToScreen(view, scale, $viewport, [xoff, yoff]);

  for (; x < width; x += scale) {
    const thick = (xoff++ % 10 === 0) ? 2 : 1;
    viewportCtx.fillRect(x, 0, thick, height);
  }

  for (; y < height; y += scale) {
    const thick = (yoff++ % 10 === 0) ? 2 : 1;
    viewportCtx.fillRect(0, y, width, thick);
  }

  viewportCtx.globalAlpha = 1;
}

/*
 * Overlay draws onto offscreen canvas, so its doing weirder math
 */
export function renderOverlay(
  state,
  $canvas,
  centerChunk,
  scale,
  tiledScale,
  scaleThreshold,
) {
  if (!templateLoader.ready || scale < 0.035) return;
  const { canvasSize, canvasId } = state.canvas;
  // world coordinates of center of center chunk
  const [x, y] = centerChunk
    .map((z) => z * TILE_SIZE / tiledScale
    + TILE_SIZE / 2 / tiledScale - canvasSize / 2);

  // if scale > scaleThreshold, then scaling happens in renderer
  // instead of offscreen canvas
  const offscreenScale = (scale > scaleThreshold) ? 1.0 : scale;

  const { width, height } = $canvas;
  const horizontalRadius = width / 2 / offscreenScale;
  const verticalRadius = height / 2 / offscreenScale;
  const templates = templateLoader.getTemplatesInView(
    canvasId, x, y, horizontalRadius, verticalRadius,
  );

  if (!templates.length) return;
  const context = $canvas.getContext('2d');
  if (!context) return;

  context.imageSmoothingEnabled = false;
  context.save();
  context.scale(offscreenScale, offscreenScale);
  context.globalAlpha = state.templates.oOpacity / 100;
  for (const template of templates) {
    if (template.width * offscreenScale < 1
      || template.height * offscreenScale < 1
    ) continue;

    const image = templateLoader.getTemplateSync(template.imageId);
    if (!image) continue;

    context.drawImage(
      image,
      template.x - x + width / 2 / offscreenScale,
      template.y - y + height / 2 / offscreenScale,
    );
  }
  context.restore();
}

/*
 * Small pixel overlay draws into viewport, because it needs
 * high scale values
 */
export function renderSmallPOverlay(
  state,
  $viewport,
  view,
  scale,
) {
  if (!templateLoader.ready) return;
  const { canvasId } = state.canvas;
  const [x, y] = view;
  const { width, height } = $viewport;
  const horizontalRadius = width / 2 / scale;
  const verticalRadius = height / 2 / scale;
  const templates = templateLoader.getTemplatesInView(
    canvasId, x, y, horizontalRadius, verticalRadius,
  );

  if (!templates.length) return;
  const context = $viewport.getContext('2d');
  if (!context) return;

  const relScale = scale / 3;
  context.imageSmoothingEnabled = false;
  context.save();
  context.scale(relScale, relScale);
  for (const template of templates) {
    const image = templateLoader.getSmallTemplateSync(template.imageId);
    if (!image) continue;
    context.drawImage(image,
      (template.x - x) * 3 + width / 2 / relScale,
      (template.y - y) * 3 + height / 2 / relScale,
    );
  }
  context.restore();
}
