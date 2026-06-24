/**
 * Integration tests for /api/users/* routes.
 *
 * Both endpoints require a valid JWT (via authenticateToken middleware).
 * jwt.verify is mocked to control auth success/failure per test.
 */

import request from 'supertest';
import app from '../../app.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../config/db.js', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

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

jest.mock('bcryptjs', () => ({
  genSalt: jest.fn().mockResolvedValue('mock_salt'),
  hash: jest.fn().mockResolvedValue('new_hashed_password'),
  compare: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_jwt_token'),
  verify: jest.fn(),
}));

// ─── Import mock references ───────────────────────────────────────────────────

import { findUserByIdWithPassword, updateUserPassword } from '../../models/user.model.js';
import { deleteAllUserRefreshTokens } from '../../models/token.model.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Make jwt.verify succeed, injecting the given payload into req.user */
const mockAuthSuccess = (payload = { id: 1, username: 'testuser' }) => {
  jwt.verify.mockImplementation((_token, _secret, cb) => {
    cb(null, payload);
  });
};

/** Make jwt.verify fail (simulates an invalid / expired token) */
const mockAuthFail = () => {
  jwt.verify.mockImplementation((_token, _secret, cb) => {
    cb(new Error('invalid token'), null);
  });
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/users/profile
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/users/profile', () => {
  test('401 — no Authorization header', async () => {
    const res = await request(app).get('/api/users/profile');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/access token missing/i);
  });

  test('403 — invalid or expired token', async () => {
    mockAuthFail();

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer badtoken');

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('200 — returns user profile when authenticated', async () => {
    mockAuthSuccess({ id: 7, username: 'bob' });

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', 'Bearer validtoken');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toEqual({ id: 7, username: 'bob' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/users/change-password
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/users/change-password', () => {
  const AUTH_HEADER = { Authorization: 'Bearer validtoken' };
  const MOCK_USER = {
    id: 1,
    username: 'testuser',
    password_hash: 'current_hash',
  };

  beforeEach(() => {
    mockAuthSuccess({ id: 1, username: 'testuser' });
  });

  test('401 — request without Authorization header', async () => {
    // Override: no auth for this single test
    jest.clearAllMocks();

    const res = await request(app)
      .post('/api/users/change-password')
      .send({ currentPassword: 'old', newPassword: 'new123' });

    expect(res.status).toBe(401);
  });

  test('400 — missing currentPassword or newPassword', async () => {
    mockAuthSuccess();

    const res = await request(app)
      .post('/api/users/change-password')
      .set(AUTH_HEADER)
      .send({ currentPassword: 'oldpass' }); // newPassword missing

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('400 — new password shorter than 6 characters', async () => {
    mockAuthSuccess();

    const res = await request(app)
      .post('/api/users/change-password')
      .set(AUTH_HEADER)
      .send({ currentPassword: 'oldpass', newPassword: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 characters/i);
  });

  test('404 — user not found in the database', async () => {
    mockAuthSuccess();
    findUserByIdWithPassword.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/users/change-password')
      .set(AUTH_HEADER)
      .send({ currentPassword: 'oldpass', newPassword: 'newpass123' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/user not found/i);
  });

  test('401 — current password does not match', async () => {
    mockAuthSuccess();
    findUserByIdWithPassword.mockResolvedValue(MOCK_USER);
    bcrypt.compare.mockResolvedValue(false);

    const res = await request(app)
      .post('/api/users/change-password')
      .set(AUTH_HEADER)
      .send({ currentPassword: 'wrongpass', newPassword: 'newpass123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid current password/i);
  });

  test('200 — password changed and all refresh tokens revoked', async () => {
    mockAuthSuccess();
    findUserByIdWithPassword.mockResolvedValue(MOCK_USER);
    bcrypt.compare.mockResolvedValue(true);
    updateUserPassword.mockResolvedValue({ id: 1, username: 'testuser' });

    const res = await request(app)
      .post('/api/users/change-password')
      .set(AUTH_HEADER)
      .send({ currentPassword: 'correctpass', newPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(updateUserPassword).toHaveBeenCalledWith(1, 'new_hashed_password');
    expect(deleteAllUserRefreshTokens).toHaveBeenCalledWith(1);
  });
});
