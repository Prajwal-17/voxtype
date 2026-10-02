//! Optional cleanup uses the authenticated server; only the finished text is sent.
use crate::{auth, speech};
use serde::Deserialize;
use std::time::Duration;

#[derive(Deserialize)]
struct CleanupResponse {
    data: CleanupResult,
}

#[derive(Deserialize)]
struct CleanupResult {
    text: String,
    cleaned: bool,
}

pub async fn clean(text: &str) -> Result<String, String> {
    if text.chars().count() > 12_000 {
        return Err("This dictation exceeds the text cleanup limit.".into());
    }
    tokio::time::timeout(Duration::from_secs(15), async {
        let response = speech::send(
            auth::speech_request("cleanup")
                .await?
                .json(&serde_json::json!({ "text": text })),
        )
        .await?;
        let result = speech::read_json::<CleanupResponse>(response, 512_000)
            .await?
            .data;
        validate_result(result, text.chars().count())
    })
    .await
    .map_err(|_| "Text cleanup timed out.".to_owned())?
}

fn validate_result(result: CleanupResult, characters: usize) -> Result<String, String> {
    let text = result.text.trim();
    if !result.cleaned {
        return Err("Text cleanup is unavailable. The original transcript was kept.".into());
    }
    if text.is_empty() || text.contains('\0') || text.chars().count() > characters * 3 + 256 {
        return Err("VoxType returned an unusable cleanup result.".into());
    }
    Ok(text.to_owned())
}
