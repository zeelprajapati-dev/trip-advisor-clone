// routes/tripRoutes.js
const express = require("express");
const Trip = require("../models/Trip");

const router = express.Router();

/**
 * GET /api/trips
 * Public list endpoint used by the customer dashboard.
 *
 * Optional query params:
 *  - src: exact source city match (if provided)
 *  - dst: exact destination city match (if provided)
 *  - budgetPerPerson: max pricePerPersonPerDay
 *
 * Only trips that are NOT hidden (hidden !== true) are returned,
 * so agent-hidden packages don't show up to customers.
 */
router.get("/", async (req, res) => {
  try {
    const { src = "", dst = "", budgetPerPerson = "" } = req.query;
    const budget = Number(budgetPerPerson) || null;

    // only show trips that are not hidden
    const all = await Trip.find({ hidden: { $ne: true } }).sort({
      createdAt: -1,
    });

    const filtered = all.filter((t) => {
      if (src && t.src !== src) return false;
      if (dst && t.dst !== dst) return false;
      if (budget && t.pricePerPersonPerDay > budget) return false;
      return true;
    });

    res.json({ ok: true, count: filtered.length, trips: filtered });
  } catch (e) {
    console.error("Error fetching trips:", e);
    res.status(500).json({ ok: false, error: "Failed to fetch trips" });
  }
});

/**
 * GET /api/trips/:id
 * Fetch a single trip by id for the Trip Details page.
 */
router.get("/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip || trip.hidden === true) {
      return res
        .status(404)
        .json({ ok: false, error: "Trip not found or is hidden" });
    }

    return res.json({ ok: true, trip });
  } catch (e) {
    console.error("Error fetching trip by id:", e);
    return res.status(500).json({ ok: false, error: "Could not fetch trip" });
  }
});

module.exports = router;
