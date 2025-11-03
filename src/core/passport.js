// passport.js
/**
 * Passport configuration:
 * This file sets up local (JSON-based) and various OAuth strategies
 * for user authentication. We serialize the user’s ID into the session
 * and deserialize by loading the full User object.
 */

import passport from 'passport';
import JsonStrategy from 'passport-json';
import GoogleStrategy from 'passport-google-oauth2';
import DiscordStrategy from 'passport-discord';
import FacebookStrategy from 'passport-facebook';
import RedditStrategy from 'passport-reddit/lib/passport-reddit/strategy';
import VkontakteStrategy from 'passport-vkontakte/lib/strategy';

import { sanitizeName } from '../utils/validation';
import logger from './logger';
import { RegUser } from '../data/sql';
import User, { regUserQueryInclude as include } from '../data/User';
import { auth } from './config';
import { compareToHash } from '../utils/hash';
import { getIPFromRequest, getIPv6Subnet } from '../utils/ip';
import { getInfoToIp, getIIDofIP } from '../data/sql/IPInfo';
import userTracking from './UserTracking';

// When using sessions, Passport will serialize user into the session by ID
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// On each request with a session, Passport will call this to get full user object
passport.deserializeUser(async (req, id, done) => {
  const user = new User();
  try {
    // Initialize the User instance with the given ID and client IP
    await user.initialize(id, getIPFromRequest(req));
    done(null, user);
  } catch (err) {
    done(err, user);
  }
});

/**
 * Local authentication strategy (email/name + password) via JSON payload.
 * We expect the request body to contain:
 *   {
 *     "nameoremail": "user@example.com",
 *     "password": "plaintextPassword"
 *   }
 */
passport.use(
  new JsonStrategy(
    {
      usernameProp: 'nameoremail', // field that holds username or email
      passwordProp: 'password',    // field that holds password
    },
    async (nameoremail, password, done) => {
      try {
        // Determine whether the user submitted an email (contains '@') or a username
        const query = nameoremail.includes('@')
          ? { email: nameoremail }
          : { name: nameoremail };

        // Search for a registered user record matching email or name
        const reguser = await RegUser.findOne({
          include,           // Include any associated models, if defined
          where: query,
        });

        // If no user is found, fail authentication
        if (!reguser) {
          return done(null, false, { message: 'Name or email does not exist!' });
        }

        // Compare submitted password against stored hash
        const passwordMatches = compareToHash(password, reguser.password);
        if (!passwordMatches) {
          return done(null, false, { message: 'Incorrect password!' });
        }

        // At this point, credentials are valid. Create a User instance and initialize it.
        const user = new User();
        await user.initialize(reguser.id, null, reguser);

        // Update the user's last login timestamp (e.g., for audit/logging purposes)
        user.updateLogInTimestamp();

        // Finish authentication, passing the User instance to Passport
        return done(null, user);
      } catch (err) {
        // If any unexpected error occurs, pass it to Passport
        return done(err);
      }
    }
  )
);

/**
 * Helper function to handle OAuth-based logins (Facebook, Google, Discord, etc.).
 * If a user with the given email already exists, we link or update their record.
 * Otherwise, we create a new RegUser entry with a sanitized username.
 */
async function oauthLogin(provider, email, name, discordid = null) {
  if (!email) {
    throw new Error("You don’t have an email set in your OAuth provider account.");
  }

  // Sanitize the display name to remove illegal characters, spaces, etc.
  name = sanitizeName(name);

  // Try to find an existing user by email
  let reguser = await RegUser.findOne({
    include,
    where: { email },
  });

  // If no user exists with this email, try to find or create by sanitized name
  if (!reguser) {
    reguser = await RegUser.findOne({
      include,
      where: { name },
    });

    // If name is already taken, append a random suffix until it’s unique
    while (reguser) {
      name = `${name.substring(0, 15)}-${Math.random().toString(36).substring(2, 10)}`;
      // eslint-disable-next-line no-await-in-loop
      reguser = await RegUser.findOne({
        include,
        where: { name },
      });
    }

    // Log creation of a new user via OAuth
    logger.info(`Create new user from ${provider} OAuth: ${email} / ${name}`);

    // Create the new RegUser record; mark as verified
    reguser = await RegUser.create({
      email,
      name,
      verified: 1,
      discordid,
    });
  }

  // If this is Discord and the existing record didn’t have a Discord ID, update it
  if (discordid && !reguser.discordid) {
    await reguser.update({ discordid });
  }

  // Create and initialize a full User instance to return
  const user = new User();
  await user.initialize(reguser.id, null, reguser);
  return user;
}

/**
 * OAuth strategy: Facebook login
 */
passport.use(
  new FacebookStrategy(
    {
      ...auth.facebook,
      callbackURL: '/api/auth/facebook/return', // Redirect URI set in Facebook app settings
      proxy: true,                             // Trust X-Forwarded-* headers (e.g. if behind proxy)
      profileFields: ['displayName', 'email'],  // Request display name and email from Facebook
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        const { displayName: name, emails } = profile;
        const email = emails[0].value; // Grab the primary email
        const user = await oauthLogin('facebook', email, name);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/**
 * OAuth strategy: Discord login
 */
passport.use(
  new DiscordStrategy(
    {
      ...auth.discord,
      callbackURL: '/api/auth/discord/return',
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { id: discordid, email, username: name } = profile;

        // Discord accounts may not always have a verified email; require one
        if (!email) {
          throw new Error(
            'Cannot use Discord login for an account without a verified email.'
          );
        }

        const user = await oauthLogin('discord', email, name, discordid);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/**
 * OAuth strategy: Google login
 */
passport.use(
  new GoogleStrategy(
    {
      ...auth.google,
      callbackURL: '/api/auth/google/return',
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const { displayName: name, emails } = profile;
        const email = emails[0].value;
        const user = await oauthLogin('google', email, name);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/**
 * OAuth strategy: Reddit login
 * Note: Reddit does not always provide email, so we rely solely on Reddit ID + username.
 */
passport.use(
  new RedditStrategy(
    {
      ...auth.reddit,
      callbackURL: '/api/auth/reddit/return',
      proxy: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const redditid = profile.id;
        let name = sanitizeName(profile.name);

        // Look up existing user by Reddit ID
        let reguser = await RegUser.findOne({
          include,
          where: { redditid },
        });

        // If not found, try to find or create by username
        if (!reguser) {
          reguser = await RegUser.findOne({
            include,
            where: { name },
          });

          // If username is taken, append random suffix until unique
          while (reguser) {
            name = `${name.substring(0, 15)}-${Math.random().toString(36).substring(2, 10)}`;
            // eslint-disable-next-line no-await-in-loop
            reguser = await RegUser.findOne({
              include,
              where: { name },
            });
          }

          logger.info(`Create new user from Reddit OAuth: ${name} / ${redditid}`);
          reguser = await RegUser.create({
            name,
            verified: 1,
            redditid,
          });
        }

        const user = new User();
        await user.initialize(reguser.id, null, reguser);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

/**
 * OAuth strategy: Vkontakte login
 */
passport.use(
  new VkontakteStrategy(
    {
      ...auth.vk,
      callbackURL: '/api/auth/vk/return',
      proxy: true,
      scope: ['email'],         // Request email permission
      profileFields: ['displayName', 'email'],
    },
    async (accessToken, refreshToken, params, profile, done) => {
      try {
        const { displayName: name } = profile;
        const { email } = params; // VK provides email in `params` object

        if (!email) {
          throw new Error(
            'Cannot use VK login for an account without a verified email.'
          );
        }

        const user = await oauthLogin('vkontakte', email, name);
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  )
);

export default passport;
