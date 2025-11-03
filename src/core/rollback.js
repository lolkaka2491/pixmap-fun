/*
 * Rolls back an area of the canvas to a specific date
 *
 */

// Tile creation is allowed to be slow
/* eslint-disable no-await-in-loop */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import RedisCanvas from '../data/redis/RedisCanvas';
import logger from './logger';
import { getChunkOfPixel } from './utils';
import Palette from './Palette';
import { TILE_SIZE } from './constants';
import { BACKUP_DIR } from './config';
import canvases from './canvases';

export default async function rollbackToDate(
  canvasId, // number
  x, // number
  y, // number
  width, // number
  height, // number
  date, // string
  time = null, // string (HHMM format)
) {
  if (!BACKUP_DIR) {
    return 0;
  }
  const dir = path.resolve(__dirname, BACKUP_DIR);
  const fullBackupDir = `${dir}/${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6)}/${canvasId}/tiles`;
  let incrementalBackupDirs = [];
  if (time) {
    // Find all incremental backup folders up to and including the requested time
    const canvasDir = `${dir}/${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6)}/${canvasId}`;
    if (fs.existsSync(canvasDir)) {
      const allTimes = fs.readdirSync(canvasDir)
        .filter(f => f.match(/^\d{4}$/))
        .sort();
      incrementalBackupDirs = allTimes.filter(t => t <= time).map(t => `${canvasDir}/${t}`);
    }
  }
  // If no incrementals, fallback to just full backup
  if (!fs.existsSync(fullBackupDir) && incrementalBackupDirs.length === 0) {
    return 0;
  }

  logger.info(
    `Rollback area ${width}/${height} to ${x}/${y}/${canvasId} to date ${date}${time ? ` time ${time}` : ''}`,
  );
  const canvas = canvases[canvasId];
  const { colors, size } = canvas;
  const palette = new Palette(colors);
  const canvasMinXY = -(size / 2);

  const [ucx, ucy] = getChunkOfPixel(size, x, y);
  const [lcx, lcy] = getChunkOfPixel(size, x + width, y + height);

  let totalPxlCnt = 0;
  logger.info(`Loading to chunks from ${ucx} / ${ucy} to ${lcx} / ${lcy} ...`);
  for (let cx = ucx; cx <= lcx; cx += 1) {
    for (let cy = ucy; cy <= lcy; cy += 1) {
      let chunk = null;
      // 1. Load from full backup first
      let backupChunk = null;
      let emptyBackup = false;
      try {
        backupChunk = await sharp(`${fullBackupDir}/${cx}/${cy}.png`)
          .ensureAlpha()
          .raw()
          .toBuffer();
        backupChunk = new Uint32Array(backupChunk.buffer);
        emptyBackup = false;
        logger.info(`Loaded full backup chunk ${fullBackupDir}/${cx}/${cy}.png`);
      } catch {
        logger.info(`Full backup chunk ${fullBackupDir}/${cx}/${cy}.png could not be loaded, assuming empty.`);
        backupChunk = new Uint32Array(TILE_SIZE * TILE_SIZE);
        emptyBackup = true;
      }
      // 2. Apply incrementals in order
      for (const incDir of incrementalBackupDirs) {
        try {
          const incPath = `${incDir}/${cx}/${cy}.png`;
          if (fs.existsSync(incPath)) {
            let incChunk = await sharp(incPath)
              .ensureAlpha()
              .raw()
              .toBuffer();
            incChunk = new Uint32Array(incChunk.buffer);
            // Only overwrite non-zero pixels (changed pixels)
            for (let i = 0; i < incChunk.length; i++) {
              if (incChunk[i] !== 0) {
                backupChunk[i] = incChunk[i];
              }
            }
            logger.info(`Applied incremental backup chunk ${incPath}`);
          }
        } catch (e) {
          logger.info(`Could not apply incremental backup chunk for ${incDir}/${cx}/${cy}.png: ${e.message}`);
        }
      }
      // 3. Now backupChunk is the correct state for this chunk at the requested time
      // Load current chunk from Redis
      try {
        chunk = await RedisCanvas.getChunk(canvasId, cx, cy, TILE_SIZE ** 2);
      } catch (error) {
        logger.error(
          `Chunk ch:${canvasId}:${cx}:${cy} could not be loaded from redis, assuming empty.`,
        );
      }
      if (!chunk || !chunk.length) {
        chunk = new Uint8Array(TILE_SIZE * TILE_SIZE);
      } else {
        chunk = new Uint8Array(chunk);
      }
      // Write pixels from backupChunk to chunk
      let pxlCnt = 0;
      const cOffX = cx * TILE_SIZE + canvasMinXY - x;
      const cOffY = cy * TILE_SIZE + canvasMinXY - y;
      let cOff = 0;
      for (let py = 0; py < TILE_SIZE; py += 1) {
        for (let px = 0; px < TILE_SIZE; px += 1) {
          const clrX = cOffX + px;
          const clrY = cOffY + py;
          if (clrX >= 0 && clrY >= 0 && clrX < width && clrY < height) {
            const pixel = palette.abgr.indexOf(backupChunk[cOff]);
            if (pixel !== -1) {
              chunk[cOff] = pixel;
              pxlCnt += 1;
            }
          }
          cOff += 1;
        }
      }
      if (pxlCnt) {
        const ret = await RedisCanvas.setChunk(cx, cy, chunk, canvasId);
        if (ret) {
          logger.info(`Loaded ${pxlCnt} pixels into chunk ${cx}, ${cy}.`);
          totalPxlCnt += pxlCnt;
        }
      }
      chunk = null;
    }
  }
  logger.info('Rollback done.');
  return totalPxlCnt;
}
