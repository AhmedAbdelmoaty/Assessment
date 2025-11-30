// public/js/auth.js

function toggleButtonDisabled(form, button) {
  // فعّل الزر لما الحقول الأساسية تكون صالحة
  button.disabled = !form.checkValidity();
}

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function handleSignupSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector('button[type="submit"]');

  const name = form.querySelector('[name="name"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const phone = form.querySelector('[name="phone"]').value.trim();
  const password = form.querySelector('[name="password"]').value;
  const confirm = form.querySelector('[name="confirm"]').value;

  if (password !== confirm) { alert("Passwords do not match"); return; }

  btn.disabled = true;
  try {
    await postJSON("/api/auth/signup", { name, email, password, locale: "ar", phone });
    window.location.href = "/app.html";
  } catch (err) {
    alert("Signup failed: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function handleLoginSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector('button[type="submit"]');

  const email = form.querySelector('[name="email"]').value.trim();
  const password = form.querySelector('[name="password"]').value;

  btn.disabled = true;
  try {
    await postJSON("/api/auth/login", { email, password });
    window.location.href = "/app.html";
  } catch (err) {
    alert("Login failed: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

window.addEventListener("load", () => {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const btn = loginForm.querySelector('button[type="submit"]');
    loginForm.addEventListener("input", () => toggleButtonDisabled(loginForm, btn));
    loginForm.addEventListener("submit", handleLoginSubmit);
    toggleButtonDisabled(loginForm, btn);
  }

  const signupForm = document.getElementById("signupForm");
  if (signupForm) {
    const btn = signupForm.querySelector('button[type="submit"]');
    signupForm.addEventListener("input", () => toggleButtonDisabled(signupForm, btn));
    signupForm.addEventListener("submit", handleSignupSubmit);
    toggleButtonDisabled(signupForm, btn);
  }
});
