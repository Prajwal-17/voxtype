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

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    async fn server(status: u16, body: &str) -> (String, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}/v1/speech/token", listener.local_addr().unwrap());
        let body = body.to_owned();
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut bytes = [0; 2048];
            while !request.windows(4).any(|part| part == b"\r\n\r\n") {
                let count = socket.read(&mut bytes).await.unwrap();
                assert!(count > 0);
                request.extend_from_slice(&bytes[..count]);
            }
            let response = format!(
                "HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            String::from_utf8(request).unwrap()
        });
        (url, task)
    }

    fn client() -> reqwest::Client {
        let _ = rustls::crypto::ring::default_provider().install_default();
        reqwest::Client::new()
    }

    #[tokio::test]
    async fn server_credentials_use_the_account_bearer_and_decode_the_shared_contract() {
        let (url, request) = server(
            200,
            r#"{"data":{"token":"temporary.jwt.token","expiresIn":60}}"#,
        )
        .await;
        let response = send(client().post(url).bearer_auth("account-session"))
            .await
            .unwrap();
        let envelope: Envelope<SpeechToken> = read_json(response, 65_536).await.unwrap();
        assert_eq!(
            validate_token(envelope.data).unwrap(),
            "temporary.jwt.token"
        );
        let request = request.await.unwrap();
        assert!(request.starts_with("POST /v1/speech/token "));
        assert!(request.contains("authorization: Bearer account-session"));
    }

    #[tokio::test]
    async fn server_failures_never_expose_provider_response_details() {
        for (status, message) in [
            (401, "Sign out and sign in again"),
            (403, "Sign out and sign in again"),
            (429, "Try again shortly"),
            (502, "unavailable"),
        ] {
            let (url, request) = server(status, "provider-secret").await;
            let error = send(client().post(url)).await.unwrap_err();
            assert!(error.contains(message));
            assert!(!error.contains("provider-secret"));
            request.await.unwrap();
        }
    }

    #[tokio::test]
    async fn invalid_and_oversized_server_responses_fail_explicitly() {
        for (body, limit) in [("not JSON".into(), 100), ("x".repeat(129), 128)] {
            let (url, request) = server(200, &body).await;
            let response = send(client().post(url)).await.unwrap();
            assert!(read_json::<serde_json::Value>(response, limit)
                .await
                .is_err());
            request.await.unwrap();
        }
    }

    #[test]
    fn server_token_must_be_valid_for_a_bearer_header_and_unexpired() {
        for (token, expires_in) in [("", 60), ("bad\nheader", 60), ("jwt", 0)] {
            assert!(validate_token(SpeechToken {
                token: token.into(),
                expires_in
            })
            .is_err());
        }
        let response: Envelope<SpeechToken> =
            serde_json::from_str(r#"{"data":{"token":"temporary.jwt.token","expiresIn":60}}"#)
                .unwrap();
        assert_eq!(
            validate_token(response.data).unwrap(),
            "temporary.jwt.token"
        );
    }
}
