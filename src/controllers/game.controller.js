import jwt from 'jsonwebtoken';
import { GameLog, UserStats } from '../models/game.model.js';
import pool from '../config/db.js';

// Save game log after game ends
export const saveGameLog = async (req, res, next) => {
  try {
    const { score, user } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({ success: false, error: 'Score is required' });
    }

    // Identify username and userId
    let currentUsername = null;
    let userId = null;

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUsername = decoded.username;
        userId = decoded.id?.toString();
      } catch (e) {
        // Ignore
      }
    }

    if (!currentUsername) {
      currentUsername = user?.username || req.query.username;
    }
    
    // If we still don't have a userId, let's fetch it from postgres using the username!
    if (currentUsername) {
      try {
        const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [currentUsername]);
        if (userResult.rows.length > 0) {
          userId = userResult.rows[0].id.toString();
        }
      } catch (dbErr) {
        console.error("Error looking up user ID:", dbErr);
      }
    }

    if (!currentUsername) {
      return res.status(401).json({ success: false, error: 'Unauthorized: User identification missing' });
    }

    // Default userId if still not found
    if (!userId) {
      userId = currentUsername;
    }

    // 1. Create the game log in Mongo
    const newLog = new GameLog({
      userId,
      score,
    });
    await newLog.save();

    // 2. Update user stats in Mongo
    const stats = await UserStats.findOneAndUpdate(
      { userId },
      {
        $inc: {
          totalScore: score,
          totalGamesPlayed: 1,
        },
      },
      { new: true, upsert: true }
    );

    // 3. Update PostgreSQL quiz_stats table
    await pool.query(
      `INSERT INTO quiz_stats (username, total_score, total_games_played)
       VALUES ($1, $2, 1)
       ON CONFLICT (username)
       DO UPDATE SET
         total_score = quiz_stats.total_score + EXCLUDED.total_score,
         total_games_played = quiz_stats.total_games_played + 1`,
      [currentUsername, score]
    );

    res.status(201).json({
      success: true,
      data: {
        gameLog: newLog,
        userStats: stats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get only the games played by the user (sorted by date desc)
export const getUserGames = async (req, res, next) => {
  try {
    let userId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id?.toString();
      } catch (e) {}
    }
    if (!userId && req.query.username) {
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [req.query.username]);
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id.toString();
      }
    }
    if (!userId) {
      return res.status(200).json({ success: true, data: [] });
    }

    const games = await GameLog.find({ userId }).sort({ date: -1 });

    res.status(200).json({
      success: true,
      data: games,
    });
  } catch (error) {
    next(error);
  }
};

// Get user stats
export const getUserStats = async (req, res, next) => {
  try {
    let userId = null;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id?.toString();
      } catch (e) {}
    }
    if (!userId && req.query.username) {
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [req.query.username]);
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id.toString();
      }
    }
    if (!userId) {
      return res.status(200).json({ success: true, data: { totalScore: 0, totalGamesPlayed: 0 } });
    }

    let stats = await UserStats.findOne({ userId });

    if (!stats) {
      stats = { totalScore: 0, totalGamesPlayed: 0 };
    }

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
};

// Get Leaderboard
export const getLeaderboard = async (req, res, next) => {
  try {
    let currentUsername = null;

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_access_key';
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUsername = decoded.username;
      } catch (e) {
        // Ignore
      }
    }

    if (!currentUsername) {
      currentUsername = req.query.username || req.body?.user?.username;
    }

    // Fetch top 10 users ordered by total_score desc, total_games_played asc
    const top10Result = await pool.query(
      `SELECT username, total_score, total_games_played
       FROM quiz_stats
       ORDER BY total_score DESC, total_games_played ASC
       LIMIT 10`
    );

    const top10 = top10Result.rows.map((row, index) => ({
      username: row.username,
      totalScore: row.total_score,
      totalGamesPlayed: row.total_games_played,
      rank: index + 1
    }));

    // Find current user's rank
    let currentUser = null;
    if (currentUsername) {
      const rankResult = await pool.query(
        `WITH ranked_users AS (
           SELECT username, total_score, total_games_played,
                  ROW_NUMBER() OVER (ORDER BY total_score DESC, total_games_played ASC) as rank
           FROM quiz_stats
         )
         SELECT rank, total_score, total_games_played
         FROM ranked_users
         WHERE username = $1`,
        [currentUsername]
      );

      if (rankResult.rows.length > 0) {
        currentUser = {
          username: currentUsername,
          totalScore: rankResult.rows[0].total_score,
          totalGamesPlayed: rankResult.rows[0].total_games_played,
          rank: parseInt(rankResult.rows[0].rank, 10)
        };
      } else {
        currentUser = {
          username: currentUsername,
          totalScore: 0,
          totalGamesPlayed: 0,
          rank: null
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        top10,
        currentUser
      }
    });
  } catch (error) {
    next(error);
  }
};
