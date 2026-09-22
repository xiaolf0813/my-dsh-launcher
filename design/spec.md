# DSH Launcher — Design Spec

Frameless Tauri 2 Windows shell around the DeepSeek Harness (DSH) web UI. Default window 1280 × 800 (`decorations: false`). The webview first shows a SPLASH document while `dsh web --no-open` boots a local server; once ready the same webview navigates to the DSH page. One shared window-controls overlay serves both documents.

Companion mockup: `design/mockup.html` (6 frames at true 1280 × 800: splash light loading, splash light error, splash dark loading, DSH light strip-open, DSH dark strip-open, DSH light sidebar-collapsed). A checkbox in the review page outlines drag/injected regions.

Design temperament: calm, commercial, Windows-native. No playfulness, no emoji icons — inline SVG glyphs only. System font stack everywhere: `"Segoe UI", "Microsoft YaHei UI", sans-serif`.

---

## 1. Color tokens

Expressed as CSS custom properties; map directly to whatever theming mechanism the app uses (the splash document and the injected stylesheet both consume them).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f6f7f9` | `#1a1d24` | window / splash background (matches DSH) |
| `--surface` | `#ffffff` | `#20242c` | cards, composer, right panel |
| `--surface-2` | `#f0f1f5` | `#161920` | left sidebar (slightly darker than bg in both modes) |
| `--text` | `#141414` | `#e8e9ec` | primary text, control glyphs |
| `--text-2` | `#6b6f76` | `#8b909a` | secondary text, strip icons at rest |
| `--accent` | `#4D6BFE` | `#4D6BFE` | whale logo on splash, progress bar, primary button, send button |
| `--accent-strong` | `#3d59e8` | `#3d59e8` | accent hover |
| `--line` | `rgba(20,20,20,.08)` | `rgba(255,255,255,.07)` | hairlines, progress track |
| `--line-strong` | `rgba(20,20,20,.16)` | `rgba(255,255,255,.15)` | ghost button border |
| `--ctl-hover` | `rgba(0,0,0,.05)` | `rgba(255,255,255,.06)` | caption-button hover, generic row hover |
| `--ctl-active` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.11)` | caption-button press |
| `--close-hover` | `#e81123` (glyph `#ffffff`) | same | close-button hover (fixed, not themed) |
| `--close-active` | `#c50f1f` | same | close-button press |
| `--err` | `#d93025` | `#ff6b63` | error icon |

Theme switch: splash uses `prefers-color-scheme`; the injected overlay uses the same media query so it tracks whatever DSH resolves to (DSH itself follows system). Never hardcode one mode.

## 2. Geometry & spacing

- Base unit 4px. Window default 1280 × 800; recommend `minWidth: 960, minHeight: 640` in Tauri config.
- Window corners are **straight** (decorations removed). Caption buttons are square-cornered, flush to the very top-right corner. (The mockup gives the review frame a 6px presentation radius only; the app has none.)
- Control strip height: **38px** — deliberately matches DSH's top tab strip so the two layers read as one chrome line.

| Element | Size | Notes |
|---|---|---|
| Caption button | 48 × 38 px | 3 buttons = **144px** total = `--dsh-launcher-inset` |
| Caption glyph | 10 × 10 px SVG, 1px stroke | Segoe Fluent style, `stroke: currentColor` |
| Top drag strip | full-width × **6px** | overlay-only, see §4 |
| Splash header drag zone | full-width-minus-inset × 44px | splash document only |
| DSH strip icon button | 28 × 28 px, radius 6, glyph 16px | gap 2px, strip padding `0 144px 0 8px` after injection |
| Splash logo | 76 × 76 px | whale SVG, `color: var(--accent)` |
| Splash title | 24px / 600 | "DeepSeek Harness" |
| Splash tagline | 11px / 600, letter-spacing .3em, uppercase | "DSH Launcher" |
| Splash status | 13px, `--text-2` | 20px tall reserved line (no layout shift) |
| Progress bar | 220 × 2px, radius 1 | track `--line`, moving segment `--accent` at 36% width |
| Splash buttons | height 32px, radius 6, padding 0 20px, gap 10px | primary accent / ghost bordered |

## 3. Shared window-controls overlay

One overlay component, injected identically into splash and DSH documents. Fixed to the top-right, above everything.

```html
<div id="dsh-launcher-controls" data-tauri-drag-region>
  <button id="dsh-lc-min"    title="最小化" aria-label="最小化"><svg …i-min…></button>
  <button id="dsh-lc-max"    title="最大化" aria-label="最大化"><svg …i-max…></button>
  <button id="dsh-lc-close"  title="关闭"   aria-label="关闭"><svg …i-close…></button>
</div>
```

```css
#dsh-launcher-controls {
  position: fixed; top: 0; right: 0; height: 38px;
  display: flex; z-index: 2147483646;
  user-select: none;
}
#dsh-launcher-controls button {
  width: 48px; height: 38px; padding: 0; border: 0;
  display: flex; align-items: center; justify-content: center;
  background: transparent; color: var(--dsh-text);
  cursor: default; -webkit-user-drag: none;
  transition: background-color 120ms linear, color 120ms linear;
}
#dsh-launcher-controls button:hover { background: var(--dsh-ctl-hover); }
#dsh-launcher-controls button:active { background: var(--dsh-ctl-active); }
#dsh-launcher-controls .close:hover { background: #e81123; color: #fff; }
#dsh-launcher-controls .close:active { background: #c50f1f; color: #fff; }
```

- Glyphs (viewBox `0 0 10 10`, `fill="none" stroke="currentColor" stroke-width="1"`):
  - minimize `M1 5h8`
  - maximize `<rect x="1.5" y="1.5" width="7" height="7"/>`
  - restore (window maximized state) `<rect x="1.5" y="3.5" width="5.5" height="5"/><path d="M3.5 3.5V1.5h5v5h-2"/>` — swap via Tauri maximize/restore events; tooltip swaps 最大化 ↔ 还原
  - close `M1.2 1.2l7.6 7.6 M8.8 1.2l-7.6 7.6`
- **Drag on empty overlay space:** the container carries `data-tauri-drag-region`; the buttons do not. Tauri's drag listener checks the exact mousedown target, so mousedown on a button = normal click, mousedown on any container gap = window drag. Keep the container transparent (DSH reserves its 38px strip beneath, so nothing scrolls under); if a future DSH layout lets content pass underneath, add `background: var(--dsh-bg)`.
- Hairline separators between buttons are optional (`box-shadow: inset 1px 0 0 var(--line)` on buttons 2–3); default OFF to match Windows 11 caption buttons.
- Unfocused window: dim the whole overlay (`opacity: .45`) and restore on focus, matching Windows caption behavior.
- Accessibility: keep `aria-label`s; buttons ≥ 48px wide exceed touch/hit minimums.

## 4. Drag regions — exact mechanics

Tauri 2's drag-region listener fires only when the **exact mousedown target** carries `data-tauri-drag-region` (it does not bubble from children). Therefore the attribute must sit on the element the pointer actually hits.

**Top drag strip (all documents, ≈6px, click-through by construction):**

```css
#dsh-launcher-dragstrip {
  position: fixed; top: 0; left: 0; right: 0; height: 6px;
  z-index: 2147483645;   /* BELOW the controls (…646) so control buttons stay clickable */
}
```

```html
<div id="dsh-launcher-dragstrip" data-tauri-drag-region></div>
```

Why this does not block clicks: the element is only 6px tall, so it covers nothing below y=6 — there is nothing to "pass through". The DSH strip's icon buttons are vertically centered in their 38px bar (≈5–33px), so the 6px overlap is dead padding. If a future layout puts a real hit-target inside the top 6px, switch to the hard pass-through wrapper:

```css
#dsh-launcher-dragwrap { position: fixed; inset: 0 0 auto 0; height: 6px;
  pointer-events: none; z-index: 2147483645; }   /* wrapper ignores all pointers */
#dsh-launcher-dragwrap > .strip { pointer-events: auto; height: 100%;
  width: 100%; }                                  /* only the strip itself catches */
```

**Splash header zone (splash document only):** `position: absolute; top: 0; left: 0; right: var(--dsh-launcher-inset); height: 44px; z-index: 2147483645;` with `data-tauri-drag-region` on that exact div — lets users grab anywhere along the splash top edge, excluding the controls area.

**Double-click** on any drag region toggles maximize; Tauri's drag-region implementation does this on Windows automatically. Optional to re-implement manually; prefer the built-in.

## 5. Z-index plan

| Layer | z-index | pointer-events |
|---|---|---|
| Hint labels (mockup-only) | 2147483647 | none |
| **Window-controls container** | **2147483646** | auto; container drags on empty space (has `data-tauri-drag-region`), buttons do not |
| **Top drag strip** / splash header zone | **2147483645** | auto on the 6px/44px strip itself only |
| DSH page content (incl. right-panel strip) | DSH-native (auto or lower) | default |

Rationale: values near int32 max so no DSH-authored z-index can cover the chrome. Controls strictly above the drag strip — the top-right 48×38px of the strip is covered by the minimize button and must stay clickable.

## 6. DSH-page integration CSS (injected)

Injected once per document as a `<style id="dsh-launcher-inject">` in the DSH page (see §8 for timing). Problem: DSH's right-sidebar tab strip (`[role="tablist"][data-dockkit-strip]`, ~38px, icons right-aligned) lives exactly where our 144px control block sits.

```css
/* ===== DSH Launcher injection — window-controls clearance ===== */
:root { --dsh-launcher-inset: 144px; }

/* 1. Shift the right-sidebar tab strip icons left, clear of the controls.
      Primary selector: stable data attribute. */
[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip] {
  padding-right: var(--dsh-launcher-inset);
}
/* Fallback if the panel attribute is absent but the class exists. */
.P3OORG_panel [role="tablist"][data-dockkit-strip] {
  padding-right: var(--dsh-launcher-inset);
}

/* 2. Keep the strip pinned and vertically aligned (38px line, icons centered). */
[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip],
.P3OORG_panel [role="tablist"][data-dockkit-strip] {
  box-sizing: border-box;
  height: 38px;
  align-items: center;
}
```

- `data-sidebar-right-toggle` / `data-sidebar-right-mode` are state markers, not styling targets: read them to detect collapsed/fullscreen state if the app ever needs to adapt (e.g. auto-hide). The padding rule is harmless when collapsed (no strip → no effect).
- Scope the rule to descendants of the right panel (as above) rather than globally on `[data-dockkit-strip]`, so any other dockkit strip in DSH is untouched.
- Because the icons shift left by exactly 144px and the buttons occupy exactly 144px, there is zero overlap in both themes (see mockup frames D/E).
- If DSH's own layout ever measures the strip (`getBoundingClientRect` for popover anchoring), padding is the safest shift mechanism — it moves the buttons' boxes without transforms.

## 7. Splash page

Composition (light and dark identical, tokens swap):

1. Centered column, translateY(-16px) optical correction: whale logo (76px, accent blue) → "DeepSeek Harness" (24/600) → "DSH Launcher" tagline (11/600, tracked uppercase).
2. Status line 40px below, 13px secondary, fixed 20px height: `正在启动 dsh 服务…` (starting) → `正在打开界面…` (transitioning).
3. Thin indeterminate bar 14px below the status: 220 × 2px track, 36%-width accent segment, 1.6s loop.
4. Error replaces items 2–3's lower half: 34px error icon (circle-exclaim, `--err`), `启动失败` (15/600), detail line (12.5/1.7 secondary, max-width 400px), then `重试` (primary) + `退出` (ghost), gap 10px.
5. Top edge: 6px universal drag strip + 44px splash header drag zone (§4); shared controls overlay top-right.

Copy (exact strings):

| State | String |
|---|---|
| starting | `正在启动 dsh 服务…` |
| transitioning | `正在打开界面…` |
| error title | `启动失败` |
| error detail (example) | `dsh web --no-open 未能启动本地服务。请确认 dsh 已安装并在 PATH 中，或检查端口是否被占用。` |
| buttons | `重试` / `退出` |
| caption buttons | `最小化` / `最大化` / `还原` / `关闭` |

Behavior notes: keep the controls visible and functional in the error state (user must always be able to close). Status text crossfades; no spinners, no bounce — one calm moving element (the progress segment) is the entire loading choreography.

## 8. Animation & timing

| Motion | Spec |
|---|---|
| Splash content enter | opacity 0→1, 240ms, cubic-bezier(0, 0, 0.2, 1), slight 4px rise optional |
| Status text swap | crossfade 200ms ease (fade out → swap text → fade in) |
| Indeterminate bar | 1.6s infinite, translateX −120% → 420%, cubic-bezier(0.4, 0, 0.2, 1) |
| Error icon entrance | fade + scale .94→1, 200ms ease-out |
| **Splash → DSH transition** | when server URL arrives: enforce minimum 600ms total splash dwell, then fade whole splash **before** navigating: opacity 1→0, 280ms, cubic-bezier(0.4, 0, 0.2, 1), then call navigate. Because navigation replaces the document (no cross-document animation possible), pre-paint the html background to the DSH `--bg` value for the current scheme to avoid a one-frame white flash |
| Caption-button hover/press | 120ms linear background-color (close hover: also color swap) |
| DSH strip icon hover | 120ms linear background + color |
| Focus-visible | 2px accent outline offset 1px on splash buttons; caption buttons may skip rings (native convention) |

Flag (custom implementation work): a "content reveal" fade-in on the DSH page after navigation would require injecting an entry animation into the DSH document — out of scope for v1; the 280ms pre-navigation fade is the polished minimum.

## 9. Injection & platform notes (Tauri 2, Windows)

- **Injection timing:** register the overlay + integration CSS as a Tauri **initialization script** on the webview so it exists before first paint in *every* document, including the DSH page after navigation. Re-assert after each navigation event (guard: `if (!document.getElementById('dsh-launcher-inject'))`). Idempotent by id.
- **Resizable:** with `decorations: false` the visible resize borders are gone, and native hit-testing would normally die with them. Tauri keeps **invisible resize borders** on Windows when `resizable: true` — the frameless window still resizes from all edges/corners. No custom resize-handle work needed; just keep `resizable: true` in the Tauri config and verify edge hit-testing on a build (documented Tauri behavior, confirm at runtime).
- **Maximize:** double-click on drag regions toggles maximize (built-in). On maximize, swap maximize→restore glyph via window events; overlay geometry unchanged.
- **Fullscreen (DSH 全屏 button / F11):** v1 keeps the overlay visible. Optional polish (flagged as custom work): fade the overlay out in DSH fullscreen and reveal it when the pointer nears the top edge.
- **Alt+F4** and system shortcuts keep working; Alt+Space system menu is lost with decorations — acceptable for v1, optionally re-add a custom menu later.
- **DPI/zoom:** overlay uses fixed CSS px, so it scales with page zoom/DPI like the rest of the page; `--dsh-launcher-inset` and the DSH padding use the same variable so they can never drift apart. If DSH ever offers its own zoom control, recompute nothing — both sides scale together.
- **Dark mode:** injected CSS carries its own `prefers-color-scheme` blocks; the splash too. Do not inherit from DSH's runtime theme class (unstable), rely on the OS setting DSH itself follows.

## 10. Edge cases checklist

- Right sidebar collapsed → strip absent, top-right shows only the controls (mockup frame F); padding rule harmless.
- Right sidebar open, light and dark → icons land exactly 144px left of the window edge, flush against the controls (frames D/E).
- Window unfocused → overlay dimmed 45%.
- Maximized → restore glyph + 还原 tooltip; drag regions still work (Windows disallows move-drag while maximized; double-click restores).
- Splash error → controls and drag regions fully operative; 重试 restarts the boot sequence and returns to the starting status.
- Rapid navigation/successive retries → injection guarded by element id; overlay never duplicates.
- Text selection / drag ghosts on the overlay → `user-select: none`, `-webkit-user-drag: none`.

## 11. Asset dependency

- Whale logo: inlined verbatim from `D:\Users\xiaolf\WorkSpace\dsh-launcher\assets\dsh-favicon.svg` (path data unchanged; original `fill="#000"` + embedded dark-mode `<style>` replaced with `fill="currentColor"` so the mockup/splash color it via tokens). No external requests anywhere in the mockup; fonts are the OS stack.
