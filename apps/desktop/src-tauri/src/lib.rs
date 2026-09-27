mod audio;
mod cleanup;
mod desktop;
mod model;
mod session;
mod storage;

use model::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub snapshot: Mutex<Snapshot>,
    pub control: Mutex<Option<tokio::sync::mpsc::Sender<session::Control>>>,
    pub shortcut_registered: AtomicBool,
}
impl Default for AppState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(Snapshot::default()),
            control: Mutex::new(None),
            shortcut_registered: AtomicBool::new(false),
        }
    }
}

pub fn publish(app: &tauri::AppHandle, snapshot: &Snapshot) {
    if let Ok(mut state) = app.state::<AppState>().snapshot.lock() {
        *state = snapshot.clone();
    }
    let _ = app.emit("session", snapshot);
}
pub fn show_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[tauri::command]
async fn bootstrap(app: tauri::AppHandle) -> Result<Bootstrap, String> {
    let settings = storage::settings(&app)?;
    let (key, cleanup_key) =
        tokio::join!(key_status(storage::key), key_status(storage::cleanup_key));
    let state = app.state::<AppState>();
    let snapshot = state
        .snapshot
        .lock()
        .map_err(|_| "Session is unavailable.")?
        .clone();
    let (has_key, key_error) = match key {
        Ok(k) => (k.is_some(), None),
        Err(e) => (false, Some(e)),
    };
    let (has_cleanup_key, cleanup_key_error) = match cleanup_key {
        Ok(k) => (k.is_some(), None),
        Err(e) => (false, Some(e)),
    };
    Ok(Bootstrap {
        settings,
        has_key,
        key_error,
        has_cleanup_key,
        cleanup_key_error,
        snapshot,
        shortcut_registered: state.shortcut_registered.load(Ordering::Relaxed),
        version: env!("CARGO_PKG_VERSION").into(),
    })
}
async fn key_status(
    read: fn() -> Result<Option<String>, String>,
) -> Result<Option<String>, String> {
    tokio::time::timeout(
        std::time::Duration::from_secs(6),
        tokio::task::spawn_blocking(read),
    )
    .await
    .map_err(|_| "Unlock your login keyring, then reopen Settings.")?
    .map_err(|_| "Keyring request failed.")?
}
#[tauri::command]
async fn save_cleanup_key(key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::save_cleanup_key(&key))
        .await
        .map_err(|_| "Keyring request failed.")?
}
#[tauri::command]
async fn remove_cleanup_key() -> Result<(), String> {
    tokio::task::spawn_blocking(storage::delete_cleanup_key)
        .await
        .map_err(|_| "Keyring request failed.")?
}
#[tauri::command]
async fn save_api_key(key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || storage::save_key(&key))
        .await
        .map_err(|_| "Keyring request failed.")?
}
#[tauri::command]
async fn remove_api_key() -> Result<(), String> {
    tokio::task::spawn_blocking(storage::delete_key)
        .await
        .map_err(|_| "Keyring request failed.")?
}
#[tauri::command]
fn update_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    settings.validate()?;
    // Refuse changes during recording: each session runs with one immutable configuration.
    if app
        .state::<AppState>()
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .is_some()
    {
        return Err("Finish your dictation before changing settings.".into());
    }
    storage::save_settings(&app, &settings)
}
#[tauri::command]
fn get_history(app: tauri::AppHandle) -> Result<Vec<HistoryItem>, String> {
    storage::history(&app)
}
#[tauri::command]
fn delete_history(app: tauri::AppHandle, id: Option<String>) -> Result<(), String> {
    let items = match id {
        Some(id) => storage::history(&app)?
            .into_iter()
            .filter(|item| item.id != id)
            .collect(),
        None => vec![],
    };
    storage::write_history(&app, items)
}
#[tauri::command]
async fn get_microphones() -> Result<Vec<Microphone>, String> {
    desktop::microphones().await
}
#[tauri::command]
async fn get_diagnostics(app: tauri::AppHandle) -> Vec<Diagnostic> {
    desktop::diagnostics(
        app.state::<AppState>()
            .shortcut_registered
            .load(Ordering::Relaxed),
    )
    .await
}
#[tauri::command]
async fn enable_shortcut(app: tauri::AppHandle) -> Result<(), String> {
    if app
        .state::<AppState>()
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .is_some()
    {
        return Err("Finish recording before changing shortcuts.".into());
    }
    tokio::task::spawn_blocking(desktop::install_shortcut)
        .await
        .map_err(|_| "Shortcut setup failed.")??;
    app.state::<AppState>()
        .shortcut_registered
        .store(true, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
async fn copy_text(text: String) -> Result<(), String> {
    desktop::copy(&text).await
}
#[tauri::command]
async fn start_dictation(app: tauri::AppHandle, test: bool) -> Result<(), String> {
    session::start(app, test, false).await
}
#[tauri::command]
async fn stop_dictation(app: tauri::AppHandle) -> Result<(), String> {
    session::signal(&app, session::Control::Stop).await
}
#[tauri::command]
async fn cancel_dictation(app: tauri::AppHandle) -> Result<(), String> {
    session::signal(&app, session::Control::Cancel).await
}
#[tauri::command]
fn open_main(app: tauri::AppHandle) {
    show_main(&app);
}
#[tauri::command]
fn dismiss_overlay(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.hide();
    }
}

fn dispatch(app: &tauri::AppHandle, action: &str) {
    let app = app.clone();
    match action {
        "toggle" => {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = session::toggle(app.clone()).await {
                    let _ = app.emit("app-error", &error);
                    show_main(&app);
                }
            });
        }
        "cancel" => {
            tauri::async_runtime::spawn(async move {
                let _ = session::signal(&app, session::Control::Cancel).await;
            });
        }
        _ => show_main(&app),
    }
}

pub fn run() {
    // GNOME's native Wayland windows cannot be positioned by applications. Use
    // XWayland when available so the dictation overlay can stay at the bottom.
    // This does not change the desktop session or its clipboard/input adapters.
    if desktop::wayland() && std::env::var_os("DISPLAY").is_some() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    // WebSocket TLS has multiple optional crypto backends; select one explicitly.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut builder = tauri::Builder::default();
    // Debug-only WebDriver sessions can run independently of the user's open app.
    // Release builds always enforce a single instance.
    if !cfg!(debug_assertions) || std::env::var("TAURI_WEBVIEW_AUTOMATION").as_deref() != Ok("true")
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _| {
            dispatch(app, args.get(1).map(String::as_str).unwrap_or("settings"));
        }));
    }
    builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            save_api_key,
            remove_api_key,
            save_cleanup_key,
            remove_cleanup_key,
            update_settings,
            get_history,
            delete_history,
            get_microphones,
            get_diagnostics,
            copy_text,
            start_dictation,
            stop_dictation,
            cancel_dictation,
            open_main,
            dismiss_overlay,
            enable_shortcut
        ])
        .setup(|app| {
            let handle = app.handle();
            // Reuse Flow's existing GNOME entry: this replaces the old chord and
            // refreshes the executable path when switching between dev/release.
            let shortcut_ready = desktop::install_shortcut().is_ok();
            handle
                .state::<AppState>()
                .shortcut_registered
                .store(shortcut_ready, Ordering::Relaxed);
            use tauri::menu::{Menu, MenuItem};
            let menu = Menu::with_items(
                handle,
                &[
                    &MenuItem::with_id(
                        handle,
                        "toggle",
                        "Start / stop dictation",
                        true,
                        None::<&str>,
                    )?,
                    &MenuItem::with_id(handle, "cancel", "Cancel dictation", true, None::<&str>)?,
                    &MenuItem::with_id(handle, "settings", "Open Flow", true, None::<&str>)?,
                    &MenuItem::with_id(handle, "quit", "Quit Flow", true, None::<&str>)?,
                ],
            )?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("Flow · voice dictation")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    } else {
                        dispatch(app, event.id.as_ref());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            // A missing GNOME tray extension must not prevent the main app from opening.
            let _ = tray.build(app);
            let initial = std::env::args().nth(1).unwrap_or_default();
            if initial == "toggle" {
                dispatch(handle, "toggle");
            } else if initial != "cancel" {
                show_main(handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect(
            "Flow could not start. Check that the desktop session and WebKitGTK are available.",
        );
}
