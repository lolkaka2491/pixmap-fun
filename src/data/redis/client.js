/*
 * redis client
 * REDIS_URL can be url or path to unix socket
 */
import fs from 'fs';
import path from 'path';
import { createClient, defineScript } from 'redis';
import { isMainThread } from 'worker_threads';

import { REDIS_URL, SHARD_NAME } from '../../core/config';

const scripts = {
  placePxl: defineScript({
    NUMBER_OF_KEYS: 9,
    SCRIPT: fs.readFileSync(path.resolve('workers', 'lua', 'placePixel.lua')),
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) {
      // arr[0-4]: numbers, arr[5]: comma-separated indices string (may be undefined)
      const base = arr.slice(0, 5).map(Number);
      let indices = [];
      if (arr.length > 5 && typeof arr[5] === 'string' && arr[5].length > 0) {
        indices = arr[5].split(',').map(Number);
      }
      return [...base, indices];
    },
  }),
  allowedChat: defineScript({
    NUMBER_OF_KEYS: 3,
    SCRIPT: fs.readFileSync(path.resolve('workers', 'lua', 'allowedChat.lua')),
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) { return arr.map((r) => Number(r)); },
  }),
  getUserRanks: defineScript({
    NUMBER_OF_KEYS: 2,
    SCRIPT: fs.readFileSync(path.resolve('workers', 'lua', 'getUserRanks.lua')),
    transformArguments(...args) {
      return args.map((a) => ((typeof a === 'string') ? a : a.toString()));
    },
    transformReply(arr) { return arr.map((r) => Number(r)); },
  }),
  zmRankRev: defineScript({
    NUMBER_OF_KEYS: 1,
    SCRIPT: fs.readFileSync(path.resolve('workers', 'lua', 'zmRankRev.lua')),
    transformArguments(key, uids) {
      return [
        key,
        ...uids.map((a) => ((typeof a === 'string') ? a : a.toString())),
      ];
    },
    transformReply(arr) {
      return arr.map((r) => {
        const rank = Number(r);
        return rank || null;
      });
    },
  }),
};

const client = createClient(REDIS_URL.startsWith('redis://')
  ? {
    url: REDIS_URL,
    scripts,
  }
  : {
    socket: {
      path: REDIS_URL,
    },
    scripts,
  },
);

/*
 * for sending messages via cluster
 */
export const pubsub = {
  subscriber: null,
  publisher: null,
};

export const connect = async () => {
  // eslint-disable-next-line no-console
  const now = new Date().toISOString();
  console.log(`${now} -- Connecting to redis server at ${REDIS_URL}`);
  await client.connect();
  if (SHARD_NAME && isMainThread) {
    const subscriber = client.duplicate();
    await subscriber.connect();
    pubsub.publisher = client;
    pubsub.subscriber = subscriber;
  }
};

export default client;