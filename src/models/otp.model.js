import pool from '../config/db.js';

export const saveOtp = async (email, otp, expiresAt) => {
  await pool.query(
    `INSERT INTO otps (email, otp, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET otp = $2, expires_at = $3`,
    [email, otp, expiresAt]
  );
};

export const findOtp = async (email) => {
  const result = await pool.query(
    'SELECT * FROM otps WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
};

export const deleteOtp = async (email) => {
  await pool.query('DELETE FROM otps WHERE email = $1', [email]);
};
