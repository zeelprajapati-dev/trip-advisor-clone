const mongoose = require("mongoose");

const simpleItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    nights: { type: Number }, // used for hotels
  },
  { _id: false }
);

const tripSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },

    src: { type: String, required: true, trim: true },
    dst: { type: String, required: true, trim: true },

    durationDays: { type: Number, required: true, default: 3 },
    pricePerPersonPerDay: { type: Number, required: true },

    rating: { type: Number, default: 4.5 },
    img: { type: String, trim: true },

    // NEW: which agent owns this trip
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // NEW: detailed content
    hotels: [simpleItemSchema],
    restaurants: [simpleItemSchema],
    sightseeing: [simpleItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Trip", tripSchema);
