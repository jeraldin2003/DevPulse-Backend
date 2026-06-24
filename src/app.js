import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import gameRoutes from './routes/game.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import dotenv from 'dotenv'

dotenv.config();

const ORIGIN = process.env.ORIGIN;

const app = express();

// CORS — allow Vite dev server
app.use(cors({
  origin: ORIGIN,
  credentials: true
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/dashboard', dashboardRoutes)

// Error middleware
app.use(errorHandler);

export default app;
