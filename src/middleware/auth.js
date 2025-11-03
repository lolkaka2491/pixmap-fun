import { getUserIdByName } from '../data/sql/database';
import { RegUser } from '../data/sql/index.js';

export const isAuthenticated = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userId = await getUserIdByName(token);
    if (!userId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const regUser = await RegUser.findByPk(userId);
    if (!regUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = { 
      id: userId,
      regUser: regUser
    };
    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 