import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../middleware/auth.middleware.js';

jest.mock('jsonwebtoken');

describe('authenticateToken middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
  });

  test('returns 401 when Authorization header is absent', () => {
    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Access token missing',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when Bearer token is an empty string', () => {
    req.headers['authorization'] = 'Bearer ';

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when token is invalid or expired', () => {
    req.headers['authorization'] = 'Bearer bad.token.here';
    jwt.verify.mockImplementation((_token, _secret, cb) => {
      cb(new Error('JsonWebTokenError'), null);
    });

    authenticateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired access token',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() and attaches decoded payload to req.user when token is valid', () => {
    req.headers['authorization'] = 'Bearer valid.token.here';
    const decoded = { id: 42, username: 'alice' };
    jwt.verify.mockImplementation((_token, _secret, cb) => {
      cb(null, decoded);
    });

    authenticateToken(req, res, next);

    expect(req.user).toEqual(decoded);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
