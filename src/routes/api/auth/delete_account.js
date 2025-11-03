/*
 * account deletion endpoint
 */

import socketEvents from '../../../socket/socketEvents';
import { RegUser } from '../../../data/sql';
import { validatePassword } from '../../../utils/validation';
import { checkIfMuted } from '../../../data/redis/chat';
import { compareToHash } from '../../../utils/hash';

function validate(password, gettext) {
  const errors = [];

  const passworderror = gettext(validatePassword(password));
  if (passworderror) errors.push(passworderror);

  return errors;
}

export default async (req, res) => {
  const { password } = req.body;
  const { t, gettext } = req.ttag;

  const { user } = req;
  if (!user || !user.regUser) {
    res.status(401);
    res.json({
      errors: [t`You are not authenticated.`],
    });
    return;
  }
  const { id, name } = user;

  let freshUser;
  try {
    freshUser = await RegUser.findByPk(id, {
      attributes: ['banned', 'ban_expiration', 'ban_reason', 'password'],
      raw: true,
    });
  } catch (err) {
    console.error('Error reloading user for ban check:', err);
    return res.status(500).json({ errors: [t`Server error checking ban status.`] });
  }
  if (!freshUser) {
    return res.status(404).json({ errors: [t`User not found.`] });
  }

  const now = new Date();
  const expires = freshUser.ban_expiration ? new Date(freshUser.ban_expiration) : null;
  if (freshUser.banned && (!expires || expires > now)) {
    const reason = freshUser.ban_reason || t`No reason provided`;
    return res.status(403).json({ errors: [t`Your account is banned. Reason: ${reason}`] });
  }

  const mutedTtl = await checkIfMuted(id);
  if (mutedTtl !== -2) {
    res.status(403);
    res.json({
      errors: [t`Muted Users can not delete their account.`],
    });
    return;
  }

  const currentPassword = freshUser.password;
  if (!currentPassword || !compareToHash(password, currentPassword)) {
    res.status(400);
    res.json({
      errors: [t`Incorrect password!`],
    });
    return;
  }


  req.logout((err) => {
    if (err) {
      res.status(500);
      res.json({
        errors: [t`Server error when logging out.`],
      });
      return;
    }

    RegUser.destroy({ where: { id } });

    socketEvents.reloadUser(name);

    res.status(200);
    res.json({
      success: true,
    });
  });
};
