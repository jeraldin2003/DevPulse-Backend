import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_DATABASE,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client', err);
  process.exit(-1);
});

// Auto-initialize quiz_stats table
const initTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_stats (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        total_score INT DEFAULT 0,
        total_games_played INT DEFAULT 0
      );
    `);
    console.log('PostgreSQL quiz_stats table checked/initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize quiz_stats table:', error);
  }
};
initTable();

export default pool;