import express from 'express';
// import { authenticateToken } from '../middleware/auth.middleware';
import { fetchPostsController, fetchUsersController, fetchTodosController, fetchTriviaController } from '../controllers/api.controller.js';
const router = express.Router();

// router.use(authenticateToken);

// router.get('/countries', fetchCountriesController)
router.get('/posts', fetchPostsController)
router.get('/todos', fetchTodosController)
router.get('/users', fetchUsersController)
router.get('/trivia', fetchTriviaController)

export default router;
