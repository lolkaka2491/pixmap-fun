/*
 *
 * Database layout for Announcements
 *
 */

import { DataTypes } from 'sequelize';
import sequelize from './sequelize';

const Announcement = sequelize.define('Announcement', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  username: {
    type: `${DataTypes.CHAR(32)} CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    allowNull: false,
  },
  type: {
    type: DataTypes.ENUM('popup', 'banner'),
    allowNull: false,
    defaultValue: 'banner',
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  updatedAt: false,
});

export default Announcement; 