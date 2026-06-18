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
