//! Preferences/history use Tauri Store. Credentials never enter that file or leave Rust.
use crate::{
    environment,
    model::{HistoryItem, Settings},
};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

fn entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(environment::keyring_service(), account)
        .map_err(|_| "The desktop keyring is unavailable.".into())
}
fn read_key(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err("Unlock your login keyring, then try again.".into()),
    }
}
fn write_key(account: &str, value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.len() < 10 || value.len() > 512 || value.chars().any(char::is_whitespace) {
        return Err("Paste a valid API key without spaces.".into());
    }
    entry(account)?
        .set_password(value)
        .map_err(|_| "Could not save the key. Unlock your login keyring and try again.".into())
}
fn remove_key(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the key from your keyring.".into()),
    }
}
pub fn key() -> Result<Option<String>, String> {
    read_key("deepgram")
}
pub fn save_key(value: &str) -> Result<(), String> {
    write_key("deepgram", value)
}
pub fn delete_key() -> Result<(), String> {
    remove_key("deepgram")
}
pub fn cleanup_key() -> Result<Option<String>, String> {
    read_key("deepseek")
}
pub fn save_cleanup_key(value: &str) -> Result<(), String> {
    write_key("deepseek", value)
}
pub fn delete_cleanup_key() -> Result<(), String> {
    remove_key("deepseek")
}

pub fn auth_token() -> Result<Option<String>, String> {
    read_key("auth-session")
}
pub fn save_auth_token(value: &str) -> Result<(), String> {
    let value = value.trim();
    if !(20..=2_048).contains(&value.len()) || value.chars().any(char::is_whitespace) {
        return Err("VoxType received an invalid account session.".into());
    }
    entry("auth-session")?.set_password(value).map_err(|_| {
        "Could not save your account session. Unlock your keyring and try again.".into()
    })
}
pub fn delete_auth_token() -> Result<(), String> {
    remove_key("auth-session")
}

pub fn settings(app: &AppHandle) -> Result<Settings, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    match store.get("settings") {
        Some(value) => serde_json::from_value(value).map_err(|_| {
            "Settings could not be read. Your local data has not been overwritten.".into()
        }),
        None => Ok(Settings::default()),
    }
}
pub fn save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    settings.validate()?;
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set(
        "settings",
        serde_json::to_value(settings).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}
pub fn history(app: &AppHandle) -> Result<Vec<HistoryItem>, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    match store.get("history") {
        Some(value) => {
            serde_json::from_value(value).map_err(|_| "Local history could not be read.".into())
        }
        None => Ok(vec![]),
    }
}
pub fn write_history(app: &AppHandle, items: Vec<HistoryItem>) -> Result<(), String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set(
        "history",
        serde_json::to_value(items).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit("history-changed", ());
    Ok(())
}
pub fn append_history(app: &AppHandle, item: HistoryItem) -> Result<(), String> {
    let mut items = history(app)?;
    items.insert(0, item);
    items.truncate(200);
    write_history(app, items)
}
