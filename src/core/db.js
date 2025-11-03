const { sequelize } = require('../data/sql/sequelize');

const db = {
  query: async (sql, params) => {
    try {
      const [results] = await sequelize.query(sql, {
        replacements: params,
        type: sequelize.QueryTypes.SELECT
      });
      return results;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  }
};

module.exports = { db }; 