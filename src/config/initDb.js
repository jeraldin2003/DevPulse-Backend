import pool from './db.js';

const createTablesQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const initDb = async () => {
  try {
    console.log('Initializing database tables...');
    await pool.query(createTablesQuery);
    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
  } finally {
    await pool.end();
  }
};

initDb();
