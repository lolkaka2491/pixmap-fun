/*
 * Script to force start a void event
 */

import { setNextEvent } from './data/redis/Event.js';
import logger from './core/logger.js';
import { TILE_SIZE } from './core/constants.js';

async function forceStartVoid() {
    try {
        const i = Math.floor(Math.random() * 3 - 1);
        const j = Math.floor(Math.random() * 3 - 1);
        
        // Force event to start now (0 minutes from now)
        await setNextEvent(0, i, j);
        
        logger.info(`Force started void at ${i * TILE_SIZE}, ${j * TILE_SIZE}`);
        process.exit(0);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
}

forceStartVoid(); 