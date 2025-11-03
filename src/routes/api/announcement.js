import express from 'express';
import { Announcement } from '../../data/sql';
import socketEvents from '../../socket/socketEvents';
import { ADMIN_IDS } from '../../core/config';
import { logModerationCommands } from '../../core/discord-webhook.js';

const router = express.Router();

// POST /api/announcement - Admin only
router.post('/', async (req, res) => {
  try {
    const user = req.user && req.user.regUser;
    if (!user || !ADMIN_IDS.includes(user.id)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { message, type } = req.body;
    if (!message || !type || !['popup', 'banner'].includes(type)) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const announcement = await Announcement.create({
      message,
      username: user.name,
      type,
    });
    // Broadcast via socket
    socketEvents.emit('announcement', {
      message: announcement.message,
      username: announcement.username,
      type: announcement.type,
      createdAt: announcement.createdAt,
    });

    logModerationCommands({
      executorId: req.user.id,
      executorName: req.user.name,
      command: type,
      commandDescription: message,
      timestamp: new Date()
    })

    return res.json({ success: true, announcement });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/announcement/latest
router.get('/latest', async (req, res) => {
  try {
    const latest = await Announcement.findOne({
      order: [['createdAt', 'DESC']],
    });
    if (!latest) return res.json({ announcement: null });
    return res.json({ announcement: latest });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router; 