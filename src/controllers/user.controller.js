import bcrypt from 'bcryptjs';
import { findUserByIdWithPassword, updateUserPassword } from '../models/user.model.js';
import { deleteAllUserRefreshTokens } from '../models/token.model.js';


export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long' });
    }

    const user = await findUserByIdWithPassword(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid current password' });
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    await updateUserPassword(userId, newPasswordHash);

    // Revoke all refresh tokens for this user on password change (security best practice)
    await deleteAllUserRefreshTokens(userId);

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. Please login again.'
    });
  } catch (error) {
    next(error);
  }
};
