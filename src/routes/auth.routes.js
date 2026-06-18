import express from 'express';
import { register, login, refresh, logout, sendOtp } from '../controllers/auth.controller.js';

const router = express.Router();

router.post('/send-otp', sendOtp);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

export default router;
