//! Server-issued provider tokens are held only long enough to open a socket.
use crate::auth;
use serde::{de::DeserializeOwned, Deserialize};
use std::time::Duration;

#[derive(Deserialize)]
struct Envelope<T> {
    data: T,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SpeechToken {
    token: String,
    expires_in: u64,
}

pub async fn token() -> Result<String, String> {
    tokio::time::timeout(Duration::from_secs(20), async {
        let response = send(auth::speech_request("token").await?).await?;
        let token = read_json::<Envelope<SpeechToken>>(response, 65_536)
            .await?
            .data;
        validate_token(token)
    })
    .await
    .map_err(|_| "Transcription setup timed out. Check your connection and try again.")?
}

pub(crate) async fn read_json<T: DeserializeOwned>(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<T, String> {
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "The VoxType speech response was interrupted.")?
    {
        if body.len() + chunk.len() > limit {
            return Err("VoxType returned an oversized speech response.".into());
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| "VoxType returned an invalid speech response.".into())
}

fn validate_token(token: SpeechToken) -> Result<String, String> {
    if token.token.is_empty()
        || token.token.len() > 16_384
        || !token.token.bytes().all(|b| b.is_ascii_graphic())
        || token.expires_in == 0
    {
        return Err("VoxType received invalid transcription credentials.".into());
    }
    Ok(token.token)
}

pub(crate) async fn send(request: reqwest::RequestBuilder) -> Result<reqwest::Response, String> {
    let response = request
        .send()
        .await
        .map_err(|_| "Could not reach the VoxType server. Check your connection and try again.")?;
    match response.status().as_u16() {
        200..=299 => Ok(response),
        401 | 403 => Err("Your VoxType session expired. Sign out and sign in again.".into()),
        429 => Err("Too many speech requests. Try again shortly.".into()),
        _ => Err("The VoxType speech service is unavailable. Try again shortly.".into()),
    }
}
