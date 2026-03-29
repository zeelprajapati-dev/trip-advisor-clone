(function () {
  // ------------- helpers -------------
  function $(id) {
    return document.getElementById(id);
  }

  function rupee(n) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(Number(n) || 0);
  }

  // Simple helper: create & append li elements
  function renderList(container, items, mapFn) {
    if (!container) return;
    container.innerHTML = "";

    if (!items || !items.length) {
      container.innerHTML = '<li class="muted">No data added yet.</li>';
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.innerHTML = mapFn(item);
      container.appendChild(li);
    });
  }

  // ------------- grab DOM elements -------------
  const heroImgEl       = $("td-hero-img");
  const titleEl         = $("td-title");
  const routeEl         = $("td-route");
  const daysEl          = $("td-days");
  const priceEl         = $("td-price");
  const ratingEl        = $("td-rating");
  const itineraryEl     = $("td-itinerary");
  const hotelsEl        = $("td-hotels");
  const restaurantsEl   = $("td-restaurants");
  const sightseeingEl   = $("td-sightseeing");
  const galleryStripEl  = $("td-gallery");
  const bookBtn         = $("book-trip-btn");
  const errorEl         = $("td-error"); // optional <div id="td-error">...</div> if you want

  let currentTrip = null;

  // ------------- read tripId from URL -------------
  const params = new URLSearchParams(window.location.search);
  const tripId = params.get("tripId") || params.get("id");

  if (!tripId) {
    if (errorEl) {
      errorEl.textContent = "Trip not found. Please go back and choose a package again.";
      errorEl.style.display = "block";
    } else {
      alert("Trip not found. Please go back and choose a package again.");
    }
    return;
  }

  // ------------- fetch trip data -------------
  async function loadTrip() {
    try {
      const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`);
      const data = await res.json();

      if (!res.ok || !data.ok || !data.trip) {
        throw new Error(data.error || "Failed to load trip details");
      }

      currentTrip = data.trip;
      renderTrip(currentTrip);
    } catch (err) {
      console.error(err);
      if (errorEl) {
        errorEl.textContent = err.message || "Could not load this trip.";
        errorEl.style.display = "block";
      } else {
        alert(err.message || "Could not load this trip.");
      }
    }
  }

  // ------------- render trip into page -------------
  function renderTrip(t) {
    if (titleEl)  titleEl.textContent = t.title || "Untitled trip";

    const src = t.src || "Any city";
    const dst = t.dst || "-";
    if (routeEl) routeEl.textContent = `${src} → ${dst}`;

    if (daysEl)  daysEl.textContent = t.durationDays ? `${t.durationDays} days` : "Duration not specified";
    if (priceEl) priceEl.textContent = t.pricePerPersonPerDay
      ? `${rupee(t.pricePerPersonPerDay)} / person / day`
      : "Price on request";

    if (ratingEl) ratingEl.textContent = t.rating ? `${t.rating.toFixed(1)} ★` : "New package";

    if (heroImgEl && t.img) {
      heroImgEl.src = t.img;
      heroImgEl.alt = t.title || "Trip hero image";
    }

    // --------- itinerary (from itineraryText) ---------
    if (itineraryEl) {
      itineraryEl.innerHTML = "";
      const text = (t.itineraryText || "").trim();

      if (!text) {
        itineraryEl.innerHTML = '<li class="muted">Itinerary will be shared after booking.</li>';
      } else {
        // split by blank lines or single line per day
        const blocks = text
          .split(/\n\s*\n|\r\s*\r/g)
          .map((b) => b.trim())
          .filter(Boolean);

        if (!blocks.length) {
          itineraryEl.innerHTML = '<li class="muted">Itinerary will be shared after booking.</li>';
        } else {
          blocks.forEach((block) => {
            const li = document.createElement("li");
            li.innerHTML = block.replace(/\n/g, "<br>");
            itineraryEl.appendChild(li);
          });
        }
      }
    }

    // --------- Hotels / stays ---------
    renderList(
      hotelsEl,
      t.hotels || [],
      (h) => {
        const nights = h.nights ? ` · ${h.nights} night(s)` : "";
        const desc = h.description ? ` – ${h.description}` : "";
        return `<strong>${h.name}</strong>${desc}${nights}`;
      }
    );

    // --------- Restaurants ---------
    renderList(
      restaurantsEl,
      t.restaurants || [],
      (r) => {
        const desc = r.description ? ` – ${r.description}` : "";
        return `<strong>${r.name}</strong>${desc}`;
      }
    );

    // --------- Sightseeing ---------
    renderList(
      sightseeingEl,
      t.sightseeing || [],
      (s) => {
        const desc = s.description ? ` – ${s.description}` : "";
        return `<strong>${s.name}</strong>${desc}`;
      }
    );

    // --------- Gallery images (if any) ---------
    if (galleryStripEl) {
      galleryStripEl.innerHTML = "";
      const gallery = Array.isArray(t.galleryImages) ? t.galleryImages : [];

      if (!gallery.length) {
        // optional: show nothing or tiny message
        return;
      }

      gallery.forEach((src) => {
        if (!src) return;
        const img = document.createElement("img");
        img.src = src;
        img.alt = t.title || "Trip gallery image";
        img.className = "td-gallery-thumb"; // style this class in your CSS
        galleryStripEl.appendChild(img);
      });
    }
  }

  // ------------- “Book this trip” button -------------
  if (bookBtn) {
    bookBtn.addEventListener("click", (e) => {
      e.preventDefault();

      if (!currentTrip) {
        // fallback: use only tripId if for some reason renderTrip not done yet
        window.location.href = `/booking?tripId=${encodeURIComponent(tripId)}`;
        return;
      }

      const q = new URLSearchParams({
        tripId: currentTrip._id || tripId,
        title: currentTrip.title || "",
        price: String(currentTrip.pricePerPersonPerDay || ""),
        src: currentTrip.src || "",
        dst: currentTrip.dst || "",
        days: String(currentTrip.durationDays || ""),
      });

      window.location.href = `/booking?${q.toString()}`;
    });
  }

  // ------------- init -------------
  loadTrip();
})();
