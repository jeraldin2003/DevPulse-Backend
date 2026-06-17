import pool from '../config/db.js';

export const createUser = async (username, passwordHash) => {
  const result = await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
    [username, passwordHash]
  );
  return result.rows[0];
};

export const findUserByUsername = async (username) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE username = $1',
    [username]
  );
  return result.rows[0] || null;
};

export const findUserById = async (id) => {
  const result = await pool.query(
    'SELECT id, username, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

export const findUserByIdWithPassword = async (id) => {
  const result = await pool.query(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

export const updateUserPassword = async (id, newPasswordHash) => {
  const result = await pool.query(
    'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, username',
    [newPasswordHash, id]
  );
  return result.rows[0] || null;
};
