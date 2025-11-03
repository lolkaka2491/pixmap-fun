import { query } from '../../data/sql/database';
import getMe from '../../core/me';

async function idbaninfo(req, res, next) {
    try {
        // First get user data using getMe
        if (!req.user) {
            return res.status(200).json({ message: 'You are not banned' });
        }
        const meData = req.user;

        if (!meData) {
            return res.status(200).json({ message: 'You are not banned' });
        }

        // Now check ban details with the ID we got
        const banInfo = await query(`
            SELECT u.banned, u.ban_reason, u.ban_expiration, u.moderator, m.name as mod_name, u.ban_date
            FROM Users u 
            LEFT JOIN Users m ON u.moderator = m.id 
            WHERE u.id = ? AND u.banned = 1
        `, [meData.id]);

        if (!banInfo || banInfo.length === 0) {
            return res.status(200).json({ message: 'You are not banned' });
        }

        const banDetails = banInfo[0];
        let duration = banDetails.ban_expiration ? Math.round((banDetails.ban_expiration.getTime() - Date.now()) / 1000) : 'Permanent';
        
        if (duration !== 'Permanent' && duration <= 0) {
            await query('UPDATE Users SET banned = 0, ban_expiration = NULL, ban_reason = NULL WHERE id = ?', [meData.id]);
            return res.status(200).json({ message: 'You are not banned' });
        }

        const modInfo = banDetails.mod_name ? `${banDetails.mod_name} (${banDetails.moderator})` : banDetails.moderator;
        
        // Format the ban date
        const banDate = banDetails.ban_date ? new Date(banDetails.ban_date) : new Date();
        const banDateFormatted = banDate.toISOString().split('T')[0] + ' ' + 
                                banDate.toISOString().split('T')[1].substring(0, 5) + ' UTC';

        return res.status(200).json({
            moderator: modInfo,
            duration,
            reason: banDetails.ban_reason,
            since: banDateFormatted,
        });
    } catch (err) {
        next(err);
    }
}

export default idbaninfo;