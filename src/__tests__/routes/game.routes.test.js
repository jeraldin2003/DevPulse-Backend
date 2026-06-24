/**
 * Integration tests for /api/games/* routes.
 *
 * The game controller touches both PostgreSQL (pool) and MongoDB (GameLog /
 * UserStats).  Both are fully mocked so no live DB is needed.
 *
 * Key design note
 * ───────────────
 * The game controller calls jwt.verify *synchronously* (no callback), so mocks
 * must use mockImplementation(() => payload) rather than mockReturnValue().
 * A beforeEach sets jwt.verify to throw by default (no-auth state) and
 * withValidToken() overrides it per-test to return a payload.
 */

import request from 'supertest';
import app from '../../app.js';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('../../config/db.js', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

// GameLog / UserStats are constructed INSIDE the factory so babel-jest's
// hoisting step does not raise a temporal-dead-zone error on the name.
jest.mock('../../models/game.model.js', () => {
  const mockSave = jest.fn().mockResolvedValue({});

  const mockGameLogCtor = jest.fn().mockImplementation(() => ({
    _id: 'gameid123',
    userId: 'user1',
    score: 100,
    date: new Date().toISOString(),
    save: mockSave,
  }));

  mockGameLogCtor.find = jest.fn().mockReturnValue({
    sort: jest.fn().mockResolvedValue([
      { _id: 'gameid123', userId: 'user1', score: 100, date: new Date().toISOString() },
    ]),
  });

  return {
    __esModule: true,
    GameLog: mockGameLogCtor,
    UserStats: {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        userId: 'user1',
        totalScore: 200,
        totalGamesPlayed: 2,
      }),
      findOne: jest.fn().mockResolvedValue({
        userId: 'user1',
        totalScore: 200,
        totalGamesPlayed: 2,
      }),
    },
  };
});

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

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
}));

// ─── Import mock references ───────────────────────────────────────────────────

import { GameLog, UserStats } from '../../models/game.model.js';
import jwt from 'jsonwebtoken';
import pool from '../../config/db.js';

// ─── Per-test setup ───────────────────────────────────────────────────────────

beforeEach(() => {
  // Default: no valid JWT — jwt.verify throws so the controller's try/catch
  // leaves userId/currentUsername as null, falling back to query params.
  jwt.verify.mockImplementation(() => {
    throw new Error('no valid token');
  });
  // Default pool response for any unspecified query
  pool.query.mockResolvedValue({ rows: [] });
});

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Wire jwt.verify to return `payload` synchronously (the game controller
 * calls it as a 2-argument synchronous function, NOT callback-style).
 * Returns an Authorization header object for convenience.
 */
const withValidToken = (payload = { id: 1, username: 'testuser' }) => {
  jwt.verify.mockImplementation(() => payload);
  return { Authorization: 'Bearer mock_token' };
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/games/leaderboard
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/games/leaderboard', () => {
  test('200 — returns top-10 list; currentUser is null when unauthenticated', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { username: 'alice', total_score: 500, total_games_played: 5 },
        { username: 'bob',   total_score: 400, total_games_played: 4 },
      ],
    });

    const res = await request(app).get('/api/games/leaderboard');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.top10).toHaveLength(2);
    expect(res.body.data.top10[0]).toMatchObject({
      username: 'alice',
      totalScore: 500,
      rank: 1,
    });
    expect(res.body.data.currentUser).toBeNull();
  });

  test('200 — includes currentUser rank when authenticated via JWT', async () => {
    const headers = withValidToken({ id: 1, username: 'alice' });

    pool.query
      .mockResolvedValueOnce({
        rows: [{ username: 'alice', total_score: 500, total_games_played: 5 }],
      })
      .mockResolvedValueOnce({
        rows: [{ rank: '1', total_score: 500, total_games_played: 5 }],
      });

    const res = await request(app)
      .get('/api/games/leaderboard')
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.currentUser).toMatchObject({
      username: 'alice',
      totalScore: 500,
      rank: 1,
    });
  });

  test('200 — currentUser has null rank when they have no stats yet', async () => {
    const headers = withValidToken({ id: 2, username: 'newbie' });

    pool.query
      .mockResolvedValueOnce({ rows: [] }) // top-10 empty
      .mockResolvedValueOnce({ rows: [] }); // rank not found

    const res = await request(app)
      .get('/api/games/leaderboard')
      .set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data.currentUser).toMatchObject({
      username: 'newbie',
      totalScore: 0,
      rank: null,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/games  — saveGameLog
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/games', () => {
  test('400 — score is missing from body', async () => {
    const res = await request(app).post('/api/games').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/score is required/i);
  });

  test('401 — no user identity (no token, no username)', async () => {
    const res = await request(app).post('/api/games').send({ score: 50 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthorized/i);
  });

  test('201 — saves game log and updates stats when authenticated via JWT', async () => {
    const headers = withValidToken({ id: 1, username: 'testuser' });

    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // SELECT id FROM users
      .mockResolvedValueOnce({ rows: [] });           // quiz_stats UPSERT

    const res = await request(app)
      .post('/api/games')
      .set(headers)
      .send({ score: 100 });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(GameLog).toHaveBeenCalledWith(
      expect.objectContaining({ score: 100 }),
    );
    expect(UserStats.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: '1' },
      expect.objectContaining({ $inc: { totalScore: 100, totalGamesPlayed: 1 } }),
      expect.objectContaining({ upsert: true }),
    );
  });

  test('201 — saves game log when identity comes from body.user.username', async () => {
    // jwt.verify already throws (set in beforeEach) → falls back to body.user.username
    pool.query
      .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // user lookup by username
      .mockResolvedValueOnce({ rows: [] });            // quiz_stats UPSERT

    const res = await request(app)
      .post('/api/games')
      .send({ score: 75, user: { username: 'guestuser' } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/games  — getUserGames
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/games', () => {
  test('200 — returns empty array when no identity is provided', async () => {
    const res = await request(app).get('/api/games');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });

  test('200 — returns games array for authenticated user', async () => {
    const headers = withValidToken({ id: 1, username: 'testuser' });

    const res = await request(app).get('/api/games').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(GameLog.find).toHaveBeenCalledWith({ userId: '1' });
  });

  test('200 — fetches games when username is provided as a query param', async () => {
    // jwt.verify throws (default from beforeEach) — no JWT auth path
    pool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

    const res = await request(app).get('/api/games?username=testuser');

    expect(res.status).toBe(200);
    expect(GameLog.find).toHaveBeenCalledWith({ userId: '5' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/games/stats  — getUserStats
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/games/stats', () => {
  test('200 — returns zeros when no identity is provided', async () => {
    const res = await request(app).get('/api/games/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ totalScore: 0, totalGamesPlayed: 0 });
  });

  test('200 — returns Mongo stats for authenticated user', async () => {
    const headers = withValidToken({ id: 1, username: 'testuser' });

    const res = await request(app).get('/api/games/stats').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ totalScore: 200, totalGamesPlayed: 2 });
    expect(UserStats.findOne).toHaveBeenCalledWith({ userId: '1' });
  });

  test('200 — returns zeros when user has no stats document in Mongo', async () => {
    const headers = withValidToken({ id: 99, username: 'newplayer' });
    UserStats.findOne.mockResolvedValueOnce(null);

    const res = await request(app).get('/api/games/stats').set(headers);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ totalScore: 0, totalGamesPlayed: 0 });
  });
});
