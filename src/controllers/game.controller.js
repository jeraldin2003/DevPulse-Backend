import { GameLog, UserStats } from '../models/game.model.js';
import pool from '../config/db.js';

// Save game log after game ends
export const saveGameLog = async (req, res, next) => {
  try {
    const userId = req.user.id.toString();
    const { score } = req.body;

    if (score === undefined || score === null) {
      return res.status(400).json({ success: false, error: 'Score is required' });
    }

    // 1. Create the game log
    const newLog = new GameLog({
      userId,
      score,
      // date is automatically set to Date.now
    });
    await newLog.save();

    // 2. Update user stats
    const stats = await UserStats.findOneAndUpdate(
      { userId },
      {
        $inc: {
          totalScore: score,
          totalGamesPlayed: 1,
        },
      },
      { new: true, upsert: true } // Create if doesn't exist
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
    const userId = req.user.id.toString();

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
    const userId = req.user.id.toString();

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
    const currentUserId = req.user.id.toString();

    // Fetch all user stats
    const allStats = await UserStats.find({}).lean();

    let statsWithCalculations = allStats.map(s => {
      let winrate = 0;
      if (s.totalGamesPlayed > 0) {
        winrate = (s.totalScore / s.totalGamesPlayed) * 100;
      }
      return { ...s, winrate };
    });

    // 1. Sort by totalScore
    const sortedByScore = [...statsWithCalculations].sort((a, b) => b.totalScore - a.totalScore);
    const topScoreStats = sortedByScore.slice(0, 10);
    const currentUserScoreRank = sortedByScore.findIndex(s => s.userId === currentUserId) + 1;
    let currentUserScoreData = sortedByScore.find(s => s.userId === currentUserId) || { userId: currentUserId, totalScore: 0, totalGamesPlayed: 0, winrate: 0 };

    // 2. Sort by winrate (only those with >= 10 games)
    const eligibleForWinrate = statsWithCalculations.filter(s => s.totalGamesPlayed >= 10);
    const sortedByWinrate = eligibleForWinrate.sort((a, b) => b.winrate - a.winrate);
    const topWinrateStats = sortedByWinrate.slice(0, 10);
    let currentUserWinrateRank = eligibleForWinrate.findIndex(s => s.userId === currentUserId) + 1;
    if (currentUserWinrateRank === 0) currentUserWinrateRank = null; 

    // Collect all unique userIds to fetch usernames
    const userIds = new Set([
      ...topScoreStats.map(s => s.userId),
      ...topWinrateStats.map(s => s.userId),
      currentUserId
    ]);

    // Fetch usernames from postgres
    const idsArray = Array.from(userIds);
    let usernameMap = {};
    if (idsArray.length > 0) {
      const result = await pool.query(
        'SELECT id, username FROM users WHERE id = ANY($1)',
        [idsArray]
      );
      result.rows.forEach(r => {
        usernameMap[r.id.toString()] = r.username;
      });
    }

    // Format final response
    const formatStat = (s, rank) => ({
      userId: s.userId,
      username: usernameMap[s.userId] || 'Unknown',
      totalScore: s.totalScore,
      totalGamesPlayed: s.totalGamesPlayed,
      winrate: s.winrate,
      rank
    });

    const leaderboard = {
      totalScore: {
        top: topScoreStats.map((s, i) => formatStat(s, i + 1)),
        currentUser: {
          ...formatStat(currentUserScoreData, currentUserScoreRank || 0),
          isEligibleForWinrate: currentUserScoreData.totalGamesPlayed >= 10
        }
      },
      winrate: {
        top: topWinrateStats.map((s, i) => formatStat(s, i + 1)),
        currentUser: currentUserWinrateRank ? formatStat(currentUserScoreData, currentUserWinrateRank) : null
      }
    };

    res.status(200).json({
      success: true,
      data: leaderboard
    });
  } catch (error) {
    next(error);
  }
};

