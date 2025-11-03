
/**
 * send initial data to player and log countries with iids
 */


import getMe from '../../core/me';
import { getIPFromRequest, getIPv6Subnet } from '../../utils/ip';
import { getInfoToIp, getIIDofIP } from '../../data/sql/IPInfo';
import { LoginLog, RegUser } from '../../data/sql';
import { verifyCanvasToken } from '../../core/canvasToken';
import userTracking from '../../core/UserTracking';

export default async (req, res, next) => {
  try {
    const { user, lang } = req;

    // Protect canvases unless a valid short-lived token is provided
    const token = req.header('X-Canvas-Token');
    const tokenOk = verifyCanvasToken(token);

    const userdata = await getMe(user, lang, { includeCanvases: !!tokenOk });
    user.updateLogInTimestamp();

    if (!user || typeof user.id !== 'number' || !user.id) {
      return res.json(userdata);
    }

    try {
      // 1. Resolve raw IP and geo
      const rawIp = getIPFromRequest(req);
      const ipSubnet = getIPv6Subnet(rawIp);
      let info = await getInfoToIp(ipSubnet);
      if (!info) {
        try { await getInfoToIp(ipSubnet); } catch {}
        info = await getInfoToIp(ipSubnet);
      }
      const country = info?.country?.toLowerCase() || 'xx';

      // 2. Resolve the IID  for this IP
      const iid = await getIIDofIP(rawIp);
      if (!iid) {
        // if we can't resolve an IID, skip logging entirely
        return res.json(userdata);
      }

      // 3. Check if this user has ever logged with this IID
      const alreadyLogged = await LoginLog.findOne({
        where: { userId: user.id, iid },
      });

      // 4. Only create a new row if that IID is brand-new for this user
      if (!alreadyLogged) {
        await LoginLog.create({ userId: user.id, flag: country, iid });

        // Track in UserIIDHistory
        await userTracking.trackUserIID(user.id, iid, country);

        if (country !== 'xx') {
          // Get current flag to track changes
          const currentUser = await RegUser.findByPk(user.id, { attributes: ['flag'] });
          const oldFlag = currentUser?.flag;
          
          await RegUser.update(
            { flag: country },
            { where: { id: user.id } }
          );

          // Track flag change if it's different
          if (oldFlag !== country) {
            await userTracking.trackUserFlag(user.id, country, oldFlag);
          }
        }
      } else {
        // Update existing IID tracking
        await userTracking.trackUserIID(user.id, iid, country);
      }
    } catch (err) {
      console.error('LoginLog error:', err);
    }

    return res.json(userdata);
  } catch (error) {
    return next(error);
  }
};
