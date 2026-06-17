import express from 'express';
import { saveGameLog, getUserGames, getUserStats, getLeaderboard } from '../controllers/game.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = express.Router();

// Apply auth middleware to all game routes
router.use(authenticateToken);

// GET /api/games/leaderboard - Get leaderboard for top 10 users
router.get('/leaderboard', getLeaderboard);

// POST /api/games - Save a new game log (called once game ends)
router.post('/', saveGameLog);

// GET /api/games - Get all games played by the current user
router.get('/', getUserGames);

// GET /api/games/stats - Get total score and total games played for the current user
router.get('/stats', getUserStats);

export default router;
