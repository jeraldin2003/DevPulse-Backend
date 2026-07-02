import request from 'supertest';
import app from '../../app.js';

// Mock DB, models, and mail helpers
jest.mock('../../config/db.js', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

jest.mock('../../helpers/mail.helper.js', () => ({
  __esModule: true,
  sendContactConfirmationEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../models/feedback.model.js', () => ({
  __esModule: true,
  saveFeedback: jest.fn().mockResolvedValue({ id: 1, name: 'Alice', email: 'alice@example.com', subject: 'Inquiry', message: 'Hello, this is a feedback message of 20+ chars.' }),
}));

import { saveFeedback } from '../../models/feedback.model.js';
import { sendContactConfirmationEmail } from '../../helpers/mail.helper.js';

describe('POST /api/contact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('400 — missing name', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        email: 'test@example.com',
        subject: 'Test',
        message: 'This is a valid long message for feedback.',
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/name is required/i);
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(sendContactConfirmationEmail).not.toHaveBeenCalled();
  });

  test('400 — invalid email', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Test User',
        email: 'invalid-email',
        subject: 'Test',
        message: 'This is a valid long message for feedback.',
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/valid email/i);
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(sendContactConfirmationEmail).not.toHaveBeenCalled();
  });

  test('400 — message too short', async () => {
    const res = await request(app)
      .post('/api/contact')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        subject: 'Test',
        message: 'Too short',
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/at least 20 characters/i);
    expect(saveFeedback).not.toHaveBeenCalled();
    expect(sendContactConfirmationEmail).not.toHaveBeenCalled();
  });

  test('200 — saves feedback to db and sends email confirmation', async () => {
    const data = {
      name: 'Alice ',
      email: 'alice@example.com',
      subject: ' Inquiry ',
      message: 'Hello, this is a feedback message of 20+ chars.  ',
    };

    const res = await request(app)
      .post('/api/contact')
      .send(data);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/thank you/i);

    expect(saveFeedback).toHaveBeenCalledTimes(1);
    expect(saveFeedback).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
      subject: 'Inquiry',
      message: 'Hello, this is a feedback message of 20+ chars.',
    });

    expect(sendContactConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(sendContactConfirmationEmail).toHaveBeenCalledWith({
      name: 'Alice',
      email: 'alice@example.com',
      subject: 'Inquiry',
      message: 'Hello, this is a feedback message of 20+ chars.',
    });
  });
});
