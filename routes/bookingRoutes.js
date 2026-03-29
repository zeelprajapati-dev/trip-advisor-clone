// routes/bookingRoutes.js
const express = require("express");
const Booking = require("../models/Booking");
const Trip = require("../models/Trip");

const router = express.Router();

/**
 * POST /api/bookings
 * Create a booking for a trip
 *
 * NOTE:
 *  - This version does NOT force authentication.
 *  - If req.user is present (because some auth middleware ran earlier),
 *    its id/email will be used. Otherwise the booking is created without
 *    a linked user (userId: null).
 */
router.post("/", async (req, res) => {
  try {
    const {
      tripId,
      persons,
      days,
      startDate,
      room,
      notes,
      email,
      phone,
    } = req.body;

    if (!tripId || !persons || !days || !startDate) {
      return res.status(400).json({
        ok: false,
        error: "tripId, persons, days and startDate are required",
      });
    }

    // 1) Load the trip so we know which agent owns it
    const trip = await Trip.findById(tripId);
    if (!trip) {
      return res.status(404).json({ ok: false, error: "Trip not found" });
    }

    const pricePerPersonPerDay = Number(trip.pricePerPersonPerDay) || 0;
    const numPersons = Number(persons) || 0;
    const numDays = Number(days) || 0;

    // 2) Calculate totalAmount like booking page
    const totalAmount = pricePerPersonPerDay * numPersons * numDays;

    // 3) If some upstream auth middleware has set req.user, use it
    const authUser = req.user || {};

    // 4) Build booking payload
    const bookingPayload = {
      tripId: trip._id,
      userId: authUser.id || null,          // optional link to logged-in user
      agentId: trip.provider || null,       // IMPORTANT link to agent
      passengers: numPersons,
      days: numDays,
      startDate: new Date(startDate),
      roomPreference: room || "standard",
      notes: notes || "",
      email: email || authUser.email || "", // fall back to authUser.email or empty
      phone: phone || "",
      totalAmount,
      paymentStatus: "pending",
      status: "unconfirmed",
    };

    const booking = await Booking.create(bookingPayload);

    return res.status(201).json({ ok: true, booking });
  } catch (e) {
    console.error("❌ Error creating booking:", e);
    return res
      .status(500)
      .json({ ok: false, error: "Could not create booking" });
  }
});

module.exports = router;
