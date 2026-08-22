/**
 * ChillPill Gaming Cafe — Owner console logic.
 * Talks to Supabase directly from the browser using the anon key.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const ALERT_MS = (CFG.ALERT_MINUTES_BEFORE_END || 5) * 60 * 1000;
  const ADMIN_ONLY_PAGES = new Set(["page-revenue", "page-menu", "page-content", "page-staff"]);

  let menuItems = [];
  let records = [];
  let staffList = [];
  let currentStaff = null; // { id, name, username, role }
  let sdkReady = false;
  let realtimeChannel = null;
  const overdueToasted = new Set();

  // ---------- helpers ----------
  const inr = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

  const localDateTimeValue = (date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const fmtDateTime = (iso) =>
    iso ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

  const isToday = (iso) => {
    if (!iso) return false;
    const d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };

  const normalizeUsername = (s) => (s || "").trim().toLowerCase();

  const randomPassword = (len = 10) => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(len));
    return [...bytes].map((b) => chars[b % chars.length]).join("");
  };

  function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.classList.add("toast-show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("toast-show"), 3200);
  }

  function showMessage(message, error) {
    const el = document.getElementById("form-message");
    el.textContent = message;
    el.className = "mt-3 text-sm min-h-5 " + (error ? "text-red-300" : "text-[#d8ff45]");
  }

  function updateClock() {
    document.getElementById("live-clock").textContent = new Intl.DateTimeFormat("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(new Date());
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
      setTimeout(() => ctx.close(), 700);
    } catch (e) { /* ignore audio errors (autoplay policy etc.) */ }
  }

  function notifyOwner(title, body) {
    beep();
    showToast(body);
    if (window.Notification && Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch (e) {}
    }
  }

  // ---------- login ----------
  // /admin -> password-only, matched against any active admin account.
  // /staff (or anything else, incl. dashboard.html directly) -> normal
  // username + password. Also overridable with ?as=admin / ?as=staff for
  // local testing, since a plain static server won't apply vercel.json's
  // path rewrites the way Vercel itself does.
  function getLoginMode() {
    const path = location.pathname;
    if (path.startsWith("/admin")) return "admin";
    if (path.startsWith("/staff")) return "staff";
    const override = new URLSearchParams(location.search).get("as");
    return override === "admin" ? "admin" : "staff";
  }

  function initLogin() {
    const mode = getLoginMode();
    const lockScreen = document.getElementById("lock-screen");
    const appRoot = document.getElementById("app-root");
    const form = document.getElementById("lock-form");
    const usernameField = document.getElementById("lock-username-field");
    const usernameInput = document.getElementById("lock-username");
    const passwordInput = document.getElementById("lock-password");
    const error = document.getElementById("lock-error");
    const warning = document.getElementById("lock-config-warning");
    const heading = document.getElementById("lock-heading");
    const subheading = document.getElementById("lock-subheading");
    const hint = document.getElementById("lock-hint");

    if (mode === "admin") {
      usernameField.classList.add("hidden");
      usernameInput.required = false;
      heading.textContent = "Admin login";
      subheading.textContent = "Enter the admin password to continue.";
      hint.textContent = "First time setting up? Default password is ChangeMe123! — change it immediately from Staff → Reset password.";
    } else {
      usernameField.classList.remove("hidden");
      usernameInput.required = true;
      heading.textContent = "Staff login";
      subheading.textContent = "Sign in with your ChillPill staff account.";
      hint.textContent = "";
    }

    if (!window.SUPABASE_CONFIGURED) warning.classList.remove("hidden");

    function unlock(staff) {
      currentStaff = staff;
      sessionStorage.setItem("chillpill_staff", JSON.stringify(staff));
      lockScreen.remove();
      appRoot.classList.remove("hidden");
      bootstrap();
    }

    async function tryResumeSession() {
      const raw = sessionStorage.getItem("chillpill_staff");
      if (!raw || !window.SUPABASE_CONFIGURED) return;
      try {
        const staff = JSON.parse(raw);
        const { data, error: err } = await window.sb.from("staff").select("*").eq("id", staff.id).maybeSingle();
        if (!err && data && data.active) {
          unlock({ id: data.id, name: data.name, username: data.username, role: data.role });
        } else {
          sessionStorage.removeItem("chillpill_staff");
        }
      } catch (e) {
        sessionStorage.removeItem("chillpill_staff");
      }
    }

    async function loginByUsername(password) {
      const username = normalizeUsername(usernameInput.value);
      if (!username || !password) return null;
      const { data, error: err } = await window.sb.from("staff").select("*").eq("username", username).maybeSingle();
      if (err || !data || !data.active) return null;
      const hash = await window.ChillPillCrypto.hashPassword(password, data.password_salt);
      return hash === data.password_hash ? data : null;
    }

    async function loginByAdminPassword(password) {
      if (!password) return null;
      const { data, error: err } = await window.sb.from("staff").select("*").eq("role", "admin").eq("active", true);
      if (err || !data || !data.length) return null;
      for (const candidate of data) {
        const hash = await window.ChillPillCrypto.hashPassword(password, candidate.password_salt);
        if (hash === candidate.password_hash) return candidate;
      }
      return null;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      if (!window.SUPABASE_CONFIGURED) {
        error.textContent = "Supabase isn't configured yet — see README.md.";
        return;
      }
      const password = passwordInput.value;

      const submitBtn = form.querySelector("button[type=submit]");
      submitBtn.disabled = true;
      try {
        const matched = mode === "admin" ? await loginByAdminPassword(password) : await loginByUsername(password);
        if (!matched) throw new Error("invalid");
        unlock({ id: matched.id, name: matched.name, username: matched.username, role: matched.role });
      } catch (e) {
        error.textContent = mode === "admin" ? "Incorrect password." : "Invalid username or password.";
        passwordInput.value = "";
        passwordInput.focus();
      } finally {
        submitBtn.disabled = false;
      }
    });

    tryResumeSession();
    lucide.createIcons();
  }

  // ---------- sidebar / page navigation ----------
  function switchPage(pageId) {
    if (ADMIN_ONLY_PAGES.has(pageId) && (!currentStaff || currentStaff.role !== "admin")) pageId = "page-overview";
    document.querySelectorAll(".page-view").forEach((el) => el.classList.toggle("active", el.id === pageId));
    document.querySelectorAll(".sidebar-link").forEach((link) => link.classList.toggle("active", link.dataset.page === pageId));
    const activeLink = document.querySelector(`.sidebar-link[data-page="${pageId}"]`);
    document.getElementById("page-title").textContent = activeLink ? activeLink.textContent.trim() : "Overview";
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("sidebar-backdrop").classList.remove("show");
  }

  function initSidebar() {
    document.querySelectorAll(".sidebar-link").forEach((link) =>
      link.addEventListener("click", (event) => {
        event.preventDefault();
        switchPage(link.dataset.page);
      })
    );
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    document.getElementById("sidebar-toggle").addEventListener("click", () => {
      sidebar.classList.add("open");
      backdrop.classList.add("show");
    });
    backdrop.addEventListener("click", () => { sidebar.classList.remove("open"); backdrop.classList.remove("show"); });

    document.getElementById("logout-button").addEventListener("click", () => {
      sessionStorage.removeItem("chillpill_staff");
      location.reload();
    });
  }

  function applyRoleVisibility() {
    const isAdmin = currentStaff && currentStaff.role === "admin";
    document.querySelectorAll(".admin-only").forEach((el) => el.classList.toggle("hidden", !isAdmin));
    document.getElementById("current-staff-name").textContent = currentStaff ? currentStaff.name : "—";
    document.getElementById("current-staff-role").textContent = currentStaff ? currentStaff.role.toUpperCase() + " · @" + currentStaff.username : "";
  }

  // ---------- menu (food & drinks) ----------
  function menuOptions(selectedId) {
    return (
      '<option value="">Select item</option>' +
      menuItems.map((item) => `<option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>${item.name} (${inr(item.price)})</option>`).join("")
    );
  }

  function addFoodRow(selectedId = "", qty = 1) {
    const row = document.createElement("div");
    row.className = "food-row grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center";
    row.innerHTML = `
      <select aria-label="Food or drink item" class="form-control food-select">${menuOptions(selectedId)}</select>
      <input aria-label="Quantity" type="number" min="1" value="${qty}" class="form-control food-quantity w-16">
      <span class="food-price mono min-w-16 text-right text-sm text-[#d8ff45]">₹0</span>
      <button type="button" aria-label="Remove food item" class="remove-food h-10 w-10 rounded-lg border border-slate-600 text-slate-300 hover:text-red-300 hover:border-red-400">×</button>`;
    row.querySelector(".food-select").addEventListener("change", () => { updateFoodRow(row); calculateAmount(); });
    row.querySelector(".remove-food").addEventListener("click", () => { row.remove(); calculateAmount(); });
    document.getElementById("food-order-list").appendChild(row);
    updateFoodRow(row);
  }

  function updateFoodRow(row) {
    const select = row.querySelector(".food-select");
    const item = menuItems.find((entry) => entry.id === select.value);
    const quantity = Math.max(1, Number(row.querySelector(".food-quantity").value) || 1);
    const price = item ? item.price * quantity : 0;
    row.dataset.price = price;
    row.dataset.qty = quantity;
    row.dataset.itemId = item ? item.id : "";
    row.dataset.itemName = item ? item.name : "";
    row.dataset.unitPrice = item ? item.price : 0;
    row.querySelector(".food-price").textContent = inr(price);
  }

  function refreshFoodMenus() {
    document.querySelectorAll(".food-select").forEach((select) => {
      const current = select.value;
      select.innerHTML = menuOptions(current);
      updateFoodRow(select.closest(".food-row"));
    });
    document.getElementById("menu-empty-note").classList.toggle("hidden", menuItems.length > 0);
    calculateAmount();
  }

  function collectFoodItems() {
    return [...document.querySelectorAll(".food-row")]
      .filter((row) => row.dataset.itemId)
      .map((row) => ({ id: row.dataset.itemId, name: row.dataset.itemName, price: Number(row.dataset.unitPrice), qty: Number(row.dataset.qty) }));
  }

  function calculateAmount() {
    const duration = Math.max(0, Number(document.getElementById("duration-minutes").value) || 0);
    const rate = Math.max(0, Number(document.getElementById("rate").value) || 0);
    const foodTotal = [...document.querySelectorAll(".food-row")].reduce((sum, row) => sum + (Number(row.dataset.price) || 0), 0);
    const timeCost = (duration / 60) * rate;
    const total = Math.round(timeCost + foodTotal);
    document.getElementById("estimate-total").textContent = inr(total);
    return { total, foodTotal, timeCost, duration, rate };
  }

  function renderMenu() {
    const list = document.getElementById("menu-list");
    list.innerHTML = "";
    menuItems.forEach((item) => {
      const line = document.createElement("div");
      line.className = "flex items-center justify-between rounded-lg border border-slate-700 bg-[#111722] px-3 py-2 text-sm";
      line.innerHTML = `<span>${item.name}</span><div class="flex items-center gap-3"><span class="mono text-[#d8ff45]">${inr(item.price)}</span><button type="button" aria-label="Remove ${item.name}" class="text-slate-400 hover:text-red-300">×</button></div>`;
      line.querySelector("button").addEventListener("click", async () => {
        const { error } = await window.sb.from("menu_items").delete().eq("id", item.id);
        if (error) showToast("Could not remove this menu item.");
      });
      list.appendChild(line);
    });
  }

  // ---------- bookings ----------
  function renderBookings() {
    const query = document.getElementById("booking-search").value.trim().toLowerCase();
    const list = document.getElementById("booking-list");
    list.innerHTML = "";
    const bookings = records.filter(
      (r) => r.status === "Booked" && `${r.customer_name} ${r.station_name} ${r.customer_phone}`.toLowerCase().includes(query)
    );
    bookings.forEach((record) => {
      const overdue = record.start_time && new Date(record.start_time) < new Date();
      const card = document.createElement("article");
      card.className = "rounded-xl border border-slate-700 bg-[#111722] p-4";
      card.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-semibold">${record.customer_name || "Unnamed customer"}</p>
            <p class="mono text-xs text-slate-400 mt-1">${record.station_name || "No station"} · ${record.start_time ? fmtDateTime(record.start_time) : "Time not set"}</p>
            <p class="text-xs text-slate-500 mt-1">${record.customer_phone || ""}</p>
          </div>
          <span class="rounded-full px-2 py-1 text-xs font-bold ${overdue ? "status-active" : "status-booked"}">${overdue ? "Arrived / overdue" : "Booked"}</span>
        </div>
        <button type="button" class="activate-booking w-full mt-4 rounded-lg px-3 py-2 text-sm font-bold" style="background:#d8ff45;color:#10141e;">Mark active</button>`;
      card.querySelector(".activate-booking").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        const start = new Date();
        const end = new Date(start.getTime() + (Number(record.duration_minutes) || 60) * 60000);
        const { error } = await window.sb
          .from("sessions")
          .update({ status: "Active", start_time: start.toISOString(), end_time: end.toISOString(), notified_5min: false })
          .eq("id", record.id);
        if (error) { button.disabled = false; showToast("Could not activate this booking."); }
        else showToast("Booking marked active — clock is running.");
      });
      list.appendChild(card);
    });
    const empty = document.getElementById("empty-bookings");
    empty.classList.toggle("hidden", bookings.length > 0);
    empty.textContent = query ? "No matching bookings found." : "No waiting bookings right now.";

    const overdueCount = records.filter((r) => r.status === "Booked" && r.start_time && new Date(r.start_time) < new Date()).length;
    document.getElementById("notification-count").textContent = overdueCount;
    document.getElementById("notification-count").classList.toggle("hidden", overdueCount === 0);
    document.getElementById("notification-copy").textContent = overdueCount
      ? `${overdueCount} booking${overdueCount === 1 ? "" : "s"} passed the scheduled start time.`
      : "No overdue bookings.";
  }

  // ---------- records / session cards ----------
  function updateSummary() {
    const activeSessions = records.filter((r) => r.status === "Active");
    const endingSoon = activeSessions.filter((r) => r.end_time && new Date(r.end_time) - new Date() > 0 && new Date(r.end_time) - new Date() <= ALERT_MS);
    const completedToday = records.filter((r) => r.status === "Completed" && isToday(r.paid_at || r.created_at));
    const todayRevenue = records.filter((r) => r.paid && isToday(r.paid_at)).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    document.getElementById("active-count").textContent = activeSessions.length;
    document.getElementById("ending-soon-count").textContent = endingSoon.length;
    document.getElementById("completed-count").textContent = completedToday.length;
    document.getElementById("food-count").textContent = records.filter((r) => r.food_items && r.food_items.length).length;
    document.getElementById("today-revenue").textContent = inr(todayRevenue);
    document.getElementById("record-count").textContent = records.length;
  }

  function foodSummaryText(record) {
    if (!record.food_items || !record.food_items.length) return "";
    return "🍟 " + record.food_items.map((f) => `${f.name} ×${f.qty}`).join(", ");
  }

  function timeRemainingText(record) {
    if (!record.end_time) return "";
    const diffMs = new Date(record.end_time) - new Date();
    const mins = Math.round(Math.abs(diffMs) / 60000);
    if (diffMs <= 0) return `⏰ OVERDUE by ${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    return `Ends in ${h ? h + "h " : ""}${m}m`;
  }

  function updateCard(card, record) {
    card.dataset.recordId = record.id;
    card.querySelector(".record-customer").textContent = record.customer_name || "—";
    card.querySelector(".record-station").textContent = (record.station_name || "—") + " · " + (record.type || "—");
    card.querySelector(".record-duration").textContent = (Number(record.duration_minutes) || 0) + " min";
    card.querySelector(".record-amount").textContent = inr(record.amount);

    const status = card.querySelector(".record-status");
    status.textContent = record.status || "Completed";
    status.className =
      "record-status rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap " +
      (record.status === "Active" ? "status-active" : record.status === "Booked" ? "status-booked" : record.status === "Cancelled" ? "status-cancelled" : "status-completed");

    const food = card.querySelector(".record-food");
    const foodText = foodSummaryText(record);
    food.textContent = foodText;
    food.classList.toggle("hidden", !foodText);

    const staffEl = card.querySelector(".record-staff");
    if (record.staff_name) { staffEl.textContent = "👤 " + record.staff_name; staffEl.classList.remove("hidden"); }
    else staffEl.classList.add("hidden");

    const paymentEl = card.querySelector(".record-payment");
    if (record.paid && record.payment_method) {
      paymentEl.textContent = record.payment_method;
      paymentEl.className = "record-payment rounded-full px-2 py-0.5 font-bold " + (record.payment_method === "Cash" ? "badge-cash" : "badge-online");
    } else paymentEl.classList.add("hidden");

    const countdown = card.querySelector(".record-countdown");
    const actions = card.querySelector(".record-active-actions");
    card.classList.remove("overdue", "ending-soon");
    if (record.status === "Active" && record.end_time) {
      const diffMs = new Date(record.end_time) - new Date();
      countdown.textContent = timeRemainingText(record);
      countdown.classList.remove("hidden");
      countdown.className = "record-countdown mono mt-2 text-xs " + (diffMs <= 0 ? "text-[#ff6875]" : diffMs <= ALERT_MS ? "text-amber-300" : "text-slate-400");
      actions.classList.remove("hidden");
      actions.classList.add("flex");
      if (diffMs <= 0) card.classList.add("overdue");
      else if (diffMs <= ALERT_MS) card.classList.add("ending-soon");
    } else {
      countdown.classList.add("hidden");
      actions.classList.add("hidden");
      actions.classList.remove("flex");
    }

    card.querySelector(".delete-wrap").classList.toggle("hidden", !(currentStaff && currentStaff.role === "admin"));
    card.querySelector(".record-created").textContent = record.created_at ? fmtDateTime(record.created_at) : "";
  }

  function createCard(record) {
    const fragment = document.getElementById("record-template").content.cloneNode(true);
    const card = fragment.querySelector("article");
    updateCard(card, record);

    const trigger = card.querySelector(".delete-trigger");
    const confirmArea = card.querySelector(".delete-confirm");
    trigger.addEventListener("click", () => { trigger.classList.add("hidden"); confirmArea.classList.replace("hidden", "flex"); });
    card.querySelector(".delete-no").addEventListener("click", () => { trigger.classList.remove("hidden"); confirmArea.classList.replace("flex", "hidden"); });
    card.querySelector(".delete-yes").addEventListener("click", async () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (!item || !sdkReady) return;
      const button = card.querySelector(".delete-yes");
      button.disabled = true;
      const { error } = await window.sb.from("sessions").delete().eq("id", item.id);
      if (error) { button.disabled = false; showToast("Could not remove this record."); }
    });

    card.querySelector(".extend-15").addEventListener("click", async () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (!item) return;
      const newEnd = new Date((item.end_time ? new Date(item.end_time) : new Date()).getTime() + 15 * 60000);
      const newDuration = (Number(item.duration_minutes) || 0) + 15;
      const timeCost = (newDuration / 60) * (Number(item.rate) || 0);
      const amount = Math.round(timeCost + (Number(item.food_total) || 0));
      const { error } = await window.sb
        .from("sessions")
        .update({ end_time: newEnd.toISOString(), duration_minutes: newDuration, amount, notified_5min: false })
        .eq("id", item.id);
      if (error) showToast("Could not extend this session.");
      else { overdueToasted.delete(item.id); showToast("Extended by 15 minutes."); }
    });

    card.querySelector(".open-checkout").addEventListener("click", () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (item) openCheckoutModal(item);
    });

    card.querySelector(".open-add-food").addEventListener("click", () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (item) openAddFoodModal(item);
    });

    return card;
  }

  function syncCardList(container, list) {
    const existing = new Map([...container.children].map((card) => [card.dataset.recordId, card]));
    list.forEach((record) => {
      const card = existing.get(record.id);
      if (card) { updateCard(card, record); existing.delete(record.id); }
      else container.appendChild(createCard(record));
    });
    existing.forEach((card) => card.remove());
  }

  function renderAllLists() {
    const sorted = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const active = sorted.filter((r) => r.status === "Active");

    syncCardList(document.getElementById("records-list"), sorted);
    document.getElementById("empty-records").classList.toggle("hidden", records.length > 0);

    syncCardList(document.getElementById("overview-active-list"), active);
    document.getElementById("overview-empty").classList.toggle("hidden", active.length > 0);

    syncCardList(document.getElementById("billing-list"), active);
    document.getElementById("empty-billing").classList.toggle("hidden", active.length > 0);

    updateSummary();
    renderBookings();
    if (currentStaff && currentStaff.role === "admin") renderRevenue();
  }

  // ---------- checkout modal ----------
  function openCheckoutModal(record) {
    const modal = document.getElementById("checkout-modal");
    modal.dataset.recordId = record.id;
    document.getElementById("checkout-customer").textContent = record.customer_name || "—";
    document.getElementById("checkout-station").textContent = `${record.station_name || ""} · ${record.duration_minutes || 0} min`;
    const timeCost = ((Number(record.duration_minutes) || 0) / 60) * (Number(record.rate) || 0);
    const foodLines = (record.food_items || []).map((f) => `${f.name} ×${f.qty} — ${inr(f.price * f.qty)}`);
    document.getElementById("checkout-breakdown").innerHTML =
      [`Time: ${record.duration_minutes || 0} min @ ₹${record.rate || 0}/hr — ${inr(timeCost)}`, ...foodLines].map((l) => `<span class="block">${l}</span>`).join("");
    document.getElementById("checkout-amount").textContent = inr(record.amount);
    modal.classList.add("show");
  }

  function closeCheckoutModal() {
    document.getElementById("checkout-modal").classList.remove("show");
  }

  function initCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    document.getElementById("checkout-cancel").addEventListener("click", closeCheckoutModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeCheckoutModal(); });
    modal.querySelectorAll(".checkout-pay-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const recordId = modal.dataset.recordId;
        const method = btn.dataset.method;
        btn.disabled = true;
        const { error } = await window.sb
          .from("sessions")
          .update({ status: "Completed", paid: true, payment_method: method, paid_at: new Date().toISOString() })
          .eq("id", recordId);
        btn.disabled = false;
        if (error) showToast("Could not record payment: " + error.message);
        else { closeCheckoutModal(); showToast(`Payment recorded — ${method}.`); }
      })
    );
  }

  // ---------- add food to an in-progress session ----------
  let addFoodTarget = null;

  function addFoodModalRow(selectedId = "", qty = 1) {
    const row = document.createElement("div");
    row.className = "af-row grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center";
    row.innerHTML = `
      <select aria-label="Food or drink item" class="form-control af-select">${menuOptions(selectedId)}</select>
      <input aria-label="Quantity" type="number" min="1" value="${qty}" class="form-control af-qty w-16">
      <span class="af-price mono min-w-16 text-right text-sm text-[#d8ff45]">₹0</span>
      <button type="button" aria-label="Remove food item" class="af-remove h-10 w-10 rounded-lg border border-slate-600 text-slate-300 hover:text-red-300 hover:border-red-400">×</button>`;
    row.querySelector(".af-select").addEventListener("change", () => { updateAddFoodModalRow(row); recalcAddFoodModal(); });
    row.querySelector(".af-qty").addEventListener("input", () => { updateAddFoodModalRow(row); recalcAddFoodModal(); });
    row.querySelector(".af-remove").addEventListener("click", () => { row.remove(); recalcAddFoodModal(); });
    document.getElementById("add-food-rows").appendChild(row);
    updateAddFoodModalRow(row);
  }

  function updateAddFoodModalRow(row) {
    const select = row.querySelector(".af-select");
    const item = menuItems.find((entry) => entry.id === select.value);
    const quantity = Math.max(1, Number(row.querySelector(".af-qty").value) || 1);
    const price = item ? item.price * quantity : 0;
    row.dataset.price = price;
    row.dataset.qty = quantity;
    row.dataset.itemId = item ? item.id : "";
    row.dataset.itemName = item ? item.name : "";
    row.dataset.unitPrice = item ? item.price : 0;
    row.querySelector(".af-price").textContent = inr(price);
  }

  function collectAddFoodModalItems() {
    return [...document.querySelectorAll("#add-food-rows .af-row")]
      .filter((row) => row.dataset.itemId)
      .map((row) => ({ id: row.dataset.itemId, name: row.dataset.itemName, price: Number(row.dataset.unitPrice), qty: Number(row.dataset.qty) }));
  }

  function recalcAddFoodModal() {
    if (!addFoodTarget) return 0;
    const timeCost = ((Number(addFoodTarget.duration_minutes) || 0) / 60) * (Number(addFoodTarget.rate) || 0);
    const existingFoodTotal = Number(addFoodTarget.food_total) || 0;
    const newRowsTotal = [...document.querySelectorAll("#add-food-rows .af-row")].reduce((sum, row) => sum + (Number(row.dataset.price) || 0), 0);
    const total = Math.round(timeCost + existingFoodTotal + newRowsTotal);
    document.getElementById("add-food-new-total").textContent = inr(total);
    return total;
  }

  function openAddFoodModal(record) {
    addFoodTarget = record;
    document.getElementById("add-food-customer").textContent = record.customer_name || "—";
    document.getElementById("add-food-station").textContent = record.station_name || "";
    const existingText = foodSummaryText(record);
    document.getElementById("add-food-existing-note").textContent = existingText
      ? "Already ordered: " + existingText.replace("🍟 ", "")
      : "No food ordered yet on this session.";
    document.getElementById("add-food-rows").innerHTML = "";
    document.getElementById("add-food-menu-empty").classList.toggle("hidden", menuItems.length > 0);
    addFoodModalRow();
    recalcAddFoodModal();
    document.getElementById("add-food-modal").classList.add("show");
  }

  function closeAddFoodModal() {
    document.getElementById("add-food-modal").classList.remove("show");
    addFoodTarget = null;
  }

  function initAddFoodModal() {
    const modal = document.getElementById("add-food-modal");
    document.getElementById("add-food-add-row").addEventListener("click", () => addFoodModalRow());
    document.getElementById("add-food-cancel").addEventListener("click", closeAddFoodModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeAddFoodModal(); });
    document.getElementById("add-food-save").addEventListener("click", async () => {
      if (!addFoodTarget) return;
      const newItems = collectAddFoodModalItems();
      if (!newItems.length) return closeAddFoodModal();

      const merged = (addFoodTarget.food_items || []).map((item) => ({ ...item }));
      newItems.forEach((item) => {
        const existing = merged.find((m) => m.id === item.id);
        if (existing) existing.qty += item.qty;
        else merged.push(item);
      });
      const foodTotal = merged.reduce((sum, item) => sum + item.price * item.qty, 0);
      const timeCost = ((Number(addFoodTarget.duration_minutes) || 0) / 60) * (Number(addFoodTarget.rate) || 0);
      const amount = Math.round(timeCost + foodTotal);

      const btn = document.getElementById("add-food-save");
      btn.disabled = true;
      const { error } = await window.sb.from("sessions").update({ food_items: merged, food_total: foodTotal, amount }).eq("id", addFoodTarget.id);
      btn.disabled = false;
      if (error) showToast("Could not add food to this order.");
      else { closeAddFoodModal(); showToast("Food added to the order."); }
    });
  }

  // ---------- revenue (admin) ----------
  function renderRevenue() {
    const paid = records.filter((r) => r.paid);
    const total = paid.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const cash = paid.filter((r) => r.payment_method === "Cash").reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const online = paid.filter((r) => r.payment_method === "Online").reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const today = paid.filter((r) => isToday(r.paid_at)).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

    document.getElementById("revenue-total").textContent = inr(total);
    document.getElementById("revenue-cash").textContent = inr(cash);
    document.getElementById("revenue-online").textContent = inr(online);
    document.getElementById("revenue-today").textContent = inr(today);

    const splitEl = document.getElementById("revenue-split");
    const bar = (label, value) => `
      <div>
        <div class="flex justify-between text-xs mb-1"><span>${label}</span><span class="mono text-slate-300">${inr(value)}</span></div>
        <div class="revenue-bar-track"><div class="revenue-bar-fill" style="width:${total > 0 ? Math.round((value / total) * 100) : 0}%"></div></div>
      </div>`;
    splitEl.innerHTML = bar("Cash", cash) + bar("Online", online);

    const byStaff = {};
    paid.forEach((r) => {
      const key = r.staff_name || "Unassigned";
      byStaff[key] = (byStaff[key] || 0) + (Number(r.amount) || 0);
    });
    const staffEntries = Object.entries(byStaff).sort((a, b) => b[1] - a[1]);
    const staffEl = document.getElementById("revenue-by-staff");
    document.getElementById("revenue-by-staff-empty").classList.toggle("hidden", staffEntries.length > 0);
    staffEl.innerHTML = staffEntries.map(([name, amount]) => bar(name, amount)).join("");
  }

  // ---------- staff management (admin) ----------
  function renderStaffList() {
    const list = document.getElementById("staff-list");
    list.innerHTML = "";
    staffList.forEach((staff) => {
      const row = document.createElement("div");
      row.className = "rounded-lg border border-slate-700 bg-[#111722] px-3 py-2.5 text-sm";
      row.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="font-medium truncate">${staff.name} <span class="text-xs text-slate-500">@${staff.username}</span></p>
            <p class="text-xs text-slate-500">${staff.role} · ${staff.active ? "Active" : "Deactivated"}</p>
          </div>
          <div class="flex gap-1.5 shrink-0">
            <button type="button" class="toggle-active rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300">${staff.active ? "Deactivate" : "Activate"}</button>
            <button type="button" class="reset-password rounded-lg border border-slate-600 px-2 py-1.5 text-xs text-slate-300">Reset pw</button>
          </div>
        </div>
        <div class="reset-result hidden mt-2 text-xs rounded bg-[#0f1520] border border-slate-700 p-2"></div>`;
      row.querySelector(".toggle-active").addEventListener("click", async () => {
        if (staff.id === currentStaff.id && staff.active) return showToast("You can't deactivate your own account while signed in.");
        const { error } = await window.sb.from("staff").update({ active: !staff.active }).eq("id", staff.id);
        if (error) showToast("Could not update this account.");
      });
      row.querySelector(".reset-password").addEventListener("click", async () => {
        const btn = row.querySelector(".reset-password");
        btn.disabled = true;
        const newPassword = randomPassword();
        const salt = window.ChillPillCrypto.randomSalt();
        const hash = await window.ChillPillCrypto.hashPassword(newPassword, salt);
        const { error } = await window.sb.from("staff").update({ password_hash: hash, password_salt: salt }).eq("id", staff.id);
        btn.disabled = false;
        if (error) return showToast("Could not reset password.");
        const resultEl = row.querySelector(".reset-result");
        resultEl.textContent = `New password for ${staff.username}: ${newPassword} — share this now, it won't be shown again.`;
        resultEl.classList.remove("hidden");
      });
      list.appendChild(row);
    });
  }

  function fillContentForm(settings) {
    if (!settings) return;
    document.getElementById("cms-name").value = settings.cafe_name || "";
    document.getElementById("cms-tagline").value = settings.cafe_tagline || "";
    document.getElementById("cms-location").value = settings.cafe_location || "";
    document.getElementById("cms-address").value = settings.cafe_address || "";
    document.getElementById("cms-hours").value = settings.opening_hours || "";
    document.getElementById("cms-whatsapp").value = settings.whatsapp_number || "";
    document.getElementById("cms-whatsapp-message").value = settings.whatsapp_message || "";
    document.getElementById("sidebar-cafe-name").textContent = settings.cafe_name || "ChillPill Gaming Cafe";
  }

  // ---------- time-based alerts ----------
  function checkTimeAlerts() {
    renderAllLists();

    records
      .filter((r) => r.status === "Active" && r.end_time)
      .forEach(async (record) => {
        const diffMs = new Date(record.end_time) - new Date();
        if (diffMs > 0 && diffMs <= ALERT_MS && !record.notified_5min) {
          notifyOwner("Session ending soon", `${record.customer_name} at ${record.station_name} ends in ${Math.round(diffMs / 60000)} min.`);
          record.notified_5min = true;
          const card = document.querySelector(`#records-list article[data-record-id="${record.id}"]`);
          if (card) { card.classList.add("flash-alert"); setTimeout(() => card.classList.remove("flash-alert"), 3800); }
          await window.sb.from("sessions").update({ notified_5min: true }).eq("id", record.id);
        }
        if (diffMs <= 0 && !overdueToasted.has(record.id)) {
          overdueToasted.add(record.id);
          notifyOwner("Time's up!", `${record.customer_name}'s session at ${record.station_name} has ended.`);
        }
      });
  }

  // ---------- supabase data loading ----------
  async function fetchSessions() {
    const { data, error } = await window.sb.from("sessions").select("*").order("created_at", { ascending: false });
    if (error) { showMessage("Could not load records: " + error.message, true); return; }
    records = data || [];
    renderAllLists();
  }

  async function fetchMenu() {
    const { data, error } = await window.sb.from("menu_items").select("*").order("created_at", { ascending: true });
    if (error) { showToast("Could not load the menu."); return; }
    menuItems = data || [];
    renderMenu();
    refreshFoodMenus();
  }

  async function fetchSettings() {
    const { data, error } = await window.sb.from("settings").select("*").eq("id", 1).maybeSingle();
    if (error || !data) return;
    document.getElementById("admin-rate").value = data.default_rate;
    document.getElementById("rate").value = data.default_rate;
    calculateAmount();
    fillContentForm(data);
  }

  async function fetchStaff() {
    const { data, error } = await window.sb.from("staff").select("*").order("created_at", { ascending: true });
    if (error) return;
    staffList = data || [];
    renderStaffList();
  }

  function setConnectionStatus(ok, label) {
    document.getElementById("connection-dot").style.background = ok ? "#d8ff45" : "#ff6875";
    document.getElementById("connection-label").textContent = label;
  }

  async function loadAll() {
    await Promise.all([fetchSessions(), fetchMenu(), fetchSettings(), fetchStaff()]);
  }

  function subscribeRealtime() {
    realtimeChannel = window.sb
      .channel("chillpill-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, fetchSessions)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, fetchMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetchSettings)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, fetchStaff)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus(true, "Live");
      });
  }

  // ---------- bootstrap ----------
  function bootstrap() {
    applyRoleVisibility();
    initSidebar();
    initCheckoutModal();
    initAddFoodModal();
    switchPage("page-overview");

    document.getElementById("booking-search").addEventListener("input", renderBookings);
    document.getElementById("notification-button").addEventListener("click", () => {
      const panel = document.getElementById("notification-panel");
      const isHidden = panel.classList.toggle("hidden");
      document.getElementById("notification-button").setAttribute("aria-expanded", String(!isHidden));
    });
    document.getElementById("enable-alerts").addEventListener("click", async () => {
      if (!window.Notification) return showToast("Browser notifications aren't supported here.");
      const perm = await Notification.requestPermission();
      showToast(perm === "granted" ? "Alerts enabled — you'll get a heads-up 5 min before a session ends." : "Notifications weren't enabled.");
    });
    document.getElementById("add-food-row").addEventListener("click", () => addFoodRow());
    document.getElementById("food-order-list").addEventListener("input", (event) => {
      if (event.target.classList.contains("food-quantity")) { updateFoodRow(event.target.closest(".food-row")); calculateAmount(); }
    });

    document.getElementById("rate-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const rate = Math.max(0, Number(document.getElementById("admin-rate").value) || 0);
      document.getElementById("rate").value = rate;
      calculateAmount();
      if (!sdkReady) return showToast("Supabase isn't connected.");
      const { error } = await window.sb.from("settings").update({ default_rate: rate, updated_at: new Date().toISOString() }).eq("id", 1);
      showToast(error ? "Could not save the default rate." : "Default hourly rate saved.");
    });

    document.getElementById("menu-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("menu-name").value.trim();
      const price = Math.max(0, Number(document.getElementById("menu-price").value) || 0);
      if (!name) return;
      if (!sdkReady) return showToast("Supabase isn't connected yet.");
      const { error } = await window.sb.from("menu_items").insert({ name, price });
      if (error) showToast("Could not add menu item.");
      else { event.target.reset(); showToast("Menu item added."); }
    });

    document.getElementById("content-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!sdkReady) return;
      const payload = {
        cafe_name: document.getElementById("cms-name").value.trim() || "ChillPill Gaming Cafe",
        cafe_tagline: document.getElementById("cms-tagline").value.trim(),
        cafe_location: document.getElementById("cms-location").value.trim(),
        cafe_address: document.getElementById("cms-address").value.trim(),
        opening_hours: document.getElementById("cms-hours").value.trim(),
        whatsapp_number: document.getElementById("cms-whatsapp").value.replace(/[^\d]/g, ""),
        whatsapp_message: document.getElementById("cms-whatsapp-message").value.trim(),
        updated_at: new Date().toISOString()
      };
      const { error } = await window.sb.from("settings").update(payload).eq("id", 1);
      const el = document.getElementById("content-message");
      el.textContent = error ? "Could not save: " + error.message : "Saved — the public website now reflects these changes.";
      el.className = "mt-3 text-sm min-h-5 " + (error ? "text-red-300" : "text-[#d8ff45]");
      if (!error) showToast("Cafe content updated.");
    });

    document.getElementById("staff-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("staff-name").value.trim();
      const username = normalizeUsername(document.getElementById("staff-username").value);
      const password = document.getElementById("staff-password").value;
      const role = document.getElementById("staff-role").value;
      const msgEl = document.getElementById("staff-form-message");
      if (!name || !username || !password) return;
      if (!sdkReady) { msgEl.textContent = "Supabase isn't connected yet."; msgEl.className = "text-sm min-h-5 text-red-300"; return; }
      const salt = window.ChillPillCrypto.randomSalt();
      const hash = await window.ChillPillCrypto.hashPassword(password, salt);
      const { error } = await window.sb.from("staff").insert({ name, username, password_hash: hash, password_salt: salt, role, active: true });
      if (error) {
        msgEl.textContent = error.message.includes("duplicate") ? "That username is already taken." : "Could not create account: " + error.message;
        msgEl.className = "text-sm min-h-5 text-red-300";
      } else {
        event.target.reset();
        msgEl.textContent = `Account created. Share the username "${username}" and the password you entered with them directly.`;
        msgEl.className = "text-sm min-h-5 text-[#d8ff45]";
        showToast("Staff account created.");
      }
    });

    document.getElementById("end-time").addEventListener("change", () => {
      const start = document.getElementById("start-time").value, end = document.getElementById("end-time").value;
      if (start && end) {
        const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
        if (minutes >= 0) document.getElementById("duration-minutes").value = minutes;
      }
      calculateAmount();
    });
    ["duration-minutes", "rate"].forEach((id) => document.getElementById(id).addEventListener("input", calculateAmount));

    document.getElementById("session-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!sdkReady) return showMessage("Supabase isn't connected. Edit assets/js/config.js (or config.local.js), then reload.", true);

      const station = document.getElementById("station-name").value.trim();
      const customer = document.getElementById("customer-name").value.trim();
      const phone = document.getElementById("customer-phone").value.trim();
      if (!station || !customer || !phone) return showMessage("Please enter the station, customer name, and phone number.", true);

      const button = document.getElementById("save-button");
      button.disabled = true;
      button.classList.add("opacity-60");

      const status = document.getElementById("session-status").value;
      const start = document.getElementById("start-time").value;
      const { total, foodTotal, duration, rate } = calculateAmount();
      const foodItems = collectFoodItems();
      const startIso = start ? new Date(start).toISOString() : status !== "Booked" ? new Date().toISOString() : null;
      const endIso = startIso ? new Date(new Date(startIso).getTime() + duration * 60000).toISOString() : null;

      const { error } = await window.sb.from("sessions").insert({
        type: status === "Booked" ? "Booked" : "Walk-in",
        station_name: station,
        customer_name: customer,
        customer_phone: phone,
        start_time: startIso,
        end_time: endIso,
        duration_minutes: duration,
        rate,
        food_items: foodItems,
        food_total: foodTotal,
        amount: total,
        status,
        notes: document.getElementById("notes").value.trim(),
        notified_5min: false,
        staff_id: currentStaff ? currentStaff.id : null,
        staff_name: currentStaff ? currentStaff.name : null
      });

      button.disabled = false;
      button.classList.remove("opacity-60");

      if (!error) {
        event.target.reset();
        document.getElementById("duration-minutes").value = 60;
        document.getElementById("rate").value = document.getElementById("admin-rate").value;
        document.getElementById("start-time").value = localDateTimeValue(new Date());
        document.getElementById("food-order-list").innerHTML = "";
        addFoodRow();
        calculateAmount();
        showMessage("Session saved.", false);
        showToast("New session saved.");
      } else {
        showMessage("Could not save this record: " + error.message, true);
      }
    });

    // initial state
    document.getElementById("start-time").value = localDateTimeValue(new Date());
    addFoodRow();
    calculateAmount();
    updateClock();
    setInterval(updateClock, 1000);
    setInterval(checkTimeAlerts, 5000);
    lucide.createIcons();

    if (!window.SUPABASE_CONFIGURED) {
      setConnectionStatus(false, "Supabase not configured");
      showMessage("Supabase isn't configured yet. Edit assets/js/config.js, then reload this page.", true);
      return;
    }

    setConnectionStatus(false, "Connecting…");
    loadAll().then(() => {
      sdkReady = true;
      subscribeRealtime();
    });
  }

  document.addEventListener("DOMContentLoaded", initLogin);
})();
