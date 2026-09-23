/*!
 * DSH Launcher — shared window-controls overlay + DSH integration CSS.
 * Runs as a Tauri initialization script in EVERY document (splash + DSH page),
 * before first paint. Idempotent via element-id guards.
 */
(function () {
  'use strict';
  if (window.__dshLauncherInit) return;
  window.__dshLauncherInit = true;

  var STYLE_ID = 'dsh-launcher-inject';
  var STRIP_ID = 'dsh-launcher-dragstrip';
  var CONTROLS_ID = 'dsh-launcher-controls';

  var CSS = [
    '/* ===== DSH Launcher injection — window-controls clearance ===== */',
    ':root { --dsh-launcher-inset: 144px; }',

    '/* 6px full-width top drag strip (below the controls so buttons stay clickable). */',
    '#' + STRIP_ID + ' { position: fixed; top: 0; left: 0; right: 0; height: 6px; z-index: 998; }',

    '/* Token set: reference the host theme tokens (--dsw-alias-*) so glyph and',
    '   hover colors follow ANY DSH theme (default light/dark, Catppuccin, …).',
    '   The hardcoded values are only the splash-page fallback (no tokens there).',
    '   NOTE: no body[data-ds-dark-theme] override here — it would clobber the',
    '   synced tokens on DSH pages; the @media fallback only fires on the splash. */',
    '#' + CONTROLS_ID + ', #' + STRIP_ID + ' {',
    '  --dsh-ctl-glyph: var(--dsw-alias-label-secondary, #5C5F77);',
    '  --dsh-ctl-hover: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .05));',
    '  --dsh-ctl-active: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, .09));',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  #' + CONTROLS_ID + ', #' + STRIP_ID + ' {',
    '    --dsh-ctl-glyph: var(--dsw-alias-label-secondary, #9aa3af);',
    '    --dsh-ctl-hover: var(--dsw-alias-interactive-bg-hover, rgba(255, 255, 255, .06));',
    '    --dsh-ctl-active: var(--dsw-alias-interactive-bg-active, rgba(255, 255, 255, .11));',
    '  }',
    '}',

    '/* Windows-11-style caption buttons, flush to the exact top-right corner.',
    '   z-index 999: above all normal page content and the app shell (z ≤ 20),',
    '   but BELOW DSH modal overlays (z 1000) so open dialogs cover and dim the',
    '   buttons naturally — no listeners needed, the browser does the work. */',
    '#' + CONTROLS_ID + ' {',
    '  position: fixed; top: 0; right: 0; height: 38px;',
    '  display: flex; z-index: 999;',
    '  background: transparent;',
    '  user-select: none; -webkit-user-select: none;',
    '}',
    '#' + CONTROLS_ID + ' button {',
    '  position: relative; overflow: hidden;',
    '  width: 48px; height: 38px; padding: 0; border: 0; margin: 0; border-radius: 0;',
    '  display: flex; align-items: center; justify-content: center;',
    '  background: transparent; color: var(--dsh-ctl-glyph);',
    '  cursor: default; -webkit-user-drag: none;',
    '}',
    '/* On DSH pages the caption glyphs align to the host icon row (center y=25);',
    '   the splash keeps the native 38px-band center. */',
    'html.dsh-page #' + CONTROLS_ID + ' button { padding-top: 12px; }',
    '/* Hover/active feedback as a centered pill (28x28, r=28) — same shape and',
    '   token color as the host icon buttons; the 48x38 hit area is unchanged. */',
    '#' + CONTROLS_ID + ' button::before {',
    '  content: "";',
    '  position: absolute; left: 50%; top: 50%;',
    '  width: 28px; height: 28px; border-radius: 28px;',
    '  transform: translate(-50%, -50%);',
    '  background: transparent;',
    '  pointer-events: none;',
    '  transition: background-color 120ms linear;',
    '}',
    'html.dsh-page #' + CONTROLS_ID + ' button::before { top: 25px; }',
    '#' + CONTROLS_ID + ' button:hover::before { background: var(--dsh-ctl-hover); }',
    '#' + CONTROLS_ID + ' button:active::before { background: var(--dsh-ctl-active); }',
    '#' + CONTROLS_ID + ' button.close:hover { color: #fff; }',
    '#' + CONTROLS_ID + ' button.close:hover::before { background: #e81123; }',
    '#' + CONTROLS_ID + ' button.close:active::before { background: #c50f1f; }',
    '#' + CONTROLS_ID + ' button svg { width: 15px; height: 15px; display: block; pointer-events: none; }',

    '/* Maximize <-> restore glyph swap (toggled via .is-max). */',
    '#dsh-lc-max .glyph-restore { display: none; }',
    '#dsh-lc-max.is-max .glyph-max { display: none; }',
    '#dsh-lc-max.is-max .glyph-restore { display: block; }',

    '/* Unfocused window: dim the overlay like native captions. */',
    'html.dsh-launcher-unfocused #' + CONTROLS_ID + ' { opacity: .45; }',

    '/* DSH-page avoidance CSS lives in the adapter registry (see applyAdapter):',
    '   per-dsh-release "solutions" chosen by detected version + live DOM probe. */'
  ].join('\n');

  /* 16-grid glyphs at 1.3 rounded strokes — matches the weight/size of the
     host page's native 16-grid icons (rendered at 15px). */
  var GLYPH_MIN =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 8h7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  var GLYPH_MAX =
    '<svg class="glyph-max" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.9" y="3.9" width="8.2" height="8.2" rx="1.6" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
  var GLYPH_RESTORE =
    '<svg class="glyph-restore" viewBox="0 0 16 16" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="4.4" y="5.9" width="6.6" height="6.6" rx="1.4"/><path d="M6.4 3.9h4.2a2.1 2.1 0 0 1 2.1 2.1v4.2"/></g></svg>';
  var GLYPH_CLOSE =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.6 4.6l6.8 6.8M11.4 4.6l-6.8 6.8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

  function buildControls() {
    var box = document.createElement('div');
    box.id = CONTROLS_ID;
    // The attribute must sit on the exact mousedown target: it goes on the
    // container (empty space drags the window) and NEVER on the buttons.
    box.setAttribute('data-tauri-drag-region', '');
    box.setAttribute('aria-label', '窗口控制');

    function makeButton(id, className, title, glyphs) {
      var b = document.createElement('button');
      b.id = id;
      b.type = 'button';
      b.className = className;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.innerHTML = glyphs;
      return b;
    }

    box.appendChild(makeButton('dsh-lc-min', '', '最小化', GLYPH_MIN));
    box.appendChild(makeButton('dsh-lc-max', '', '最大化', GLYPH_MAX + GLYPH_RESTORE));
    box.appendChild(makeButton('dsh-lc-close', 'close', '关闭', GLYPH_CLOSE));
    return box;
  }

  var wired = false;

  function noop() {}

  function stampDshVersion() {
    var T = window.__TAURI__;
    if (!T || !T.core) return;
    T.core.invoke('get_dsh_version').then(function (v) {
      if (v) document.documentElement.dataset.dshLauncherDshVersion = v;
    }).catch(noop);
  }

  // Per-dsh-release adapter registry — one entry per known UI implementation
  // ("方案"). Selection: adapters whose match(version) is true are probed
  // against the live DOM first, then the rest; first probe hit wins and its
  // CSS is injected. If nothing fits after several rounds, flag it loudly
  // instead of letting the native icons drift under the window controls.
  // Add a new entry whenever a dsh release changes its UI internals.
  function cmpVersion(a, b) {
    var pa = String(a).split('-')[0].split('.'), pb = String(b).split('-')[0].split('.');
    for (var i = 0; i < 3; i++) {
      var x = parseInt(pa[i], 10) || 0, y = parseInt(pb[i], 10) || 0;
      if (x !== y) return x < y ? -1 : 1;
    }
    var preA = String(a).indexOf('-') !== -1, preB = String(b).indexOf('-') !== -1;
    if (preA !== preB) return preA ? -1 : 1; // 0.1.5-rc.3 < 0.1.5
    return 0;
  }

  var DSH_ADAPTERS = [
    {
      id: 'dsh-0.1.x',
      // generic: verified on 0.1.4 through 0.1.5-rc.3
      match: function () { return true; },
      probe: function () {
        return !!(document.querySelector('[data-dockkit-strip]') ||
                  document.querySelector('[data-slot="conversation.session.header"]'));
      },
      css: [
        '[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip],',
        '.P3OORG_panel [role="tablist"][data-dockkit-strip] {',
        '  padding-right: var(--dsh-launcher-inset);',
        '  box-sizing: border-box; height: 38px; align-items: center;',
        '}',
        '[data-slot="conversation.session.header"] > header > div:first-child,',
        '.wSkVaW_titleRow {',
        '  padding-right: var(--dsh-launcher-inset);',
        '  box-sizing: border-box;',
        '}',
      ],
    },
    // Example of a version-scoped entry (kept for reference):
    // {
    //   id: 'dsh-0.1.6-newui',
    //   match: function (v) { return cmpVersion(v, '0.1.6') >= 0; },
    //   probe: function () { return !!document.querySelector('<new anchor>'); },
    //   css: [ '...' ],
    // },
  ];

  var ADAPTER_STYLE_ID = 'dsh-launcher-adapter';
  var compatAttempts = 0;

  function scheduleAdapter() {
    if (compatAttempts >= 6) return;
    setTimeout(applyAdapter, compatAttempts === 0 ? 1200 : 4000);
  }

  function applyAdapter() {
    if (!document.documentElement.classList.contains('dsh-page')) return;
    var v = document.documentElement.dataset.dshLauncherDshVersion || '';
    var matched = DSH_ADAPTERS.filter(function (a) { return a.match(v); });
    var rest = DSH_ADAPTERS.filter(function (a) { return !a.match(v); });
    var chosen = null;
    for (var i = 0; i < matched.concat(rest).length; i++) {
      var a = matched.concat(rest)[i];
      var ok = false;
      try { ok = a.probe(); } catch (e) { ok = false; }
      if (ok) { chosen = a; break; }
    }
    if (chosen) {
      var style = document.getElementById(ADAPTER_STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = ADAPTER_STYLE_ID;
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = chosen.css.join('\n');
      document.documentElement.dataset.dshLauncherAdapter = chosen.id;
      delete document.documentElement.dataset.dshLauncherCompat;
      return;
    }
    if (++compatAttempts < 6) {
      scheduleAdapter();
      return;
    }
    document.documentElement.dataset.dshLauncherCompat = 'stale';
    console.warn('[dsh-launcher] no adapter matches this dsh build (' +
      (v || 'unknown version') + ') — window-control avoidance inactive.');
  }

  function wire() {
    if (wired) return;
    var T = window.__TAURI__;
    if (!T || !T.window || !T.event) return;
    var minBtn = document.getElementById('dsh-lc-min');
    var maxBtn = document.getElementById('dsh-lc-max');
    var closeBtn = document.getElementById('dsh-lc-close');
    if (!minBtn || !maxBtn || !closeBtn) return;
    wired = true;

    var win = T.window.getCurrentWindow();

    minBtn.addEventListener('click', function () { win.minimize().catch(noop); });
    maxBtn.addEventListener('click', function () { win.toggleMaximize().catch(noop); });
    closeBtn.addEventListener('click', function () { win.close().catch(noop); });

    // Unfocused-window dim (window blur/focus).
    win.onFocusChanged(function (ev) {
      document.documentElement.classList.toggle('dsh-launcher-unfocused', !ev.payload);
    });

    // Maximize glyph swap: poll isMaximized() on resize, debounced ~100ms.
    var timer = null;
    function refreshMaximized() {
      win.isMaximized().then(function (maximized) {
        maxBtn.classList.toggle('is-max', !!maximized);
        maxBtn.title = maximized ? '还原' : '最大化';
        maxBtn.setAttribute('aria-label', maxBtn.title);
      }).catch(noop);
    }
    win.onResized(function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refreshMaximized, 100);
    });
    refreshMaximized();
  }

  function inject() {
    // Remote (DSH) pages get glyph alignment with the host icon row; the local
    // splash keeps the native caption centering.
    if (location.hostname !== 'tauri.localhost' && location.protocol !== 'tauri:') {
      document.documentElement.classList.add('dsh-page');
    }
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      (document.head || document.documentElement).appendChild(style);
    }
    var host = document.body || document.documentElement;
    if (!document.getElementById(STRIP_ID)) {
      var strip = document.createElement('div');
      strip.id = STRIP_ID;
      strip.setAttribute('data-tauri-drag-region', '');
      host.appendChild(strip);
    }
    if (!document.getElementById(CONTROLS_ID)) {
      host.appendChild(buildControls());
    }
    wire();
    stampDshVersion();
    scheduleAdapter();
  }

  // The init script runs at document creation, before <html>/<body> exist —
  // touching the DOM there throws and would kill the retry wiring, so mount
  // only once the document is ready.
  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  try {
    ready(inject);
  } catch (e) {
    /* never block the host page */
  }
  window.addEventListener('pageshow', function () { try { inject(); } catch (e) {} });
})();
