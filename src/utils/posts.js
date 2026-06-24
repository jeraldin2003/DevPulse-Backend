
const POSTS_URL = 'https://jsonplaceholder.typicode.com/posts';

export async function fetchPosts() {
    try {
        const response = await fetch(POSTS_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch posts: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error in fetchPosts:', error);
        throw error;
    }
}
