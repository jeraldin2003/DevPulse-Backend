/**
 * Integration tests for /api/auth/* routes.
 *
 * All external dependencies (DB, Mongo, mail, crypto) are mocked so the
 * suite can run without any running infrastructure.
 */

import request from 'supertest';
import app from '../../app.js';

// ─── Module mocks (hoisted by babel-jest before any import) ───────────────────

// Prevent pg Pool from connecting / running initTable()
jest.mock('../../config/db.js', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

// Prevent mongoose model registration from requiring a live connection
jest.mock('../../models/game.model.js', () => ({
  __esModule: true,
  GameLog: jest.fn().mockImplementation(() => ({
    save: jest.fn().mockResolvedValue({}),
  })),
  UserStats: {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../models/user.model.js', () => ({
  __esModule: true,
  createUser: jest.fn(),
  findUserByUsername: jest.fn(),
  findUserByEmail: jest.fn(),
  findUserById: jest.fn(),
  findUserByIdWithPassword: jest.fn(),
  updateUserPassword: jest.fn(),
}));

jest.mock('../../models/token.model.js', () => ({
  __esModule: true,
  saveRefreshToken: jest.fn().mockResolvedValue({}),
  findRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  deleteAllUserRefreshTokens: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../models/otp.model.js', () => ({
  __esModule: true,
  saveOtp: jest.fn().mockResolvedValue(undefined),
  findOtp: jest.fn(),
  deleteOtp: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../models/password.model.js', () => ({
  __esModule: true,
  addPasswordHistory: jest.fn().mockResolvedValue(undefined),
  getPasswordHistory: jest.fn().mockResolvedValue([]),
}));

jest.mock('../../helpers/mail.helper.js', () => ({
  __esModule: true,
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetOtpEmail: jest.fn().mockResolvedValue(undefined),
}));

// Speed up tests — bcrypt salt rounds are expensive in real usage
jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('mock_salt'),
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
  verify: jest.fn(),
}));

// ─── Import mock references AFTER jest.mock() calls ──────────────────────────

import { findUserByEmail, findUserByUsername, createUser } from '../../models/user.model.js';
import {
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
} from '../../models/token.model.js';
import { saveOtp, findOtp, deleteOtp } from '../../models/otp.model.js';
import { addPasswordHistory, getPasswordHistory } from '../../models/password.model.js';
import { sendOtpEmail, sendPasswordResetOtpEmail } from '../../helpers/mail.helper.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../config/db.js';

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/send-otp
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/send-otp', () => {
  test('400 — missing email', async () => {
    const res = await request(app).post('/api/auth/send-otp').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/valid email/i);
  });

  test('400 — malformed email address', async () => {
    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('409 — email already registered', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: 'taken@example.com' });

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'taken@example.com' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('200 — sends OTP for a valid new email', async () => {
    findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/send-otp')
      .send({ email: 'new@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(saveOtp).toHaveBeenCalledWith(
      'new@example.com',
      expect.stringMatching(/^\d{6}$/),
      expect.any(Date),
    );
    expect(sendOtpEmail).toHaveBeenCalledWith(
      'new@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/register', () => {
  const VALID_BODY = {
    username: 'testuser',
    password: 'password123',
    email: 'test@example.com',
    otp: '123456',
  };

  const FUTURE_OTP = {
    otp: '123456',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };

  test('400 — missing required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — password shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...VALID_BODY, password: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('409 — username already taken', async () => {
    findUserByUsername.mockResolvedValue({ id: 1, username: 'testuser' });

    const res = await request(app).post('/api/auth/register').send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/username already exists/i);
  });

  test('400 — no OTP found for the email', async () => {
    findUserByUsername.mockResolvedValue(null);
    findOtp.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/register').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no otp found/i);
  });

  test('400 — OTP has expired', async () => {
    findUserByUsername.mockResolvedValue(null);
    findOtp.mockResolvedValue({
      otp: '123456',
      expires_at: new Date(Date.now() - 1_000).toISOString(), // past
    });

    const res = await request(app).post('/api/auth/register').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
    expect(deleteOtp).toHaveBeenCalledWith(VALID_BODY.email);
  });

  test('400 — OTP code is wrong', async () => {
    findUserByUsername.mockResolvedValue(null);
    // Do NOT spread FUTURE_OTP here — the spread would overwrite otp back to '123456'
    findOtp.mockResolvedValue({
      otp: '999999',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const res = await request(app).post('/api/auth/register').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid otp/i);
  });

  test('201 — creates user and returns data on valid registration', async () => {
    findUserByUsername.mockResolvedValue(null);
    findOtp.mockResolvedValue(FUTURE_OTP);
    createUser.mockResolvedValue({
      id: 1,
      username: 'testuser',
      email: 'test@example.com',
      created_at: new Date().toISOString(),
    });

    const res = await request(app).post('/api/auth/register').send(VALID_BODY);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('testuser');
    expect(res.body.data.email).toBe('test@example.com');
    expect(addPasswordHistory).toHaveBeenCalledWith(1, 'hashed_password');
    expect(deleteOtp).toHaveBeenCalledWith('test@example.com');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/login', () => {
  const MOCK_USER = { id: 1, username: 'alice', password_hash: 'hash' };

  test('400 — no credentials at all', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('400 — password missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice' });
    expect(res.status).toBe(400);
  });

  test('401 — username not found', async () => {
    findUserByUsername.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'ghost', password: 'pass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('401 — email not found (email-based login)', async () => {
    findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'pass' });

    expect(res.status).toBe(401);
  });

  test('401 — password does not match', async () => {
    findUserByUsername.mockResolvedValue(MOCK_USER);
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'wrong' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  test('200 — returns access and refresh tokens on success (username login)', async () => {
    findUserByUsername.mockResolvedValue(MOCK_USER);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign
      .mockReturnValueOnce('access_token_abc')
      .mockReturnValueOnce('refresh_token_xyz');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'alice', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('access_token_abc');
    expect(res.body.data.refreshToken).toBe('refresh_token_xyz');
    expect(res.body.data.user).toEqual({ id: 1, username: 'alice' });
    expect(saveRefreshToken).toHaveBeenCalled();
  });

  test('200 — succeeds with email instead of username', async () => {
    findUserByEmail.mockResolvedValue(MOCK_USER);
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alice@example.com', password: 'correct' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/logout
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/logout', () => {
  test('400 — refreshToken missing from body', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('404 — refreshToken not found in the store', async () => {
    deleteRefreshToken.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'nonexistent_token' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('200 — logs out successfully and removes the token', async () => {
    deleteRefreshToken.mockResolvedValue({ token: 'rt', user_id: 1 });

    const res = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'rt' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(deleteRefreshToken).toHaveBeenCalledWith('rt');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/refresh
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/refresh', () => {
  test('400 — refreshToken missing', async () => {
    const res = await request(app).post('/api/auth/refresh').send({});
    expect(res.status).toBe(400);
  });

  test('403 — refreshToken not found in the store', async () => {
    findRefreshToken.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'unknown' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/invalid refresh token/i);
  });

  test('403 — refreshToken is expired', async () => {
    findRefreshToken.mockResolvedValue({
      token: 'expired_rt',
      user_id: 1,
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'expired_rt' });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/expired/i);
    expect(deleteRefreshToken).toHaveBeenCalledWith('expired_rt');
  });

  test('403 — jwt.verify rejects the token', async () => {
    findRefreshToken.mockResolvedValue({
      token: 'bad_sig',
      user_id: 1,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    jwt.verify.mockImplementation((_t, _s, cb) => {
      cb(new Error('invalid signature'), null);
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad_sig' });

    expect(res.status).toBe(403);
  });

  test('200 — issues new token pair on success', async () => {
    findRefreshToken.mockResolvedValue({
      token: 'good_rt',
      user_id: 1,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    jwt.verify.mockImplementation((_t, _s, cb) => {
      cb(null, { id: 1, username: 'alice' });
    });
    jwt.sign
      .mockReturnValueOnce('new_access_token')
      .mockReturnValueOnce('new_refresh_token');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'good_rt' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('new_access_token');
    expect(res.body.data.refreshToken).toBe('new_refresh_token');
    expect(deleteRefreshToken).toHaveBeenCalledWith('good_rt');
    expect(saveRefreshToken).toHaveBeenCalledWith(
      'new_refresh_token',
      1,
      expect.any(Date),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/forgot-password
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/forgot-password', () => {
  test('400 — missing email', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({});
    expect(res.status).toBe(400);
  });

  test('400 — invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'not-valid' });
    expect(res.status).toBe(400);
  });

  test('200 — still succeeds when email does NOT exist (prevents enumeration)', async () => {
    findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendPasswordResetOtpEmail).not.toHaveBeenCalled();
  });

  test('200 — sends reset OTP when email is registered', async () => {
    findUserByEmail.mockResolvedValue({ id: 2, email: 'user@example.com' });

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(sendPasswordResetOtpEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/reset-password
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/auth/reset-password', () => {
  const VALID_BODY = {
    email: 'user@example.com',
    otp: '654321',
    newPassword: 'newSecurePass',
  };

  const VALID_OTP = {
    otp: '654321',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  };

  test('400 — missing fields (no otp or newPassword)', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: 'user@example.com' });
    expect(res.status).toBe(400);
  });

  test('400 — new password shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ ...VALID_BODY, newPassword: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('404 — no account found with that email', async () => {
    findUserByEmail.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(404);
  });

  test('400 — no reset code found for the email', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: VALID_BODY.email });
    findOtp.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no reset code/i);
  });

  test('400 — reset code has expired', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: VALID_BODY.email });
    findOtp.mockResolvedValue({
      otp: '654321',
      expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/i);
  });

  test('400 — reset code is incorrect', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: VALID_BODY.email });
    // Do NOT spread VALID_OTP here — the spread would overwrite otp back to '654321'
    findOtp.mockResolvedValue({
      otp: '000000',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid reset code/i);
  });

  test('400 — new password was previously used', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: VALID_BODY.email });
    findOtp.mockResolvedValue(VALID_OTP);
    getPasswordHistory.mockResolvedValue(['old_hash_1', 'old_hash_2']);
    // bcrypt.compare returns true → password reuse detected
    bcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cannot reuse/i);
  });

  test('200 — resets password successfully', async () => {
    findUserByEmail.mockResolvedValue({ id: 1, email: VALID_BODY.email });
    findOtp.mockResolvedValue(VALID_OTP);
    getPasswordHistory.mockResolvedValue(['old_hash']);
    bcrypt.compare.mockResolvedValue(false); // no password reuse
    pool.query.mockResolvedValue({ rows: [] });   // UPDATE users SET ...

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(addPasswordHistory).toHaveBeenCalledWith(1, 'hashed_password');
    expect(deleteOtp).toHaveBeenCalledWith(VALID_BODY.email);
  });
});
