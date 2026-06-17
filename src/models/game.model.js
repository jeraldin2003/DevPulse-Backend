import mongoose from 'mongoose';

const gameLogSchema = new mongoose.Schema({
  userId: {
    type: String, // Or Number depending on PG id type. Using String is safe for both.
    required: true,
    index: true,
  },
  score: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

export const GameLog = mongoose.model('GameLog', gameLogSchema);

const userStatsSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  totalScore: {
    type: Number,
    default: 0,
  },
  totalGamesPlayed: {
    type: Number,
    default: 0,
  },
});

export const UserStats = mongoose.model('UserStats', userStatsSchema);
