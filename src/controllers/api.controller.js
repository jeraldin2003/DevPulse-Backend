import { fetchCountries } from "../utils/countries.js";
import { fetchPosts } from "../utils/posts.js";
import { fetchUsers } from "../utils/users.js"
import { fetchTodos } from "../utils/todos.js"
import { fetchTrivia } from "../utils/trivia.js"
// export const fetchCountriesController = async (req, res, next) => {
//     try {
//         const data = await fetchCountries();
//         res.status(200).json({ success: true, data });
//     } catch (error) {
//         next(error);
//     }
// };

export const fetchPostsController = async (req, res, next) => {
    try {
        const data = await fetchPosts();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const fetchUsersController = async (req, res, next) => {
    try {
        const data = await fetchUsers();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const fetchTodosController = async (req, res, next) => {
    try {
        const data = await fetchTodos();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const fetchTriviaController = async (req, res, next) => {
    try {
        const data = await fetchTrivia();
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};