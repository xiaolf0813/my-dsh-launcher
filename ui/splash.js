/* DSH Launcher — splash page behavior: boot status, ready/error handling, retry. */
(function () {
  'use strict';

  /* Whale巡游 loading (Lottie): loops for as long as dsh boots; on ready the
     splash fades and Rust performs the navigation (SameSite-safe). Light/dark
     variants follow the OS scheme; falls back to the static whale if the
     bundled player fails to load. */
  var whaleAnim = null;

  function showWhaleFallback(host) {
    host.classList.add('is-fallback');
    host.innerHTML = '<img src="whale.svg" alt="">';
  }

  function initWhale() {
    var host = document.getElementById('whale-lottie');
    if (!host) return;
    if (!window.lottie) {
      showWhaleFallback(host);
      return;
    }
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var load = function () {
      fetch(mq.matches ? 'dsh-fish-loading-dark.json' : 'dsh-fish-loading.json')
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (whaleAnim) whaleAnim.destroy();
          whaleAnim = window.lottie.loadAnimation({
            container: host, renderer: 'svg', loop: true, autoplay: true,
            animationData: data,
          });
        })
        .catch(function () {
          showWhaleFallback(host);
        });
    };
    load();
    if (mq.addEventListener) mq.addEventListener('change', load);
  }
  initWhale();

  var T = window.__TAURI__;
  if (!T || !T.event || !T.core) return;

  // Bottom-right brand version, read from the Tauri app config.
  if (T.app && T.app.getVersion) {
    T.app.getVersion().then(function (v) {
      var el = document.getElementById('app-ver');
      if (el) el.textContent = 'v' + v;
    }).catch(function () {});
  }

  var STATUS_STARTING = '正在启动 dsh 服务…';
  var STATUS_OPENING = '正在打开界面…';
  var UNKNOWN_ERROR = '启动失败：发生未知错误。';
  var MIN_DWELL_MS = 600;   // minimum splash dwell before fading out
  var CROSSFADE_MS = 200;   // status text crossfade
  var FADE_OUT_MS = 280;    // splash fade before requesting navigation
  // Navigation is performed by Rust (Webview::navigate, needed so dsh's
  // SameSite=Strict auth cookie survives the redirect). This side fades the
  // splash after the minimum dwell, then invokes `navigate_now`.

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

  var splashFinishing = false;

  function finishSplash() {
    if (splashFinishing) return;
    splashFinishing = true;
    document.documentElement.classList.add('dsh-splash-out');
    setTimeout(function () { T.core.invoke('navigate_now').catch(function () {}); }, FADE_OUT_MS);
  }

  T.event.listen('dsh://ready', function (e) {
    setStatus(STATUS_OPENING);
    if (e.payload && e.payload.dshVersion) {
      var brand = document.querySelector('.corner-brand');
      if (brand) brand.title = 'dsh ' + e.payload.dshVersion;
    }
    var wait = Math.max(0, MIN_DWELL_MS - (Date.now() - startedAt));
    setTimeout(finishSplash, wait);
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
