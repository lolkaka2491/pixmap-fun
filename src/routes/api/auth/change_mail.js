/*
 * request password change
 */

import mailProvider from '../../../core/MailProvider';

import { validatePassword, validateEMail } from '../../../utils/validation';
import { getHostFromRequest } from '../../../utils/ip';
import { compareToHash } from '../../../utils/hash';
import { checkIfMuted } from '../../../data/redis/chat';
import { checkIfMailDisposable } from '../../../core/isAllowed';
import { RegUser } from '../../../data/sql';

async function validate(email, password, t, gettext) {
  const errors = [];

  const passerror = gettext(validatePassword(password));
  if (passerror) errors.push(passerror);
  const mailerror = gettext(validateEMail(email));
  if (mailerror) {
    errors.push(mailerror);
  } else if (await checkIfMailDisposable(email)) {
    errors.push(t`This email provider is not allowed`);
  }

  return errors;
}

export default async (req, res) => {
  const { email, password } = req.body;
  const { t, gettext } = req.ttag;
  const errors = await validate(email, password, t, gettext);
  if (errors.length > 0) {
    res.status(400);
    res.json({
      errors,
    });
    return;
  }

  const { user, lang } = req;
  if (!user || !user.regUser) {
    res.status(401);
    res.json({
      errors: [t`You are not authenticated.`],
    });
    return;
  }

  let freshUser;
  try {
    freshUser = await RegUser.findByPk(user.id, {
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

  const mutedTtl = await checkIfMuted(user.id);
  if (mutedTtl !== -2) {
    res.status(403);
    res.json({
      errors: [t`Muted Users can not do this.`],
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

  try {
    await user.regUser.update({
      email,
      mailVerified: false,
    });
  } catch (err) {
    console.error('Error updating user email:', err);
    return res.status(500).json({ errors: [t`Server error updating email.`] });
  }

  const host = getHostFromRequest(req);
  mailProvider.sendVerifyMail(email, user.regUser.name, host, lang);

  res.json({
    success: true,
  });
};
