// MongoDB connection helper
import mongoose from 'mongoose';

let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    await mongoose.connect(uri);
    isConnected = true;
    console.error(`[db] Connected to MongoDB`);
  } catch (err) {
    console.error(`[db] Connection failed: ${err.message}`);
    throw err;
  }
}

export async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.error('[db] Disconnected from MongoDB');
}
