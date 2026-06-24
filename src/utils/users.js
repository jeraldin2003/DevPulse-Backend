const USERS_URL = 'https://jsonplaceholder.typicode.com/users';

export async function fetchUsers() {
    try {
        const response = await fetch(USERS_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch users: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error in fetchUsers:', error);
        throw error;
    }
}
