import { MAX_CHAT_MESSAGES } from '../../core/constants';
import store from '../store';

const initialState = {
  /*
   * {
   *   cid: [
   *     name,
   *     type,
   *     lastTs,
   *   ],
   *   cid2: [
   *     name,
   *     type,
   *     lastTs,
   *     dmUserId,
   *   ],
   *   ...
   * }
   */
  channels: {},
  // [[uId, userName], [userId2, userName2],...]
  blocked: [],
  // { cid: [message1,message2,message3,...]}
  messages: {},
  // { messageId: { emoji: [{ userId, userName }, ...] } }
  reactions: {},
  // { channelId: [user1, user2, ...] } - users currently typing
  typing: {},
};

// used to give every message a unique incrementing key
let msgId = 0;

export default function chat(
  state = initialState,
  action,
) {
  switch (action.type) {
    case 's/REC_ME':
    case 's/LOGIN': {
      // making sure object keys are numbers
      const channels = {};
      const channelsJson = action.channels;
      const cids = Object.keys(channelsJson);
      for (let i = 0; i < cids.length; i += 1) {
        const cid = cids[i];
        channels[Number(cid)] = channelsJson[cid];
      }
      return {
        ...state,
        channels,
        blocked: action.blocked,
      };
    }

    case 's/LOGOUT': {
      const channels = { ...state.channels };
      const messages = { ...state.messages };
      const keys = Object.keys(channels);
      for (let i = 0; i < keys.length; i += 1) {
        const cid = keys[i];
        if (channels[cid][1] !== 0) {
          delete messages[cid];
          delete channels[cid];
        }
      }
      return {
        ...state,
        channels,
        blocked: [],
        messages,
      };
    }

    case 's/BLOCK_USER': {
      const { userId, userName } = action;
      const blocked = [
        ...state.blocked,
        [userId, userName],
      ];
      /*
       * remove DM channel if exists
       */
      const channels = { ...state.channels };
      const chanKeys = Object.keys(channels);
      for (let i = 0; i < chanKeys.length; i += 1) {
        const cid = chanKeys[i];
        if (channels[cid][1] === 1 && channels[cid][3] === userId) {
          delete channels[cid];
          return {
            ...state,
            channels,
            blocked,
          };
        }
      }
      return {
        ...state,
        blocked,
      };
    }

    case 's/UNBLOCK_USER': {
      const { userId } = action;
      const blocked = state.blocked.filter((bl) => (bl[0] !== userId));
      return {
        ...state,
        blocked,
      };
    }

    case 's/ADD_CHAT_CHANNEL': {
      const { channel } = action;
      const cid = Number(Object.keys(channel)[0]);
      if (state.channels[cid]) {
        return state;
      }
      return {
        ...state,
        channels: {
          ...state.channels,
          ...channel,
        },
      };
    }

    case 's/REMOVE_CHAT_CHANNEL': {
      const { cid } = action;
      if (!state.channels[cid]) {
        return state;
      }
      const channels = { ...state.channels };
      const messages = { ...state.messages };
      delete messages[cid];
      delete channels[cid];
      return {
        ...state,
        channels,
        messages,
      };
    }

    case 's/REC_CHAT_MESSAGE': {
      const {
        name, text, country, channel, user, factionTag, messageId,
      } = action;
      if (!state.messages[channel] || !state.channels[channel]) {
        return state;
      }
      const ts = Math.round(Date.now() / 1000);
      const finalMessageId = messageId !== null ? messageId : (msgId += 1, msgId);

      // Skip if this messageId already exists to avoid duplicates
      const existing = state.messages[channel].some((m) => m[6] === finalMessageId);
      if (existing) {
        return state;
      }

      const updatedChannelMessages = [
        ...state.messages[channel],
        [name, text, country, user, ts, factionTag, finalMessageId],
      ];

      // Enforce chat history length from GUI settings if present, else fallback to MAX_CHAT_MESSAGES
      let limit = MAX_CHAT_MESSAGES;
      try {
        const guiLen = store.getState()?.gui?.chatHistoryLength;
        if (Number.isInteger(guiLen) && guiLen > 0) limit = Math.min(200, guiLen);
      } catch (_) { /* ignore */ }

      const trimmed = updatedChannelMessages.length > limit
        ? updatedChannelMessages.slice(-limit)
        : updatedChannelMessages;

      const messages = {
        ...state.messages,
        [channel]: trimmed,
      };

      const channelArray = [...state.channels[channel]];
      channelArray[2] = Date.now();

      return {
        ...state,
        channels: {
          ...state.channels,
          [channel]: channelArray,
        },
        messages,
      };
    }

    case 's/REC_CHAT_HISTORY': {
      const { cid, history, reactions: historyReactions = {} } = action;
      if (history.length === 0) {
        return {
          ...state,
          messages: {
            ...state.messages,
            [cid]: [],
          },
          reactions: {
            ...state.reactions,
            ...Object.keys(state.reactions).reduce((acc, messageId) => {
              acc[messageId] = state.reactions[messageId];
              return acc;
            }, {}),
          },
        };
      }

      // Trim to GUI limit if necessary and dedupe by messageId
      let limit = MAX_CHAT_MESSAGES;
      try {
        const guiLen = store.getState()?.gui?.chatHistoryLength;
        if (Number.isInteger(guiLen) && guiLen > 0) limit = Math.min(200, guiLen);
      } catch (_) { /* ignore */ }

      const seen = new Set();
      const deduped = [];
      for (let i = 0; i < history.length; i += 1) {
        const msg = history[i];
        const id = msg[6];
        if (id == null || !seen.has(id)) {
          if (id != null) seen.add(id);
          deduped.push(msg);
        }
      }
      const trimmedHistory = deduped.length > limit ? deduped.slice(-limit) : deduped;

      // Keep reactions handling intact; it may be empty now
      const reactions = { ...state.reactions };
      Object.keys(historyReactions).forEach((mid) => {
        reactions[mid] = historyReactions[mid];
      });

      return {
        ...state,
        messages: {
          ...state.messages,
          [cid]: trimmedHistory,
        },
        reactions,
      };
    }

    case 's/REC_CHAT_REACTION': {
      const { messageId, emoji, userId, userName, action: reactionAction } = action;
      const reactions = { ...state.reactions };
      
      if (!reactions[messageId]) {
        reactions[messageId] = {};
      }
      
      if (!reactions[messageId][emoji]) {
        reactions[messageId][emoji] = [];
      }
      
      const emojiReactions = [...reactions[messageId][emoji]];
      const existingIndex = emojiReactions.findIndex(r => r.userId === userId);
      
      if (reactionAction === 'add') {
        if (existingIndex === -1) {
          emojiReactions.push({ userId, userName });
        }
      } else if (reactionAction === 'remove') {
        if (existingIndex !== -1) {
          emojiReactions.splice(existingIndex, 1);
        }
      }
      
      if (emojiReactions.length === 0) {
        delete reactions[messageId][emoji];
        if (Object.keys(reactions[messageId]).length === 0) {
          delete reactions[messageId];
        }
      } else {
        reactions[messageId][emoji] = emojiReactions;
      }
      
      return {
        ...state,
        reactions,
      };
    }

    case 's/REC_TYPING_UPDATE': {
      const { users, channelId } = action;
      return {
        ...state,
        typing: {
          ...state.typing,
          [channelId]: users,
        },
      };
    }

    default:
      return state;
  }
}
