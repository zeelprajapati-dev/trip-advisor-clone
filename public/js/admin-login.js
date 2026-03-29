// public/js/admin-login.js
(function () {
  const form   = document.getElementById("admin-login-form");
  const email  = document.getElementById("admin-email");
  const pass   = document.getElementById("admin-password");
  const errEl  = document.getElementById("admin-login-error");

  if (!form) return;

  function showError(msg) {
    if (errEl) errEl.textContent = msg || "";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");

    const emailVal = (email && email.value.trim()) || "";
    const passVal  = (pass && pass.value) || "";

    if (!emailVal || !passVal) {
      showError("Please enter email and password.");
      return;
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, password: passVal }),
      });

      const data = await res.json();

      if (!data.ok) {
        showError(data.error || "Login failed. Check your credentials.");
        return;
      }

      const user = data.user || {};
      if (user.role !== "admin") {
        // Logged in, but not an admin – log them out again to be safe
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } catch (_) {}
        showError("This account is not an admin account.");
        return;
      }

      // success – go to admin dashboard
      window.location.href = "/admin/dashboard";
    } catch (err) {
      console.error("Admin login error:", err);
      showError("Something went wrong. Please try again.");
    }
  });
})();
