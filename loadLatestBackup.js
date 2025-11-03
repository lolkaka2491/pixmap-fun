const fs = require('fs');
const path = require('path');
const { createClient } = require('redis');
const sharp = require('sharp');

// Load canvases.json
const canvases = JSON.parse(fs.readFileSync(path.join(__dirname, 'src', 'canvases.json'), 'utf8'));

// Create a simple Palette class for color conversion
class Palette {
  constructor(colors) {
    this.length = colors.length;
    this.rgb = new Uint8Array(this.length * 3);
    this.colors = new Array(this.length);
    this.abgr = new Uint32Array(this.length);
    this.fl = new Array(this.length);

    let cnt = 0;
    for (let index = 0; index < colors.length; index++) {
      const r = colors[index][0];
      const g = colors[index][1];
      const b = colors[index][2];
      this.rgb[cnt++] = r;
      this.rgb[cnt++] = g;
      this.rgb[cnt++] = b;
      this.colors[index] = `rgb(${r}, ${g}, ${b})`;
      this.abgr[index] = (0xFF000000) | (b << 16) | (g << 8) | (r);
      this.fl[index] = [r / 256, g / 256, b / 256];
    }
  }

  getColorIndex(r, g, b) {
    const { rgb } = this;
    let i = rgb.length / 3;
    let closestIndex = 0;
    let closestDistance = null;
    while (i > 0) {
      i -= 1;
      const off = i * 3;
      let distance = (rgb[off] - r) ** 2;
      distance += (rgb[off + 1] - g) ** 2;
      distance += (rgb[off + 2] - b) ** 2;
      if (closestDistance === null || closestDistance > distance) {
        closestIndex = i;
        closestDistance = distance;
      }
    }
    return closestIndex;
  }
}

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BACKUP_DIR = process.env.BACKUP_DIR || 'backups';

// Create Redis client
const redis = createClient(REDIS_URL.startsWith('redis://')
  ? { url: REDIS_URL }
  : { socket: { path: REDIS_URL } }
);

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

// Function to load PNG backup into Redis
async function loadPngBackup(canvasId, backupDir) {
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
        // Read PNG file
        const image = await sharp(pngPath).raw().toBuffer();
        
        // Convert RGBA to indexed color
        const canvas = canvases[canvasId];
        const palette = new Palette(canvas.colors);
        const indexedBuffer = Buffer.alloc(image.length / 4);
        
        for (let i = 0; i < image.length; i += 4) {
          const r = image[i];
          const g = image[i + 1];
          const b = image[i + 2];
          const colorIndex = palette.getColorIndex(r, g, b);
          indexedBuffer[i / 4] = colorIndex;
        }

        // Store in Redis
        await redis.set(key, indexedBuffer);
        console.log(`Loaded chunk ${key}`);
      } catch (error) {
        console.error(`Error loading chunk ${key}: ${error.message}`);
      }
    }
  }
}

// Main function
async function main() {
  try {
    // Connect to Redis
    await redis.connect();
    console.log('Connected to Redis');

    // Find latest backup directory
    const latestBackupDir = findLatestBackupDir();
    console.log(`Found latest backup directory: ${latestBackupDir}`);

    // Load backups for each canvas
    for (const canvasId of Object.keys(canvases)) {
      const canvas = canvases[canvasId];
      if (canvas.v || canvas.hid || canvas.ed) {
        // Skip 3D, hidden, and retired canvases
        continue;
      }
      await loadPngBackup(canvasId, latestBackupDir);
    }

    console.log('Backup loading completed');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await redis.quit();
  }
}

// Run the script
main(); 