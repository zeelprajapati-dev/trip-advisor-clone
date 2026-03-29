document.getElementById("signupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm = document.getElementById("confirm").value;
  const errorEl = document.getElementById("error");

  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, confirm }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Signup failed");
    location.href = data.redirect || "/";
  } catch (err) {
    errorEl.textContent = err.message;
  }
});
