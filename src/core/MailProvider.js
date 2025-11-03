/*
 * functions for mail verification
 */

/* eslint-disable max-len */

import nodemailer from 'nodemailer';

import logger from './logger';
import { getTTag } from './ttag';
import { codeExists, checkCode, setCode } from '../data/redis/mailCodes';
import socketEvents from '../socket/socketEvents';
import { USE_MAILER, MAIL_ADDRESS } from './config';

import { RegUser } from '../data/sql';

/**
 * Normalize email by removing dots and plus signs from the local part.
 * Example: g.eorg.a.re.ve+nio@gmail.com -> georgarevenio@gmail.com
 */
function normalizeEmail(email) {
  const [localPart, domain] = email.split('@');
  // remove all dots and plus signs in the local part
  const cleanedLocal = localPart.replace(/[.+]/g, '');
  return `${cleanedLocal}@${domain}`;
}

export class MailProvider {
  constructor() {
    this.enabled = !!USE_MAILER;
    if (this.enabled) {
      this.transporter = nodemailer.createTransport({
        sendmail: true,
        newline: 'unix',
        path: '/usr/sbin/sendmail',
      });
    }

    /*
     * Mail requests go through SocketEvents when sharding
     */
    socketEvents.on('mail', (type, args) => {
      switch (type) {
        case 'verify':
          this.postVerifyMail(...args);
          break;
        case 'pwreset':
          this.postPasswdResetMail(...args);
          break;
        default:
          // no action
      }
    });
  }

  /**
   * Send an email
   * @param to - recipient email address (normalized before sending)
   * @param subject - email subject
   * @param html - HTML content of the email
   */
  sendMail(to, subject, html) {
    if (!this.enabled) {
      return;
    }
    const normalizedTo = normalizeEmail(to);
    this.transporter.sendMail({
      from: `PixMap <${MAIL_ADDRESS}>`,
      to: normalizedTo,
      replyTo: MAIL_ADDRESS,
      subject,
      html,
    }, (err) => {
      if (err) {
        logger.error(err);
      }
    });
  }

  /**
   * Constructs and sends account verification email
   */
  postVerifyMail(to, name, host, lang, code) {
    const normalizedTo = normalizeEmail(to);
    const { t } = getTTag(lang);
    logger.info(`Sending verification mail to ${normalizedTo} / ${name}`);
    const verifyUrl = `${host}/api/auth/verify?token=${code}&email=${encodeURIComponent(normalizedTo)}`;
    const subject = t`Welcome ${name} to PixMap, please verify your mail`;
    const html = `<em>${t`Hello ${name}`}</em>,<br />
      ${t`welcome to our little community of pixelplacers, to use your account, you have to verify your mail. You can do that here: `} <a href="${verifyUrl}">${t`Click to Verify`}</a>. ${t`Or by copying following url:`}<br />${verifyUrl}\n<br />
      ${t`Have fun and don't hesitate to contact us if you encounter any problems :)`}<br />
      ${t`Thanks`}<br /><br />
      <img alt="" src="https://pixmap.fun/tile.png" style="height:64px; width:64px" />`;
    this.sendMail(normalizedTo, subject, html);
  }

  /**
   * Request to send verification email (with timeout check)
   */
  async sendVerifyMail(to, name, host, lang) {
    if (!this.enabled && !socketEvents.isCluster) {
      return null;
    }
    const normalizedTo = normalizeEmail(to);
    const { t } = getTTag(lang);

    const pastCodeAge = await codeExists(normalizedTo);
    if (pastCodeAge && pastCodeAge < 180) {
      const minLeft = Math.ceil((180 - pastCodeAge) / 60);
      logger.info(
        `Verification mail for ${normalizedTo} - already sent, ${minLeft} minutes remaining`,
      );
      return t`We already sent you a verification mail, you can request another one in ${minLeft} minutes.`;
    }

    const code = setCode(normalizedTo);
    if (this.enabled) {
      this.postVerifyMail(normalizedTo, name, host, lang, code);
    } else {
      socketEvents.sendMail('verify', [normalizedTo, name, host, lang, code]);
    }
    return null;
  }

  /**
   * Constructs and sends password reset email
   */
  postPasswdResetMail(to, ip, host, lang, code) {
    const normalizedTo = normalizeEmail(to);
    const { t } = getTTag(lang);
    logger.info(`Sending password reset mail to ${normalizedTo}`);
    const restoreUrl = `${host}/reset_password?token=${code}&email=${encodeURIComponent(normalizedTo)}`;
    const subject = t`You forgot your password for PixMap? Get a new one here`;
    const html = `<em>${t`Hello`}</em>,<br />
      ${t`You requested to get a new password. You can change your password within the next 30min here: `} <a href="${restoreUrl}">${t`Reset Password`}</a>. ${t`Or by copying following url:`}<br />${restoreUrl}\n<br />
      ${t`If you did not request this mail, please just ignore it (the ip that requested this mail was ${ip}).`}<br />
      ${t`Thanks`}<br /><br />\n<img alt="" src="https://pixmap.fun/tile.png" style="height:64px; width:64px" />`;
    this.sendMail(normalizedTo, subject, html);
  }

  /**
   * Request to send password reset email (with timeout and user existence checks)
   */
  async sendPasswdResetMail(to, ip, host, lang) {
    const { t } = getTTag(lang);
    if (!this.enabled && !socketEvents.isCluster) {
      return t`Mail is not configured on the server`;
    }
    const normalizedTo = normalizeEmail(to);

    const pastCodeAge = await codeExists(normalizedTo);
    if (pastCodeAge && pastCodeAge < 180) {
      logger.info(
        `Password reset mail for ${normalizedTo} requested by ${ip} - already sent`,
      );
      return t`We already sent you a mail with instructions. Please wait before requesting another mail.`;
    }

    const reguser = await RegUser.findOne({ where: { email: normalizedTo } });
    if (!reguser) {
      logger.info(
        `Password reset mail for ${normalizedTo} requested by ${ip} - email not found`,
      );
      return t`Couldn't find this email in our database`;
    }

    const code = setCode(normalizedTo);
    if (this.enabled) {
      this.postPasswdResetMail(normalizedTo, ip, host, lang, code);
    } else {
      socketEvents.sendMail('pwreset', [normalizedTo, ip, host, lang, code]);
    }
    return null;
  }

  static async verify(email, code) {
    const normalizedEmail = normalizeEmail(email);
  
    const ret = await checkCode(normalizedEmail, code);
    if (!ret) return false;

    const reguser = await RegUser.findOne({ where: { email: normalizedEmail } });
    if (!reguser) {
      logger.error(`${normalizedEmail} does not exist in database`);
      return false;
    }
    await reguser.update({ mailVerified: true, verificationReqAt: null });
    return reguser.name;
  }

  /*
   * we do not use this right now
  static cleanUsers() {
    // delete users that require verification for more than 4 days
    RegUser.destroy({
      where: {
        verificationReqAt: {
          [Sequelize.Op.lt]:
            Sequelize.literal('CURRENT_TIMESTAMP - INTERVAL 4 DAY'),
        },
        verified: 0,
      },
    });
  }
  */
}

const mailProvider = new MailProvider();

export default mailProvider;
