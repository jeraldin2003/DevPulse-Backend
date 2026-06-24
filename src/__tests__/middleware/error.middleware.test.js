import { errorHandler } from '../../middleware/error.middleware.js';

describe('errorHandler middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('uses the error statusCode and message when both are provided', () => {
    const err = { statusCode: 422, message: 'Unprocessable Entity', stack: '' };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unprocessable Entity',
    });
  });

  test('defaults to status 500 when statusCode is absent', () => {
    const err = { message: 'Something blew up', stack: '' };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Something blew up',
    });
  });

  test('defaults to "Internal Server Error" when message is absent', () => {
    const err = { stack: '' };

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal Server Error',
    });
  });

  test('logs the error stack', () => {
    const err = { stack: 'Error: boom\n  at ...' };

    errorHandler(err, req, res, next);

    expect(console.error).toHaveBeenCalledWith(err.stack);
  });
});
