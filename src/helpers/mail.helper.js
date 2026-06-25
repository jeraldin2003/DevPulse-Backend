import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // Use STARTTLS (port 587)
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: `"DevPulse" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Your DevPulse Verification Code',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #2563eb; border-radius: 10px; padding: 12px 20px;">
            <span style="color: white; font-size: 20px; font-weight: 700;">DevPulse</span>
          </div>
        </div>
        <h2 style="color: #1e293b; text-align: center; margin-bottom: 8px;">Verify your email</h2>
        <p style="color: #64748b; text-align: center; margin-bottom: 28px;">Use the code below to complete your registration. It expires in <strong>10 minutes</strong>.</p>
        <div style="background: white; border: 2px solid #e2e8f0; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: 800; letter-spacing: 10px; color: #2563eb;">${otp}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
};

export const sendPasswordResetOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: `"DevPulse" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'DevPulse — Password Reset Code',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 480px; margin: auto; padding: 32px; background: #fffbf0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #d97706; border-radius: 10px; padding: 12px 20px;">
            <span style="color: white; font-size: 20px; font-weight: 700;">DevPulse</span>
          </div>
        </div>
        <h2 style="color: #1e293b; text-align: center; margin-bottom: 8px;">Password Reset Request</h2>
        <p style="color: #64748b; text-align: center; margin-bottom: 28px;">Use the code below to reset your password. It expires in <strong>10 minutes</strong>.</p>
        <div style="background: white; border: 2px solid #fde68a; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: 800; letter-spacing: 10px; color: #d97706;">${otp}</span>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">If you did not request a password reset, please ignore this email. Your account is safe.</p>
      </div>
    `,
  });
};

// ─── Contact form confirmation ─────────────────────────────────────────────────
/**
 * Sends a "Thank you for contacting us" confirmation to the user.
 * Also forwards the enquiry to the support inbox (SMTP_USER) so the team sees it.
 *
 * @param {{ name: string, email: string, subject: string, message: string }} data
 */
export const sendContactConfirmationEmail = async ({ name, email, subject, message }) => {
  // 1. Confirmation to the submitter
  await transporter.sendMail({
    from: `"DevPulse Support" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'Thank you for contacting us — DevPulse',
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: #2563eb; border-radius: 10px; padding: 12px 20px;">
            <span style="color: white; font-size: 20px; font-weight: 700;">DevPulse</span>
          </div>
        </div>
        <h2 style="color: #1e293b; text-align: center; margin-bottom: 8px;">Thank you for contacting us!</h2>
        <p style="color: #64748b; text-align: center; margin-bottom: 28px;">
          Hi <strong>${name}</strong>, we've received your message and will get back to you as soon as possible.
        </p>
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 6px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Your message</p>
          <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${message}</p>
        </div>
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          If you didn't submit this form, please ignore this email.
        </p>
      </div>
    `,
  });

  // 2. Internal notification to the support team
  await transporter.sendMail({
    from: `"DevPulse Contact Form" <${process.env.SMTP_USER}>`,
    to: process.env.SMTP_USER,
    replyTo: email,
    subject: `[Contact Form] ${subject || 'New enquiry'} — from ${name}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 520px; margin: auto; padding: 32px; background: #fffbeb; border-radius: 12px;">
        <h2 style="color: #1e293b; margin-bottom: 4px;">New contact form submission</h2>
        <p style="color: #64748b; margin-top: 0; margin-bottom: 24px; font-size: 13px;">Sent via DevPulse Contact Us page.</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #94a3b8; font-weight: 700; width: 80px;">Name</td><td style="color: #1e293b;">${name}</td></tr>
          <tr><td style="padding: 8px 0; color: #94a3b8; font-weight: 700;">Email</td><td><a href="mailto:${email}" style="color: #2563eb;">${email}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #94a3b8; font-weight: 700;">Subject</td><td style="color: #1e293b;">${subject || '—'}</td></tr>
        </table>
        <div style="background: white; border: 1px solid #fde68a; border-radius: 10px; padding: 20px; margin-top: 20px;">
          <p style="margin: 0; color: #334155; font-size: 14px; line-height: 1.7; white-space: pre-wrap;">${message}</p>
        </div>
      </div>
    `,
  });
};
