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

// Auto-initialize tables
const initTable = async () => {
  try {
    // Add email column to users if not exists
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
    `);

    // Create otps table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS otps (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_stats (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        total_score INT DEFAULT 0,
        total_games_played INT DEFAULT 0
      );
    `);
    console.log('PostgreSQL tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize tables:', error);
  }
};
initTable();

export default pool;