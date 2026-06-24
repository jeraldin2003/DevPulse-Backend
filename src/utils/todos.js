const TODOS_URL = 'https://jsonplaceholder.typicode.com/todos';

export async function fetchTodos() {
    try {
        const response = await fetch(TODOS_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch todos: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error in fetchTodos:', error);
        throw error;
    }
}
