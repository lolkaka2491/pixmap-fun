import { DataTypes } from 'sequelize';
import sequelize from './sequelize';
import RegUser from './RegUser';

const LoginLog = sequelize.define('LoginLog', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  flag: {
    type: DataTypes.CHAR(2),
    allowNull: true,
  },
  iid: {
    type: DataTypes.UUID,
    allowNull: true,
  },
}, {
  tableName: 'LoginLogs',
  timestamps: false,     
});

LoginLog.belongsTo(RegUser, { foreignKey: 'userId', targetKey: 'id' });
RegUser.hasMany(LoginLog, { foreignKey: 'userId', sourceKey: 'id' });

export default LoginLog;
