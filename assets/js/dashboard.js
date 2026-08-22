/**
 * PlayBox Gaming Cafe — Owner console logic.
 * Talks to Supabase directly from the browser using the anon key.
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const ALERT_MS = (CFG.ALERT_MINUTES_BEFORE_END || 5) * 60 * 1000;

  let menuItems = [];
  let records = [];
  let sdkReady = false;
  let realtimeChannel = null;
  const overdueToasted = new Set(); // session ids we've already toasted "time's up" for

  // ---------- helpers ----------
  const inr = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

  const localDateTimeValue = (date) =>
    new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  const fmtDateTime = (iso) =>
    iso ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";

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
      try { new Notification(title, { body, icon: undefined }); } catch (e) {}
    }
  }

  // ---------- lock screen ----------
  function initLockScreen() {
    const lockScreen = document.getElementById("lock-screen");
    const appRoot = document.getElementById("app-root");
    const form = document.getElementById("lock-form");
    const input = document.getElementById("lock-password");
    const error = document.getElementById("lock-error");
    const warning = document.getElementById("lock-config-warning");

    if (!CFG.DASHBOARD_PASSWORD || CFG.DASHBOARD_PASSWORD.startsWith("PLACEHOLDER")) {
      warning.classList.remove("hidden");
    }

    function unlock() {
      lockScreen.remove();
      appRoot.classList.remove("hidden");
      bootstrap();
    }

    if (sessionStorage.getItem("playbox_unlocked") === "1") {
      unlock();
      return;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value === CFG.DASHBOARD_PASSWORD) {
        sessionStorage.setItem("playbox_unlocked", "1");
        unlock();
      } else {
        error.textContent = "Incorrect password.";
        input.value = "";
        input.focus();
      }
    });

    lucide.createIcons();
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

  // ---------- records / sessions ----------
  function updateSummary() {
    const activeSessions = records.filter((r) => r.status === "Active");
    const endingSoon = activeSessions.filter((r) => r.end_time && new Date(r.end_time) - new Date() > 0 && new Date(r.end_time) - new Date() <= ALERT_MS);
    document.getElementById("active-count").textContent = activeSessions.length;
    document.getElementById("ending-soon-count").textContent = endingSoon.length;
    document.getElementById("completed-count").textContent = records.filter((r) => r.status === "Completed").length;
    document.getElementById("food-count").textContent = records.filter((r) => r.food_items && r.food_items.length).length;
    document.getElementById("sales-total").textContent = inr(records.reduce((sum, r) => sum + (Number(r.amount) || 0), 0));
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

    card.querySelector(".mark-complete").addEventListener("click", async () => {
      const item = records.find((row) => row.id === card.dataset.recordId);
      if (!item) return;
      const { error } = await window.sb.from("sessions").update({ status: "Completed" }).eq("id", item.id);
      if (error) showToast("Could not update this record.");
      else { overdueToasted.delete(item.id); showToast("Session marked complete."); }
    });

    return card;
  }

  function renderRecords() {
    const sorted = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const list = document.getElementById("records-list");
    const existing = new Map([...list.children].map((card) => [card.dataset.recordId, card]));
    sorted.forEach((record) => {
      const card = existing.get(record.id);
      if (card) { updateCard(card, record); existing.delete(record.id); }
      else list.appendChild(createCard(record));
    });
    existing.forEach((card) => card.remove());
    document.getElementById("empty-records").classList.toggle("hidden", records.length > 0);
    updateSummary();
    renderBookings();
  }

  // ---------- time-based alerts (runs every tick, independent of re-renders) ----------
  function checkTimeAlerts() {
    // re-render countdowns on active cards without a full refetch
    document.querySelectorAll("#records-list article").forEach((card) => {
      const record = records.find((r) => r.id === card.dataset.recordId);
      if (record) updateCard(card, record);
    });

    records
      .filter((r) => r.status === "Active" && r.end_time)
      .forEach(async (record) => {
        const diffMs = new Date(record.end_time) - new Date();
        if (diffMs > 0 && diffMs <= ALERT_MS && !record.notified_5min) {
          notifyOwner("Session ending soon", `${record.customer_name} at ${record.station_name} ends in ${Math.round(diffMs / 60000)} min.`);
          record.notified_5min = true; // optimistic, avoid re-firing before DB round-trip
          const card = document.querySelector(`#records-list article[data-record-id="${record.id}"]`);
          if (card) { card.classList.add("flash-alert"); setTimeout(() => card.classList.remove("flash-alert"), 3800); }
          await window.sb.from("sessions").update({ notified_5min: true }).eq("id", record.id);
        }
        if (diffMs <= 0 && !overdueToasted.has(record.id)) {
          overdueToasted.add(record.id);
          notifyOwner("Time's up!", `${record.customer_name}'s session at ${record.station_name} has ended.`);
        }
      });

    updateSummary();
  }

  // ---------- supabase data loading ----------
  async function fetchSessions() {
    const { data, error } = await window.sb.from("sessions").select("*").order("created_at", { ascending: false });
    if (error) { showMessage("Could not load records: " + error.message, true); return; }
    records = data || [];
    renderRecords();
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
  }

  function setConnectionStatus(ok, label) {
    document.getElementById("connection-dot").style.background = ok ? "#d8ff45" : "#ff6875";
    document.getElementById("connection-label").textContent = label;
  }

  async function loadAll() {
    await Promise.all([fetchSessions(), fetchMenu(), fetchSettings()]);
  }

  function subscribeRealtime() {
    realtimeChannel = window.sb
      .channel("playbox-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "sessions" }, fetchSessions)
      .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, fetchMenu)
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, fetchSettings)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnectionStatus(true, "Live");
      });
  }

  // ---------- bootstrap ----------
  function bootstrap() {
    document.getElementById("header-title").textContent = (CFG.CAFE_NAME || "PlayBox Gaming Cafe").toUpperCase();

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
      if (sdkReady) {
        const { error } = await window.sb.from("settings").update({ default_rate: rate, updated_at: new Date().toISOString() }).eq("id", 1);
        if (error) showToast("Rate updated locally, but could not save to Supabase.");
        else showToast("Default hourly rate saved.");
      } else showToast("Rate applied to this entry (Supabase not connected).");
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

    document.getElementById("end-time").addEventListener("change", () => {
      const start = document.getElementById("start-time").value, end = document.getElementById("end-time").value;
      if (start && end) {
        const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
        if (minutes >= 0) document.getElementById("duration-minutes").value = minutes;
      }
      calculateAmount();
    });
    ["duration-minutes", "rate"].forEach((id) => document.getElementById(id).addEventListener("input", calculateAmount));

    document.querySelectorAll(".nav-tab").forEach((button) =>
      button.addEventListener("click", () => {
        document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
        document.getElementById(button.dataset.target).scrollIntoView({ behavior: "smooth", block: "start" });
      })
    );

    document.getElementById("session-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!sdkReady) return showMessage("Supabase isn't connected. Edit assets/js/config.js with your project URL and anon key, then reload.", true);

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
        notified_5min: false
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
        showMessage("Record saved.", false);
        showToast("New lounge record saved.");
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

  document.addEventListener("DOMContentLoaded", initLockScreen);
})();
