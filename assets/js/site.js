/**
 * ChillPill Gaming Cafe — public website logic.
 * Fills in cafe info from config.js, wires up WhatsApp links, and pulls a
 * read-only, live menu list from Supabase (falls back to a friendly message
 * if Supabase isn't configured yet).
 */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};

  const inr = (value) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

  function whatsappUrl(message) {
    const number = (CFG.WHATSAPP_NUMBER || "").replace(/[^\d]/g, "");
    const text = encodeURIComponent(message || CFG.WHATSAPP_DEFAULT_MESSAGE || "Hi! I'd like to book a PlayStation slot.");
    if (!number || CFG.WHATSAPP_NUMBER.startsWith("PLACEHOLDER")) {
      return null;
    }
    return `https://wa.me/${number}?text=${text}`;
  }

  function wireWhatsappLinks() {
    const url = whatsappUrl();
    const ids = ["nav-whatsapp", "nav-whatsapp-mobile", "hero-whatsapp", "pricing-whatsapp", "contact-whatsapp", "fab-whatsapp"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (url) {
        el.href = url;
      } else {
        el.removeAttribute("target");
        el.href = "#contact";
        el.title = "WhatsApp number not set up yet — see the Contact section.";
      }
    });
  }

  function fillCafeInfo() {
    document.title = `${CFG.CAFE_NAME || "ChillPill Gaming Cafe"} — ${CFG.CAFE_LOCATION || ""}`;
    const set = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
    set("hero-tagline", CFG.CAFE_TAGLINE);
    set("hero-location", "📍 " + (CFG.CAFE_LOCATION || ""));
    set("hero-hours", CFG.OPENING_HOURS);
    set("contact-address", CFG.CAFE_ADDRESS_LINE);
    set("contact-hours", CFG.OPENING_HOURS);
    set("footer-cafe-name", CFG.CAFE_NAME);
    document.getElementById("footer-year").textContent = new Date().getFullYear();
  }

  function wireMobileMenu() {
    const button = document.getElementById("mobile-menu-button");
    const menu = document.getElementById("mobile-menu");
    if (!button || !menu) return;
    button.addEventListener("click", () => {
      const isHidden = menu.classList.toggle("hidden");
      button.setAttribute("aria-expanded", String(!isHidden));
    });
    menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => menu.classList.add("hidden")));
  }

  async function loadMenu() {
    const grid = document.getElementById("menu-grid");
    const fallback = document.getElementById("menu-fallback");
    if (!window.SUPABASE_CONFIGURED) {
      fallback.classList.remove("hidden");
      return;
    }
    const { data, error } = await window.sb.from("menu_items").select("*").order("category", { ascending: true }).order("name", { ascending: true });
    if (error || !data || !data.length) {
      fallback.classList.remove("hidden");
      return;
    }
    fallback.classList.add("hidden");
    grid.innerHTML = data
      .map(
        (item) => `
      <div class="panel rounded-xl p-4 flex items-center justify-between gap-3">
        <span class="font-medium">${item.name}</span>
        <span class="mono text-[#d8ff45] font-bold">${inr(item.price)}</span>
      </div>`
      )
      .join("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    fillCafeInfo();
    wireWhatsappLinks();
    wireMobileMenu();
    loadMenu();
    lucide.createIcons();
  });
})();
