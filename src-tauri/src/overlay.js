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
    '#' + STRIP_ID + ' { position: fixed; top: 0; left: 0; right: 0; height: 6px; z-index: 2147483645; }',

    '/* Token set: light default; dark when DSH marks its theme OR the OS is dark.',
    '   --dsh-ctl-glyph matches the muted tone of DSH native icons (#5C5F77 light). */',
    '#' + CONTROLS_ID + ', #' + STRIP_ID + ' {',
    '  --dsh-text: #141414;',
    '  --dsh-ctl-glyph: #5C5F77;',
    '  --dsh-ctl-hover: rgba(0, 0, 0, .05);',
    '  --dsh-ctl-active: rgba(0, 0, 0, .09);',
    '}',
    'body[data-ds-dark-theme] #' + CONTROLS_ID + ', body[data-ds-dark-theme] #' + STRIP_ID + ' {',
    '  --dsh-text: #e8e9ec;',
    '  --dsh-ctl-glyph: #9aa3af;',
    '  --dsh-ctl-hover: rgba(255, 255, 255, .06);',
    '  --dsh-ctl-active: rgba(255, 255, 255, .11);',
    '}',
    '@media (prefers-color-scheme: dark) {',
    '  #' + CONTROLS_ID + ', #' + STRIP_ID + ' {',
    '    --dsh-text: #e8e9ec;',
    '    --dsh-ctl-glyph: #9aa3af;',
    '    --dsh-ctl-hover: rgba(255, 255, 255, .06);',
    '    --dsh-ctl-active: rgba(255, 255, 255, .11);',
    '  }',
    '}',

    '/* Windows-11-style caption buttons, flush to the exact top-right corner. */',
    '#' + CONTROLS_ID + ' {',
    '  position: fixed; top: 0; right: 0; height: 38px;',
    '  display: flex; z-index: 2147483646;',
    '  background: transparent;',
    '  user-select: none; -webkit-user-select: none;',
    '}',
    '#' + CONTROLS_ID + ' button {',
    '  width: 48px; height: 38px; padding: 0; border: 0; margin: 0; border-radius: 0;',
    '  display: flex; align-items: center; justify-content: center;',
    '  background: transparent; color: var(--dsh-ctl-glyph);',
    '  cursor: default; -webkit-user-drag: none;',
    '  transition: background-color 120ms linear, color 120ms linear;',
    '}',
    '/* On DSH pages the caption glyphs align to the host icon row (center y=25);',
    '   the splash keeps the native 38px-band center. */',
    'html.dsh-page #' + CONTROLS_ID + ' button { padding-top: 12px; }',
    '#' + CONTROLS_ID + ' button:hover { background: var(--dsh-ctl-hover); }',
    '#' + CONTROLS_ID + ' button:active { background: var(--dsh-ctl-active); }',
    '#' + CONTROLS_ID + ' button.close:hover { background: #e81123; color: #fff; }',
    '#' + CONTROLS_ID + ' button.close:active { background: #c50f1f; color: #fff; }',
    '#' + CONTROLS_ID + ' button svg { width: 15px; height: 15px; display: block; pointer-events: none; }',

    '/* Maximize <-> restore glyph swap (toggled via .is-max). */',
    '#dsh-lc-max .glyph-restore { display: none; }',
    '#dsh-lc-max.is-max .glyph-max { display: none; }',
    '#dsh-lc-max.is-max .glyph-restore { display: block; }',

    '/* Unfocused window: dim the overlay like native captions. */',
    'html.dsh-launcher-unfocused #' + CONTROLS_ID + ' { opacity: .45; }',

    '/* Shift the DSH right-sidebar tab strip icons left, clear of the controls. */',
    '[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip],',
    '.P3OORG_panel [role="tablist"][data-dockkit-strip] {',
    '  padding-right: var(--dsh-launcher-inset);',
    '}',
    '[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip],',
    '.P3OORG_panel [role="tablist"][data-dockkit-strip] {',
    '  box-sizing: border-box;',
    '  height: 38px;',
    '  align-items: center;',
    '}',

    '/* Conversation view: the session header title row packs right-side actions',
    '   (open-in-explorer, open-with, more, open-right-sidebar) against the window',
    '   edge — under the controls. Shift the whole row clear of them. */',
    '[data-slot="conversation.session.header"] > header > div:first-child,',
    '.wSkVaW_titleRow {',
    '  padding-right: var(--dsh-launcher-inset);',
    '  box-sizing: border-box;',
    '}'
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
