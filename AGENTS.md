# AGENTS.md — DSH Launcher

Tauri 2 无边框 Windows 桌面壳：启动页等待 `dsh web --no-open` 就绪，解析其 stdout 中的带 token URL，然后同一 WebView 导航到 DSH（DeepSeek Harness）网页，并在所有页面上注入 Windows 风格窗口控制按钮。

## 常用命令

```bash
npm install                      # 安装依赖（仅 @tauri-apps/cli 与 lottie-web devDep）
npm run tauri dev                # 开发运行
npx tauri build --no-bundle      # 只出绿色版 exe（src-tauri/target/release/dsh-launcher.exe）
npx tauri build                  # 出 NSIS 安装包（src-tauri/target/release/bundle/nsis/）
npx @tauri-apps/cli icon assets/dsh-icon-1024.png -o src-tauri/icons   # 重新生成图标
```

- 前端无打包器：`ui/` 是纯静态目录，`tauri.conf.json` 的 `build.frontendDist` 指向它，**改动 ui/ 后必须重新 build 才会生效**（资源在编译期内嵌）。
- 构建前需关闭正在运行的 dsh-launcher.exe（文件锁），构建后用安装包或绿色版 exe 重新启动。

## 结构

- `ui/` — 启动页静态前端：`index.html` + `splash.css` + `splash.js`；`lottie.min.js` 是本地内嵌的 lottie-web 播放器（禁止改为 CDN）；`dsh-fish-loading(-dark).json` 鲸鱼巡游动画（跟随系统深浅色）；`whale.svg` 为播放器加载失败时的回退图。
- `src-tauri/src/lib.rs` — 全部 Rust 逻辑：Rust 侧建窗口、spawn/kill dsh、stdout 解析、事件与命令。
- `src-tauri/src/overlay.js` — 注入到**每个页面**（启动页 + DSH 页）的初始化脚本：窗口控制按钮、拖拽条、主题 token、DSH 页面避让 CSS。以 `include_str!` 编译进二进制。
- `src-tauri/tauri.conf.json` — `decorations: false`、`withGlobalTauri: true`、`app.windows: []`（窗口必须在 Rust 里用 `WebviewWindowBuilder` 创建，因为 `initializationScript` 不是 conf 字段）。
- `src-tauri/capabilities/default.json` — 窗口控制权限；`remote.urls` 覆盖 `http://127.0.0.1:3080`、`http://localhost:3080` 及 `:*` 端口通配（dsh 页面属远程源，没有这些权限注入按钮会失效）。
- `design/` — ui-designer 产出的设计契约（spec.md + mockup.html），改动视觉前先读。
- `assets/` — 素材源：`generate_fish_loading.py` 可重新生成 Lottie JSON（鲸鱼已朝右，`bake()` 不做镜像，勿加回）；`dsh-icon-1024.png` 为应用图标源。

## 关键不变量（踩过的坑，勿破坏）

1. **导航必须走 Rust**：`dsh` 的认证 cookie 是 `SameSite=Strict`，从启动页用 `location.replace` 跨源跳转会在 303 时丢 cookie 落到 401。流程固定为：Rust 解析 URL → `emit_ready` 暂存 `PendingNav` 并发 `dsh://ready` → 启动页最短停留 600ms 后淡出 → 调 `navigate_now` 命令 → Rust `Webview::navigate`（无 initiator，cookie 正常携带）。
2. **初始化脚本执行时 DOM 尚不存在**：overlay.js 一律通过 `ready()`（DOMContentLoaded）挂载，直接操作 `document.body` 会抛错并中断后续重试逻辑。
3. **stdout 就绪 URL 必须含 `token=`**（`extract_url`），且在扫描循环内**立即** emit——dsh 服务器存活期间 stdout 不会 EOF，等循环结束再发就永远不会触发。
4. **控制按钮 z-index = 999**：高于页面普通内容与 shell 层（z≤20），**低于 DSH 模态遮罩（z=1000）**——弹窗打开时遮罩自然盖住按钮，点击落到遮罩上。不要改回极大值，也不要加 MutationObserver 监听弹窗（已按"正确层序自动弱化"的方案重做过）。
5. **DSH 页面避让 CSS 走适配器注册表**（overlay.js 的 `DSH_ADAPTERS`）：每个已知 dsh UI 实现一套"方案"（选择器 + CSS），启动器启动时探测 `dsh --version`（随 ready 事件与 `get_dsh_version` 下发），注入层按版本选用方案并用 `probe()` 在真实 DOM 上验证，全部失配时在 `<html>` 打 `data-dsh-launcher-compat="stale"` 并 console 警告。当前 `dsh-0.1.x` 通用方案依赖稳定 data 属性：右侧栏顶条 `[data-sidebar-right-panel] [role="tablist"][data-dockkit-strip]`、会话顶栏 `[data-slot="conversation.session.header"] > header > div:first-child`，各加 `padding-right: var(--dsh-launcher-inset)（144px）`；`wSkVaW_*`/`P3OORG_*` 是 CSS modules 哈希，仅作后备。dsh 改版时新增一个 adapter 条目即可，勿改通用方案。
6. **Windows 进程管理**：`dsh` 是 npm shim，必须 `cmd /C dsh ...` 并加 `CREATE_NO_WINDOW (0x0800_0000)`；杀进程用 `taskkill /PID <pid> /T /F`（/T /F 缺一不可），挂在 `RunEvent::Exit` 与重试前。关闭启动器即停止 dsh——"服务常驻热启动"方案已被否决，勿重新引入。
7. **图标控制按钮样式与 DSH 原生图标对齐**：16 viewBox / 渲染 15px / 1.3 圆头描边 / 灰蓝色 `#5C5F77`（深色 `#9aa3af`）；DSH 顶栏图标行垂直中心在 y=25，故 `html.dsh-page` 下按钮加 `padding-top: 12px`（仅远程页面，启动页保持原生居中）。
8. **启动页 UI 文案为简体中文**，深浅色跟随 `prefers-color-scheme`；DSH 页面内的深色识别优先读 `body[data-ds-dark-theme]`。

## 验证清单（改动后手动过一遍）

- 启动页：鲸鱼动画循环播放 → dsh 就绪后淡出并进入 DSH 首页（会话自动恢复）；右下角显示 `DSH Launcher v{版本}`（版本来自 tauri.conf.json，读取用 `getVersion()`）。
- 杀掉 dsh 子进程 → 启动页出现错误态（含服务输出）→「重试」能完整恢复；「退出」退出应用。
- 窗口控制：最小化/最大化（图形切换 还原）/关闭均可用；顶部拖拽区可拖动窗口。
- 打开 DSH 设置弹窗：控制按钮被遮罩盖住且不可点击（点击落在遮罩上、弹窗关闭），关弹窗后恢复。
- 关闭启动器：dsh 进程树被清理（`netstat -ano` 确认 3080 无 LISTENING）。
