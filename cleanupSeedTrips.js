// cleanupSeedTrips.js
const mongoose = require("mongoose");
const Trip = require("./models/Trip"); // adjust path if needed

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/TripAdvisor";

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB");

    // Delete trips that don't have a provider (likely seeded/demo)
    const res = await Trip.deleteMany({ provider: { $exists: false } });
    console.log(`Deleted ${res.deletedCount} trips without provider`);

    await mongoose.disconnect();
    console.log("Done, disconnected.");
  } catch (err) {
    console.error("Cleanup error:", err);
    process.exit(1);
  }
}

run();
