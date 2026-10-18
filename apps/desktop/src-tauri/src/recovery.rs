//! Playback stays local; an explicit retry transcribes the original WAV and replaces one history ID.
use crate::{
    account_id, cleanup, local,
    model::{HistoryItem, Phase},
    publish, recordings, speech, storage, uploads, AppState,
};
use std::{path::PathBuf, time::Duration};
use tauri::Manager;
pub const MAX_AUDIO_BYTES: u64 = 64 * 1024 * 1024;
fn take(app: &tauri::AppHandle, id: &str, owner: &str) -> Result<local::LocalRecording, String> {
    local::recordings(app, owner)?
        .into_iter()
        .find(|row| row.id == id)
        .ok_or("Recording no longer available.".into())
}
fn audio_path(app: &tauri::AppHandle, row: &local::LocalRecording) -> Result<PathBuf, String> {
    let directory = recordings::directory(app)?
        .canonicalize()
        .map_err(|_| "Recording unavailable.")?;
    let path = PathBuf::from(
        row.audio_file
            .as_ref()
            .ok_or("Audio no longer available.")?,
    )
    .canonicalize()
    .map_err(|_| "Audio no longer available.")?;
    if path.parent() != Some(directory.as_path()) {
        return Err("Recording unavailable.".into());
    }
    let bytes = path
        .metadata()
        .map_err(|_| "Audio no longer available.")?
        .len();
    if !(45..=MAX_AUDIO_BYTES).contains(&bytes) {
        return Err("Recording is empty or exceeds the 64 MB retry limit.".into());
    }
    Ok(path)
}
#[tauri::command]
pub async fn get_recording_audio(
    app: tauri::AppHandle,
    id: String,
    expected_user_id: String,
) -> Result<tauri::ipc::Response, String> {
    if account_id(&app)? != expected_user_id {
        return Err("Account changed.".into());
    }
    let row = take(&app, &id, &expected_user_id)?;
    let path = audio_path(&app, &row)?;
    let audio = std::fs::read(path).map_err(|_| "Couldn’t read recording.")?;
    if account_id(&app)? != expected_user_id {
        return Err("Account changed.".into());
    }
    Ok(tauri::ipc::Response::new(audio))
}
pub(crate) fn transcript(body: &serde_json::Value) -> Result<String, String> {
    let text = body["results"]["channels"][0]["alternatives"][0]["transcript"]
        .as_str()
        .unwrap_or_default()
        .trim();
    if text.is_empty() || text.len() > 100_000 {
        return Err(
            "No usable speech received. Your previous text and recording are unchanged.".into(),
        );
    }
    Ok(text.into())
}
#[tauri::command]
pub async fn regenerate_transcript(
    app: tauri::AppHandle,
    id: String,
    expected_user_id: String,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let _retry = state
        .regeneration_lock
        .try_lock()
        .map_err(|_| "Another recording is already being regenerated.")?;
    if account_id(&app)? != expected_user_id {
        return Err("Account changed.".into());
    }
    if state
        .control
        .lock()
        .map_err(|_| "Session unavailable.")?
        .is_some()
    {
        return Err("Finish recording first.".into());
    }
    let row = take(&app, &id, &expected_user_id)?;
    let path = audio_path(&app, &row)?;
    // Load the bounded file once, so normal pruning cannot break an in-flight provider request.
    let audio = std::fs::read(path).map_err(|_| "Couldn’t read recording.")?;
    let settings = storage::settings(&app)?;
    local::record(&app, &expected_user_id, local::Event::RegenerationStarted);
    let result = async {
        let jwt = speech::token().await?;
        if account_id(&app)? != expected_user_id {
            return Err("Account changed.".into());
        }
        let mut url = url::Url::parse("https://api.deepgram.com/v1/listen")
            .map_err(|_| "Invalid transcription endpoint.")?;
        url.query_pairs_mut()
            .append_pair("model", "nova-3")
            .append_pair("smart_format", "true")
            .append_pair("punctuate", "true")
            .append_pair("language", &settings.language);
        for term in &settings.vocabulary {
            url.query_pairs_mut().append_pair("keyterm", term);
        }
        let response = reqwest::Client::builder()
            .timeout(Duration::from_secs(180))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Transcription unavailable.")?
            .post(url)
            .bearer_auth(jwt)
            .header("Content-Type", "audio/wav")
            .body(audio)
            .send()
            .await
            .map_err(|_| "Transcription failed. Your previous text and recording are unchanged.")?;
        if !response.status().is_success() {
            return Err(
                "Transcription failed. Your previous text and recording are unchanged.".into(),
            );
        }
        let raw = transcript(&speech::read_json(response, 8_000_000).await?)?;
        let text = if settings.cleanup_enabled {
            cleanup::clean(&raw).await.unwrap_or_else(|_| raw.clone())
        } else {
            raw.clone()
        };
        // Serialize replacement with upload/delete: an older request cannot consume this new upload revision.
        let _sync = state.upload_lock.lock().await;
        if account_id(&app)? != expected_user_id {
            return Err("Account changed.".into());
        }
        take(&app, &id, &expected_user_id)?; // A pruned take cannot be resurrected by a late response.
        storage::append_history(
            &app,
            HistoryItem {
                id: id.clone(),
                text: text.clone(),
                original_text: Some(raw),
                created_at: row.created_at,
                duration_ms: row.duration_ms,
                words: text.split_whitespace().count(),
                delivery: "saved".into(),
                user_id: Some(expected_user_id.clone()),
                audio_file: row.audio_file,
                upload_api_url: Some(crate::auth::api_url()),
            },
        )?;
        let mut snapshot = state
            .snapshot
            .lock()
            .map_err(|_| "Session unavailable.")?
            .clone();
        if snapshot.session_id == id && matches!(snapshot.phase, Phase::Done | Phase::Error) {
            snapshot.text = text.clone();
            snapshot.original_text = None;
            snapshot.phase = Phase::Done;
            snapshot.delivery = "saved".into();
            snapshot.message = "Transcript regenerated.".into();
            publish(&app, &snapshot);
        }
        Ok(text)
    }
    .await;
    local::record(
        &app,
        &expected_user_id,
        if result.is_ok() {
            local::Event::RegenerationComplete
        } else {
            local::Event::RegenerationFailed
        },
    );
    if result.is_ok() {
        uploads::send_pending(app.clone());
    }
    result
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failed_or_empty_regeneration_cannot_replace_a_transcript() {
        for body in [
            serde_json::json!({"error":"offline"}),
            serde_json::json!({"results":{"channels":[{"alternatives":[{"transcript":"  "}]}]}}),
        ] {
            assert!(transcript(&body).is_err());
        }
        assert_eq!(transcript(&serde_json::json!({"results":{"channels":[{"alternatives":[{"transcript":"Recovered full plan"}]}]}})).unwrap(),"Recovered full plan");
    }
}
