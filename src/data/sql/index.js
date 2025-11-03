import Whitelist from './Whitelist';
import RegUser from './RegUser';
import Channel from './Channel';
import UserChannel from './UserChannel';
import Message from './Message';
import Reaction from './Reaction';
import UserBlock from './UserBlock';
import IPInfo from './IPInfo';
import ScheduledAction from './models/ScheduledAction';
import Announcement from './Announcement';
import LoginLog from './LoginLog';

/*
 * User Channel access
 */
RegUser.belongsToMany(Channel, {
  as: 'channel',
  through: UserChannel,
});
Channel.belongsToMany(RegUser, {
  as: 'user',
  through: UserChannel,
});

/*
 * User blocking
 */
RegUser.belongsToMany(RegUser, {
  as: 'blocked',
  through: UserBlock,
  foreignKey: 'uid',
  otherKey: 'buid',
});

RegUser.belongsToMany(RegUser, {
  as: 'blockedBy',
  through: UserBlock,
  foreignKey: 'buid',
  otherKey: 'uid',
});

export {
  Whitelist,
  RegUser,
  Channel,
  UserChannel,
  Message,
  Reaction,
  UserBlock,
  IPInfo,
  ScheduledAction,
  Announcement,
  LoginLog
};
