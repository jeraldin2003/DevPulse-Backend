import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createUser, findUserByUsername, findUserByEmail } from '../models/user.model.js';
import { saveRefreshToken, findRefreshToken, deleteRefreshToken } from '../models/token.model.js';
import { saveOtp, findOtp, deleteOtp } from '../models/otp.model.js';
import { addPasswordHistory, getPasswordHistory } from '../models/password.model.js';
import { sendOtpEmail, sendPasswordResetOtpEmail } from '../helpers/mail.helper.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const OTP_EXPIRY_MINUTES = 10;

// ─── Helper: generate 6-digit numeric OTP ─────────────────────────────────────
const generateOtp = () => String(crypto.randomInt(100000, 999999));

// ─── Helper: check new password against history ────────────────────────────────
const isPasswordReused = async (userId, plainPassword) => {
  const history = await getPasswordHistory(userId);
  for (const hash of history) {
    if (await bcrypt.compare(plainPassword, hash)) return true;
  }
  return false;
};

// ─── POST /auth/send-otp (registration OTP) ───────────────────────────────────
export const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'This email is already registered.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await saveOtp(email, otp, expiresAt);
    await sendOtpEmail(email, otp);

    return res.status(200).json({ success: true, message: 'OTP sent to your email.' });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/register ──────────────────────────────────────────────────────
export const register = async (req, res, next) => {
  try {
    const { username, password, email, otp } = req.body;

    if (!username || !password || !email || !otp) {
      return res.status(400).json({ success: false, error: 'Username, password, email, and OTP are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Username already exists.' });
    }

    // Verify OTP
    const otpRecord = await findOtp(email);
    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'No OTP found for this email. Please request a new one.' });
    }
    if (new Date() > new Date(otpRecord.expires_at)) {
      await deleteOtp(email);
      return res.status(400).json({ success: false, error: 'OTP has expired. Please request a new one.' });
    }
    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid OTP. Please check your email and try again.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await createUser(username, passwordHash, email);

    // Seed password history for this new user
    await addPasswordHistory(newUser.id, passwordHash);

    await deleteOtp(email);

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      data: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        created_at: newUser.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/forgot-password ───────────────────────────────────────────────
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    // Always respond with the same success message to prevent email enumeration
    const user = await findUserByEmail(email);
    if (user) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
      await saveOtp(email, otp, expiresAt);
      await sendPasswordResetOtpEmail(email, otp);
    }

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset code has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/reset-password ────────────────────────────────────────────────
export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ success: false, error: 'Email, OTP, and new password are required.' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    // Verify the user exists
    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'No account found with this email.' });
    }

    // Verify OTP
    const otpRecord = await findOtp(email);
    if (!otpRecord) {
      return res.status(400).json({ success: false, error: 'No reset code found. Please request a new one.' });
    }
    if (new Date() > new Date(otpRecord.expires_at)) {
      await deleteOtp(email);
      return res.status(400).json({ success: false, error: 'Reset code has expired. Please request a new one.' });
    }
    if (otpRecord.otp !== otp.trim()) {
      return res.status(400).json({ success: false, error: 'Invalid reset code. Please check your email and try again.' });
    }

    // Enforce password history — reject if password was used before
    const reused = await isPasswordReused(user.id, newPassword);
    if (reused) {
      return res.status(400).json({
        success: false,
        error: 'You cannot reuse a previous password. Please choose a different one.',
      });
    }

    // Hash and persist new password
    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);

    await import('../config/db.js').then(({ default: pool }) =>
      pool.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newHash, user.id]
      )
    );

    await addPasswordHistory(user.id, newHash);
    await deleteOtp(email);

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/login ─────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    if ((!username && !email) || !password) {
      return res.status(400).json({ success: false, error: 'Username (or email) and password are required' });
    }

    // Prefer username lookup; fall back to email lookup if only email is supplied
    let user = null;
    if (username) {
      user = await findUserByUsername(username);
    } else {
      user = await findUserByEmail(email);
    }

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_jwt_refresh_key';

    const accessToken = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    const refreshToken = jwt.sign({ id: user.id, username: user.username }, JWT_REFRESH_SECRET, { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    await saveRefreshToken(refreshToken, user.id, expiresAt);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: { id: user.id, username: user.username },
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' });
    }

    const savedToken = await findRefreshToken(refreshToken);
    if (!savedToken) {
      return res.status(403).json({ success: false, error: 'Invalid refresh token' });
    }

    if (new Date() > new Date(savedToken.expires_at)) {
      await deleteRefreshToken(refreshToken);
      return res.status(403).json({ success: false, error: 'Expired refresh token' });
    }

    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your_super_secret_jwt_refresh_key';
    const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';

    jwt.verify(refreshToken, JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        await deleteRefreshToken(refreshToken);
        return res.status(403).json({ success: false, error: 'Invalid refresh token' });
      }

      const newAccessToken = jwt.sign(
        { id: decoded.id, username: decoded.username },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );
      const newRefreshToken = jwt.sign(
        { id: decoded.id, username: decoded.username },
        JWT_REFRESH_SECRET,
        { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
      );

      await deleteRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
      await saveRefreshToken(newRefreshToken, decoded.id, expiresAt);

      return res.status(200).json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
      });
    });
  } catch (error) {
    next(error);
  }
};

// ─── POST /auth/logout ────────────────────────────────────────────────────────
export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' });
    }

    const deleted = await deleteRefreshToken(refreshToken);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Refresh token not found' });
    }

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};
