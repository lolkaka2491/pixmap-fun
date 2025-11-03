import { Faction, FactionMember } from '../../data/sql/Faction';
import RegUser from '../../data/sql/RegUser';
import { getUserRanks } from '../../data/redis/ranks';
import redis from '../../data/redis/client';
import logger from '../../core/logger';
import { t } from 'ttag';
import fs from 'fs';
import path from 'path';
import { setCoolDown, getCoolDown } from '../../data/redis/cooldown';
import { Op } from 'sequelize';

const MIN_PIXELS_FOR_CREATION = 200000;
const FLAGS_DIR = path.join(process.cwd(), 'public', 'factions', 'flags');
const MAX_FLAG_SIZE = 3 * 1024 * 1024; // 3MB in bytes
const FACTION_ACTION_COOLDOWN = 5; // 5 seconds cooldown
const RATE_LIMIT_WINDOW = 60; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 10; // Maximum requests per minute
const DAILY_RANKED_KEY = 'daily_ranked';

// Ensure flags directory exists
if (!fs.existsSync(FLAGS_DIR)) {
  fs.mkdirSync(FLAGS_DIR, { recursive: true });
}

// Helper function to save flag
async function saveFlag(base64Data, factionId) {
  try {
    const matches = base64Data.match(/^data:image\/([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      throw new Error('Invalid image data');
    }

    const imageType = matches[1];
    if (imageType !== 'png') {
      throw new Error('Only PNG images are allowed');
    }

    const imageData = matches[2];
    const buffer = Buffer.from(imageData, 'base64');

    // Check file size
    if (buffer.length > MAX_FLAG_SIZE) {
      throw new Error('Flag image must be less than 3MB');
    }

    const filename = `${factionId}.${imageType}`;
    const filepath = path.join(FLAGS_DIR, filename);

    // Ensure the directory exists
    if (!fs.existsSync(FLAGS_DIR)) {
      fs.mkdirSync(FLAGS_DIR, { recursive: true });
    }

    await fs.promises.writeFile(filepath, buffer);
    return filename;
  } catch (error) {
    logger.error(`Error saving flag: ${error.message}`);
    throw error;
  }
}

// Helper function to check rate limit
async function checkRateLimit(userId, action) {
  if (!userId) {
    throw new Error(t`Invalid user ID`);
  }
  
  const cooldownKey = `faction_${action}_${userId}`;
  const rateLimitKey = `faction_rate_${userId}`;
  
  // Check cooldown
  const cooldown = await getCoolDown(cooldownKey);
  if (cooldown) {
    throw new Error(t`Please wait ${cooldown} seconds before ${action} again`);
  }
  
  // Check rate limit window
  const requests = await redis.incr(rateLimitKey);
  if (requests === 1) {
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
  }
  
  if (requests > MAX_REQUESTS_PER_WINDOW) {
    throw new Error(t`Too many requests. Please try again later.`);
  }
  
  // Set cooldown
  await setCoolDown(cooldownKey, FACTION_ACTION_COOLDOWN);
}

// Helper function to handle rate limit errors
function handleRateLimitError(error, res) {
  if (error.message.includes('Please wait') || error.message.includes('Too many requests')) {
    res.status(429).json({ error: error.message });
    return true;
  }
  return false;
}

// Helper function to update faction daily pixels
async function updateFactionDailyPixels(factionId, userId) {
  try {
    // Get daily pixels from Redis
    const dailyPixels = await redis.zScore(DAILY_RANKED_KEY, userId);
    if (dailyPixels > 0) {
      await Faction.increment('dailyPixels', {
        by: dailyPixels,
        where: { id: factionId }
      });
    }
  } catch (error) {
    logger.error(`Error updating faction daily pixels: ${error.message}`);
  }
}

// Helper function to get user's faction tag
export async function getUserFactionTag(userId) {
  try {
    const membership = await FactionMember.findOne({
      where: { RegUserId: userId }
    });
    
    if (membership) {
      const faction = await Faction.findByPk(membership.FactionId);
      if (faction && faction.tag) {
        return faction.tag;
      }
    }
    return null;
  } catch (error) {
    logger.error(`Error getting user faction tag: ${error.message}`);
    return null;
  }
}

// Helper function to update faction pixels when user places pixels
export async function updateFactionPixels(userId, pixelsPlaced) {
  try {
    const membership = await FactionMember.findOne({
      where: { RegUserId: userId },
      include: [{
        model: Faction,
        attributes: ['id']
      }]
    });

    if (membership && membership.Faction) {
      await Faction.increment('totalPixels', {
        by: pixelsPlaced,
        where: { id: membership.Faction.id }
      });
    }
  } catch (error) {
    logger.error(`Error updating faction pixels: ${error.message}`);
  }
}

async function createFaction(req, res) {
  const { name, description, tag, flag } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'create');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    // Check if user is already in a faction
    const existingMembership = await FactionMember.findOne({
      where: {
        RegUserId: user.regUser.id,
      },
    });

    if (existingMembership) {
      res.status(400).json({ error: t`You are already a member of a faction` });
      return;
    }

    // Check if user has enough pixels using Redis
    const [totalPixels] = await getUserRanks(user.regUser.id);

    if (totalPixels < MIN_PIXELS_FOR_CREATION) {
      res.status(403).json({
        error: t`You need at least ${MIN_PIXELS_FOR_CREATION} pixels to create a faction`,
      });
      return;
    }

    // Validate and process tag if provided
    let processedTag = null;
    if (tag && tag.trim()) {
      const sanitizedTag = tag.trim().toUpperCase();
      if (sanitizedTag.length < 2 || sanitizedTag.length > 4) {
        res.status(400).json({ error: t`Faction tag must be between 2 and 4 characters` });
        return;
      }
      if (!/^[A-Z0-9]+$/.test(sanitizedTag)) {
        res.status(400).json({ error: t`Faction tag can only contain letters and numbers` });
        return;
      }
      
      // Check if tag is already taken
      const existingFaction = await Faction.findOne({
        where: { tag: sanitizedTag }
      });
      
      if (existingFaction) {
        res.status(400).json({ error: t`This faction tag is already taken` });
        return;
      }
      
      processedTag = sanitizedTag;
    }

    const factionData = {
      name,
      description,
      tag: processedTag,
      ownerId: user.regUser.id,
      memberCount: 1, // Initialize member count to 1
    };

    // Handle flag if provided
    if (flag) {
      try {
        // Create faction first to get ID for flag filename
        const faction = await Faction.create(factionData);
        const flagFilename = await saveFlag(flag, faction.id);
        await faction.update({ flag: flagFilename });
        
        // Add owner as first member
        await FactionMember.create({
          FactionId: faction.id,
          RegUserId: user.regUser.id,
          role: 'owner',
        });

        // Update faction's daily pixels with owner's daily pixels
        await updateFactionDailyPixels(faction.id, user.regUser.id);

        res.json({ success: true, faction });
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
    } else {
      // Create faction without flag
      const faction = await Faction.create(factionData);

      // Add owner as first member
      await FactionMember.create({
        FactionId: faction.id,
        RegUserId: user.regUser.id,
        role: 'owner',
      });

      // Update faction's daily pixels with owner's daily pixels
      await updateFactionDailyPixels(faction.id, user.regUser.id);

      res.json({ success: true, faction });
    }
  } catch (error) {
    logger.error(`Error creating faction: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

async function joinFaction(req, res) {
  const { factionId } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'join');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    // Check if user is already in any faction
    const existingMembership = await FactionMember.findOne({
      where: {
        RegUserId: user.regUser.id,
      },
    });

    if (existingMembership) {
      res.status(400).json({ error: t`You are already a member of a faction. Leave your current faction first.` });
      return;
    }

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    await FactionMember.create({
      FactionId: factionId,
      RegUserId: user.regUser.id,
      role: 'member',
    });

    // Increment member count
    await faction.increment('memberCount');

    // Update faction's total pixels with user's daily pixels
    await updateFactionDailyPixels(factionId, user.regUser.id);

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error joining faction: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

async function leaveFaction(req, res) {
  const { factionId } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'leave');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    // Check if owner
    if (faction.ownerId === user.regUser.id) {
      res.status(400).json({ error: t`Faction owner cannot leave. Transfer ownership or delete the faction first.` });
      return;
    }

    const member = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: user.regUser.id,
      },
    });

    if (!member) {
      res.status(400).json({ error: t`You are not a member of this faction` });
      return;
    }

    // Delete member record
    await member.destroy();
    
    // Update member count
    await faction.decrement('memberCount');

    // Get member's daily pixels and subtract from faction's daily pixels
    const [dailyPixels] = await getUserRanks(user.regUser.id);
    if (dailyPixels > 0) {
      const currentDailyPixels = faction.dailyPixels || 0;
      const newDailyPixels = Math.max(0, currentDailyPixels - dailyPixels);
      await faction.update({ dailyPixels: newDailyPixels });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error leaving faction: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

/** Removes a user from a faction without reservation.
 * For **internal server-use only**. This should not be an API endpoint.
 * There is no verification that the user executing this function has permission to do so!
 * It is assumed that since the server is executing this function, something else has already verified this should be run.
 * This does not work on faction owners.
 * @param {*} userId - The ID of the user to remove from the faction
 * @param {*} factionId - The ID of the faction to remove the user from
 * @returns {string} Status message
 */
export async function _leaveFaction(userId, factionId) {

  try {
    const member = await FactionMember.findOne({
      where: {
        FactionId: Number(factionId),
        RegUserId: Number(userId),
      },
    });

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      return `Faction ${factionId} not found!`;
    }

    // Check if owner
    if (faction.ownerId === userId) {
      return `User ${userId} is the faction (${factionId}) owner. We can't remove them from the faction!`;
    }

    if (!member) {
      return `User ${userId} is not a member of faction ${factionId}!`;
    }

    // Delete member record
    await member.destroy();
    
    // Update member count
    await faction.decrement('memberCount');

    // Get member's daily pixels and subtract from faction's daily pixels
    const [dailyPixels] = await getUserRanks(userId);
    if (dailyPixels > 0) {
      const currentDailyPixels = faction.dailyPixels || 0;
      const newDailyPixels = Math.max(0, currentDailyPixels - dailyPixels);
      await faction.update({ dailyPixels: newDailyPixels });
    }
  } catch (exception) {
    logger.error(`Error leaving faction: ${exception.message}`);
    return `Error leaving faction: ${exception.message}`;
  }

  return `Removed user ${userId} from faction ${factionId}`;
}

async function updateFaction(req, res) {
  const { factionId, name, description, flag, tag } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    // Check if user is owner or admin
    const member = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: user.regUser.id,
      },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: t`You don't have permission to update this faction` });
      return;
    }

    const updates = {};
    if (name) {
      // Sanitize name
      const sanitizedName = name.trim().slice(0, 32);
      if (sanitizedName.length < 3) {
        res.status(400).json({ error: t`Faction name must be at least 3 characters long` });
        return;
      }
      updates.name = sanitizedName;
    }
    if (description) {
      // Sanitize description
      updates.description = description.trim().slice(0, 1000);
    }
    if (flag) {
      try {
        updates.flag = await saveFlag(flag, factionId);
      } catch (error) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    if (tag !== undefined) {
      if (tag === null || tag === '') {
        // Allow clearing the tag
        updates.tag = null;
      } else {
        // Validate tag
        const sanitizedTag = tag.trim().toUpperCase();
        if (sanitizedTag.length < 2 || sanitizedTag.length > 4) {
          res.status(400).json({ error: t`Faction tag must be between 2 and 4 characters` });
          return;
        }
        if (!/^[A-Z0-9]+$/.test(sanitizedTag)) {
          res.status(400).json({ error: t`Faction tag can only contain letters and numbers` });
          return;
        }
        
        // Check if tag is already taken by another faction
        const existingFaction = await Faction.findOne({
          where: {
            tag: sanitizedTag,
            id: { [Op.ne]: factionId }
          }
        });
        
        if (existingFaction) {
          res.status(400).json({ error: t`This faction tag is already taken` });
          return;
        }
        
        updates.tag = sanitizedTag;
      }
    }

    await faction.update(updates);
    res.json({ success: true, faction });
  } catch (error) {
    logger.error(`Error updating faction: ${error.message}`);
    res.status(400).json({ error: t`Failed to update faction` });
  }
}

async function deleteFaction(req, res) {
  const { factionId } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'delete');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    if (faction.ownerId !== user.regUser.id) {
      res.status(403).json({ error: t`Only the faction owner can delete the faction` });
      return;
    }

    // Delete the flag file if it exists
    if (faction.flag) {
      const flagPath = path.join(FLAGS_DIR, faction.flag);
      try {
        await fs.promises.unlink(flagPath);
      } catch (error) {
        logger.error(`Error deleting flag file: ${error.message}`);
        // Continue with faction deletion even if flag deletion fails
      }
    }

    // Delete all member records
    await FactionMember.destroy({
      where: {
        FactionId: factionId
      }
    });

    // Delete the faction
    await faction.destroy();

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting faction: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

async function kickMember(req, res) {
  const { factionId, userId } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'kick');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    // Check if user is owner or admin
    const member = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: user.regUser.id,
      },
    });

    if (!member || !['owner', 'admin'].includes(member.role)) {
      res.status(403).json({ error: t`You don't have permission to kick members` });
      return;
    }

    // Can't kick the owner
    if (faction.ownerId === userId) {
      res.status(400).json({ error: t`Cannot kick the faction owner` });
      return;
    }

    const targetMember = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: userId,
      },
    });

    if (!targetMember) {
      res.status(404).json({ error: t`Member not found` });
      return;
    }

    await targetMember.destroy();
    await faction.decrement('memberCount');

    // Get kicked member's daily pixels and subtract from faction's daily pixels
    const [dailyPixels] = await getUserRanks(userId);
    if (dailyPixels > 0) {
      const currentDailyPixels = faction.dailyPixels || 0;
      const newDailyPixels = Math.max(0, currentDailyPixels - dailyPixels);
      await faction.update({ dailyPixels: newDailyPixels });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error kicking member: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

async function getFactions(req, res) {
  try {
    const { sortBy = 'createdAt', sortDirection = 'DESC' } = req.query;
    
    // Validate sort parameters
    const validSortFields = ['name', 'memberCount', 'totalPixels', 'dailyPixels', 'createdAt'];
    const validDirections = ['ASC', 'DESC'];
    
    if (!validSortFields.includes(sortBy)) {
      res.status(400).json({ 
        error: t`Invalid sort field. Valid fields are: name, memberCount, totalPixels, dailyPixels, createdAt` 
      });
      return;
    }
    
    if (!validDirections.includes(sortDirection.toUpperCase())) {
      res.status(400).json({ error: t`Invalid sort direction. Use ASC or DESC` });
      return;
    }

    // Get all factions with their owners and members
    const factions = await Faction.findAll({
      include: [
        {
          model: RegUser,
          as: 'owner',
          attributes: ['id', 'name'],
        },
        {
          model: RegUser,
          as: 'members',
          attributes: ['id', 'name', 'priv'], 
          through: {
            attributes: ['role'],
          },
        }
      ],
      order: [[sortBy, sortDirection.toUpperCase()]],
    });

    // Format the response
    const formattedFactions = await Promise.all(factions.map(async faction => {
      const plainFaction = faction.get({ plain: true });
      
      // Get pixel counts for all members
      const memberPromises = plainFaction.members.map(async member => {
        // priv is now always from the Users table (RegUser)
        const isPrivate = member.priv === true || member.priv === 1 || member.priv === '1';
        const displayName = isPrivate ? 'Private Account' : member.name;
        // Get fresh data from Redis
        const [totalPixels, dailyPixels] = await getUserRanks(member.id);

        return {
          id: member.id,
          name: displayName,
          role: member.FactionMember.role,
          totalPixels: parseInt(totalPixels) || 0,
          dailyPixels: parseInt(dailyPixels) || 0,
        };
      });

      const members = await Promise.all(memberPromises);
      
      // Calculate faction totals
      const totalPixels = members.reduce((sum, member) => sum + member.totalPixels, 0);
      const dailyPixels = members.reduce((sum, member) => sum + member.dailyPixels, 0);

      // Construct flag URL if it exists
      const flagUrl = plainFaction.flag ? `/factions/flags/${plainFaction.flag}` : null;

      return {
        id: plainFaction.id,
        name: plainFaction.name,
        description: plainFaction.description,
        flag: flagUrl,
        createdAt: plainFaction.createdAt,
        updatedAt: plainFaction.updatedAt,
        owner: plainFaction.owner,
        members,
        memberCount: plainFaction.memberCount,
        totalPixels,
        dailyPixels
      };
    }));

    res.json({ 
      success: true, 
      factions: formattedFactions,
      sortBy,
      sortDirection: sortDirection.toUpperCase()
    });
  } catch (error) {
    logger.error(`Error getting factions: ${error.message}`);
    res.status(500).json({ error: t`Failed to get factions: ${error.message}` });
  }
}

async function transferOwnership(req, res) {
  const { factionId, newOwnerId } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    // Check rate limit first
    try {
      await checkRateLimit(user.regUser.id, 'transfer');
    } catch (error) {
      if (handleRateLimitError(error, res)) return;
      throw error;
    }

    const faction = await Faction.findByPk(factionId);
    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    if (faction.ownerId !== user.regUser.id) {
      res.status(403).json({ error: t`Only the faction owner can transfer ownership` });
      return;
    }

    const newOwner = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: newOwnerId,
      },
    });

    if (!newOwner) {
      res.status(404).json({ error: t`New owner is not a member of this faction` });
      return;
    }

    // Get current owner's member record
    const currentOwner = await FactionMember.findOne({
      where: {
        FactionId: factionId,
        RegUserId: user.regUser.id,
      },
    });

    if (!currentOwner) {
      res.status(404).json({ error: t`Current owner record not found` });
      return;
    }

    // Update ownership
    await faction.update({ ownerId: newOwnerId });
    await newOwner.update({ role: 'owner' });
    await currentOwner.update({ role: 'member' });

    res.json({ success: true });
  } catch (error) {
    logger.error(`Error transferring ownership: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

// Helper function to update member ranks
async function updateMemberRanks(factionId) {
  try {
    const members = await FactionMember.findAll({
      where: { FactionId: factionId },
      include: [{
        model: RegUser,
        attributes: ['id', 'name']
      }],
      order: [['dailyPixels', 'DESC']]
    });

    // Update ranks
    for (let i = 0; i < members.length; i++) {
      await members[i].update({ rank: i + 1 });
    }
  } catch (error) {
    logger.error(`Error updating member ranks: ${error.message}`);
  }
}
// Update faction theme
async function updateTheme(req, res) {
  const { factionId, themeColor } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    const faction = await Faction.findByPk(factionId, {
      include: [{
        model: RegUser,
        as: 'owner',
        attributes: ['id']
      }]
    });

    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    if (faction.owner.id !== user.regUser.id) {
      res.status(403).json({ error: t`Only the faction owner can update the theme` });
      return;
    }

    await faction.update({ themeColor });
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error updating theme: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

// Update welcome template
async function updateWelcomeTemplate(req, res) {
  const { factionId, welcomeTemplate } = req.body;
  const { user } = req;

  if (!user || !user.regUser) {
    res.status(401).json({ error: t`You must be logged in` });
    return;
  }

  try {
    const faction = await Faction.findByPk(factionId, {
      include: [{
        model: RegUser,
        as: 'owner',
        attributes: ['id']
      }]
    });

    if (!faction) {
      res.status(404).json({ error: t`Faction not found` });
      return;
    }

    if (faction.owner.id !== user.regUser.id) {
      res.status(403).json({ error: t`Only the faction owner can update the welcome template` });
      return;
    }

    await faction.update({ welcomeTemplate });
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error updating welcome template: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

// Get faction rankings
async function getRankings(req, res) {
  try {
    const factions = await Faction.findAll({
      attributes: ['id', 'name', 'totalPixels', 'dailyPixels', 'memberCount'],
      include: [{
        model: RegUser,
        as: 'owner',
        attributes: ['id', 'name']
      }],
      order: [['dailyPixels', 'DESC']]
    });

    // Add rank to each faction
    const rankedFactions = factions.map((faction, index) => ({
      ...faction.toJSON(),
      rank: index + 1
    }));

    res.json({ success: true, factions: rankedFactions });
  } catch (error) {
    logger.error(`Error getting rankings: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

export {
  createFaction,
  joinFaction,
  leaveFaction,
  updateFaction,
  deleteFaction,
  kickMember,
  getFactions,
  transferOwnership,
  updateTheme,
  updateWelcomeTemplate,
  getRankings
}; 