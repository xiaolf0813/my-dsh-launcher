use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const STDERR_TAIL_LINES: usize = 10;
/// Splash minimum dwell (600ms) + fade-out (280ms) before the webview is
/// navigated to the dsh URL; keep in sync with ui/splash.js.
const SPLASH_TOTAL_MS: u64 = 950;

const INIT_JS: &str = include_str!("overlay.js");

/// The spawned `dsh web` process: PID for tree-kill plus the child handle.
struct DshChild {
    pid: u32,
    child: Child,
}

/// Managed state holding the current dsh process, if any.
struct DshProcess(Mutex<Option<DshChild>>);

/// Boot progress shared between the stdout scanner, stderr drainer and timeout watchdog.
struct BootShared {
    found: AtomicBool,
    errored: AtomicBool,
    stderr_tail: Mutex<Vec<String>>,
}

fn spawn_command(program: &str, args: &[&str]) -> Command {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Extract the ready URL: the first `http://127.0.0.1:*` / `http://localhost:*`
/// URL that carries an auth token (the bare host URL 401s without it).
fn extract_url(line: &str) -> Option<String> {
    let start = line.find("http://")?;
    let rest = &line[start..];
    let end = rest.find(char::is_whitespace).unwrap_or(rest.len());
    let url = &rest[..end];
    let lower = url.to_ascii_lowercase();
    if (lower.starts_with("http://127.0.0.1") || lower.starts_with("http://localhost"))
        && lower.contains("token=")
    {
        Some(url.to_string())
    } else {
        None
    }
}

/// Emit `dsh://error` at most once per boot attempt, appending the stderr tail if any.
fn emit_error_once(shared: &BootShared, app: &tauri::AppHandle, mut message: String) {
    if shared.errored.swap(true, Ordering::SeqCst) {
        return;
    }
    let tail: Vec<String> = shared.stderr_tail.lock().unwrap().clone();
    if !tail.is_empty() {
        message.push_str("\n\n服务输出：\n");
        message.push_str(&tail.join("\n"));
    }
    let _ = app.emit("dsh://error", serde_json::json!({ "message": message }));
}

/// Emit `dsh://ready` (splash UI feedback), then navigate to the URL from the
/// Rust side after the splash dwell+fade window. Navigation MUST NOT be done
/// from the splash page: a cross-origin `location.replace` marks the request
/// chain cross-site, so dsh's `SameSite=Strict` auth cookie is withheld on the
/// 303 redirect and the page lands on a 401. A native `Webview::navigate` has
/// no initiator (Sec-Fetch-Site: none) and carries the cookie correctly.
fn emit_ready_then_navigate(shared: &BootShared, app: &tauri::AppHandle, url: String) {
    if shared.found.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = app.emit("dsh://ready", serde_json::json!({ "url": url }));
    let app = app.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(SPLASH_TOTAL_MS));
        let Some(webview) = app.get_webview_window("main") else {
            return;
        };
        if let Ok(parsed) = tauri::Url::parse(&url) {
            let _ = webview.navigate(parsed);
        }
    });
}

/// Kill the whole dsh process tree. The PID is taken out of state BEFORE killing
/// so a subsequent retry can respawn cleanly.
fn kill_dsh_tree(app: &tauri::AppHandle) {
    let handle = app.state::<DshProcess>().0.lock().unwrap().take();
    if let Some(mut dsh) = handle {
        let mut killer = spawn_command("taskkill", &["/PID", &dsh.pid.to_string(), "/T", "/F"]);
        let _ = killer.output();
        let _ = dsh.child.kill();
        let _ = dsh.child.wait();
    }
}

/// Reap the child if it is still the current one and has already exited.
fn reap_if_current(app: &tauri::AppHandle, pid: u32) {
    let state = app.state::<DshProcess>();
    let mut guard = state.0.lock().unwrap();
    if guard.as_ref().map(|c| c.pid) == Some(pid) {
        if let Some(mut dsh) = guard.take() {
            match dsh.child.try_wait() {
                Ok(Some(_)) => {} // exited; handle drop reaps it
                _ => *guard = Some(dsh), // still running: keep it for exit-time cleanup
            }
        }
    }
}

/// Spawn `dsh web --no-open`, scan stdout for the ready URL and emit
/// `dsh://ready` / `dsh://error` to the webview.
fn spawn_dsh(app: tauri::AppHandle) {
    let mut child = match spawn_command("cmd", &["/C", "dsh", "web", "--no-open"]).spawn() {
        Ok(child) => child,
        Err(e) => {
            let _ = app.emit(
                "dsh://error",
                serde_json::json!({ "message": format!(
                    "dsh web --no-open 未能启动本地服务。请确认 dsh 已安装并在 PATH 中，或检查端口是否被占用。\n\n详细信息：{e}"
                ) }),
            );
            return;
        }
    };

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let pid = child.id();
    *app.state::<DshProcess>().0.lock().unwrap() = Some(DshChild { pid, child });

    let shared = Arc::new(BootShared {
        found: AtomicBool::new(false),
        errored: AtomicBool::new(false),
        stderr_tail: Mutex::new(Vec::new()),
    });

    // Drain stderr forever (keeps the pipe from blocking), keeping a short tail.
    if let Some(stderr) = stderr {
        let shared = Arc::clone(&shared);
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut tail = shared.stderr_tail.lock().unwrap();
                if tail.len() >= STDERR_TAIL_LINES {
                    tail.remove(0);
                }
                tail.push(line);
            }
        });
    }

    // Timeout watchdog.
    {
        let shared = Arc::clone(&shared);
        let app = app.clone();
        thread::spawn(move || {
            thread::sleep(READY_TIMEOUT);
            if !shared.found.load(Ordering::SeqCst) {
                emit_error_once(
                    &shared,
                    &app,
                    "启动超时：dsh 服务未能在 90 秒内就绪。请检查网络连接或端口是否被占用，然后重试。".into(),
                );
            }
        });
    }

    // Scan stdout; emit + navigate the moment the URL line arrives (the server
    // keeps stdout open for its whole lifetime, so waiting for EOF never
    // fires), then keep draining so the pipe never blocks the child.
    let shared = Arc::clone(&shared);
    let app_scanner = app.clone();
    thread::spawn(move || {
        let mut found = false;
        if let Some(stdout) = stdout {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if !found {
                    if let Some(url) = extract_url(&line) {
                        found = true;
                        emit_ready_then_navigate(&shared, &app_scanner, url);
                    }
                }
            }
        }
        if !found && !shared.found.load(Ordering::SeqCst) {
            emit_error_once(
                &shared,
                &app_scanner,
                "dsh web --no-open 未能启动本地服务。请确认 dsh 已安装并在 PATH 中，或检查端口是否被占用。".into(),
            );
        }
        reap_if_current(&app_scanner, pid);
    });
}

#[tauri::command]
fn start_dsh(app: tauri::AppHandle) {
    kill_dsh_tree(&app);
    spawn_dsh(app);
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

pub fn run() {
    tauri::Builder::default()
        .manage(DshProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_dsh, quit_app])
        .setup(|app| {
            let _window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("DSH Launcher")
                .inner_size(1280.0, 800.0)
                .min_inner_size(940.0, 600.0)
                .center()
                .decorations(false)
                .resizable(true)
                .initialization_script(INIT_JS)
                .build()?;

            spawn_dsh(app.handle().clone());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building dsh launcher")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                kill_dsh_tree(app);
            }
        });
}
