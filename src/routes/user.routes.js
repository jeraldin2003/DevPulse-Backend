import express from 'express';
import { changePassword } from '../controllers/user.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authenticateToken)

router.post('/change-password', changePassword);

export default router;
