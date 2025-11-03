import { createRequire } from 'node:module';
import readline from 'readline-sync';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Import ESM modules properly
const { drawByOffsets } = await import('./src/core/draw.js');
const { getChunkOfPixel, getOffsetOfPixel } = await import('./src/data/redis/RedisCanvas.js');

// Load JSON
const canvases = require('./src/canvases.json');
const RedisCanvas = require('./src/data/redis/RedisCanvas');

async function fillRectangle() {
    // Get user input
    const canvasId = readline.question('Enter Canvas ID: ');
    const colorIndex = parseInt(readline.question('Enter Color Index: '), 10);
    const x1 = parseInt(readline.question('Enter Start X: '), 10);
    const y1 = parseInt(readline.question('Enter Start Y: '), 10);
    const x2 = parseInt(readline.question('Enter End X: '), 10);
    const y2 = parseInt(readline.question('Enter End Y: '), 10);

    // Validate canvas exists
    const canvas = canvases[canvasId];
    if (!canvas) {
        throw new Error(`Canvas ${canvasId} not found in canvases.json`);
    }

    // Validate color index
    if (colorIndex >= canvas.colors.length || colorIndex < 0) {
        throw new Error(`Invalid color index for canvas ${canvasId}. Max index: ${canvas.colors.length - 1}`);
    }

    // Validate coordinates
    const canvasSize = canvas.size;
    const validateCoord = (coord, name) => {
        if (coord < 0 || coord >= canvasSize) {
            throw new Error(`${name} coordinate out of bounds (0-${canvasSize - 1})`);
        }
    };
    validateCoord(x1, 'Start X');
    validateCoord(y1, 'Start Y');
    validateCoord(x2, 'End X');
    validateCoord(y2, 'End Y');

    // Group pixels by chunk
    const chunkMap = new Map();
    for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
            const [i, j] = getChunkOfPixel(canvasSize, x, y);
            const offset = getOffsetOfPixel(canvasSize, x, y);
            const chunkKey = `${i},${j}`;
            chunkMap.set(chunkKey, [...(chunkMap.get(chunkKey) || []), [offset, colorIndex]]);
        }
    }

    // Create admin user
    const adminUser = {
        id: 0,
        ipSub: '127.0.0.1',
        userlvl: 1,
        country: 'xx'
    };

    // Confirm action
    const totalPixels = Array.from(chunkMap.values()).reduce((sum, pixels) => sum + pixels.length, 0);
    const confirm = readline.question(`About to place ${totalPixels} pixels on canvas ${canvasId}. Proceed? (y/n) `);
    if (confirm.toLowerCase() !== 'y') {
        console.log('Aborted');
        return;
    }

    // Process chunks
    for (const [chunkKey, pixels] of chunkMap) {
        const [i, j] = chunkKey.split(',').map(Number);
        try {
            await drawByOffsets(adminUser, canvasId, i, j, pixels, Date.now());
            console.log(`✅ Placed ${pixels.length} pixels in chunk ${chunkKey}`);
        } catch (error) {
            console.error(`❌ Error in chunk ${chunkKey}:`, error.message);
        }
    }
}

// Run the script
(async () => {
    try {
        await fillRectangle();
        console.log('✅ Rectangle filled successfully!');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
})();
