#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BACKUP_DIR = process.env.BACKUP_DIR || '/var/www/ppbc/history';

// Function to find the latest backup directory
function findLatestBackupDir() {
  const baseDir = path.resolve(BACKUP_DIR);
  if (!fs.existsSync(baseDir)) {
    throw new Error(`Backup directory ${baseDir} does not exist`);
  }

  // Get all year directories
  const years = fs.readdirSync(baseDir)
    .filter(dir => /^\d{4}$/.test(dir))
    .sort((a, b) => b - a);

  if (years.length === 0) {
    throw new Error('No backup directories found');
  }

  // Get latest month in latest year
  const latestYear = years[0];
  const months = fs.readdirSync(path.join(baseDir, latestYear))
    .filter(dir => /^\d{2}$/.test(dir))
    .sort((a, b) => b - a);

  if (months.length === 0) {
    throw new Error('No backup months found');
  }

  // Get latest day in latest month
  const latestMonth = months[0];
  const days = fs.readdirSync(path.join(baseDir, latestYear, latestMonth))
    .filter(dir => /^\d{2}$/.test(dir))
    .sort((a, b) => b - a);

  if (days.length === 0) {
    throw new Error('No backup days found');
  }

  const latestDay = days[0];
  return path.join(baseDir, latestYear, latestMonth, latestDay);
}

// Function to load PNG backup into Redis using redis-cli
function loadPngBackup(canvasId, backupDir) {
  const canvasBackupDir = path.join(backupDir, canvasId.toString());
  if (!fs.existsSync(canvasBackupDir)) {
    console.log(`No backup found for canvas ${canvasId}`);
    return;
  }

  // Get the latest time directory (HHMM format)
  const timeDirs = fs.readdirSync(canvasBackupDir)
    .filter(dir => /^\d{4}$/.test(dir))
    .sort((a, b) => b - a);

  if (timeDirs.length === 0) {
    console.log(`No time directories found for canvas ${canvasId}`);
    return;
  }

  const latestTimeDir = timeDirs[0];
  const timeBackupDir = path.join(canvasBackupDir, latestTimeDir);

  console.log(`Loading backup for canvas ${canvasId} from ${timeBackupDir}`);

  // Get all x directories
  const xDirs = fs.readdirSync(timeBackupDir)
    .filter(dir => /^\d+$/.test(dir))
    .map(dir => parseInt(dir, 10))
    .sort((a, b) => a - b);

  for (const x of xDirs) {
    const xDir = path.join(timeBackupDir, x.toString());
    const yFiles = fs.readdirSync(xDir)
      .filter(file => file.endsWith('.png'))
      .map(file => parseInt(file.replace('.png', ''), 10))
      .sort((a, b) => a - b);

    for (const y of yFiles) {
      const pngPath = path.join(xDir, `${y}.png`);
      const key = `ch:${canvasId}:${x}:${y}`;

      try {
        // Convert PNG to raw data using ImageMagick
        const rawData = execSync(`convert "${pngPath}" -depth 8 RGBA:-`).toString('hex');
        
        // Convert hex to binary
        const buffer = Buffer.from(rawData, 'hex');
        
        // Convert RGBA to indexed color (simple version)
        const indexedBuffer = Buffer.alloc(buffer.length / 4);
        let isEmpty = true;
        
        for (let i = 0; i < buffer.length; i += 4) {
          const r = buffer[i];
          const g = buffer[i + 1];
          const b = buffer[i + 2];
          // Simple color index calculation (can be improved)
          const colorIndex = Math.floor((r + g + b) / 3 / 4);
          indexedBuffer[i / 4] = colorIndex;
          
          // Check if chunk is empty (all pixels are index 0)
          if (colorIndex !== 0) {
            isEmpty = false;
          }
        }

        // Skip empty chunks
        if (isEmpty) {
          console.log(`Skipping empty chunk ${key}`);
          continue;
        }

        // Store in Redis using redis-cli
        const redisCmd = `redis-cli -u ${REDIS_URL} SET "${key}" "${indexedBuffer.toString('hex')}"`;
        execSync(redisCmd);
        console.log(`Loaded chunk ${key}`);
      } catch (error) {
        console.error(`Error loading chunk ${key}: ${error.message}`);
      }
    }
  }
}

// Main function
function main() {
  try {
    console.log('Starting backup loading...');

    // Find latest backup directory
    const latestBackupDir = findLatestBackupDir();
    console.log(`Found latest backup directory: ${latestBackupDir}`);

    // Get all canvas directories
    const canvasDirs = fs.readdirSync(latestBackupDir)
      .filter(dir => /^\d+$/.test(dir));

    // Load backups for each canvas
    for (const canvasId of canvasDirs) {
      loadPngBackup(canvasId, latestBackupDir);
    }

    console.log('Backup loading completed');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the script
main(); 