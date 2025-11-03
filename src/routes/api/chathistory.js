/*
 *
 * returns chat messages of given channel
 *
 */
import chatProvider from '../../core/ChatProvider';
import { Reaction, RegUser } from '../../data/sql';

async function chatHistory(req, res) {
  let { cid, limit } = req.query;

  if (!cid || !limit) {
    res.status(400);
    res.json({
      errors: ['cid or limit not defined'],
    });
    return;
  }
  cid = parseInt(cid, 10);
  limit = parseInt(limit, 10);
  if (Number.isNaN(cid) || Number.isNaN(limit)
    || limit <= 0 || limit > 200) {
    res.status(400);
    res.json({
      errors: ['cid or limit not a valid value'],
    });
    return;
  }

  const { user } = req;
  user.lang = req.lang;

  if (!chatProvider.userHasChannelAccess(user, cid)) {
    res.status(401);
    res.json({
      errors: ['You don\'t have access to this channel'],
    });
    return;
  }

  const history = await chatProvider.getHistory(cid, limit);
  
  // Get message IDs from the history
  const messageIds = history
    .filter(message => message[6]) // Only messages with valid IDs
    .map(message => message[6]); // Extract message ID (index 6)

  // Fetch reactions for these messages
  let reactions = {};
  if (messageIds.length > 0) {
    const reactionData = await Reaction.findAll({
      where: {
        messageId: messageIds
      },
      include: [
        {
          model: RegUser,
          as: 'user',
          attributes: ['name']
        }
      ]
    });

    // Group reactions by messageId and emoji
    for (const reaction of reactionData) {
      const { messageId, emoji, userId, user: userModel } = reaction;
      
      if (!reactions[messageId]) {
        reactions[messageId] = {};
      }
      
      if (!reactions[messageId][emoji]) {
        reactions[messageId][emoji] = [];
      }
      
      reactions[messageId][emoji].push({
        userId,
        userName: userModel.name
      });
    }
  }

  res.json({
    history,
    reactions
  });
}

export default chatHistory;
