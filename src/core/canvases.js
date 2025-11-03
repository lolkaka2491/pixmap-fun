import path from 'path';
import { readFileSync } from 'fs';

let canvases = JSON.parse(readFileSync(
  path.resolve(__dirname, './canvases.json'),
));

/**
 * Reload canvas configuration from disk
 * Used for dynamic configuration updates
 */
export function reloadCanvases() {
  try {
    const newCanvases = JSON.parse(readFileSync(
      path.resolve(__dirname, './canvases.json'),
    ));
    canvases = newCanvases;
    console.log('Canvas configuration reloaded successfully');
    return true;
  } catch (error) {
    console.error('Failed to reload canvas configuration:', error);
    return false;
  }
}

/**
 * Get current canvas configuration
 * @returns {Object} Current canvas configuration
 */
export function getCanvases() {
  return canvases;
}

/**
 * Update a specific canvas configuration in memory
 * @param {string} canvasId - Canvas ID to update
 * @param {Object} config - New configuration
 */
export function updateCanvasConfig(canvasId, config) {
  if (canvases[canvasId]) {
    canvases[canvasId] = {
      ...canvases[canvasId],
      ...config
    };
    console.log(`Canvas ${canvasId} configuration updated in memory`);
    return true;
  }
  return false;
}

export default canvases;
