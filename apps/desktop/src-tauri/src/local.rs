//! Device-only recovery and redacted diagnostics. Never used by upload DTOs.
use crate::{
    environment,
    model::{now_ms, HistoryItem},
    recordings,
};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;
static LOCK: Mutex<()> = Mutex::new(());
pub const RETENTION_MS: u64 = 14 * 24 * 60 * 60 * 1000;
pub const EVENT_LIMIT: usize = 500;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRecording {
    pub id: String,
    pub user_id: String,
    pub original_text: String,
    pub created_at: u64,
    pub duration_ms: u64,
    pub audio_file: Option<String>,
}
#[derive(Clone, Copy, Serialize, Deserialize, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Event {
    RecordingStarted,
    TranscriptionComplete,
    TranscriptionFailed,
    CleanupFallback,
    DeliverySent,
    DeliveryRecovery,
    ClipboardFailed,
    SaveFailed,
    Cancelled,
}
#[derive(Clone, Serialize, Deserialize)]
struct Entry {
    owner: String,
    timestamp: u64,
    event: Event,
}
fn file() -> &'static str {
    if environment::is_development() {
        "local-recovery-dev.json"
    } else {
        "local-recovery.json"
    }
}
fn bound_recordings(rows: &mut Vec<LocalRecording>) {
    rows.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    let mut ids = std::collections::HashSet::new();
    rows.retain(|row| ids.insert(row.id.clone()));
    rows.truncate(recordings::AUDIO_LIMIT);
}
/// Separate storage retains originals even if cloud reconciliation removes a cleaned-history row.
pub fn retain(app: &AppHandle, item: &HistoryItem) -> Result<(), String> {
    let Some(user_id) = &item.user_id else {
        return Ok(());
    };
    let _lock = LOCK.lock().map_err(|_| "Local recovery unavailable.")?;
    let store = app.store(file()).map_err(|e| e.to_string())?;
    let mut rows: Vec<LocalRecording> = match store.get("recordings") {
        Some(value) => {
            serde_json::from_value(value).map_err(|_| "Local recovery could not be read.")?
        }
        None => vec![],
    };
    if item.original_text.is_none() && rows.iter().any(|row| row.id == item.id) {
        return Ok(());
    }
    rows.retain(|row| row.id != item.id);
    rows.push(LocalRecording {
        id: item.id.clone(),
        user_id: user_id.clone(),
        original_text: item.original_text.as_deref().unwrap_or(&item.text).into(),
        created_at: item.created_at,
        duration_ms: item.duration_ms,
        audio_file: item.audio_file.clone(),
    });
    bound_recordings(&mut rows);
    store.set(
        "recordings",
        serde_json::to_value(rows).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    let _ = app.emit("local-recordings-changed", ());
    Ok(())
}
pub fn recordings(app: &AppHandle, user_id: &str) -> Result<Vec<LocalRecording>, String> {
    let _lock = LOCK.lock().map_err(|_| "Local recovery unavailable.")?;
    let store = app.store(file()).map_err(|e| e.to_string())?;
    let mut rows: Vec<LocalRecording> = match store.get("recordings") {
        Some(value) => {
            serde_json::from_value(value).map_err(|_| "Local recovery could not be read.")?
        }
        None => vec![],
    };
    bound_recordings(&mut rows);
    rows.retain(|row| row.user_id == user_id);
    for row in &mut rows {
        if row
            .audio_file
            .as_deref()
            .is_some_and(|path| !std::path::Path::new(path).is_file())
        {
            row.audio_file = None;
        }
    }
    Ok(rows)
}
fn prune(rows: &mut Vec<Entry>, now: u64) {
    rows.retain(|row| row.timestamp <= now && now - row.timestamp < RETENTION_MS);
    if rows.len() > EVENT_LIMIT {
        rows.drain(..rows.len() - EVENT_LIMIT);
    }
}
pub fn record(app: &AppHandle, owner: &str, event: Event) {
    let _ = (|| -> Result<(), String> {
        let _lock = LOCK.lock().map_err(|_| "Diagnostics unavailable.")?;
        let store = app.store(file()).map_err(|e| e.to_string())?;
        let mut rows: Vec<Entry> = store
            .get("diagnostics")
            .and_then(|v| serde_json::from_value(v).ok())
            .unwrap_or_default();
        let now = now_ms();
        rows.push(Entry {
            owner: owner.into(),
            timestamp: now,
            event,
        });
        prune(&mut rows, now);
        store.set(
            "diagnostics",
            serde_json::to_value(rows).map_err(|e| e.to_string())?,
        );
        store.save().map_err(|e| e.to_string())
    })();
}
pub fn diagnostics(app: &AppHandle, owner: &str) -> Result<String, String> {
    let _lock = LOCK.lock().map_err(|_| "Diagnostics unavailable.")?;
    let store = app.store(file()).map_err(|e| e.to_string())?;
    let mut rows: Vec<Entry> = store
        .get("diagnostics")
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    prune(&mut rows, now_ms());
    store.set(
        "diagnostics",
        serde_json::to_value(&rows).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())?;
    let redacted: Vec<_> = rows
        .iter()
        .filter(|row| row.owner == owner)
        .map(|row| serde_json::json!({"timestamp":row.timestamp,"event":row.event}))
        .collect();
    serde_json::to_string_pretty(&serde_json::json!({"version":env!("CARGO_PKG_VERSION"),"retentionDays":14,"events":redacted})).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn originals_are_bounded_and_newest_wins() {
        let mut rows: Vec<_> = (0..15)
            .map(|i| LocalRecording {
                id: i.to_string(),
                user_id: "owner".into(),
                original_text: format!("raw {i}"),
                created_at: i,
                duration_ms: 1,
                audio_file: None,
            })
            .collect();
        bound_recordings(&mut rows);
        assert_eq!(rows.len(), 10);
        assert_eq!(rows[0].original_text, "raw 14");
        assert_eq!(rows[9].original_text, "raw 5");
    }
    #[test]
    fn diagnostic_expiry_and_overflow_are_bounded_and_content_is_fixed() {
        let now = RETENTION_MS + 1000;
        let mut rows: Vec<_> = (0..600)
            .map(|i| Entry {
                owner: "private@example.test".into(),
                timestamp: now - i,
                event: Event::DeliveryRecovery,
            })
            .collect();
        rows.push(Entry {
            owner: "secret".into(),
            timestamp: 1000,
            event: Event::TranscriptionFailed,
        });
        rows.push(Entry {
            owner: "secret".into(),
            timestamp: now + 1,
            event: Event::TranscriptionFailed,
        });
        prune(&mut rows, now);
        assert_eq!(rows.len(), EVENT_LIMIT);
        assert!(rows
            .iter()
            .all(|row| row.timestamp > 1000 && row.timestamp <= now));
        assert!(serde_json::from_str::<Event>("\"secret transcript/token\"").is_err());
    }
}
