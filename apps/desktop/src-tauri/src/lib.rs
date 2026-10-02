mod audio;
mod auth;
mod cleanup;
mod desktop;
mod display;
mod environment;
mod model;
mod recordings;
mod session;
mod speech;
mod storage;
mod uploads;

use model::*;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub snapshot: Mutex<Snapshot>,
    pub control: Mutex<Option<tokio::sync::mpsc::Sender<session::Control>>>,
    pub authenticated: AtomicBool,
    pub user: Mutex<Option<AuthUser>>,
    pub local_data: Mutex<()>,
    pub upload_lock: tokio::sync::Mutex<()>,
    pub shortcut_registered: AtomicBool,
}
impl Default for AppState {
    fn default() -> Self {
        Self {
            snapshot: Mutex::new(Snapshot::default()),
            control: Mutex::new(None),
            authenticated: AtomicBool::new(false),
            user: Mutex::new(None),
            local_data: Mutex::new(()),
            upload_lock: tokio::sync::Mutex::new(()),
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
fn require_authenticated(app: &tauri::AppHandle) -> Result<(), String> {
    if app
        .state::<AppState>()
        .authenticated
        .load(Ordering::Acquire)
    {
        Ok(())
    } else {
        Err("Sign in with Google to use VoxType dictation.".into())
    }
}

#[tauri::command]
async fn bootstrap(app: tauri::AppHandle) -> Result<Bootstrap, String> {
    let settings = storage::settings(&app)?;
    let shortcut_id = storage::shortcut_id(&app)?;
    let shortcut = desktop::shortcut(&shortcut_id).unwrap_or_else(desktop::default_shortcut);
    let mut shortcut_options = desktop::shortcut_options();
    if shortcut.id.starts_with("custom:") {
        shortcut_options.push(ShortcutOption {
            id: shortcut.id.clone(),
            label: shortcut.label.clone(),
        });
    }
    let state = app.state::<AppState>();
    let snapshot = state
        .snapshot
        .lock()
        .map_err(|_| "Session is unavailable.")?
        .clone();
    Ok(Bootstrap {
        settings,
        snapshot,
        shortcut_registered: state.shortcut_registered.load(Ordering::Relaxed),
        version: env!("CARGO_PKG_VERSION").into(),
        environment: if environment::is_development() {
            "development"
        } else {
            "production"
        }
        .into(),
        shortcut_id: shortcut.id,
        shortcut_label: shortcut.label,
        shortcut_options,
    })
}
#[tauri::command]
async fn get_auth_user(app: tauri::AppHandle) -> Result<Option<AuthUser>, String> {
    app.state::<AppState>()
        .authenticated
        .store(false, Ordering::Release);
    let user = auth::current_user().await?;
    *app.state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")? = user.clone();
    app.state::<AppState>()
        .authenticated
        .store(user.is_some(), Ordering::Release);
    Ok(user)
}
#[tauri::command]
async fn sign_in_with_google(app: tauri::AppHandle) -> Result<AuthUser, String> {
    let user = auth::sign_in(app.clone()).await?;
    *app.state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")? = Some(user.clone());
    app.state::<AppState>()
        .authenticated
        .store(true, Ordering::Release);
    Ok(user)
}
#[tauri::command]
async fn sign_out(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<AppState>()
        .authenticated
        .store(false, Ordering::Release);
    let _ = session::signal(&app, session::Control::Cancel).await;
    if let Err(error) = auth::sign_out().await {
        app.state::<AppState>()
            .authenticated
            .store(true, Ordering::Release);
        return Err(error);
    }
    *app.state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")? = None;
    Ok(())
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
fn get_history(
    app: tauri::AppHandle,
    cursor: Option<String>,
    query: Option<String>,
) -> Result<serde_json::Value, String> {
    require_authenticated(&app)?;
    let user_id = app
        .state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")?
        .as_ref()
        .map(|u| u.id.clone())
        .ok_or("Sign in again.")?;
    let mut items: Vec<_> = storage::history(&app)?
        .into_iter()
        .filter(|item| item.user_id.as_deref() == Some(user_id.as_str()))
        .collect();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    let query = query.unwrap_or_default().to_lowercase();
    items.retain(|item| item.text.to_lowercase().contains(&query));
    if let Some(cursor) = cursor {
        let (time, id) = cursor.split_once(':').ok_or("Invalid cursor.")?;
        let time: u64 = time.parse().map_err(|_| "Invalid cursor.")?;
        items.retain(|item| {
            item.created_at < time || (item.created_at == time && item.id.as_str() < id)
        });
    }
    let more = items.len() > 12;
    items.truncate(12);
    let next = if more {
        items
            .last()
            .map(|item| format!("{}:{}", item.created_at, item.id))
    } else {
        None
    };
    Ok(serde_json::json!({"items": items, "nextCursor": next}))
}
#[tauri::command]
async fn get_analytics(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    require_authenticated(&app)?;
    let (_, bearer, client) = auth::upload_session().await?.ok_or("Sign in again.")?;
    let response = client
        .get(format!("{}/v1/analytics?range=30d", auth::api_url()))
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|_| "Couldn’t load analytics.")?;
    if !response.status().is_success() {
        return Err("Couldn’t load analytics.".into());
    }
    let body: serde_json::Value = speech::read_json(response, 256_000).await?;
    Ok(body["data"].clone())
}
#[tauri::command]
fn delete_history(app: tauri::AppHandle, id: Option<String>) -> Result<(), String> {
    storage::delete_history(&app, id.as_deref())
}
#[tauri::command]
async fn get_microphones() -> Result<Vec<Microphone>, String> {
    desktop::microphones().await
}
#[tauri::command]
async fn get_diagnostics(app: tauri::AppHandle) -> Vec<Diagnostic> {
    let shortcut_id =
        storage::shortcut_id(&app).unwrap_or_else(|_| environment::default_shortcut_id().into());
    let shortcut = desktop::shortcut(&shortcut_id).unwrap_or_else(desktop::default_shortcut);
    desktop::diagnostics(
        app.state::<AppState>()
            .shortcut_registered
            .load(Ordering::Relaxed),
        &shortcut.label,
    )
    .await
}
#[tauri::command]
async fn configure_shortcut(app: tauri::AppHandle, shortcut_id: String) -> Result<(), String> {
    if app
        .state::<AppState>()
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .is_some()
    {
        return Err("Finish recording before changing shortcuts.".into());
    }
    let shortcut_id_for_install = shortcut_id.clone();
    tokio::task::spawn_blocking(move || desktop::install_shortcut(&shortcut_id_for_install))
        .await
        .map_err(|_| "Shortcut setup failed.")??;
    storage::save_shortcut_id(&app, &shortcut_id)?;
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
    require_authenticated(&app)?;
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
    if action == "toggle" {
        if let Err(error) = require_authenticated(app) {
            let _ = app.emit("app-error", error);
            show_main(app);
            return;
        }
    }
    let app = app.clone();
    match action {
        #[cfg(debug_assertions)]
        "preview-overlay" => session::preview_overlay(&app),
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

fn prepare_overlay_window(window: &tauri::WebviewWindow) {
    use gtk::prelude::*;

    let width = 288;
    let height = environment::overlay_height();
    if let Ok(container) = window.default_vbox() {
        container.set_size_request(width, height);
        for child in container.children() {
            child.set_size_request(width, height);
        }
    }
    if let Ok(native_window) = window.gtk_window() {
        // Tauri's cross-platform flags are not sufficient for Mutter/XWayland:
        // without native EWMH hints GNOME treats the overlay as a normal app
        // window and includes it in Alt-Tab. This is a transient notification,
        // not a second VoxType window.
        native_window.set_type_hint(gtk::gdk::WindowTypeHint::Notification);
        native_window.set_skip_taskbar_hint(true);
        native_window.set_skip_pager_hint(true);
        native_window.set_accept_focus(false);
        native_window.set_focus_on_map(false);
        native_window.set_keep_above(true);
        native_window.stick();
        native_window.set_size_request(width, height);
        native_window.resize(width, height);
    }
}

pub fn run() {
    display::configure();
    // WebSocket TLS has multiple optional crypto backends; select one explicitly.
    let _ = rustls::crypto::ring::default_provider().install_default();
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            dispatch(app, args.get(1).map(String::as_str).unwrap_or("settings"));
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            get_auth_user,
            sign_in_with_google,
            sign_out,
            update_settings,
            get_history,
            get_analytics,
            delete_history,
            get_microphones,
            get_diagnostics,
            copy_text,
            start_dictation,
            stop_dictation,
            cancel_dictation,
            open_main,
            dismiss_overlay,
            configure_shortcut
        ])
        .setup(|app| {
            let handle = app.handle();
            if let Err(error) =
                recordings::recover(handle).and_then(|_| storage::prune_audio(handle))
            {
                let _ = handle.emit("app-error", error);
            }
            if let Some(overlay) = handle.get_webview_window("overlay") {
                prepare_overlay_window(&overlay);
            }
            // Each environment owns a separate GNOME entry and refreshes only its
            // own executable path when it starts.
            let shortcut_id = storage::shortcut_id(handle)
                .unwrap_or_else(|_| environment::default_shortcut_id().into());
            let shortcut_ready = desktop::install_shortcut(&shortcut_id).is_ok();
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
                    &MenuItem::with_id(
                        handle,
                        "settings",
                        format!("Open {}", environment::app_name()),
                        true,
                        None::<&str>,
                    )?,
                    &MenuItem::with_id(
                        handle,
                        "quit",
                        format!("Quit {}", environment::app_name()),
                        true,
                        None::<&str>,
                    )?,
                ],
            )?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .tooltip(format!("{} · voice dictation", environment::app_name()))
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
            dispatch(handle, &initial);
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
            "VoxType could not start. Check that the desktop session and WebKitGTK are available.",
        );
}
