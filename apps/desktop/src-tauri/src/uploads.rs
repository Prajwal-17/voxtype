//! Synchronize account transcripts with the cloud; audio remains a private device cache.
use crate::{auth, model::HistoryItem, storage, AppState};
use serde::{Deserialize, Serialize};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};
static LAST_RESTORE: Mutex<Option<(String, String, Instant)>> = Mutex::new(None);
// Emit once per batch, including when a later upload/restore fails after a successful write.
struct CloudChanges<'a> {
    app: &'a AppHandle,
    changed: bool,
}
impl Drop for CloudChanges<'_> {
    fn drop(&mut self) {
        if self.changed {
            let _ = self.app.emit("analytics-changed", ());
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscriptUpload<'a> {
    text: &'a str,
    created_at: u64,
    duration_ms: u64,
    source: &'static str,
}
impl<'a> From<&'a HistoryItem> for TranscriptUpload<'a> {
    fn from(item: &'a HistoryItem) -> Self {
        Self {
            text: &item.text,
            created_at: item.created_at,
            duration_ms: item.duration_ms,
            source: "desktop",
        }
    }
}

async fn flush(app: &AppHandle) -> Result<(), String> {
    let Some((user, bearer, client)) = auth::upload_session().await? else {
        return Ok(());
    };
    storage::claim_legacy_history(app, &user.id)?;
    let pending = storage::pending_uploads(app)?;
    let api_url = auth::api_url();
    let mut changes = CloudChanges {
        app,
        changed: false,
    };
    for item in pending.iter().filter(|item| {
        item.user_id.as_deref() == Some(user.id.as_str())
            && item.upload_api_url.as_deref() == Some(api_url.as_str())
    }) {
        if !owns_session(app, &user.id) {
            break;
        }
        let response = client
            .put(format!("{api_url}/v1/dictations/{}", item.id))
            .bearer_auth(&bearer)
            .json(&TranscriptUpload::from(item))
            .send()
            .await
            .map_err(|_| "Transcript is waiting to sync.")?;
        if response.status().is_success() {
            storage::acknowledge_upload(app, item)?;
            changes.changed = true;
        } else if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            break;
        }
        // Upload retries use the same transcript ID.
    }
    if LAST_RESTORE
        .lock()
        .map_err(|_| "Cloud history unavailable.")?
        .as_ref()
        .is_some_and(|(owner, api, time)| {
            owner == &user.id && api == &api_url && time.elapsed() < Duration::from_secs(120)
        })
    {
        return Ok(());
    }
    let mut cursor: Option<String> = None;
    let mut seen = std::collections::HashSet::new();
    let mut cloud_ids = std::collections::HashSet::new();
    let mut complete_listing = false;
    loop {
        if !owns_session(app, &user.id) {
            break;
        }
        let mut endpoint =
            url::Url::parse(&format!("{api_url}/v1/dictations")).map_err(|_| "Invalid API URL.")?;
        endpoint.query_pairs_mut().append_pair("limit", "100");
        if let Some(value) = &cursor {
            endpoint.query_pairs_mut().append_pair("cursor", value);
        }
        let request = client.get(endpoint).bearer_auth(&bearer);
        let response = request
            .send()
            .await
            .map_err(|_| "Cloud history unavailable.")?;
        if !response.status().is_success() {
            return Err("Cloud history unavailable.".into());
        }
        let body = crate::speech::read_json(response, 12_000_000).await?;
        let page: CloudPage = serde_json::from_value(body).map_err(|_| "Invalid cloud history.")?;
        if !owns_session(app, &user.id) {
            break;
        }
        cloud_ids.extend(page.data.iter().map(|row| row.id.clone()));
        let rows = page
            .data
            .into_iter()
            .map(|row| HistoryItem {
                id: row.id,
                text: row.text,
                original_text: None,
                created_at: row.created_at,
                duration_ms: row.duration_ms,
                words: row.words,
                delivery: "saved".into(),
                user_id: Some(user.id.clone()),
                audio_file: None,
                upload_api_url: Some(api_url.clone()),
            })
            .collect();
        changes.changed |= storage::restore_history(app, rows)?;
        cursor = page.next_cursor;
        match &cursor {
            None => {
                complete_listing = true;
                break;
            }
            Some(value) if seen.insert(value.clone()) => {}
            _ => return Err("Repeated history cursor.".into()),
        }
    }
    if complete_listing && owns_session(app, &user.id) {
        changes.changed |= storage::reconcile_history(app, &user.id, &api_url, &cloud_ids)?;
        *LAST_RESTORE
            .lock()
            .map_err(|_| "Cloud history unavailable.")? =
            Some((user.id.clone(), api_url, Instant::now()));
    }
    Ok(())
}

fn owns_session(app: &AppHandle, user_id: &str) -> bool {
    let state = app.state::<AppState>();
    state
        .authenticated
        .load(std::sync::atomic::Ordering::Acquire)
        && state
            .user
            .lock()
            .ok()
            .and_then(|user| user.as_ref().map(|user| user.id == user_id))
            .unwrap_or(false)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudPage {
    data: Vec<CloudRow>,
    next_cursor: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CloudRow {
    id: String,
    text: String,
    created_at: u64,
    duration_ms: u64,
    words: usize,
}

/// Runs after login, new recordings, and periodic retries.
pub fn send_pending(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let Ok(_lock) = state.upload_lock.try_lock() else {
            return;
        };
        if state
            .authenticated
            .load(std::sync::atomic::Ordering::Acquire)
        {
            if let Err(error) = flush(&app).await {
                let _ = app.emit("sync-error", error);
            }
        }
    });
}

#[cfg(test)]
mod privacy_tests {
    use super::*;
    #[test]
    fn upload_dto_excludes_local_original_audio_and_owner() {
        let item = HistoryItem {
            id: "id".into(),
            text: "clean".into(),
            original_text: Some("private raw".into()),
            created_at: 1,
            duration_ms: 2,
            words: 1,
            delivery: "saved".into(),
            user_id: Some("private owner".into()),
            audio_file: Some("/private.wav".into()),
            upload_api_url: Some("https://private".into()),
        };
        let payload = serde_json::to_value(TranscriptUpload::from(&item)).unwrap();
        assert_eq!(payload["text"], "clean");
        assert_eq!(payload.as_object().unwrap().len(), 4);
        assert!(!payload.to_string().contains("private"));
    }
}
