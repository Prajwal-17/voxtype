mod audio;
mod auth;
mod cleanup;
mod desktop;
mod dictionary;
mod display;
mod environment;
mod local;
mod model;
mod recordings;
mod recovery;
mod session;
mod speech;
mod startup;
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
    pub dictionary_lock: tokio::sync::Mutex<()>,
    pub upload_lock: tokio::sync::Mutex<()>,
    pub regeneration_lock: tokio::sync::Mutex<()>,
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
            dictionary_lock: tokio::sync::Mutex::new(()),
            upload_lock: tokio::sync::Mutex::new(()),
            regeneration_lock: tokio::sync::Mutex::new(()),
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
        startup_available: startup::available(),
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
    if user.is_some() {
        uploads::send_pending(app.clone());
        dictionary::refresh(app.clone());
    }
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
    uploads::send_pending(app.clone());
    dictionary::refresh(app.clone());
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
    publish(&app, &Snapshot::default());
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
    startup::configure(&app, settings.launch_at_login)?;
    storage::save_settings(&app, &settings)
}
#[tauri::command]
fn get_history(
    app: tauri::AppHandle,
    cursor: Option<String>,
    query: Option<String>,
    expected_user_id: Option<String>,
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
    if expected_user_id.as_deref().is_some_and(|id| id != user_id) {
        return Err("Account changed.".into());
    }
    storage::claim_legacy_history(&app, &user_id)?;
    storage::history_page(
        storage::history(&app)?,
        &user_id,
        cursor.as_deref(),
        query.as_deref(),
    )
}
#[tauri::command]
async fn get_analytics(
    app: tauri::AppHandle,
    range: Option<String>,
    timezone: Option<String>,
    expected_user_id: Option<String>,
) -> Result<serde_json::Value, String> {
    require_authenticated(&app)?;
    let (user, bearer, client) = auth::upload_session().await?.ok_or("Sign in again.")?;
    if expected_user_id.as_deref().is_some_and(|id| id != user.id) {
        return Err("Account changed.".into());
    }
    let response = client
        .get(format!("{}/v1/analytics", auth::api_url()))
        .query(&[
            ("range", range.as_deref().unwrap_or("30d")),
            ("timezone", timezone.as_deref().unwrap_or("UTC")),
        ])
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|_| "Couldn’t load analytics.")?;
    if !response.status().is_success() {
        return Err("Couldn’t load analytics.".into());
    }
    let body: serde_json::Value = speech::read_json(response, 256_000).await?;
    if account_id(&app)? != user.id {
        return Err("Account changed.".into());
    }
    Ok(body["data"].clone())
}
#[tauri::command]
async fn export_analytics(
    app: tauri::AppHandle,
    range: String,
    timezone: String,
) -> Result<bool, String> {
    require_authenticated(&app)?;
    let (user, bearer, client) = auth::upload_session().await?.ok_or("Sign in again.")?;
    let response = client
        .get(format!("{}/v1/analytics", auth::api_url()))
        .query(&[
            ("range", range.as_str()),
            ("timezone", timezone.as_str()),
            ("format", "csv"),
        ])
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|_| "Couldn’t export insights.")?;
    if !response.status().is_success() {
        return Err("Couldn’t export insights.".into());
    }
    let mut response = response;
    let mut csv = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "Export interrupted.")? {
        if csv.len() + chunk.len() > 8_000_000 {
            return Err("Export exceeds the file limit.".into());
        }
        csv.extend_from_slice(&chunk);
    }
    let (current, _, _) = auth::upload_session().await?.ok_or("Sign in again.")?;
    if current.id != user.id {
        return Err("Account changed. Try again.".into());
    }
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        use gtk::prelude::*;
        let dialog = gtk::FileChooserNative::new(
            Some("Export insights"),
            None::<&gtk::Window>,
            gtk::FileChooserAction::Save,
            Some("Save"),
            Some("Cancel"),
        );
        dialog.set_current_name("voxtype-insights.csv");
        dialog.set_do_overwrite_confirmation(true);
        let path = if dialog.run() == gtk::ResponseType::Accept {
            dialog.filename()
        } else {
            None
        };
        dialog.destroy();
        let _ = sender.send(path);
    })
    .map_err(|_| "Couldn’t open the save dialog.")?;
    let Some(path) = receiver.await.map_err(|_| "Save dialog closed.")? else {
        return Ok(false);
    };
    let (current, _, _) = auth::upload_session().await?.ok_or("Sign in again.")?;
    if current.id != user.id {
        return Err("Account changed. Try again.".into());
    }
    tokio::task::spawn_blocking(move || std::fs::write(path, csv))
        .await
        .map_err(|_| "Couldn’t save CSV.")?
        .map_err(|_| "Couldn’t save CSV. Choose a writable folder.")?;
    Ok(true)
}
#[tauri::command]
async fn delete_history(app: tauri::AppHandle, id: Option<String>) -> Result<(), String> {
    require_authenticated(&app)?;
    let state = app.state::<AppState>();
    let _sync = state.upload_lock.lock().await;
    let (user, bearer, client) = auth::upload_session().await?.ok_or("Sign in again.")?;
    if let Some(value) = &id {
        uuid::Uuid::parse_str(value).map_err(|_| "Invalid transcript ID.")?;
    }
    let path = id
        .as_ref()
        .map(|id| format!("/v1/dictations/{id}"))
        .unwrap_or("/v1/dictations".into());
    let response = client
        .delete(format!("{}{path}", auth::api_url()))
        .bearer_auth(bearer)
        .send()
        .await
        .map_err(|_| "Connect to delete this transcript from the cloud.")?;
    if !response.status().is_success() && response.status().as_u16() != 404 {
        return Err("Couldn’t delete cloud transcript.".into());
    }
    storage::delete_history(&app, &user.id, id.as_deref())?;
    let _ = app.emit("analytics-changed", ());
    Ok(())
}
fn account_id(app: &tauri::AppHandle) -> Result<String, String> {
    require_authenticated(app)?;
    app.state::<AppState>()
        .user
        .lock()
        .map_err(|_| "Account unavailable.")?
        .as_ref()
        .map(|user| user.id.clone())
        .ok_or("Sign in again.".into())
}
#[tauri::command]
fn get_local_recordings(app: tauri::AppHandle) -> Result<Vec<local::LocalRecording>, String> {
    local::recordings(&app, &account_id(&app)?)
}
#[tauri::command]
fn get_local_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    local::diagnostics(&app, &account_id(&app)?)
}
#[tauri::command]
async fn export_local_diagnostics(app: tauri::AppHandle) -> Result<(), String> {
    let user = account_id(&app)?;
    let report = local::diagnostics(&app, &user)?;
    let output = tokio::process::Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--filename=voxtype-diagnostics.json",
        ])
        .output()
        .await
        .map_err(|_| "Install zenity to export diagnostics.")?;
    if !output.status.success() {
        return Ok(());
    }
    if account_id(&app)? != user {
        return Err("Account changed.".into());
    }
    let destination = String::from_utf8(output.stdout).map_err(|_| "Invalid export path.")?;
    let destination = destination.trim();
    if !destination.is_empty() {
        std::fs::write(destination, report).map_err(|_| "Could not export diagnostics.")?;
    }
    Ok(())
}
#[tauri::command]
async fn export_recording(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let user = account_id(&app)?;
    let row = local::recordings(&app, &user)?
        .into_iter()
        .find(|row| row.id == id)
        .ok_or("Recording no longer available.")?;
    let path = row.audio_file.ok_or("Audio no longer available.")?;
    let directory = recordings::directory(&app)?
        .canonicalize()
        .map_err(|_| "Recording unavailable.")?;
    let source = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|_| "Recording unavailable.")?;
    if source.parent() != Some(directory.as_path()) {
        return Err("Recording unavailable.".into());
    }
    let output = tokio::process::Command::new("zenity")
        .args([
            "--file-selection",
            "--save",
            "--confirm-overwrite",
            "--filename=voxtype-recording.wav",
        ])
        .output()
        .await
        .map_err(|_| "Install zenity to export a recording.")?;
    if !output.status.success() {
        return Ok(());
    }
    if account_id(&app)? != user {
        return Err("Account changed.".into());
    }
    let destination = String::from_utf8(output.stdout).map_err(|_| "Invalid export path.")?;
    let destination = destination.trim();
    if destination.is_empty() {
        return Ok(());
    }
    std::fs::copy(source, destination).map_err(|_| "Could not export recording.")?;
    Ok(())
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
async fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    desktop::copy(&app, &text).await
}
#[tauri::command]
async fn start_dictation(app: tauri::AppHandle, test: bool) -> Result<String, String> {
    require_authenticated(&app)?;
    session::start(app.clone(), test, false).await?;
    let id = app
        .state::<AppState>()
        .snapshot
        .lock()
        .map_err(|_| "Session unavailable.")?
        .session_id
        .clone();
    Ok(id)
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
    match startup::action(action) {
        startup::Action::Background => {}
        #[cfg(debug_assertions)]
        startup::Action::PreviewOverlay => session::preview_overlay(&app),
        startup::Action::Toggle => {
            tauri::async_runtime::spawn(async move {
                if let Err(error) = session::toggle(app.clone()).await {
                    session::show_error(&app, error);
                }
            });
        }
        startup::Action::Cancel => {
            tauri::async_runtime::spawn(async move {
                let _ = session::signal(&app, session::Control::Cancel).await;
            });
        }
        startup::Action::Open => show_main(&app),
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
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name(environment::app_name())
                .arg("--background")
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            dictionary::get_dictionary,
            dictionary::update_dictionary,
            bootstrap,
            get_auth_user,
            sign_in_with_google,
            sign_out,
            update_settings,
            get_history,
            get_analytics,
            export_analytics,
            delete_history,
            get_local_recordings,
            recovery::get_recording_audio,
            recovery::regenerate_transcript,
            get_local_diagnostics,
            export_recording,
            export_local_diagnostics,
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
            if let Err(error) = storage::migrate_originals(handle) {
                let _ = handle.emit("app-error", error);
            }
            let _ = local::diagnostics(handle, "");
            let sync_app = handle.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(120));
                loop {
                    interval.tick().await;
                    uploads::send_pending(sync_app.clone());
                    dictionary::refresh(sync_app.clone());
                    let _ = local::diagnostics(&sync_app, "");
                }
            });
            if let Err(error) = storage::settings(handle)
                .and_then(|settings| startup::configure(handle, settings.launch_at_login))
            {
                eprintln!("{error}");
                let _ = handle.emit("app-error", error);
            }
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
            let tray = tauri::tray::TrayIconBuilder::new()
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/tray.png"
                ))?)
                .icon_as_template(true)
                .tooltip(format!("{} · voice dictation", environment::app_name()))
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    } else {
                        dispatch(app, event.id.as_ref());
                    }
                });
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
