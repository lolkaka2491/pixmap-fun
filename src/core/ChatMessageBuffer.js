/*
 * Buffer for chatMessages for the server
 * it just buffers the most recent 200 messages for each channel
 *
 */
import Sequelize from 'sequelize';
import logger from './logger';

import { Message, Channel } from '../data/sql';
import { getUserFactionTag } from '../routes/api/faction';

const MAX_BUFFER_TIME = 120000;

class ChatMessageBuffer {
  constructor(socketEvents) {
    this.buffer = new Map();
    this.timestamps = new Map();

    this.cleanBuffer = this.cleanBuffer.bind(this);
    this.cleanLoop = setInterval(this.cleanBuffer, 3 * 60 * 1000);
    this.addMessage = this.addMessage.bind(this);
    this.socketEvents = socketEvents;
    socketEvents.on('chatMessage', this.addMessage);
  }

  async getMessages(cid, limit = 30) {
    if (limit > 200) {
      return ChatMessageBuffer.getMessagesFromDatabase(cid, limit);
    }

    let messages = this.buffer.get(cid);
    if (!messages) {
      messages = await ChatMessageBuffer.getMessagesFromDatabase(cid, 200);
      this.buffer.set(cid, messages);
    }
    this.timestamps.set(cid, Date.now());
    return messages.slice(-Math.min(limit, messages.length));
  }

  cleanBuffer() {
    const curTime = Date.now();
    const toDelete = [];
    this.timestamps.forEach((cid, timestamp) => {
      if (curTime > timestamp + MAX_BUFFER_TIME) {
        toDelete.push(cid);
      }
    });
    toDelete.forEach((cid) => {
      this.buffer.delete(cid);
      this.timestamps.delete(cid);
    });
    logger.info(
      `Cleaned ${toDelete.length} channels from chat message buffer`,
    );
  }

  async broadcastChatMessage(
    name,
    message,
    cid,
    uid,
    flag = 'xx',
    sendapi = true,
    factionTag = null,
  ) {
    if (message.length > 200) {
      return;
    }
    // Create the message in database and get the ID
    const dbMessage = await Message.create({
      name,
      flag,
      message,
      cid,
      uid,
    });
    
    Channel.update({
      lastMessage: Sequelize.literal('CURRENT_TIMESTAMP'),
    }, {
      where: {
        id: cid,
      },
    });
    /*
     * goes through socket events and then comes
     * back at addMessage
     */
    this.socketEvents.broadcastChatMessage(
      name,
      message,
      cid,
      uid,
      flag,
      sendapi,
      factionTag,
      dbMessage.id, // Pass the database message ID
    );
  }

  async addMessage(
    name,
    message,
    cid,
    uid,
    flag,
    factionTag = null,
    messageId = null, // Add messageId parameter
  ) {
    const messages = this.buffer.get(cid);
    if (messages) {
      messages.push([
        name,
        message,
        flag,
        uid,
        Math.round(Date.now() / 1000),
        factionTag,
        messageId, // Add messageId as the 7th element (index 6)
      ]);
    }
  }

  static async getMessagesFromDatabase(cid, limit = 200) {
    const messagesModel = await Message.findAll({
      attributes: [
        'id',
        'message',
        'uid',
        'name',
        'flag',
        [
          Sequelize.fn('UNIX_TIMESTAMP', Sequelize.col('createdAt')),
          'ts',
        ],
      ],
      where: { cid },
      limit,
      order: [['createdAt', 'DESC']],
      raw: true,
    });
    
    // Get unique user IDs to batch fetch faction tags
    const uniqueUserIds = [...new Set(messagesModel.map(msg => msg.uid))];
    
    // Batch fetch all faction tags in one query
    const factionTags = {};
    if (uniqueUserIds.length > 0) {
      try {
        const { FactionMember, Faction } = require('../data/sql/Faction');
        const memberships = await FactionMember.findAll({
          where: { RegUserId: uniqueUserIds },
          include: [{
            model: Faction,
            attributes: ['tag']
          }]
        });
        
        // Create a map of userId -> factionTag
        memberships.forEach(membership => {
          if (membership.Faction && membership.Faction.tag) {
            factionTags[membership.RegUserId] = membership.Faction.tag;
          }
        });
      } catch (error) {
        logger.error(`Error fetching faction tags: ${error.message}`);
      }
    }
    
    const messages = [];
    let i = messagesModel.length;
    while (i > 0) {
      i -= 1;
      const {
        id,
        message,
        uid,
        name,
        flag,
        ts,
      } = messagesModel[i];
      
      // Get faction tag from our batched results
      const factionTag = factionTags[uid] || null;
      
      messages.push([
        name,
        message,
        flag,
        uid,
        ts,
        factionTag, // Add faction tag as 6th element
        id, // Add message ID as 7th element (index 6)
      ]);
    }
    return messages;
  }
}

export default ChatMessageBuffer;
