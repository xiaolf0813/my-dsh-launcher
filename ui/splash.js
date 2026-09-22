/* DSH Launcher — splash page behavior: boot status, ready/error handling, retry. */
(function () {
  'use strict';

  var T = window.__TAURI__;
  if (!T || !T.event || !T.core) return;

  var STATUS_STARTING = '正在启动 dsh 服务…';
  var STATUS_OPENING = '正在打开界面…';
  var UNKNOWN_ERROR = '启动失败：发生未知错误。';
  var MIN_DWELL_MS = 600;   // minimum total splash dwell before fading out
  var CROSSFADE_MS = 200;   // status text crossfade
  // Navigation itself is performed by Rust (Webview::navigate, needed so dsh's
  // SameSite=Strict auth cookie survives the redirect). This side only animates:
  // fade out at MIN_DWELL_MS; Rust swaps the document at dwell+fade (950ms).

  var statusEl = document.getElementById('status-text');
  var loadingEl = document.getElementById('loading');
  var errEl = document.getElementById('err');
  var errDetailEl = document.getElementById('err-detail');
  var retryBtn = document.getElementById('btn-retry');
  var quitBtn = document.getElementById('btn-quit');

  var startedAt = Date.now();

  function setStatus(text) {
    if (!statusEl || statusEl.textContent === text) return;
    statusEl.classList.add('fade');
    setTimeout(function () {
      statusEl.textContent = text;
      statusEl.classList.remove('fade');
    }, CROSSFADE_MS);
  }

  function showError(message) {
    // Too late to show an error once the splash is fading out for navigation.
    if (document.documentElement.classList.contains('dsh-splash-out')) return;
    errDetailEl.textContent = message;
    loadingEl.hidden = true;
    errEl.hidden = false;
  }

  T.event.listen('dsh://ready', function () {
    setStatus(STATUS_OPENING);
    var wait = Math.max(0, MIN_DWELL_MS - (Date.now() - startedAt));
    setTimeout(function () {
      document.documentElement.classList.add('dsh-splash-out');
    }, wait);
  });

  T.event.listen('dsh://error', function (e) {
    showError((e.payload && e.payload.message) || UNKNOWN_ERROR);
  });

  retryBtn.addEventListener('click', function () {
    startedAt = Date.now();
    errEl.hidden = true;
    loadingEl.hidden = false;
    setStatus(STATUS_STARTING);
    T.core.invoke('start_dsh');
  });

  quitBtn.addEventListener('click', function () {
    T.core.invoke('quit_app');
  });
})();
