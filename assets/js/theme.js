/**
 * ChillPill Gaming Cafe — Theme Manager
 * Handles dark/light theme toggling with localStorage persistence.
 * Buttons: add data-theme-toggle attribute to any button to make it a toggle.
 * Structure inside button: .theme-icon-sun, .theme-icon-moon, .theme-label (all optional)
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'chillpill-theme';
  var DARK = 'dark';
  var LIGHT = 'light';

  function getPreferred() {
    var stored = localStorage.getItem(STORAGE_KEY);
    if (stored === DARK || stored === LIGHT) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? LIGHT : DARK;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    updateButtons(theme);
  }

  function updateButtons(theme) {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var sun = btn.querySelector('.theme-icon-sun');
      var moon = btn.querySelector('.theme-icon-moon');
      var label = btn.querySelector('.theme-label');
      if (theme === LIGHT) {
        if (sun) sun.style.display = 'none';
        if (moon) moon.style.display = 'block';
        if (label) label.textContent = 'Dark';
        btn.setAttribute('title', 'Switch to dark mode');
        btn.setAttribute('aria-label', 'Switch to dark mode');
      } else {
        if (sun) sun.style.display = 'block';
        if (moon) moon.style.display = 'none';
        if (label) label.textContent = 'Light';
        btn.setAttribute('title', 'Switch to light mode');
        btn.setAttribute('aria-label', 'Switch to light mode');
      }
    }
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || DARK;
    applyTheme(current === DARK ? LIGHT : DARK);
  }

  function initTheme() {
    applyTheme(getPreferred());
    document.addEventListener('DOMContentLoaded', function () {
      applyTheme(getPreferred());
      var btns = document.querySelectorAll('[data-theme-toggle]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', toggleTheme);
      }
    });
  }

  window.ChillTheme = { init: initTheme, toggle: toggleTheme, apply: applyTheme };

  // Apply immediately to avoid flash of wrong theme
  applyTheme(getPreferred());
})();
