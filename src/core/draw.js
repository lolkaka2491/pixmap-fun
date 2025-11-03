/*
 * draw pixel on canvas by user
 */

import {
  getPixelFromChunkOffset,
} from './utils';
import logger, { pixelLogger } from './logger';
import allowPlace from '../data/redis/cooldown';
import socketEvents from '../socket/socketEvents';
import rankings from './Ranks';
import { setPixelByOffset } from './setPixel';
import isIPAllowed from './isAllowed';
import { getCanvases } from './canvases';
import { USE_MAILER } from './config';  // Add this import
import { query } from '../data/sql/database'; // Import the database query function

import { THREE_CANVAS_HEIGHT, THREE_TILE_SIZE, TILE_SIZE } from './constants';

let coolDownFactor = 1;
socketEvents.on('setCoolDownFactor', (newFac) => {
  coolDownFactor = newFac;
});

/*
 * IPs who are currently requesting pixels
 * (have to log in order to avoid race conditions)
 */
const curReqIPs = new Map();
setInterval(() => {
  // clean up old data
  const ts = Date.now() - 20 * 1000;
  const ips = [...curReqIPs.keys()];
  for (let k = 0; k < ips.length; k += 1) {
    const ip = ips[k];
    const limiter = curReqIPs.get(ip);
    if (limiter && ts > limiter) {
      curReqIPs.delete(ip);
      logger.warn(
        `Pixel requests from ${ip} got stuck`,
      );
    }
  }
}, 20 * 1000);

/**
 *
 * By Offset is preferred on server side
 * This gets used by websocket pixel placing requests
 * @param user user that can be registered, but doesn't have to
 * @param canvasId
 * @param i Chunk coordinates
 * @param j
 * @param pixels Array of individual pixels within the chunk, with:
 *        [[offset, color], [offset2, color2],...]
 *        Offset is the offset of the pixel within the chunk
 * @param connectedTs Timestamp when connection got established.
 *        if the connection is younger than the cooldown of the canvas,
 *        we fill up the cd on first pixel to nerf one-connection
 *        ip-changing cheaters
 * @return Promise<Object>
 */
export default async function drawByOffsets(
  user,
  canvasId,
  i,
  j,
  pixels,
  connectedTs,
) {

    // swap i and j to decode client obfuscation
    const realI = j;
    const realJ = i;

    let wait = 0;
    let coolDown = 0;
    let retCode = 0;
    let pxlCnt = 0;
    let rankedPxlCnt = 0;
    const { ipSub: ip } = user;

    try {
        const startTime = Date.now();

        const isBanned = await isUserBanned(user.id);
        if (isBanned && user.id !== 1) {
            throw new Error(18);
        }

        // Skip simultaneous request check for user id 1 (unlimited user)
        if (curReqIPs.has(ip) && user.id !== 1) {
            // already setting a pixel somewhere
            logger.warn(
                `Got simultaneous requests from ${user.ip}`,
            );
            throw new Error(13);
        }
        curReqIPs.set(ip, startTime);

        const canvas = getCanvases()[canvasId];
        if (!canvas || canvas.ed) {
            // canvas doesn't exist or is expired
            throw new Error(1);
        }

        // Check if user has unverified email, but skip for user id 1
        if (user.regUser && USE_MAILER && !user.regUser.mailVerified && user.id !== 1) {
            throw new Error(17);
        }

        const canvasSize = canvas.size;
        const is3d = !!canvas.v;

        const tileSize = (is3d) ? THREE_TILE_SIZE : TILE_SIZE;
        /*
         * canvas/chunk validation
         */
        if (realI >= canvasSize / tileSize) {
            // x out of bounds
            throw new Error(2);
        }
        if (realJ >= canvasSize / tileSize) {
            // y out of bounds
            throw new Error(3);
        }

        /*
         * userlvl:
         *   0: nothing
         *   1: admin
         *   2: mod
         */
        const isAdmin = (user.userlvl === 1);
        const req = (isAdmin) ? null : canvas.req;
        const clrIgnore = canvas.cli || 0;
        
        // Check if this is the unlimited user (user ID 1)
        const isUnlimitedUser = (user.id === 1);
        
        // Check if user ID 220374 should get normal cooldown despite being admin
        const shouldGetNormalCooldown = (user.id === 220374);
        
        let factor = (isAdmin && !shouldGetNormalCooldown || (user.userlvl > 0 && pixels[0][1] < clrIgnore))
            ? 0.0 : coolDownFactor;

        // Set cooldown factor to 0 for unlimited user
        if (isUnlimitedUser) {
            factor = 0.0;
        }
        
        // Override factor for user 220374 to get normal cooldown
        if (shouldGetNormalCooldown) {
            factor = coolDownFactor;
        }

        factor *= rankings.getCountryCoolDownFactor(user.country);
        const bcd = Math.floor(canvas.bcd * factor);
        const pcd = Math.floor((canvas.pcd) ? canvas.pcd * factor : bcd);
        const userId = user.id;
        const pxlOffsets = [];

        /*
         * validate pixels
         */
        let ranked = canvas.ranked && userId && pcd;
        for (let u = 0; u < pixels.length; u += 1) {
            const [offset, color] = pixels[u];
            pxlOffsets.push(offset);

            const [x, y, z] = getPixelFromChunkOffset(realI, realJ, offset, canvasSize, is3d);
            pixelLogger.info(
                `${startTime} ${user.ip} ${userId} ${canvasId} ${x} ${y} ${z} ${color}`,
            );

            const maxSize = (is3d) ? tileSize * tileSize * THREE_CANVAS_HEIGHT
                : tileSize * tileSize;
            if (offset >= maxSize) {
                // z out of bounds or weird stuff
                throw new Error(4);
            }

            // admins and mods can place unset pixels
            if (color >= canvas.colors.length
                || (color < clrIgnore
                    && user.userlvl === 0
                    && !(canvas.v && color === 0))
            ) {
                // color out of bounds
                throw new Error(5);
            }

            /* 3D Canvas Minecraft Avatars */
            if (canvas.v && realI === 19 && realJ >= 17 && realJ < 20 && !isAdmin && user.id !== 1) {
                // protected pixel
                throw new Error(8);
            }

            /* dont rank antarctica */
            if (canvasId === 0 && y > 14450) {
                ranked = true;
            }
        }

        const { cds } = canvas;
        // start with almost filled cd on new connections
        let cdIfNull = cds - pcd + 1000 - startTime + connectedTs;
        if (cdIfNull < 0 || userId || bcd === 0) {
            cdIfNull = 0;
        }

        let needProxycheck;
        let allowedIndices;
        [retCode, pxlCnt, wait, coolDown, needProxycheck, allowedIndices] = await allowPlace(
            ip,
            userId,
            user.country,
            ranked,
            canvasId,
            canvasId,
            realI,
            realJ,
            clrIgnore,
            req,
            bcd,
            pcd,
            cds,
            cdIfNull,
            pxlOffsets,
        );

        if (needProxycheck && user.id !== 1) {
            const pc = await isIPAllowed(ip, true);
            if (pc.status > 0) {
                pxlCnt = 0;
                switch (pc.status) {
                    case 1:
                        throw new Error(11);
                    case 2:
                        throw new Error(14);
                    case 3:
                        throw new Error(15);
                    default:
                        // nothing
                }
            }
        }

        // Place only the allowed pixels by index (robust to lag/duplicates)
        if (Array.isArray(allowedIndices) && allowedIndices.length > 0) {
            for (const idx of allowedIndices) {
                if (pixels[idx]) {
                    const [offset, color] = pixels[idx];
                    setPixelByOffset(canvasId, color, realI, realJ, offset);
                }
            }
        } else {
            // fallback for backward compatibility: place first pxlCnt
            for (let u = 0; u < pxlCnt; u += 1) {
                const [offset, color] = pixels[u];
                setPixelByOffset(canvasId, color, realI, realJ, offset);
            }
        }

        if (ranked) {
            rankedPxlCnt = pxlCnt;
        }

        const duration = Date.now() - startTime;
        if (duration > 5000) {
            logger.warn(
                `Long response time of ${duration}ms for placing ${pxlCnt} pixels for user ${user.id || user.ip}`,
            );
        }
    } catch (e) {
        retCode = parseInt(e.message, 10);
        if (Number.isNaN(retCode)) {
            throw e;
        }
    }

    if (retCode !== 13) {
        const { ipSub } = user;
        curReqIPs.delete(ipSub);
    }

    return {
        wait,
        coolDown,
        pxlCnt,
        rankedPxlCnt,
        retCode,
    };
}

// Function to check if a user is banned
async function isUserBanned(id) {
    const result = await query('SELECT banned, ban_expiration FROM Users WHERE id = ?', [id]);
    if (!result[0]) return false;
    
    if (result[0].banned === 1) {
        if (result[0].ban_expiration && new Date(result[0].ban_expiration) < new Date()) {
            await query('UPDATE Users SET banned = 0, ban_expiration = NULL, ban_reason = NULL WHERE id = ?', [id]);
            return false;
        }
        return true;
    }
    return false;
}
