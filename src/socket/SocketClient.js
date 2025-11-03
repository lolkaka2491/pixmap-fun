// allow the websocket to be noisy on the console
/* eslint-disable no-console */

import {
  hydratePixelUpdate,
  hydratePixelReturn,
  hydrateOnlineCounter,
  hydrateCoolDown,
  hydrateCaptchaReturn,
  dehydrateRegCanvas,
  dehydrateRegChunk,
  dehydrateRegMChunks,
  dehydrateDeRegMChunks,
  dehydratePixelUpdate,
  dehydratePing,
} from './packets/client';
import {
  PIXEL_UPDATE_OP,
  PIXEL_RETURN_OP,
  ONLINE_COUNTER_OP,
  COOLDOWN_OP,
  CHANGE_ME_OP,
  CAPTCHA_RETURN_OP,
  CANVAS_TOKEN_OP,
} from './packets/op';
import {
  socketOpen,
  socketClose,
  receiveOnline,
  receiveCoolDown,
  receiveChatMessage,
  addChatChannel,
  removeChatChannel,
} from '../store/actions/socket';
import {
  fetchMe,
} from '../store/actions/thunks';
import { shardHost } from '../store/actions/fetch';
import { pAlert } from '../store/actions';

let latestCanvasToken = null;
let latestCanvasTokenTs = 0;

function getCanvasTokenHeader() {
	// simple TTL of 60s mirrored on client; server validates strictly
	if (latestCanvasToken && Date.now() - latestCanvasTokenTs < 55 * 1000) {
		return { 'X-Canvas-Token': latestCanvasToken };
	}
	return {};
}

class SocketClient {
  store = null;
  pixelTransferController = null;
  ws = null;
  getRenderer;

  constructor() {
    console.log('Creating WebSocketClient');
    this.channelId = 0;
    /*
     * properties set in connect and open:
     * this.timeLastConnecting
     * this.timeLastPing
     * this.timeLastSent
     */
    this.readyState = WebSocket.CLOSED;
    this.msgQueue = [];
    this.reqQueue = [];

    this.checkHealth = this.checkHealth.bind(this);
    setInterval(this.checkHealth, 2000);
  }

  initialize(store, pixelTransferController, getRenderer) {
    this.store = store;
    if (pixelTransferController) {
      this.pixelTransferController = pixelTransferController;
    }
    if (getRenderer) {
      this.getRenderer = getRenderer;
    }
    return this.connect();
  }

  connect() {
    this.readyState = WebSocket.CONNECTING;
    if (this.ws) {
      return;
    }
    this.timeLastConnecting = Date.now();

    // Modified to always connect without fetching a key
    const verifiedShardHost = /^\d+(\.\d+)*$/.test(shardHost); // Only numbers and periods
    const url = `${
      window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    }//${
      verifiedShardHost ? shardHost : window.location.host // Only uses shardHost if shardHost is verified to NOT contain letters AND exist
    }/ws`;

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = this.onOpen.bind(this);
    this.ws.onmessage = this.onMessage.bind(this);
    this.ws.onclose = this.onClose.bind(this);
    this.ws.onerror = (err) => {
      console.error('Socket error:', err);
    };
  }

  checkHealth() {
    if (this.readyState === WebSocket.OPEN) {
      const now = Date.now();
      if (now - 30000 > this.timeLastPing) {
        // server didn't send anything, probably dead
        console.log('Server is silent, killing websocket');
        this.readyState = WebSocket.CLOSING;
        this.ws.close();
      }
      if (now - 23000 > this.timeLastSent) {
        // make sure we send something at least all 25s
        this.send(dehydratePing());
        this.timeLastSent = now;
      }
    }
  }

  sendWhenReady(msg) {
    /*
     * if websocket is closed, store messages and send
     * them later, once connection is established again.
     * Do NOT use this method for things that wouldn't be useful after reconnect
     */
    this.timeLastSent = Date.now();
    if (this.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.msgQueue.push(msg);
    }
  }

  send(msg) {
    if (this.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    }
  }

  processMsgQueue() {
    while (this.msgQueue.length > 0) {
      this.sendWhenReady(this.msgQueue.shift());
    }
  }

  onOpen() {
    const now = Date.now();
    this.timeLastPing = now;
    this.timeLastSent = now;

    this.store.dispatch(socketOpen());
    this.readyState = WebSocket.OPEN;
    this.send(dehydrateRegCanvas(
      this.store.getState().canvas.canvasId,
    ));
    // register chunks
    const chunkids = this.getRenderer?.().recChunkIds;
    if (chunkids?.length) {
      console.log(`Register ${chunkids.length} chunks`);
      this.send(dehydrateRegMChunks(chunkids));
    }
    // flush queue
    this.processMsgQueue();
  }

  setCanvas(canvasId) {
    if (canvasId === null) {
      return;
    }
    console.log(
      `Notify websocket server that we changed canvas to ${canvasId}`,
    );
    this.send(dehydrateRegCanvas(canvasId));
  }

  registerChunk(chunkid) {
    const buffer = dehydrateRegChunk(chunkid);
    if (this.readyState === WebSocket.OPEN) {
      this.send(buffer);
    } else {
      this.msgQueue.push(buffer);
    }
  }

  deRegisterChunks(chunkids) {
    const buffer = dehydrateDeRegMChunks(chunkids);
    if (this.readyState === WebSocket.OPEN) {
      this.send(buffer);
    } else {
      this.msgQueue.push(buffer);
    }
  }

  /*
   * send captcha solution
   * @param solution text
   * @return promise that resolves when response arrives
   */
  sendCaptchaSolution(solution, captchaid) {
    return new Promise((resolve, reject) => {
      let id;
      const queueObj = ['cs', (arg) => {
        resolve(arg);
        clearTimeout(id);
      }];
      this.reqQueue.push(queueObj);
      id = setTimeout(() => {
        const pos = this.reqQueue.indexOf(queueObj);
        if (~pos) this.reqQueue.splice(pos, 1);
        reject(new Error('Timeout'));
      }, 20000);
      this.sendWhenReady(
        `cs,${JSON.stringify([String(solution || ''), String(captchaid || '')])}`,
      );
    });
  }

  /*
   * Send pixel request
   * @param i, j chunk coordinates
   * @param pixel Array of [[offset, color],...]  pixels within chunk
   */
  sendPixelUpdate(i, j, pixels) {
    return new Promise((resolve, reject) => {
      let id;
      const queueObj = ['pu', (arg) => {
        resolve(arg);
        clearTimeout(id);
      }];
      this.reqQueue.push(queueObj);
      id = setTimeout(() => {
        const pos = this.reqQueue.indexOf(queueObj);
        if (~pos) this.reqQueue.splice(pos, 1);
        reject(new Error('Timeout'));
      }, 20000);
      this.sendWhenReady(dehydratePixelUpdate(j, i, pixels));
    });
  }

  sendChatMessage(message, channelId) {
    this.sendWhenReady(
      `cm,${JSON.stringify([message, channelId])}`,
    );
  }

  sendReaction(messageId, emoji, channelId) {
    this.sendWhenReady(
      `react,${JSON.stringify([messageId, emoji, channelId])}`,
    );
  }

  sendTypingStart(channelId) {
    this.sendWhenReady(
      `ty,${JSON.stringify([channelId, true])}`,
    );
  }

  sendTypingStop(channelId) {
    this.sendWhenReady(
      `ty,${JSON.stringify([channelId, false])}`,
    );
  }

  handleChatRefresh(channelId, purgedMessageIds) {
    if (this.store) {
      // Dispatch a custom event to trigger chat refresh
      window.dispatchEvent(new CustomEvent('chatRefresh', {
        detail: { channelId, purgedMessageIds }
      }));
    }
  }

  onMessage({ data: message }) {
    try {
      // Handle binary messages
      if (message instanceof ArrayBuffer) {
        this.onBinaryMessage(message);
        return;
      }

      // Handle announcement JSON
      if (message.startsWith('{')) {
        const json = JSON.parse(message);
        if (json.type === 'announcement') {
          // Only show for connected users, only on event
          const {
            message: msg,
            username,
            announceType,
            createdAt,
          } = json;
          let title = 'Announcement';
          if (username) title += ` from ${username}`;
          let btn = 'Close';
          this.store.dispatch(pAlert(
            title,
            msg,
            announceType === 'popup' ? 'info' : 'info',
            btn,
          ));
          return;
        }
        
        if (json.type === 'canvasConfigUpdate') {
          // Handle canvas configuration update
          console.log('Canvas configuration updated, reloading user data...');
          // Reload user data to get updated canvas configurations
          this.store.dispatch(fetchMe());
          return;
        }
      }

      // Handle text messages with comma
      const comma = message.indexOf(',');
      if (comma === -1) {
        throw new Error('No comma');
      }
      const key = message.slice(0, comma);
      const val = JSON.parse(message.slice(comma + 1));

      switch (key) {
        case 'cr': {
          // chat refresh
          const [channelId, purgedMessageIds] = val;
          this.handleChatRefresh(channelId, purgedMessageIds);
          break;
        }
        case 'cr_react': {
          // chat reaction
          const [messageId, emoji, userId, userName, action] = val;
          this.store.dispatch(require('../store/actions/socket').receiveChatReaction(
            messageId, emoji, userId, userName, action
          ));
          break;
        }
        case 'cm':
          this.store.dispatch(require('../store/actions/socket').receiveChatMessage(...val));
          break;
        case 'ty': {
          // typing indicator
          const [users, channelId] = val;
          this.store.dispatch(require('../store/actions').receiveTypingUpdate(users, channelId));
          break;
        }
        case 'ac':
          this.store.dispatch(require('../store/actions/socket').addChatChannel(val));
          break;
        case 'rc':
          this.store.dispatch(require('../store/actions/socket').removeChatChannel(val));
          break;
        default:
          // nothing
      }
    } catch (err) {
      console.log(
        `An error occurred while parsing websocket message ${message}`,
        err,
      );
    }
  }

  onBinaryMessage(buffer) {
    if (buffer.byteLength === 0) return;
    const data = new DataView(buffer);
    const opcode = data.getUint8(0);

    this.timeLastPing = Date.now();

    switch (opcode) {
      case PIXEL_UPDATE_OP:
        if (this.pixelTransferController) {
          this.pixelTransferController.receivePixelUpdate(
            hydratePixelUpdate(data),
          );
        }
        break;
      case PIXEL_RETURN_OP: {
        const pos = this.reqQueue.findIndex((q) => q[0] === 'pu');
        if (~pos) {
          this.reqQueue.splice(pos, 1)[0][1](hydratePixelReturn(data));
        }
        break;
      }
      case ONLINE_COUNTER_OP:
        this.store.dispatch(receiveOnline(hydrateOnlineCounter(data)));
        break;
      case COOLDOWN_OP:
        this.store.dispatch(receiveCoolDown(hydrateCoolDown(data)));
        break;
      case CANVAS_TOKEN_OP: {
        // Decode XOR-obfuscated token with nonce and length
        if (data.byteLength >= 4) {
          const view = new DataView(buffer);
          const nonce = view.getUint8(1);
          const len = view.getUint16(2);
          if (len > 0 && 4 + len <= data.byteLength) {
            const raw = new Uint8Array(buffer, 4, len);
            const dec = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) dec[i] = raw[i] ^ ((nonce + i) & 0xFF);
            try {
              latestCanvasToken = new TextDecoder('utf-8').decode(dec);
              latestCanvasTokenTs = Date.now();
              this.store.dispatch(fetchMe());
            } catch (e) {
              console.error('Failed to decode canvas token', e);
            }
          }
        }
        break;
      }
      case CHANGE_ME_OP:
        console.log('Websocket requested api/me reload');
        this.store.dispatch(fetchMe());
        this.reconnect();
        break;
      case CAPTCHA_RETURN_OP: {
        const pos = this.reqQueue.findIndex((q) => q[0] === 'cs');
        if (~pos) {
          this.reqQueue.splice(pos, 1)[0][1](hydrateCaptchaReturn(data));
        }
        break;
      }
      default:
        console.error(`Unknown op_code ${opcode} received`);
        break;
    }
  }

  onClose(e) {
    this.store.dispatch(socketClose());
    this.ws = null;
    this.readyState = WebSocket.CONNECTING;
    // reconnect in 1s if last connect was longer than 7s ago, else 5s
    const timeout = this.timeLastConnecting < Date.now() - 7000 ? 1000 : 5000;
    console.warn(
      `Socket is closed. Reconnect will be attempted in ${timeout} ms.`,
      e.reason,
    );
    setTimeout(() => this.connect(), timeout);
  }

  reconnect() {
    if (this.readyState === WebSocket.OPEN) {
      this.readyState = WebSocket.CLOSING;
      console.log('Restarting WebSocket');
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.close();
      this.ws = null;
      this.connect();
    }
  }
}

export default new SocketClient();

export function __getCanvasTokenHeaderForFetch() { return getCanvasTokenHeader(); }
