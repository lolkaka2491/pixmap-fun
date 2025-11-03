import { DataTypes } from 'sequelize';
import sequelize from './sequelize';
import RegUser from './RegUser';

const Faction = sequelize.define('Faction', {
  id: {
    type: DataTypes.INTEGER.UNSIGNED,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(32),
    allowNull: false,
    unique: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  flag: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  ownerId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
    references: {
      model: RegUser,
      key: 'id',
    },
  },
  totalPixels: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
  },
  memberCount: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 1,
  },
  dailyPixels: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
  },
  welcomeTemplate: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  themeColor: {
    type: DataTypes.STRING(7), // Hex color code
    allowNull: true,
    defaultValue: '#ffffff',
  },
  tag: {
    type: DataTypes.STRING(4), // Faction tag (2-4 characters)
    allowNull: true,
    unique: true,
    validate: {
      len: {
        args: [2, 4],
        msg: 'Faction tag must be between 2 and 4 characters'
      },
      isAlphanumeric: {
        args: true,
        msg: 'Faction tag can only contain letters and numbers'
      }
    },
  },
}, {
  tableName: 'Factions',
  timestamps: true,
});

// Create junction table for faction members
const FactionMember = sequelize.define('FactionMember', {
  role: {
    type: DataTypes.ENUM('owner', 'admin', 'member'),
    defaultValue: 'member',
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  rank: {
    type: DataTypes.INTEGER.UNSIGNED,
    defaultValue: 0,
  },
}, {
  tableName: 'FactionMembers',
  timestamps: false,
});

// Set up associations
Faction.belongsTo(RegUser, { as: 'owner', foreignKey: 'ownerId' });
Faction.belongsToMany(RegUser, { 
  through: FactionMember,
  as: 'members',
  foreignKey: 'FactionId',
  otherKey: 'RegUserId'
});
RegUser.belongsToMany(Faction, { 
  through: FactionMember,
  as: 'factions',
  foreignKey: 'RegUserId',
  otherKey: 'FactionId'
});

// Add associations for FactionMember
FactionMember.belongsTo(Faction, { foreignKey: 'FactionId' });
FactionMember.belongsTo(RegUser, { foreignKey: 'RegUserId' });
Faction.hasMany(FactionMember, { foreignKey: 'FactionId' });
RegUser.hasMany(FactionMember, { foreignKey: 'RegUserId' });

export { Faction, FactionMember };
export default Faction; 