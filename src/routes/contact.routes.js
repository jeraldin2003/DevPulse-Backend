import express from 'express';
import { submitContactForm } from '../controllers/contact.controller.js';

const router = express.Router();

// Public — no auth required
router.post('/', submitContactForm);

export default router;
