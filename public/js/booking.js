// public/js/booking.js
// Handles trip summary + booking draft for booking.html

(function () {
  const qs = new URLSearchParams(window.location.search);

  // Data coming from dashboard / trip-details in query string
  const tripIdFromUrl = qs.get("tripId");
  const titleFromUrl  = qs.get("title");
  const priceFromUrl  = qs.get("price");
  const srcFromUrl    = qs.get("src");
  const dstFromUrl    = qs.get("dst");
  const daysFromUrl   = qs.get("days");

  const $ = (id) => document.getElementById(id);

  // Summary DOM elements (right side)
  const tripIdEl      = $("bk-trip-id");
  const tripTitleEl   = $("bk-trip-title");
  const tripPriceEl   = $("bk-trip-price");
  const tripPersonsEl = $("bk-trip-persons");
  const tripDaysEl    = $("bk-trip-days");
  const tripTotalEl   = $("bk-trip-total");
  const tripTagEl     = $("bk-trip-tag");

  // Form inputs (left side)
  const personsInput  = $("bk-persons");
  const daysInput     = $("bk-days");
  const startInput    = $("bk-start");
  const emailInput    = $("bk-email");
  const phoneInput    = $("bk-phone");
  const roomSelect    = $("bk-room");
  const notesInput    = $("bk-notes");
  const alertEl       = $("bk-alert");

  const rupee = (n) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);

  const todayISO = () => new Date().toISOString().slice(0, 10);
  if (startInput) startInput.value = todayISO();

  // Base trip object we will hydrate from URL + API
  let trip = {
    _id: tripIdFromUrl || "TEMP-" + Math.random().toString(36).slice(2, 8),
    title: titleFromUrl || "Selected Trip",
    pricePerPersonPerDay: priceFromUrl ? Number(priceFromUrl) : null,
    src: srcFromUrl || "",
    dst: dstFromUrl || "",
    durationDays: daysFromUrl ? Number(daysFromUrl) : null,
  };

  // Fetch full trip from API if we have a real tripId in the URL
  async function hydrateTripFromApiIfNeeded() {
    if (!tripIdFromUrl) return; // no real id, nothing to fetch

    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(tripIdFromUrl)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok || !data.trip) return;

      const t = data.trip;
      trip = {
        _id: t._id,
        title: t.title || trip.title,
        pricePerPersonPerDay:
          typeof t.pricePerPersonPerDay === "number"
            ? t.pricePerPersonPerDay
            : trip.pricePerPersonPerDay,
        src: t.src || trip.src,
        dst: t.dst || trip.dst,
        durationDays:
          typeof t.durationDays === "number"
            ? t.durationDays
            : trip.durationDays,
      };
    } catch (err) {
      console.error("Failed to fetch trip for booking:", err);
    }
  }

  function updateTotals() {
    const persons = personsInput ? Number(personsInput.value || 0) : 0;
    const days = daysInput ? Number(daysInput.value || 0) : 0;

    if (tripPersonsEl) {
      tripPersonsEl.textContent = persons || "-";
    }

    if (tripDaysEl) {
      tripDaysEl.textContent = days
        ? `${days} night${days > 1 ? "s" : ""}`
        : "-";
    }

    if (tripTotalEl) {
      if (trip.pricePerPersonPerDay && persons && days) {
        const total = trip.pricePerPersonPerDay * persons * days;
        tripTotalEl.textContent = rupee(total);
      } else {
        tripTotalEl.textContent = "—";
      }
    }
  }

  function renderTripSummary() {
    const routePart =
      trip.src && trip.dst ? ` (${trip.src} → ${trip.dst})` : "";

    if (tripTitleEl) {
      tripTitleEl.textContent = (trip.title || "Selected Trip") + routePart;
    }

    if (tripIdEl) {
      tripIdEl.textContent = trip._id || "—";
    }

    if (tripPriceEl) {
      tripPriceEl.textContent =
        typeof trip.pricePerPersonPerDay === "number"
          ? rupee(trip.pricePerPersonPerDay)
          : "—";
    }

    // Prefill days from trip if we have duration and URL didn't override it
    if (trip.durationDays && daysInput && !daysFromUrl) {
      daysInput.value = trip.durationDays;
    }

    if (tripTagEl && trip.title) {
      tripTagEl.textContent = "Selected package";
    }

    updateTotals();
  }

  // Listen for changes on persons / days
  if (personsInput) {
    personsInput.addEventListener("input", updateTotals);
    personsInput.addEventListener("change", updateTotals);
  }
  if (daysInput) {
    daysInput.addEventListener("input", updateTotals);
    daysInput.addEventListener("change", updateTotals);
  }

  // Handle form submit – save booking draft and go to /payment
  const form = document.getElementById("bookingForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const booking = {
        tripId: trip._id,
        title: trip.title,
        src: trip.src,
        dst: trip.dst,
        durationDays: Number(daysInput.value || trip.durationDays || 0),
        pricePerPersonPerDay: trip.pricePerPersonPerDay,
        email: emailInput.value.trim(),
        phone: phoneInput.value.trim(),
        persons: Number(personsInput.value || 0),
        days: Number(daysInput.value || 0),
        startDate: startInput.value,
        room: roomSelect.value,
        notes: notesInput.value.trim(),
        createdAt: new Date().toISOString(),
      };

      localStorage.setItem("twBookingDraft", JSON.stringify(booking));

      if (alertEl) {
        alertEl.textContent =
          "Booking details saved. Redirecting you to payment…";
        alertEl.classList.add("show");
      }

      setTimeout(() => {
        window.location.href = "/payment";
      }, 800);
    });
  }

  // Init
  (async function init() {
    await hydrateTripFromApiIfNeeded();
    renderTripSummary();
  })();
})();
