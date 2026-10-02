//! Each new transcript sends local unsent transcripts once. No audio is uploaded.
use crate::{auth, model::HistoryItem, storage, AppState};
use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscriptUpload<'a> {
    text: &'a str,
    original_text: Option<&'a str>,
    created_at: u64,
    duration_ms: u64,
    source: &'static str,
}
impl<'a> From<&'a HistoryItem> for TranscriptUpload<'a> {
    fn from(item: &'a HistoryItem) -> Self {
        Self {
            text: &item.text,
            original_text: item
                .original_text
                .as_deref()
                .filter(|t| !t.trim().is_empty()),
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
    for item in pending.iter().filter(|item| {
        item.user_id.as_deref() == Some(user.id.as_str())
            && item.upload_api_url.as_deref() == Some(api_url.as_str())
    }) {
        if !app
            .state::<AppState>()
            .authenticated
            .load(std::sync::atomic::Ordering::Acquire)
        {
            break;
        }
        let response = client
            .put(format!("{api_url}/v1/dictations/{}", item.id))
            .bearer_auth(&bearer)
            .json(&TranscriptUpload::from(item))
            .send()
            .await
            .map_err(|_| "Transcript kept locally until the next dictation.")?;
        if response.status().is_success() {
            storage::acknowledge_upload(app, item)?;
        } else if response.status().as_u16() == 401 || response.status().as_u16() == 403 {
            break;
        }
        // The response body is deliberately unused: local history is authoritative.
    }
    Ok(())
}

/// Called only after saving a newly generated transcript, never on a timer or sign-in.
pub fn send_pending(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let _lock = state.upload_lock.lock().await;
        if state
            .authenticated
            .load(std::sync::atomic::Ordering::Acquire)
        {
            let _ = flush(&app).await;
        }
    });
}
