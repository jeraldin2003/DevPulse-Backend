import pool from '../config/db.js';

/**
 * Insert a new password hash into the history for a given user.
 */
export const addPasswordHistory = async (userId, passwordHash) => {
  await pool.query(
    'INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)',
    [userId, passwordHash]
  );
};

/**
 * Return all historical password hashes for a user, newest first.
 */
export const getPasswordHistory = async (userId) => {
  const result = await pool.query(
    'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map((r) => r.password_hash);
};
