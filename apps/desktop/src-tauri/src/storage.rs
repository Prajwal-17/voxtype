//! All transcripts and the durable upload queue live locally. Audio stays in private WAV files.
use crate::{
    environment,
    model::{HistoryItem, Settings},
    recordings, AppState,
};
use tauri::{AppHandle, Emitter, Manager};
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
fn remove_key(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Could not remove the key from your keyring.".into()),
    }
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

pub fn shortcut_id(app: &AppHandle) -> Result<String, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    Ok(store
        .get("shortcutId")
        .and_then(|value| value.as_str().map(str::to_owned))
        .unwrap_or_else(|| environment::default_shortcut_id().into()))
}

pub fn save_shortcut_id(app: &AppHandle, shortcut_id: &str) -> Result<(), String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set("shortcutId", serde_json::Value::String(shortcut_id.into()));
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
pub fn delete_history(app: &AppHandle, id: Option<&str>) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    let old = history(app)?;
    let items = old
        .iter()
        .filter(|item| id.is_some_and(|id| item.id != id))
        .cloned()
        .collect::<Vec<_>>();
    write_history_unlocked(app, items.clone())?;
    for removed in old
        .iter()
        .filter(|old| !items.iter().any(|item| item.id == old.id))
    {
        if let Some(path) = &removed.audio_file {
            recordings::remove(app, path);
        }
    }
    Ok(())
}
fn write_history_unlocked(app: &AppHandle, items: Vec<HistoryItem>) -> Result<(), String> {
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
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    let mut items = history(app)?;
    let mut pending = pending_uploads_unlocked(app)?;
    pending.retain(|queued| queued.id != item.id);
    if !item.text.trim().is_empty() && item.user_id.is_some() {
        pending.push(item.clone());
    }
    items.retain(|existing| existing.id != item.id);
    items.insert(0, item);
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set(
        "uploads",
        serde_json::to_value(pending).map_err(|e| e.to_string())?,
    );
    write_history_unlocked(app, items)?;
    Ok(())
}

pub fn pending_uploads(app: &AppHandle) -> Result<Vec<HistoryItem>, String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    pending_uploads_unlocked(app)
}
fn pending_uploads_unlocked(app: &AppHandle) -> Result<Vec<HistoryItem>, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    match store.get("uploads") {
        Some(value) => serde_json::from_value(value)
            .map_err(|_| "Local upload queue could not be read.".into()),
        None => Ok(vec![]),
    }
}

pub fn acknowledge_upload(app: &AppHandle, uploaded: &HistoryItem) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    let mut pending = pending_uploads_unlocked(app)?;
    retain_unacknowledged(&mut pending, uploaded);
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set(
        "uploads",
        serde_json::to_value(pending).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

fn retain_unacknowledged(pending: &mut Vec<HistoryItem>, uploaded: &HistoryItem) {
    pending.retain(|item| item.id != uploaded.id);
}

pub fn update_delivery(app: &AppHandle, id: &str, delivery: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    let mut items = history(app)?;
    let Some(item) = items.iter_mut().find(|item| item.id == id) else {
        return Ok(());
    };
    if item.delivery == delivery {
        return Ok(());
    }
    item.delivery = delivery.into();
    let mut pending = pending_uploads_unlocked(app)?;
    if let Some(queued) = pending.iter_mut().find(|queued| queued.id == id) {
        queued.delivery = delivery.into();
    }
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store.set(
        "uploads",
        serde_json::to_value(pending).map_err(|e| e.to_string())?,
    );
    write_history_unlocked(app, items)?;
    Ok(())
}

pub fn claim_legacy_history(app: &AppHandle, user_id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    let mut items = history(app)?;
    let mut pending = pending_uploads_unlocked(app)?;
    let mut changed = false;
    for item in items.iter_mut().filter(|item| item.user_id.is_none()) {
        item.user_id = Some(user_id.into());
        item.upload_api_url = Some(crate::auth::api_url());
        if !item.text.trim().is_empty() {
            pending.push(item.clone());
        }
        changed = true;
    }
    if changed {
        let store = app
            .store(environment::store_file())
            .map_err(|e| e.to_string())?;
        store.set(
            "uploads",
            serde_json::to_value(pending).map_err(|e| e.to_string())?,
        );
        write_history_unlocked(app, items)?;
    }
    Ok(())
}

pub fn prune_audio(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let _lock = state
        .local_data
        .lock()
        .map_err(|_| "Local data unavailable.")?;
    prune_audio_unlocked(app)
}
fn prune_audio_unlocked(app: &AppHandle) -> Result<(), String> {
    let removed = recordings::prune_directory(&recordings::directory(app)?)?;
    if removed.is_empty() {
        return Ok(());
    }
    let mut items = history(app)?;
    for item in &mut items {
        if item
            .audio_file
            .as_ref()
            .is_some_and(|p| removed.contains(p))
        {
            item.audio_file = None;
        }
    }
    write_history_unlocked(app, items)
}

/// Stable keyset pages; filtering happens before the page boundary is chosen.
pub fn history_page(
    items: Vec<HistoryItem>,
    user_id: &str,
    cursor: Option<&str>,
    query: Option<&str>,
) -> Result<serde_json::Value, String> {
    let query = query.unwrap_or_default().to_lowercase();
    let mut items: Vec<_> = items
        .into_iter()
        .filter(|item| {
            item.user_id.as_deref() == Some(user_id) && item.text.to_lowercase().contains(&query)
        })
        .collect();
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    if let Some(cursor) = cursor {
        let (time, id) = cursor.split_once(':').ok_or("Invalid cursor.")?;
        let time: u64 = time.parse().map_err(|_| "Invalid cursor.")?;
        if id.is_empty() {
            return Err("Invalid cursor.".into());
        }
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
    Ok(serde_json::json!({"items":items,"nextCursor":next}))
}

#[cfg(test)]
mod paging_tests {
    use super::*;
    fn items() -> Vec<HistoryItem> {
        (0..26)
            .map(|index| HistoryItem {
                id: format!("item-{index:02}"),
                text: format!("Transcript {index}"),
                original_text: None,
                created_at: 1000,
                duration_ms: 1000,
                words: 2,
                delivery: "saved".into(),
                user_id: Some(if index == 25 { "other" } else { "owner" }.into()),
                audio_file: None,
                upload_api_url: None,
            })
            .collect()
    }
    #[test]
    fn pages_are_bounded_and_account_scoped() {
        let first = history_page(items(), "owner", None, None).unwrap();
        assert_eq!(first["items"].as_array().unwrap().len(), 12);
        assert_eq!(first["items"][0]["id"], "item-24");
        let second = history_page(items(), "owner", first["nextCursor"].as_str(), None).unwrap();
        assert_eq!(second["items"][0]["id"], "item-12");
        let third = history_page(items(), "owner", second["nextCursor"].as_str(), None).unwrap();
        assert_eq!(third["items"].as_array().unwrap().len(), 1);
        assert!(third["nextCursor"].is_null());
    }
    #[test]
    fn cursor_survives_deleted_boundary_and_search_is_global() {
        let mut rows = items();
        rows.retain(|item| item.id != "item-13");
        let page = history_page(rows, "owner", Some("1000:item-13"), None).unwrap();
        assert_eq!(page["items"][0]["id"], "item-12");
        let found = history_page(items(), "owner", None, Some("TRANSCRIPT 0")).unwrap();
        assert_eq!(found["items"][0]["id"], "item-00");
        assert!(history_page(items(), "owner", Some("invalid"), None).is_err());
    }
}
