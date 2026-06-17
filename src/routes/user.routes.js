import express from 'express';
import { getProfile, changePassword } from '../controllers/user.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/profile', authenticateToken, getProfile);
router.post('/change-password', authenticateToken, changePassword);

export default router;
