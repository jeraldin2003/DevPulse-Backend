import pool from '../config/db.js';

export const saveFeedback = async ({ name, email, subject, message }) => {
  const result = await pool.query(
    `INSERT INTO feedback (name, email, subject, message)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, subject, message, created_at`,
    [name, email, subject, message]
  );
  return result.rows[0];
};
