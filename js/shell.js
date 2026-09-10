/* ============================================================================
   BBMP Borewell Dashboard - Shell wiring (redesign 2026-09-10 rev 2)
   ============================================================================ */
(function () {
  'use strict';

  const app         = document.getElementById('app');
  const railToggle  = document.getElementById('toggleLeft');
  const railIcons   = document.querySelectorAll('.rail-icon');
  const railTabs    = document.querySelectorAll('[data-rail-panel]');

  const drawer      = document.getElementById('rightDrawer');
  const drawerClose = document.getElementById('closeDetails');
  const clearBtn    = document.getElementById('clearSelection');

  const detailTitle   = document.getElementById('detailTitle');
  const selectedChip  = document.getElementById('selectedChip');
  const selectedName  = document.getElementById('selectedChipName');
  const selectedClose = document.getElementById('selectedChipClose');

  const deviceToggle  = document.getElementById('deviceToggle');

  const PLACEHOLDER_TITLES = new Set([
    'Select a borewell',
    'Select a borewell or ward',
    'Select a borewell to view details',
    '', '—', '-', '–'
  ]);

  /* ---- Left rail ----------------------------------------------------- */
  function openRail(tabId) {
    app.setAttribute('data-left-open', 'true');
    railToggle && railToggle.setAttribute('aria-expanded', 'true');
    railIcons.forEach(b => b.classList.toggle('active', b.dataset.railTab === tabId));
    railTabs.forEach(t => t.hidden = t.dataset.railPanel !== tabId);
  }
  function closeRail() {
    app.setAttribute('data-left-open', 'false');
    railToggle && railToggle.setAttribute('aria-expanded', 'false');
    railIcons.forEach(b => b.classList.remove('active'));
  }
  function activeRailTab() {
    const active = document.querySelector('.rail-icon.active');
    return active ? active.dataset.railTab : 'filters';
  }
  if (railToggle) {
    railToggle.addEventListener('click', () => {
      if (app.getAttribute('data-left-open') === 'true') closeRail();
      else openRail(activeRailTab() || 'filters');
    });
  }
  railIcons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.railTab;
      if (app.getAttribute('data-left-open') === 'true' && btn.classList.contains('active')) {
        closeRail();
      } else openRail(tab);
    });
  });

  /* ---- Right drawer -------------------------------------------------- */
  function openDrawer() {
    app.setAttribute('data-right-open', 'true');
    if (window.map && typeof window.map.invalidateSize === 'function') {
      setTimeout(() => window.map.invalidateSize(), 260);
    }
  }
  function closeDrawer() {
    app.setAttribute('data-right-open', 'false');
    if (clearBtn && !clearBtn.disabled) clearBtn.click();
    hideSelectedChip();
    if (window.map && typeof window.map.invalidateSize === 'function') {
      setTimeout(() => window.map.invalidateSize(), 260);
    }
  }
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (app.getAttribute('data-right-open') === 'true') closeDrawer();
      else if (app.getAttribute('data-left-open') === 'true') closeRail();
    }
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      const search = document.getElementById('search');
      if (search) { e.preventDefault(); search.focus(); }
    }
  });

  /* ---- Selected-ward chip ------------------------------------------- */
  function showSelectedChip(name) {
    if (!selectedChip || !selectedName) return;
    if (!name || PLACEHOLDER_TITLES.has(name.trim())) { hideSelectedChip(); return; }
    selectedName.textContent = name;
    selectedChip.hidden = false;
  }
  function hideSelectedChip() {
    if (selectedChip) selectedChip.hidden = true;
  }
  hideSelectedChip(); // enforce on load
  if (selectedClose) {
    selectedClose.addEventListener('click', () => {
      if (clearBtn && !clearBtn.disabled) clearBtn.click();
      closeDrawer();
    });
  }

  /* ---- Detail-title observer: open drawer when a real title is set --- */
  if (detailTitle) {
    const applyFromTitle = () => {
      const t = (detailTitle.textContent || '').trim();
      if (PLACEHOLDER_TITLES.has(t)) {
        if (app.getAttribute('data-right-open') === 'true') {
          app.setAttribute('data-right-open', 'false');
        }
        hideSelectedChip();
      } else {
        openDrawer();
        showSelectedChip(t);
      }
    };
    new MutationObserver(applyFromTitle).observe(detailTitle, {
      childList: true, characterData: true, subtree: true
    });
    applyFromTitle();
  }

  /* ---- Device visibility toggle (579-only vs all) -------------------- */
  if (deviceToggle) {
    deviceToggle.addEventListener('click', (e) => {
      const btn = e.target.closest('.device-toggle-btn');
      if (!btn) return;
      const mode = btn.dataset.deviceMode;
      deviceToggle.querySelectorAll('.device-toggle-btn').forEach(b =>
        b.classList.toggle('active', b === btn)
      );
      // Update the global flag from state.js and re-render sensors
      try { window.showAllDevices = (mode === 'all'); } catch (_) {}
      if (typeof showAllDevices !== 'undefined') {
        // eslint-disable-next-line no-global-assign
        showAllDevices = (mode === 'all');
      }
      if (typeof renderSensors === 'function') renderSensors();
    });
  }

  /* ---- Failsafe auto-load: if no markers after 6s, click Reload data - */
  const refreshBtn = document.getElementById('refreshData');
  const loadHint = document.createElement('div');
  loadHint.className = 'map-loading-hint';
  loadHint.textContent = 'Loading sensors…';
  const stage = document.querySelector('.stage');
  if (stage) stage.appendChild(loadHint);
  let sensorsReady = false;
  const checkReady = () => {
    if (typeof sensors !== 'undefined' && Array.isArray(sensors) && sensors.length) {
      sensorsReady = true;
      if (loadHint.parentNode) loadHint.remove();
      return true;
    }
    return false;
  };
  // Poll for 20s; if never ready, click Reload data once
  let ticks = 0;
  const iv = setInterval(() => {
    ticks++;
    if (checkReady()) { clearInterval(iv); return; }
    if (ticks === 6 && refreshBtn && !refreshBtn.disabled) {
      refreshBtn.click(); // safety net
    }
    if (ticks > 40) { clearInterval(iv); if (loadHint.parentNode) loadHint.remove(); }
  }, 500);

  /* ---- Keep the map sized when drawers open/close -------------------- */
  if (window.map && typeof window.map.invalidateSize === 'function' && stage) {
    new ResizeObserver(() => window.map.invalidateSize()).observe(stage);
  }

  /* ---- Auto-open filters rail on desktop first load ------------------ */
  if (window.innerWidth > 960) openRail('filters');

})();
