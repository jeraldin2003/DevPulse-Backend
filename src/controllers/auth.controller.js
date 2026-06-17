import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createUser, findUserByUsername } from '../models/user.model.js';
import { saveRefreshToken, findRefreshToken, deleteRefreshToken } from '../models/token.model.js';

const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = 7; // 7 days

export const register = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long' });
    }

    const existingUser = await findUserByUsername(username);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await createUser(username, passwordHash);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUser.id,
        username: newUser.username,
        created_at: newUser.created_at
      }
    });
  } catch (error) {
    next(error);
  }
};

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

    // Save refresh token to db
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await saveRefreshToken(refreshToken, user.id, expiresAt);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

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

      // Generate new access token
      const newAccessToken = jwt.sign(
        { id: decoded.id, username: decoded.username },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
      );

      // Generate rotated refresh token
      const newRefreshToken = jwt.sign(
        { id: decoded.id, username: decoded.username },
        JWT_REFRESH_SECRET,
        { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
      );

      // Delete old refresh token, save new one
      await deleteRefreshToken(refreshToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
      await saveRefreshToken(newRefreshToken, decoded.id, expiresAt);

      res.status(200).json({
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      });
    });
  } catch (error) {
    next(error);
  }
};

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

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};
