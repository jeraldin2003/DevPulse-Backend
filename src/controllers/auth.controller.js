import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createUser, findUserByUsername, findUserByEmail } from '../models/user.model.js';
import { saveRefreshToken, findRefreshToken, deleteRefreshToken } from '../models/token.model.js';
import { saveOtp, findOtp, deleteOtp } from '../models/otp.model.js';
import { sendOtpEmail } from '../helpers/mail.helper.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;
const OTP_EXPIRY_MINUTES = 10;

// ─── Helper: generate 6-digit numeric OTP ─────────────────────────────────────
const generateOtp = () => String(crypto.randomInt(100000, 999999));

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────
export const sendOtp = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    // Ensure email is not already registered
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

    // Check username availability
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

    // Hash password & create user
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const newUser = await createUser(username, passwordHash, email);

    // Clean up OTP after successful registration
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

// ─── POST /auth/login ─────────────────────────────────────────────────────────
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
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
