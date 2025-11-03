import { DataTypes } from 'sequelize';
import sequelize from '../sequelize';

const ScheduledAction = sequelize.define('ScheduledAction', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  action: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  target: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  scheduledFor: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

export default ScheduledAction; 