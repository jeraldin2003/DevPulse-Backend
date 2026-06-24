const COUNTRIES_URL = 'https://restcountries.com/v3.1/all?fields=name,population,region,flags';

export async function fetchCountries() {
    try {
        const response = await fetch(COUNTRIES_URL);

        if (!response.ok) {
            throw new Error(`Failed to fetch countries: ${response.status}`);
        }

        const data = await response.json();

        if (data.message) {
            throw new Error(data.message);
        }

        return data;
    } catch (error) {
        console.error('Error in fetchCountries:', error);
        throw error;
    }
}
