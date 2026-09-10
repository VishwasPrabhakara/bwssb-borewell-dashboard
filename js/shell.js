/* ============================================================================
   BBMP Borewell Dashboard - Shell wiring (redesign 2026-09-10)
   Wires the new HTML shell (topbar / left rail / right drawer / selected chip)
   onto the existing state and event pipeline WITHOUT touching data logic.
   All feature code (qc.js, charts.js, api.js, utils.js) keeps working because
   every DOM id it reads/writes is preserved.
   ============================================================================ */
(function () {
  'use strict';

  const app         = document.getElementById('app');
  const railToggle  = document.getElementById('toggleLeft');
  const railIcons   = document.querySelectorAll('.rail-icon');
  const railTabs    = document.querySelectorAll('[data-rail-panel]');
  const railBackdrop= document.getElementById('railBackdrop');

  const drawer      = document.getElementById('rightDrawer');
  const drawerClose = document.getElementById('closeDetails');
  const drawerScrim = document.getElementById('drawerScrim');
  const clearBtn    = document.getElementById('clearSelection');

  const detailTitle   = document.getElementById('detailTitle');
  const selectedChip  = document.getElementById('selectedChip');
  const selectedName  = document.getElementById('selectedChipName');
  const selectedClose = document.getElementById('selectedChipClose');

  const PLACEHOLDER_TITLES = new Set([
    'Select a borewell',
    'Select a borewell or ward',
    '',
    '—', '-',
  ]);

  /* ---- Left rail (icon strip + expandable panel) ------------------------- */
  function openRail(tabId) {
    app.setAttribute('data-left-open', 'true');
    railToggle && railToggle.setAttribute('aria-expanded', 'true');
    railIcons.forEach(b => b.classList.toggle('active', b.dataset.railTab === tabId));
    railTabs.forEach(t => t.hidden = t.dataset.railPanel !== tabId);
    if (window.innerWidth <= 960 && railBackdrop) railBackdrop.hidden = false;
  }
  function closeRail() {
    app.setAttribute('data-left-open', 'false');
    railToggle && railToggle.setAttribute('aria-expanded', 'false');
    railIcons.forEach(b => b.classList.remove('active'));
    if (railBackdrop) railBackdrop.hidden = true;
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
      } else {
        openRail(tab);
      }
    });
  });
  if (railBackdrop) railBackdrop.addEventListener('click', closeRail);

  /* ---- Right drawer (opens on selection, closes on Esc / X / scrim) ----- */
  function openDrawer() {
    app.setAttribute('data-right-open', 'true');
    if (window.innerWidth <= 960 && drawerScrim) drawerScrim.hidden = false;
  }
  function closeDrawer() {
    app.setAttribute('data-right-open', 'false');
    if (drawerScrim) drawerScrim.hidden = true;
    if (clearBtn && !clearBtn.disabled) clearBtn.click();
    hideSelectedChip();
  }
  if (drawerClose) drawerClose.addEventListener('click', closeDrawer);
  if (drawerScrim) drawerScrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (app.getAttribute('data-right-open') === 'true') closeDrawer();
      else if (app.getAttribute('data-left-open') === 'true') closeRail();
    }
  });

  /* ---- Selected-ward chip (stable, non-cursor-following) --------------- */
  function showSelectedChip(name) {
    if (!selectedChip || !selectedName) return;
    selectedName.textContent = name || 'Selected';
    selectedChip.hidden = false;
  }
  function hideSelectedChip() {
    if (selectedChip) selectedChip.hidden = true;
  }
  if (selectedClose) {
    selectedClose.addEventListener('click', () => {
      if (clearBtn && !clearBtn.disabled) clearBtn.click();
      hideSelectedChip();
      closeDrawer();
    });
  }

  /* ---- Selection observer ----------------------------------------------
     The existing pipeline writes into #detailTitle when a ward or borewell
     is chosen. We watch that node: when it moves off the placeholder, we
     open the drawer and update the chip; when it goes back, we close.
     ---------------------------------------------------------------------- */
  if (detailTitle) {
    const applyFromTitle = () => {
      const t = (detailTitle.textContent || '').trim();
      if (PLACEHOLDER_TITLES.has(t)) {
        // Selection cleared
        if (app.getAttribute('data-right-open') === 'true') {
          app.setAttribute('data-right-open', 'false');
        }
        hideSelectedChip();
      } else {
        openDrawer();
        showSelectedChip(t);
      }
    };
    const mo = new MutationObserver(applyFromTitle);
    mo.observe(detailTitle, { childList: true, characterData: true, subtree: true });
    // Initial pass in case something is already selected
    applyFromTitle();
  }

  /* ---- Auto-open filters rail on first load, on desktop only ----------- */
  if (window.innerWidth > 960) {
    openRail('filters');
    // But keep the map center of attention: leave it open only briefly-
    // no auto-collapse; the user can close via the same button.
  }

  /* ---- Keep the Leaflet map sized when panels open/close --------------- */
  const map = window.map;
  if (map && typeof map.invalidateSize === 'function') {
    const ro = new ResizeObserver(() => map.invalidateSize());
    const stage = document.querySelector('.stage');
    if (stage) ro.observe(stage);
  }

  /* ---- Sensor list clicks should also open the drawer ------------------
     The list is populated by utils.js/app.js and each row calls into the
     selection pipeline that writes #detailTitle, so the observer above
     already handles this. Nothing further needed.
     ---------------------------------------------------------------------- */

  /* ---- Quality-of-life: pressing "/" focuses search ------------------- */
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      const search = document.getElementById('search');
      if (search) { e.preventDefault(); search.focus(); }
    }
  });

})();
