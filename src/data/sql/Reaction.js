/*
 *
 * Database layout for Chat Message Reactions
 *
 */

import { DataTypes } from 'sequelize';
import sequelize from './sequelize';
import Message from './Message';
import RegUser from './RegUser';

const Reaction = sequelize.define('Reaction', {
  // Reaction ID
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },

  // The emoji name (without .png extension)
  emoji: {
    type: DataTypes.STRING(32),
    allowNull: false,
  },

  // Composite index to prevent duplicate reactions
  messageId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: Message,
      key: 'id',
    },
  },

  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: RegUser,
      key: 'id',
    },
  },
}, {
  updatedAt: false,
  
  indexes: [
    {
      unique: true,
      fields: ['messageId', 'userId', 'emoji']
    }
  ]
});

Reaction.belongsTo(Message, {
  as: 'message',
  foreignKey: 'messageId',
  onDelete: 'cascade',
});

Reaction.belongsTo(RegUser, {
  as: 'user',
  foreignKey: 'userId',
  onDelete: 'cascade',
});

export default Reaction; 