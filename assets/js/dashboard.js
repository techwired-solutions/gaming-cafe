/**
 * ChillPill Gaming Cafe — Owner console logic.
 * Talks to Supabase directly from the browser using the anon key.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const ALERT_MS = (CFG.ALERT_MINUTES_BEFORE_END || 5) * 60 * 1000;
  const OVERTIME_GRACE_MINUTES = CFG.OVERTIME_GRACE_MINUTES != null ? Number(CFG.OVERTIME_GRACE_MINUTES) : 5;
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

  // ---------- generic food-order row builder, reused by New Session,
  // Edit Session, and both Waiting List forms — each identified only by
  // its container id, so multiple independent order builders can exist on
  // the page at once without interfering with each other. ----------
  const frChangeHandlers = {};
  function registerFoodContainer(containerId, onChange) {
    frChangeHandlers[containerId] = onChange;
  }

  function addFrRow(containerId, selectedId = "", qty = 1) {
    const row = document.createElement("div");
    row.className = "fr-row grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center";
    row.innerHTML = `
      <select aria-label="Food or drink item" class="form-control fr-select">${menuOptions(selectedId)}</select>
      <input aria-label="Quantity" type="number" min="1" value="${qty}" class="form-control fr-qty w-16">
      <span class="fr-price mono min-w-16 text-right text-sm text-[#d8ff45]">₹0</span>
      <button type="button" aria-label="Remove item" class="fr-remove h-10 w-10 rounded-lg border border-slate-600 text-slate-300 hover:text-red-300 hover:border-red-400">×</button>`;
    const notify = () => { const cb = frChangeHandlers[containerId]; if (cb) cb(); };
    row.querySelector(".fr-select").addEventListener("change", () => { updateFrRow(row); notify(); });
    row.querySelector(".fr-qty").addEventListener("input", () => { updateFrRow(row); notify(); });
    row.querySelector(".fr-remove").addEventListener("click", () => { row.remove(); notify(); });
    document.getElementById(containerId).appendChild(row);
    updateFrRow(row);
  }

  function updateFrRow(row) {
    const select = row.querySelector(".fr-select");
    const item = menuItems.find((entry) => entry.id === select.value);
    const quantity = Math.max(1, Number(row.querySelector(".fr-qty").value) || 1);
    const price = item ? item.price * quantity : 0;
    row.dataset.price = price;
    row.dataset.qty = quantity;
    row.dataset.itemId = item ? item.id : "";
    row.dataset.itemName = item ? item.name : "";
    row.dataset.unitPrice = item ? item.price : 0;
    row.querySelector(".fr-price").textContent = inr(price);
  }

  function collectFrItems(containerId) {
    return [...document.querySelectorAll(`#${containerId} .fr-row`)]
      .filter((row) => row.dataset.itemId)
      .map((row) => ({ id: row.dataset.itemId, name: row.dataset.itemName, price: Number(row.dataset.unitPrice), qty: Number(row.dataset.qty) }));
  }

  function frTotal(containerId) {
    return [...document.querySelectorAll(`#${containerId} .fr-row`)].reduce((sum, row) => sum + (Number(row.dataset.price) || 0), 0);
  }

  function clearFrContainer(containerId) {
    document.getElementById(containerId).innerHTML = "";
  }

  function refreshFoodMenus() {
    document.querySelectorAll(".fr-select").forEach((select) => {
      const current = select.value;
      select.innerHTML = menuOptions(current);
      updateFrRow(select.closest(".fr-row"));
    });
    document.getElementById("menu-empty-note").classList.toggle("hidden", menuItems.length > 0);
    document.getElementById("waiting-menu-empty").classList.toggle("hidden", menuItems.length > 0);
    Object.values(frChangeHandlers).forEach((cb) => cb && cb());
  }

  function calculateAmount() {
    const duration = Math.max(0, Number(document.getElementById("duration-minutes").value) || 0);
    const rate = Math.max(0, Number(document.getElementById("rate").value) || 0);
    const foodTotal = frTotal("food-order-list");
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
        <div class="flex gap-2 mt-4">
          <button type="button" class="edit-booking flex-1 rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-200">Edit</button>
          <button type="button" class="activate-booking flex-1 rounded-lg px-3 py-2 text-sm font-bold" style="background:#d8ff45;color:#10141e;">Mark active</button>
        </div>`;
      card.querySelector(".edit-booking").addEventListener("click", () => openEditModal(record));
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

  // Grace period after end_time before overtime starts accruing. Once past
  // it, the charge covers every minute since end_time (not just the
  // minutes past the grace window) — e.g. 8 minutes overdue with a 5-minute
  // grace period bills all 8 minutes, not just 3.
  function computeOvertimeCharge(record) {
    if (!record.end_time) return { minutes: 0, amount: 0 };
    const overdueMinutes = Math.floor((new Date() - new Date(record.end_time)) / 60000);
    if (overdueMinutes <= OVERTIME_GRACE_MINUTES) return { minutes: 0, amount: 0 };
    const perMinuteRate = (Number(record.rate) || 0) / 60;
    return { minutes: overdueMinutes, amount: Math.round(overdueMinutes * perMinuteRate) };
  }

  function timeRemainingText(record) {
    if (!record.end_time) return "";
    const diffMs = new Date(record.end_time) - new Date();
    const mins = Math.round(Math.abs(diffMs) / 60000);
    if (diffMs <= 0) {
      const overtime = computeOvertimeCharge(record);
      return overtime.amount > 0 ? `⏰ OVERDUE by ${mins} min (+${inr(overtime.amount)} overtime)` : `⏰ OVERDUE by ${mins} min`;
    }
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

    const gameEl = card.querySelector(".record-game");
    if (record.game) { gameEl.textContent = "🎮 " + record.game; gameEl.classList.remove("hidden"); }
    else gameEl.classList.add("hidden");

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
    const actions = card.querySelector(".record-actions");
    const extendBtn = card.querySelector(".extend-15");
    const checkoutBtn = card.querySelector(".open-checkout");
    const addFoodBtn = card.querySelector(".open-add-food");
    const editBtn = card.querySelector(".open-edit");
    card.classList.remove("overdue", "ending-soon");

    if (record.status === "Active" && record.end_time) {
      const diffMs = new Date(record.end_time) - new Date();
      countdown.textContent = timeRemainingText(record);
      countdown.classList.remove("hidden");
      countdown.className = "record-countdown mono mt-2 text-xs " + (diffMs <= 0 ? "text-[#ff6875]" : diffMs <= ALERT_MS ? "text-amber-300" : "text-slate-400");
      if (diffMs <= 0) card.classList.add("overdue");
      else if (diffMs <= ALERT_MS) card.classList.add("ending-soon");
    } else {
      countdown.classList.add("hidden");
    }

    // Edit is available on both Active and Booked sessions; +Food/extend/
    // checkout only make sense once a session is actually running.
    if (record.status === "Active" || record.status === "Booked") {
      actions.classList.remove("hidden");
      actions.classList.add("flex");
      const isActive = record.status === "Active";
      extendBtn.classList.toggle("hidden", !isActive);
      checkoutBtn.classList.toggle("hidden", !isActive);
      addFoodBtn.classList.toggle("hidden", !isActive);
      editBtn.classList.toggle("col-span-2", !isActive);
    } else {
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

    card.querySelector(".open-edit").addEventListener("click", () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (item) openEditModal(item);
    });

    card.querySelector(".open-add-food").addEventListener("click", () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (item) openEditModal(item, { focusFood: true });
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
    renderStationsBoard();
    if (currentStaff && currentStaff.role === "admin") renderRevenue();
  }

  // ---------- checkout modal ----------
  function renderCheckoutBreakdown(record) {
    const timeCost = ((Number(record.duration_minutes) || 0) / 60) * (Number(record.rate) || 0);
    const overtime = computeOvertimeCharge(record);
    const foodLines = (record.food_items || []).map((f) => `${f.name} ×${f.qty} — ${inr(f.price * f.qty)}`);
    const lines = [`Time: ${record.duration_minutes || 0} min @ ₹${record.rate || 0}/hr — ${inr(timeCost)}`, ...foodLines];
    if (overtime.amount > 0) {
      lines.push(`Overtime: ${overtime.minutes} min past end time (after a ${OVERTIME_GRACE_MINUTES}-min grace period) — ${inr(overtime.amount)}`);
    }
    document.getElementById("checkout-breakdown").innerHTML = lines.map((l) => `<span class="block">${l}</span>`).join("");
    document.getElementById("checkout-amount").textContent = inr(Math.round((Number(record.amount) || 0) + overtime.amount));
    return overtime;
  }

  function openCheckoutModal(record) {
    const modal = document.getElementById("checkout-modal");
    modal.dataset.recordId = record.id;
    document.getElementById("checkout-customer").textContent = record.customer_name || "—";
    document.getElementById("checkout-station").textContent = `${record.station_name || ""} · ${record.duration_minutes || 0} min`;
    renderCheckoutBreakdown(record);
    modal.classList.add("show");
    clearInterval(Number(modal.dataset.refreshTimer) || 0);
    modal.dataset.refreshTimer = setInterval(() => {
      const current = records.find((r) => r.id === record.id);
      if (current) renderCheckoutBreakdown(current);
    }, 15000);
  }

  function closeCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    modal.classList.remove("show");
    clearInterval(Number(modal.dataset.refreshTimer) || 0);
  }

  function initCheckoutModal() {
    const modal = document.getElementById("checkout-modal");
    document.getElementById("checkout-cancel").addEventListener("click", closeCheckoutModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeCheckoutModal(); });
    modal.querySelectorAll(".checkout-pay-btn").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const recordId = modal.dataset.recordId;
        const method = btn.dataset.method;
        const record = records.find((r) => r.id === recordId);
        if (!record) return;
        // Recompute overtime fresh at the moment of payment, not from when
        // the modal happened to be opened, so the charge reflects the
        // actual checkout time.
        const overtime = computeOvertimeCharge(record);
        const finalAmount = Math.round((Number(record.amount) || 0) + overtime.amount);
        btn.disabled = true;
        const { error } = await window.sb
          .from("sessions")
          .update({ status: "Completed", paid: true, payment_method: method, paid_at: new Date().toISOString(), amount: finalAmount, overtime_amount: overtime.amount })
          .eq("id", recordId);
        btn.disabled = false;
        if (error) showToast("Could not record payment: " + error.message);
        else { closeCheckoutModal(); showToast(`Payment recorded — ${method}${overtime.amount > 0 ? ` (incl. ${inr(overtime.amount)} overtime)` : ""}.`); }
      })
    );
  }

  // ---------- edit an active or booked session (timing, order, table, game) ----------
  let editTarget = null;

  function recalcEditModal() {
    const duration = Math.max(0, Number(document.getElementById("edit-duration").value) || 0);
    const rate = Math.max(0, Number(document.getElementById("edit-rate").value) || 0);
    const foodTotal = frTotal("edit-food-rows");
    const total = Math.round((duration / 60) * rate + foodTotal);
    document.getElementById("edit-new-total").textContent = inr(total);
    return { total, foodTotal, duration, rate };
  }

  function openEditModal(record, options = {}) {
    editTarget = record;
    document.getElementById("edit-heading").textContent = `${record.customer_name || "—"} · ${record.status}`;
    document.getElementById("edit-station").value = record.station_name || "";
    document.getElementById("edit-game").value = record.game || "";
    document.getElementById("edit-customer-name").value = record.customer_name || "";
    document.getElementById("edit-customer-phone").value = record.customer_phone || "";
    document.getElementById("edit-start-time").value = record.start_time ? localDateTimeValue(new Date(record.start_time)) : "";
    document.getElementById("edit-duration").value = record.duration_minutes || 0;
    document.getElementById("edit-rate").value = record.rate || 0;
    document.getElementById("edit-notes").value = record.notes || "";
    document.getElementById("edit-session-message").textContent = "";

    clearFrContainer("edit-food-rows");
    document.getElementById("edit-menu-empty").classList.toggle("hidden", menuItems.length > 0);
    (record.food_items || []).forEach((item) => addFrRow("edit-food-rows", item.id, item.qty));
    if (!record.food_items || !record.food_items.length) addFrRow("edit-food-rows");

    recalcEditModal();
    document.getElementById("edit-session-modal").classList.add("show");

    // "+ Food" quick action opens this same editor but jumps straight to
    // the order section and focuses an empty row, since adding food is the
    // most common reason to reopen an already-running session.
    if (options.focusFood) {
      setTimeout(() => {
        const foodSection = document.getElementById("edit-food-rows");
        foodSection.scrollIntoView({ behavior: "smooth", block: "center" });
        const emptyRow = [...foodSection.querySelectorAll(".fr-row")].find((row) => !row.dataset.itemId);
        const targetSelect = emptyRow ? emptyRow.querySelector(".fr-select") : foodSection.querySelector(".fr-select");
        if (targetSelect) targetSelect.focus();
      }, 50);
    }
  }

  function closeEditModal() {
    document.getElementById("edit-session-modal").classList.remove("show");
    editTarget = null;
  }

  function initEditModal() {
    const modal = document.getElementById("edit-session-modal");
    document.getElementById("edit-add-food-row").addEventListener("click", () => addFrRow("edit-food-rows"));
    document.getElementById("edit-session-cancel").addEventListener("click", closeEditModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeEditModal(); });
    ["edit-duration", "edit-rate"].forEach((id) => document.getElementById(id).addEventListener("input", recalcEditModal));

    document.getElementById("edit-session-save").addEventListener("click", async () => {
      if (!editTarget) return;
      const station = document.getElementById("edit-station").value.trim();
      const customerName = document.getElementById("edit-customer-name").value.trim();
      const customerPhone = document.getElementById("edit-customer-phone").value.trim();
      const msgEl = document.getElementById("edit-session-message");
      if (!station || !customerName || !customerPhone) {
        msgEl.textContent = "Station, customer name, and phone can't be empty.";
        msgEl.className = "text-sm min-h-5 mt-2 text-red-300";
        return;
      }

      const { total, foodTotal, duration, rate } = recalcEditModal();
      const foodItems = collectFrItems("edit-food-rows");
      const startVal = document.getElementById("edit-start-time").value;
      const startIso = startVal ? new Date(startVal).toISOString() : editTarget.start_time || null;
      const endIso = startIso ? new Date(new Date(startIso).getTime() + duration * 60000).toISOString() : null;

      const btn = document.getElementById("edit-session-save");
      btn.disabled = true;
      const { error } = await window.sb
        .from("sessions")
        .update({
          station_name: station,
          game: document.getElementById("edit-game").value.trim(),
          customer_name: customerName,
          customer_phone: customerPhone,
          start_time: startIso,
          end_time: endIso,
          duration_minutes: duration,
          rate,
          food_items: foodItems,
          food_total: foodTotal,
          amount: total,
          notes: document.getElementById("edit-notes").value.trim(),
          notified_5min: false
        })
        .eq("id", editTarget.id);
      btn.disabled = false;
      if (error) {
        msgEl.textContent = "Could not save changes: " + error.message;
        msgEl.className = "text-sm min-h-5 mt-2 text-red-300";
      } else {
        overdueToasted.delete(editTarget.id);
        closeEditModal();
        showToast("Session updated.");
      }
    });
  }

  // ---------- waiting list (first come, first served) ----------
  let waitingList = [];
  let pendingWaitingId = null; // waiting entry a New Session save should mark Seated

  function recalcWaitingForm() {
    document.getElementById("waiting-food-total").textContent = inr(frTotal("waiting-food-rows"));
  }

  function waitingFoodSummaryText(entry) {
    if (!entry.food_items || !entry.food_items.length) return "";
    return entry.food_items.map((f) => `${f.name} ×${f.qty}`).join(", ");
  }

  function updateWaitingCard(card, entry, position) {
    card.dataset.waitId = entry.id;
    card.querySelector(".wl-position").textContent = "#" + (position + 1);
    card.querySelector(".wl-name").textContent = entry.customer_name || "—";
    card.querySelector(".wl-phone").textContent = entry.customer_phone || "";
    const waitMins = Math.max(0, Math.round((new Date() - new Date(entry.created_at)) / 60000));
    card.querySelector(".wl-wait").textContent = `waiting ${waitMins} min`;

    const foodText = waitingFoodSummaryText(entry);
    const foodEl = card.querySelector(".wl-food");
    if (foodText) { foodEl.textContent = `🍟 ${foodText} — ${inr(entry.food_total)}`; foodEl.classList.remove("hidden"); }
    else foodEl.classList.add("hidden");

    const notesEl = card.querySelector(".wl-notes");
    if (entry.notes) { notesEl.textContent = entry.notes; notesEl.classList.remove("hidden"); }
    else notesEl.classList.add("hidden");
  }

  function createWaitingCard(entry, position) {
    const card = document.createElement("article");
    card.className = "rounded-xl border border-slate-700 bg-[#111722] p-4";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="wl-position mono text-xs font-bold text-[#d8ff45]"></p>
          <p class="wl-name font-semibold truncate mt-0.5"></p>
          <p class="wl-phone text-xs text-slate-500 mt-0.5"></p>
        </div>
        <span class="wl-wait mono text-xs text-slate-400 whitespace-nowrap"></span>
      </div>
      <p class="wl-food mt-2 text-xs text-slate-400 hidden"></p>
      <p class="wl-notes mt-1 text-xs text-slate-500 italic hidden"></p>
      <div class="flex gap-2 mt-3">
        <button type="button" class="wl-edit flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-bold text-slate-200">Edit</button>
        <button type="button" class="wl-remove flex-1 rounded-lg border border-slate-600 px-2 py-1.5 text-xs font-bold text-[#ff6875]">Remove</button>
      </div>
      <button type="button" class="wl-start w-full mt-2 rounded-lg px-2 py-2 text-xs font-bold" style="background:#d8ff45;color:#10141e;">Start session</button>`;

    card.querySelector(".wl-edit").addEventListener("click", () => {
      const item = waitingList.find((w) => w.id === card.dataset.waitId);
      if (item) openWaitingEditModal(item);
    });
    card.querySelector(".wl-remove").addEventListener("click", async () => {
      const item = waitingList.find((w) => w.id === card.dataset.waitId);
      if (!item) return;
      const { error } = await window.sb.from("waiting_list").update({ status: "Cancelled" }).eq("id", item.id);
      if (error) showToast("Could not remove from the waiting list.");
    });
    card.querySelector(".wl-start").addEventListener("click", () => {
      const item = waitingList.find((w) => w.id === card.dataset.waitId);
      if (item) startSessionFromWaiting(item);
    });

    updateWaitingCard(card, entry, position);
    return card;
  }

  function renderWaitingList() {
    const container = document.getElementById("waiting-list-container");
    const sorted = [...waitingList].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    document.getElementById("waiting-count").textContent = sorted.length;
    document.getElementById("empty-waiting").classList.toggle("hidden", sorted.length > 0);

    const existing = new Map([...container.children].map((card) => [card.dataset.waitId, card]));
    sorted.forEach((entry, index) => {
      const card = existing.get(entry.id);
      if (card) { updateWaitingCard(card, entry, index); existing.delete(entry.id); }
      else container.appendChild(createWaitingCard(entry, index));
    });
    existing.forEach((card) => card.remove());
  }

  function startSessionFromWaiting(entry) {
    pendingWaitingId = entry.id;
    document.getElementById("station-name").value = "";
    document.getElementById("game-name").value = "";
    document.getElementById("customer-name").value = entry.customer_name || "";
    document.getElementById("customer-phone").value = entry.customer_phone || "";
    document.getElementById("session-status").value = "Active";
    document.getElementById("notes").value = entry.notes || "";
    clearFrContainer("food-order-list");
    (entry.food_items || []).forEach((item) => addFrRow("food-order-list", item.id, item.qty));
    if (!entry.food_items || !entry.food_items.length) addFrRow("food-order-list");
    calculateAmount();
    switchPage("page-new-session");
    showToast(`Loaded ${entry.customer_name} from the waiting list — pick a station, then Save.`);
    document.getElementById("station-name").focus();
  }

  // ---------- edit an existing waiting-list entry ----------
  let waitingEditTarget = null;

  function recalcWaitingEditModal() {
    document.getElementById("waiting-edit-food-total").textContent = inr(frTotal("waiting-edit-food-rows"));
  }

  function openWaitingEditModal(entry) {
    waitingEditTarget = entry;
    document.getElementById("waiting-edit-heading").textContent = entry.customer_name || "—";
    document.getElementById("waiting-edit-name").value = entry.customer_name || "";
    document.getElementById("waiting-edit-phone").value = entry.customer_phone || "";
    document.getElementById("waiting-edit-notes").value = entry.notes || "";
    document.getElementById("waiting-edit-message").textContent = "";

    clearFrContainer("waiting-edit-food-rows");
    document.getElementById("waiting-edit-menu-empty").classList.toggle("hidden", menuItems.length > 0);
    (entry.food_items || []).forEach((item) => addFrRow("waiting-edit-food-rows", item.id, item.qty));
    if (!entry.food_items || !entry.food_items.length) addFrRow("waiting-edit-food-rows");

    recalcWaitingEditModal();
    document.getElementById("waiting-edit-modal").classList.add("show");
  }

  function closeWaitingEditModal() {
    document.getElementById("waiting-edit-modal").classList.remove("show");
    waitingEditTarget = null;
  }

  function initWaitingEditModal() {
    const modal = document.getElementById("waiting-edit-modal");
    document.getElementById("waiting-edit-add-food-row").addEventListener("click", () => addFrRow("waiting-edit-food-rows"));
    document.getElementById("waiting-edit-cancel").addEventListener("click", closeWaitingEditModal);
    modal.addEventListener("click", (event) => { if (event.target === modal) closeWaitingEditModal(); });

    document.getElementById("waiting-edit-save").addEventListener("click", async () => {
      if (!waitingEditTarget) return;
      const name = document.getElementById("waiting-edit-name").value.trim();
      const phone = document.getElementById("waiting-edit-phone").value.trim();
      const msgEl = document.getElementById("waiting-edit-message");
      if (!name || !phone) {
        msgEl.textContent = "Name and phone can't be empty.";
        msgEl.className = "text-sm min-h-5 mt-2 text-red-300";
        return;
      }
      const btn = document.getElementById("waiting-edit-save");
      btn.disabled = true;
      const { error } = await window.sb
        .from("waiting_list")
        .update({
          customer_name: name,
          customer_phone: phone,
          food_items: collectFrItems("waiting-edit-food-rows"),
          food_total: frTotal("waiting-edit-food-rows"),
          notes: document.getElementById("waiting-edit-notes").value.trim()
        })
        .eq("id", waitingEditTarget.id);
      btn.disabled = false;
      if (error) {
        msgEl.textContent = "Could not save: " + error.message;
        msgEl.className = "text-sm min-h-5 mt-2 text-red-300";
      } else {
        closeWaitingEditModal();
        showToast("Waiting list entry updated.");
      }
    });
  }

  // ---------- stations (availability board) ----------
  let stations = [];

  function renderStationDatalist() {
    document.getElementById("station-list").innerHTML = stations
      .filter((s) => s.active)
      .map((s) => `<option value="${s.name}"></option>`)
      .join("");
  }

  function computeStationStatus(station) {
    const activeSession = records.find((r) => r.status === "Active" && r.station_name === station.name);
    if (activeSession) return { state: "occupied", session: activeSession };
    const nextBooking = records
      .filter((r) => r.status === "Booked" && r.station_name === station.name && r.start_time)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
    return { state: "available", nextBooking };
  }

  function renderStationsBoard() {
    const board = document.getElementById("stations-board");
    if (!board) return; // page not in DOM yet during early bootstrap
    const activeStations = stations.filter((s) => s.active);
    document.getElementById("empty-stations").classList.toggle("hidden", activeStations.length > 0);

    board.innerHTML = activeStations
      .map((station) => {
        const status = computeStationStatus(station);
        let bodyHtml;
        if (status.state === "occupied") {
          const r = status.session;
          const overdue = r.end_time && new Date(r.end_time) < new Date();
          bodyHtml = `
            <p class="text-xs text-slate-300 mt-2 truncate">${r.customer_name || "—"}${r.game ? " · " + r.game : ""}</p>
            <p class="mono text-xs mt-1 ${overdue ? "text-[#ff6875]" : "text-amber-300"}">${timeRemainingText(r)}</p>`;
        } else if (status.nextBooking) {
          bodyHtml = `<p class="text-xs text-slate-400 mt-2">Available now</p><p class="text-xs text-slate-500 mt-1">Next: ${status.nextBooking.customer_name} at ${fmtDateTime(status.nextBooking.start_time)}</p>`;
        } else {
          bodyHtml = `<p class="text-xs text-slate-400 mt-2">Available now</p>`;
        }
        return `
        <article class="rounded-xl border p-4 ${status.state === "occupied" ? "border-[#ff6875]/40 bg-[#241419]" : "border-[#d8ff45]/30 bg-[#15201a]"}">
          <div class="flex items-center justify-between gap-2">
            <p class="font-semibold truncate">${station.name}</p>
            <span class="rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${status.state === "occupied" ? "status-cancelled" : "status-active"}">${status.state === "occupied" ? "Occupied" : "Available"}</span>
          </div>
          <p class="text-xs text-slate-500 mono mt-0.5">${station.type || ""}</p>
          ${bodyHtml}
        </article>`;
      })
      .join("");
  }

  function renderStationManageList() {
    const list = document.getElementById("station-manage-list");
    if (!list) return;
    list.innerHTML = "";
    stations.forEach((station) => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-[#111722] px-3 py-2 text-sm";
      row.innerHTML = `
        <div class="min-w-0">
          <span class="truncate">${station.name}</span>
          <span class="text-xs text-slate-500 mono ml-1">${station.type || ""}</span>
          ${!station.active ? '<span class="text-xs text-[#ff6875] ml-2">Inactive</span>' : ""}
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button type="button" class="st-toggle rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-300">${station.active ? "Deactivate" : "Activate"}</button>
          <button type="button" class="st-delete rounded-lg border border-slate-600 px-2 py-1 text-xs text-[#ff6875]">Delete</button>
        </div>`;
      row.querySelector(".st-toggle").addEventListener("click", async () => {
        const { error } = await window.sb.from("stations").update({ active: !station.active }).eq("id", station.id);
        if (error) showToast("Could not update this station.");
      });
      row.querySelector(".st-delete").addEventListener("click", async () => {
        const { error } = await window.sb.from("stations").delete().eq("id", station.id);
        if (error) showToast("Could not delete this station.");
      });
      list.appendChild(row);
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
    renderWaitingList();

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

  async function fetchWaitingList() {
    const { data, error } = await window.sb.from("waiting_list").select("*").eq("status", "Waiting").order("created_at", { ascending: true });
    if (error) return;
    waitingList = data || [];
    renderWaitingList();
  }

  async function fetchStations() {
    const { data, error } = await window.sb.from("stations").select("*").order("name", { ascending: true });
    if (error) return;
    stations = data || [];
    renderStationDatalist();
    renderStationsBoard();
    if (currentStaff && currentStaff.role === "admin") renderStationManageList();
  }

  function setConnectionStatus(ok, label) {
    document.getElementById("connection-dot").style.background = ok ? "#d8ff45" : "#ff6875";
    document.getElementById("connection-label").textContent = label;
  }

  async function loadAll() {
    await Promise.all([fetchSessions(), fetchMenu(), fetchSettings(), fetchStaff(), fetchWaitingList(), fetchStations()]);
  }

  function subscribeRealtime() {
    realtimeChannel = window.sb
      .channel("chillpill-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, fetchSessions)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, fetchMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetchSettings)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, fetchStaff)
      .on("postgres_changes", { event: "*", schema: "public", table: "waiting_list" }, fetchWaitingList)
      .on("postgres_changes", { event: "*", schema: "public", table: "stations" }, fetchStations)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus(true, "Live");
      });
  }

  // ---------- bootstrap ----------
  function bootstrap() {
    applyRoleVisibility();
    initSidebar();
    initCheckoutModal();
    initEditModal();
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
    document.getElementById("add-food-row").addEventListener("click", () => addFrRow("food-order-list"));

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
      const foodItems = collectFrItems("food-order-list");
      const startIso = start ? new Date(start).toISOString() : status !== "Booked" ? new Date().toISOString() : null;
      const endIso = startIso ? new Date(new Date(startIso).getTime() + duration * 60000).toISOString() : null;

      const { error } = await window.sb.from("sessions").insert({
        type: status === "Booked" ? "Booked" : "Walk-in",
        station_name: station,
        game: document.getElementById("game-name").value.trim(),
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
        if (pendingWaitingId) {
          const waitingId = pendingWaitingId;
          pendingWaitingId = null;
          await window.sb.from("waiting_list").update({ status: "Seated" }).eq("id", waitingId);
        }
        event.target.reset();
        document.getElementById("duration-minutes").value = 60;
        document.getElementById("rate").value = document.getElementById("admin-rate").value;
        document.getElementById("start-time").value = localDateTimeValue(new Date());
        clearFrContainer("food-order-list");
        addFrRow("food-order-list");
        calculateAmount();
        showMessage("Session saved.", false);
        showToast("New session saved.");
      } else {
        showMessage("Could not save this record: " + error.message, true);
      }
    });

    document.getElementById("waiting-add-food-row").addEventListener("click", () => addFrRow("waiting-food-rows"));
    document.getElementById("waiting-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("waiting-name").value.trim();
      const phone = document.getElementById("waiting-phone").value.trim();
      const msgEl = document.getElementById("waiting-form-message");
      if (!name || !phone) {
        msgEl.textContent = "Name and phone are required.";
        msgEl.className = "text-sm min-h-5 text-red-300";
        return;
      }
      if (!sdkReady) { msgEl.textContent = "Supabase isn't connected yet."; msgEl.className = "text-sm min-h-5 text-red-300"; return; }
      const { error } = await window.sb.from("waiting_list").insert({
        customer_name: name,
        customer_phone: phone,
        food_items: collectFrItems("waiting-food-rows"),
        food_total: frTotal("waiting-food-rows"),
        notes: document.getElementById("waiting-notes").value.trim(),
        status: "Waiting",
        staff_id: currentStaff ? currentStaff.id : null,
        staff_name: currentStaff ? currentStaff.name : null
      });
      if (error) {
        msgEl.textContent = "Could not add to waiting list: " + error.message;
        msgEl.className = "text-sm min-h-5 text-red-300";
      } else {
        event.target.reset();
        clearFrContainer("waiting-food-rows");
        addFrRow("waiting-food-rows");
        recalcWaitingForm();
        msgEl.textContent = `${name} added to the waiting list.`;
        msgEl.className = "text-sm min-h-5 text-[#d8ff45]";
        showToast(`${name} added to the waiting list.`);
      }
    });

    document.getElementById("station-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = document.getElementById("station-form-name").value.trim();
      const type = document.getElementById("station-form-type").value.trim() || "PS5";
      if (!name) return;
      if (!sdkReady) return showToast("Supabase isn't connected yet.");
      const { error } = await window.sb.from("stations").insert({ name, type, active: true });
      if (error) showToast(error.message.includes("duplicate") ? "A station with that name already exists." : "Could not add station.");
      else {
        event.target.reset();
        document.getElementById("station-form-type").value = "PS5";
        showToast("Station added.");
      }
    });

    initWaitingEditModal();

    // initial state
    document.getElementById("start-time").value = localDateTimeValue(new Date());
    registerFoodContainer("food-order-list", calculateAmount);
    registerFoodContainer("edit-food-rows", recalcEditModal);
    registerFoodContainer("waiting-food-rows", recalcWaitingForm);
    registerFoodContainer("waiting-edit-food-rows", recalcWaitingEditModal);
    addFrRow("food-order-list");
    addFrRow("waiting-food-rows");
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
