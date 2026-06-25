import { sendContactConfirmationEmail } from '../helpers/mail.helper.js';

// ─── POST /api/contact ────────────────────────────────────────────────────────
export const submitContactForm = async (req, res, next) => {
  try {
    const { name, email, subject, message } = req.body;

    // Basic validation
    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required.' });
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    if (!message?.trim() || message.trim().length < 20) {
      return res.status(400).json({ success: false, error: 'Message must be at least 20 characters.' });
    }

    await sendContactConfirmationEmail({
      name: name.trim(),
      email: email.trim(),
      subject: subject?.trim() || '',
      message: message.trim(),
    });

    return res.status(200).json({
      success: true,
      message: 'Thank you for contacting us! We\'ll be in touch soon.',
    });
  } catch (error) {
    next(error);
  }
};
