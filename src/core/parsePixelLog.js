import fs from 'fs';
import readline from 'readline';

import { PIXELLOGGER_PREFIX } from './logger';
import { getNamesToIds } from '../data/sql/RegUser';
import {
  getIdsToIps,
  getInfoToIps,
  getIPofIID,
} from '../data/sql/IPInfo';
import { getIPv6Subnet } from '../utils/ip';
import { Faction, FactionMember } from '../data/sql/Faction';

// Number of days to read logs for
const LOG_DAYS = 14;

const SECONDS_PER_DAY = 60 * 60 * 24;

/**
 * Helper function to get faction tags for multiple users efficiently
 * @param {number[]} userIds - array of user IDs
 * @returns {Map<number, string>} - map of userId to faction tag
 */
async function getFactionTagsForUsers(userIds) {
  const factionTags = new Map();
  
  if (!userIds || userIds.length === 0) {
    return factionTags;
  }

  try {
    const memberships = await FactionMember.findAll({
      where: { RegUserId: userIds },
      include: [{
        model: Faction,
        attributes: ['tag']
      }]
    });
    
    memberships.forEach(membership => {
      if (membership.Faction && membership.Faction.tag) {
        factionTags.set(membership.RegUserId, membership.Faction.tag);
      }
    });
  } catch (error) {
    console.error(`Error fetching faction tags: ${error.message}`);
  }
  
  return factionTags;
}

/**
 * Constructs an array of log file paths for the last `days` days (including today).
 * @param {number} days — number of days to include (defaults to LOG_DAYS).
 * @returns {string[]} — list of filenames: `${PIXELLOGGER_PREFIX}YYYY-MM-DD.log`.
 */
function findLogFiles(days = LOG_DAYS) {
  const files = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i
    ));
    const yy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    files.push(`${PIXELLOGGER_PREFIX}${yy}-${mm}-${dd}.log`);
  }
  return files;
}

/**
 * Calculates how many days have passed since `time`, with a minimum of 1.
 * Adds optional logging of inputs and results.
 * @param {number} time — UNIX timestamp in milliseconds.
 * @param {function} logger — optional logging function.
 * @returns {number} — days since `time`, rounded up.
 */
function daysSince(time, logger = null) {
  logger && logger(`daysSince called with time=${time}`);
  const nowMs = Date.now();
  logger && logger(`Current timestamp: ${nowMs}`);

  const diff = nowMs - time;
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const days = diff > 0 ? Math.ceil(diff / MS_PER_DAY) : 1;

  logger && logger(`Computed diff=${diff}ms, days=${days}`);
  return days;
}


/**
 * Reads each file in `files` line by line and invokes `cb(parts)` for each line.
 * @param {string[]} files — array of log file paths.
 * @param {(parts: string[]) => void} cb — callback receiving split line parts.
 */
async function parseFiles(files, cb) {
  for (const filename of files) {
    if (!fs.existsSync(filename)) continue;
    await new Promise((resolve, reject) => {
      const rl = readline.createInterface({
        input: fs.createReadStream(filename),
      });
      rl.on('line', line => cb(line.split(' ')));
      rl.on('error', err => reject(err));
      rl.on('close', () => resolve());
    });
  }
}

/**
 * Summarizes pixel placements per canvas for a given IID.
 * @param {string} iid — the user identifier to filter by.
 * @param {number} time — UNIX timestamp to start from.
 * @returns {object|string} — table object or error message.
 */
export async function getIIDSummary(iid, time) {
  const filterIP = await getIPofIID(iid);
  if (!filterIP) {
    return 'Could not resolve IID to IP';
  }
  const cids = {};

  try {
    const files = findLogFiles(daysSince(time)); // uses LOG_DAYS
    await parseFiles(files, parts => {
      const [tsStr, ipFull,, cid, x, y,, clrStr] = parts;
      const ts = parseInt(tsStr, 10);
      if (ts >= time && getIPv6Subnet(ipFull) === filterIP) {
        const clr = parseInt(clrStr, 10);
        let record = cids[cid];
        if (!record) {
          record = [0, 0, 0, 0, 0];
          cids[cid] = record;
        }
        record[0] += 1;    // increment pixel count
        record[1] = x;      // last x coordinate
        record[2] = y;      // last y coordinate
        record[3] = clr;    // last color
        record[4] = ts;     // last timestamp
      }
    });
  } catch (err) {
    return `Could not parse log files: ${err.message}`;
  }

  // Construct table output
  const columns = ['rid', '#', 'canvas', 'last', 'clr', 'time'];
  const types   = ['number', 'number', 'cid', 'coord', 'clr', 'ts'];
  const rows    = [];
  Object.keys(cids).forEach((cid, i) => {
    const [count, x, y, clr, ts] = cids[cid];
    rows.push([i, count, cid, `${x},${y}`, clr, ts]);
  });

  return { columns, types, rows };
}

/**
 * Retrieves detailed pixel entries for a given IID.
 * @param {string} iid — the user identifier to filter by.
 * @param {number} time — UNIX timestamp to start from.
 * @param {number} maxRows — maximum number of rows to return.
 * @returns {object|string} — table object or error message.
 */
export async function getIIDPixels(iid, time, maxRows = 1200) {
  const filterIP = await getIPofIID(iid);
  if (!filterIP) {
    return 'Could not resolve IID to IP';
  }
  const pixels = [];

  try {
    const files = findLogFiles(daysSince(time));
    await parseFiles(files, parts => {
      const [tsStr, ipFull,, cid, x, y,, clrStr] = parts;
      const ts = parseInt(tsStr, 10);
      if (ts >= time && getIPv6Subnet(ipFull) === filterIP) {
        pixels.push([cid, x, y, parseInt(clrStr, 10), ts]);
      }
    });
  } catch (err) {
    return `Could not parse log files: ${err.message}`;
  }

  // Select the last maxRows entries
  const start = pixels.length > maxRows ? pixels.length - maxRows : 0;
  const selected = pixels.slice(start);

  const columns = ['rid', 'canvas', 'coord', 'clr', 'time'];
  const types   = ['number', 'cid', 'coord', 'clr', 'ts'];
  const rows    = selected.map(([cid, x, y, clr, ts], i) => [
    i, cid, `${x},${y}`, clr, ts
  ]);

  return { columns, types, rows };
}

/**
 * Summarizes users placing pixels in a specified area over the last LOG_DAYS days.
 * @param {string|number} canvasId — canvas identifier.
 * @param {number} xUL — upper-left X coordinate.
 * @param {number} yUL — upper-left Y coordinate.
 * @param {number} xBR — bottom-right X coordinate.
 * @param {number} yBR — bottom-right Y coordinate.
 * @param {number} time — UNIX timestamp to start from.
 * @param {string} iid — optional IID filter.
 * @returns {object|string} — table object or error message.
 */
export async function getSummaryFromArea(
  canvasId, xUL, yUL, xBR, yBR, time, iid
) {
  const ips = {};
  const uids = [];
  let filterIP = null;

  if (iid) {
    filterIP = await getIPofIID(iid);
    if (!filterIP) {
      return 'Could not resolve IID to IP';
    }
  }

  try {
    const files = findLogFiles(daysSince(time));
    await parseFiles(files, parts => {
      const [tsStr, ipFull, uidStr, cid, x, y,, clrStr] = parts;
      const ts = parseInt(tsStr, 10);
      if (
        ts >= time &&
        String(cid) === String(canvasId) &&
        x >= xUL && x <= xBR &&
        y >= yUL && y <= yBR
      ) {
        const ip = getIPv6Subnet(ipFull);
        if (filterIP && ip !== filterIP) return;
        const clr = parseInt(clrStr, 10);
        const uid = parseInt(uidStr, 10);

        let record = ips[ip];
        if (!record) {
          record = [0, uid, 0, 0, 0, 0];
          ips[ip] = record;
          uids.push(uid);
        }
        record[0] += 1;    // increment pixel count
        record[2] = x;      // last x coordinate
        record[3] = y;      // last y coordinate
        record[4] = clr;    // last color
        record[5] = ts;     // last timestamp
      }
    });
  } catch (err) {
    return `Could not parse log files: ${err.message}`;
  }

  const uid2Name = await getNamesToIds(uids);
  const uid2FactionTag = await getFactionTagsForUsers(uids);
  const ipKeys   = Object.keys(ips);
  const ip2Info  = await getInfoToIps(ipKeys);

  const columns = ['rid', '#'];
  const types   = ['number', 'number'];
  const printIIDs = ip2Info.size > 0;
  const printUsers = uid2Name.size > 0;

  if (printIIDs) {
    columns.push('IID', 'ct', 'cidr', 'org', 'pc');
    types.push('uuid', 'flag', 'cidr', 'string', 'string');
  }
  if (printUsers) {
    columns.push('User');
    types.push('user');
  }
  columns.push('last', 'clr', 'time');
  types.push('coord', 'clr', 'ts');

  const rows = ipKeys.map((ip, i) => {
    const [count, uid, x, y, clr, ts] = ips[ip];
    const row = [i, count];

    if (printIIDs) {
      const info = ip2Info.get(ip) || {};
      let pc = info.pcheck || 'N/A';
      if (pc && pc.includes(',')) pc = pc.split(',')[0];
      row.push(info.uuid || 'N/A', info.country || 'xx',
               info.cidr || 'N/A', info.org || 'N/A', pc);
    }

    if (printUsers) {
      const name = uid2Name.get(uid);
      const factionTag = uid2FactionTag.get(uid);
      if (name) {
        // Include faction tag in the user data if available
        const userInfo = factionTag ? `${name},${uid},${factionTag}` : `${name},${uid}`;
        row.push(userInfo);
      } else {
        row.push('N/A');
      }
    }

    row.push(`${x},${y}`, clr, ts);
    return row;
  });

  return { columns, types, rows };
}

/**
 * Retrieves detailed pixel entries in a specified area over the last LOG_DAYS days.
 * @param {string|number} canvasId — canvas identifier.
 * @param {number} xUL — upper-left X coordinate.
 * @param {number} yUL — upper-left Y coordinate.
 * @param {number} xBR — bottom-right X coordinate.
 * @param {number} yBR — bottom-right Y coordinate.
 * @param {number} time — UNIX timestamp to start from.
 * @param {string} iid — optional IID filter.
 * @param {number} maxRows — max number of rows to return.
 * @returns {object|string} — table object or error message.
 */
export async function getPixelsFromArea(
  canvasId, xUL, yUL, xBR, yBR, time, iid, maxRows = 1200
) {
  const pixels = [];
  const ips = [];
  const uids = [];
  let filterIP = null;

  if (iid) {
    filterIP = await getIPofIID(iid);
    if (!filterIP) {
      return 'Could not resolve IID to IP';
    }
  }

  try {
    const files = findLogFiles(daysSince(time));
    await parseFiles(files, parts => {
      const [tsStr, ipFull, uidStr, cid, x, y,, clrStr] = parts;
      const ts = parseInt(tsStr, 10);

      if (
        ts >= time &&
        String(cid) === String(canvasId) &&
        x >= xUL && x <= xBR &&
        y >= yUL && y <= yBR
      ) {
        const ip = getIPv6Subnet(ipFull);
        if (filterIP && ip !== filterIP) return;
        const clr = parseInt(clrStr, 10);
        const uid = parseInt(uidStr, 10);
        pixels.push([ip, uid, x, y, clr, ts]);
        if (!ips.includes(ip)) {
          ips.push(ip);
          uids.push(uid);
        }
      }
    });
  } catch (err) {
    return `Could not parse log files: ${err.message}`;
  }

  const uid2Name = await getNamesToIds(uids);
  const uid2FactionTag = await getFactionTagsForUsers(uids);
  const ip2Id    = await getIdsToIps(ips);

  // Select the last maxRows entries
  const startIndex = pixels.length > maxRows ? pixels.length - maxRows : 0;
  const slice      = pixels.slice(startIndex);

  const columns = ['rid'];
  const types   = ['number'];
  const printIIDs  = !filterIP && ip2Id.size > 0;
  const printUsers = !filterIP && uid2Name.size > 0;

  if (printIIDs) {
    columns.push('IID'); types.push('uuid');
  }
  if (printUsers) {
    columns.push('User'); types.push('user');
  }
  columns.push('coord', 'clr', 'time'); types.push('coord', 'clr', 'ts');

  const rows = slice.map(([ip, uid, x, y, clr, ts], i) => {
    const row = [i];
    if (printIIDs)  row.push(ip2Id.get(ip) || 'N/A');
    if (printUsers) {
      const name = uid2Name.get(uid);
      const factionTag = uid2FactionTag.get(uid);
      if (name) {
        // Include faction tag in the user data if available
        const userInfo = factionTag ? `${name},${uid},${factionTag}` : `${name},${uid}`;
        row.push(userInfo);
      } else {
        row.push('N/A');
      }
    }
    row.push(`${x},${y}`, clr, ts);
    return row;
  });

  return { columns, types, rows };
}
