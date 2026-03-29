(function () {
  const cities = [
    "Delhi","Mumbai","Bengaluru","Hyderabad","Chennai","Kolkata","Jaipur",
    "Goa","Varanasi","Udaipur","Pune","Kochi","Manali","Leh","Rishikesh",
    "Darjeeling","Shimla","Mysuru"
  ];

  const $ = (id) => document.getElementById(id);

  const srcSel = $("src");
  const dstSel = $("dst");
  const budget = $("budget");
  const fromDate = $("fromDate");
  const toDate = $("toDate");
  const searchBtn = $("searchBtn");
  const cards = $("cards");
  const resultCount = $("resultCount");
  const toast = $("toast");
  $("yr").textContent = new Date().getFullYear();

  // nav auth controls
  const navLoginBtn = $("nav-login-btn");
  const navLogoutBtn = $("nav-logout-btn");
  const navAgentLink = $("nav-agent-link"); // NEW

  // auth popup elements
  const overlay = $("tw-auth-overlay");
  const tabSignup = $("tw-tab-signup");
  const tabLogin = $("tw-tab-login");
  const signupForm = $("tw-auth-signup-form");
  const loginForm = $("tw-auth-login-form");
  const titleEl = $("tw-auth-title");
  const closeBtn = $("tw-auth-close");
  const errEl = $("tw-auth-error");

  let isLoggedIn = false;
  let currentUserRole = null;   // NEW
  let authChecked = false;
  let popupShownByTimer = false;
  let lastTrips = []; // store last fetched trips for potential use

  // ------------------- helpers -------------------
  function rupee(n) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 1400);
  }

  function setTab(mode) {
    if (mode === "signup") {
      tabSignup.classList.add("tw-active");
      tabLogin.classList.remove("tw-active");
      signupForm.style.display = "block";
      loginForm.style.display = "none";
      titleEl.textContent = "Sign up to continue";
    } else {
      tabLogin.classList.add("tw-active");
      tabSignup.classList.remove("tw-active");
      signupForm.style.display = "none";
      loginForm.style.display = "block";
      titleEl.textContent = "Login to continue";
    }
    errEl.textContent = "";
  }

  function openAuthModal(mode = "signup") {
    setTab(mode);
    overlay.classList.add("tw-open");
  }

  function closeAuthModal() {
    overlay.classList.remove("tw-open");
    errEl.textContent = "";
  }

  function updateNavAuth() {
    if (!navLoginBtn || !navLogoutBtn) return;

    if (isLoggedIn) {
      navLoginBtn.style.display = "inline-flex";
      navLoginBtn.textContent = "Logged in";
      navLoginBtn.disabled = true;
      navLogoutBtn.style.display = "inline-flex";

      // show agent link only for agent role
      if (navAgentLink) {
        navAgentLink.style.display =
          currentUserRole === "agent" ? "inline-flex" : "none";
      }
    } else {
      navLoginBtn.style.display = "inline-flex";
      navLoginBtn.textContent = "Login";
      navLoginBtn.disabled = false;
      navLogoutBtn.style.display = "none";

      if (navAgentLink) {
        navAgentLink.style.display = "none";
      }
    }
  }

  // ------------------- auth check -------------------
  async function checkAuth() {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        isLoggedIn = false;
        currentUserRole = null;
        authChecked = true;
        updateNavAuth();
        return;
      }
      const data = await res.json();
      if (data.ok && data.user) {
        isLoggedIn = true;
        currentUserRole = data.user.role || "customer";
      } else {
        isLoggedIn = false;
        currentUserRole = null;
      }
    } catch (e) {
      isLoggedIn = false;
      currentUserRole = null;
    } finally {
      authChecked = true;
      updateNavAuth();
    }
  }

  // ------------------- initial setup -------------------
  function fill(sel, arr) {
    arr.forEach((city) => {
      const o = document.createElement("option");
      o.value = city;
      o.textContent = city;
      sel.appendChild(o);
    });
  }
  fill(srcSel, cities);
  fill(dstSel, cities);

  const todayISO = () => new Date().toISOString().slice(0, 10);
  fromDate.value = todayISO();
  toDate.value = todayISO();
  budget.value = 4000;

  function cardTpl(t) {
    return `
      <article class="trip">
        <div class="hero">
          <img src="${t.img}" alt="${t.title}">
          <div class="badge">${(t.rating || 0).toFixed(1)} ★</div>
        </div>
        <div class="trip-body">
          <div class="title">${t.title}</div>
          <div class="meta">${t.src} → ${t.dst} • ${t.durationDays} days</div>
          <div class="row">
            <div>${rupee(t.pricePerPersonPerDay)} <span class="muted">/ person / day</span></div>
            <button class="btn btn-primary" data-trip="${t._id || ""}">Select</button>
          </div>
        </div>
      </article>
    `;
  }

  async function fetchTrips() {
    const params = new URLSearchParams();
    if (srcSel.value) params.set("src", srcSel.value);
    if (dstSel.value) params.set("dst", dstSel.value);
    if (budget.value) params.set("budgetPerPerson", budget.value);

    try {
      const res = await fetch(`/api/trips?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error("Failed to fetch trips");

      lastTrips = Array.isArray(data.trips) ? data.trips : [];

      resultCount.textContent = `${data.count} result${data.count === 1 ? "" : "s"}`;
      cards.innerHTML = lastTrips.map(cardTpl).join("");

      // attach select handlers – now redirect to trip-details page
      cards.querySelectorAll("button[data-trip]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();

          if (!authChecked) {
            await checkAuth();
          }
          if (!isLoggedIn) {
            openAuthModal("signup");
            return;
          }

          const tripId = btn.dataset.trip;
          if (tripId) {
            // SIMPLE: send user to trip details page for this trip
            window.location.href = `/trip-details?tripId=${encodeURIComponent(tripId)}`;
          } else {
            showToast("Trip selected ✔");
          }
        });
      });
    } catch (err) {
      console.error(err);
      resultCount.textContent = "0 results";
      cards.innerHTML = `<div class="muted">Failed to load trips.</div>`;
    }
  }

  // ------------------- popup behaviors -------------------
  tabSignup.addEventListener("click", () => setTab("signup"));
  tabLogin.addEventListener("click", () => setTab("login"));
  closeBtn.addEventListener("click", closeAuthModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeAuthModal();
  });

  // signup submit
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("tw-su-name").value.trim();
    const email = document.getElementById("tw-su-email").value.trim();
    const password = document.getElementById("tw-su-password").value;
    const confirm = document.getElementById("tw-su-confirm").value;
    errEl.textContent = "";

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, confirm }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Signup failed");
      isLoggedIn = true;
      currentUserRole = (data.user && data.user.role) || "customer";
      updateNavAuth();
      closeAuthModal();
      showToast("Signed up & logged in 🎉");
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  // login submit
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("tw-li-email").value.trim();
    const password = document.getElementById("tw-li-password").value;
    errEl.textContent = "";

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Login failed");
      isLoggedIn = true;
      currentUserRole = (data.user && data.user.role) || "customer";
      updateNavAuth();
      closeAuthModal();
      showToast("Logged in ✔");
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  // ------------------- nav login / logout handlers -------------------
  if (navLoginBtn) {
    navLoginBtn.addEventListener("click", () => {
      if (!isLoggedIn) {
        openAuthModal("login");
      }
    });
  }

  if (navLogoutBtn) {
    navLogoutBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Logout failed");
      } catch (e) {
        console.error(e);
      } finally {
        isLoggedIn = false;
        currentUserRole = null;
        updateNavAuth();
        showToast("Logged out");
      }
    });
  }

  // ------------------- delayed popup trigger + init -------------------
  (async function init() {
    await checkAuth();
    fetchTrips();

    // 2 minutes (120000). Change to 180000 for 3 minutes if you want.
    setTimeout(() => {
      if (!isLoggedIn && !popupShownByTimer) {
        popupShownByTimer = true;
        openAuthModal("signup");
      }
    }, 120000);

    searchBtn.addEventListener("click", fetchTrips);
  })();
})();
