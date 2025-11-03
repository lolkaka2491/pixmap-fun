import mysql from 'mysql2/promise';
import {
  MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER, MYSQL_PW, LOG_MYSQL,
} from '../../core/config';

const pool = mysql.createPool({
    host: MYSQL_HOST || 'localhost',
    user: MYSQL_USER || 'pterodactyl',
    password: MYSQL_PW || 'yourPassword',
    database: MYSQL_DATABASE || 'panel',
});

export const query = async (sql, params = []) => {
    const [results] = await pool.execute(sql, params);
    return results;
};

export const getUserIdByName = async (name) => {
    const result = await query('SELECT id FROM Users WHERE name LIKE ?', [`%${name}%`]);
    return result.length ? result[0].id : null;
};

export const close = async () => {
    await pool.end();
};
