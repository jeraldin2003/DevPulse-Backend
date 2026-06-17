import dotenv from 'dotenv';
import app from './app.js';
import { connectMongo } from './config/mongo.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

// Connect to MongoDB
await connectMongo();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
