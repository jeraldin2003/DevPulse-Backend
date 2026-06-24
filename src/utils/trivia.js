import he from "he";

const TRIVIA_URL = "https://opentdb.com/api.php?amount=10";

export async function fetchTrivia() {
    try {
        const response = await fetch(TRIVIA_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch trivia: ${response.status}`);
        }

        const data = await response.json();
        return data.results.map((q) => {
            const correct_answer = he.decode(q.correct_answer);

            const answers = [
                correct_answer,
                ...q.incorrect_answers.map(he.decode),
            ].sort(() => Math.random() - 0.5);

            return {
                category: he.decode(q.category),
                difficulty: q.difficulty,
                type: q.type,
                question: he.decode(q.question),
                answers,
                correct_answer,
            };
        });
    } catch (error) {
        console.error("Error in fetchTrivia:", error);
        throw error;
    }
}
