use crate::{environment, model::AuthUser, storage};
use serde::Deserialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use url::Url;

const AUTH_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Deserialize)]
struct UserResponse {
    data: AuthUser,
}

#[derive(Deserialize)]
struct SessionResponse {
    user: AuthUser,
}

fn api_url() -> String {
    option_env!("VOXTYPE_API_URL")
        .unwrap_or_else(|| {
            if environment::is_development() {
                "http://localhost:8787"
            } else {
                unreachable!("production builds require VOXTYPE_API_URL")
            }
        })
        .trim_end_matches('/')
        .to_owned()
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|_| "VoxType could not prepare a secure connection.".into())
}

async fn stored_token() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(storage::auth_token)
        .await
        .map_err(|_| "The account keyring request failed.".to_string())?
}

pub async fn current_user() -> Result<Option<AuthUser>, String> {
    let Some(token) = stored_token().await? else {
        return Ok(None);
    };

    let response = client()?
        .get(format!("{}/v1/me", api_url()))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(|_| {
            "VoxType could not reach your account. Check your connection and try again."
        })?;

    if matches!(response.status().as_u16(), 401 | 403) {
        tokio::task::spawn_blocking(storage::delete_auth_token)
            .await
            .map_err(|_| "The account keyring request failed.".to_string())??;
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err("VoxType could not verify your account. Try again in a moment.".into());
    }

    response
        .json::<UserResponse>()
        .await
        .map(|response| Some(response.data))
        .map_err(|_| "VoxType received an invalid account response.".into())
}

pub async fn sign_in(app: AppHandle) -> Result<AuthUser, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| "VoxType could not open its secure sign-in listener.")?;
    let port = listener
        .local_addr()
        .map_err(|_| "VoxType could not read its sign-in listener.")?
        .port();
    let state = uuid::Uuid::new_v4().to_string();

    let mut start_url = Url::parse(&format!("{}/api/desktop-auth/start", api_url()))
        .map_err(|_| "The VoxType API address is invalid.")?;
    start_url
        .query_pairs_mut()
        .append_pair("port", &port.to_string())
        .append_pair("state", &state);

    app.opener()
        .open_url(start_url.as_str(), None::<&str>)
        .map_err(|_| "VoxType could not open Google sign-in in your browser.")?;

    let one_time_token = wait_for_callback(listener, &state).await?;
    let response = client()?
        .post(format!("{}/api/auth/one-time-token/verify", api_url()))
        .json(&serde_json::json!({ "token": one_time_token }))
        .send()
        .await
        .map_err(|_| "VoxType could not finish sign-in. Check your connection and try again.")?;

    if !response.status().is_success() {
        return Err("The sign-in link expired. Please sign in again.".into());
    }

    let session_token = response
        .headers()
        .get("set-auth-token")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
        .ok_or_else(|| "VoxType did not receive a desktop session.".to_string())?;
    let session = response
        .json::<SessionResponse>()
        .await
        .map_err(|_| "VoxType received an invalid sign-in response.")?;

    tokio::task::spawn_blocking(move || storage::save_auth_token(&session_token))
        .await
        .map_err(|_| "The account keyring request failed.".to_string())??;

    Ok(session.user)
}

pub async fn sign_out() -> Result<(), String> {
    if let Some(token) = stored_token().await? {
        let _ = client()?
            .post(format!("{}/api/auth/sign-out", api_url()))
            .header("origin", api_url())
            .bearer_auth(token)
            .json(&serde_json::json!({}))
            .send()
            .await;
    }

    tokio::task::spawn_blocking(storage::delete_auth_token)
        .await
        .map_err(|_| "The account keyring request failed.".to_string())?
}

async fn wait_for_callback(
    listener: tokio::net::TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    tokio::time::timeout(AUTH_TIMEOUT, async {
        loop {
            let (mut socket, address) = listener
                .accept()
                .await
                .map_err(|_| "The sign-in callback could not be received.".to_string())?;
            if !address.ip().is_loopback() {
                continue;
            }

            let mut request = vec![0_u8; 8_192];
            let size = socket
                .read(&mut request)
                .await
                .map_err(|_| "The sign-in callback could not be read.".to_string())?;
            let request = String::from_utf8_lossy(&request[..size]);
            let Some(target) = request
                .lines()
                .next()
                .and_then(|line| line.split_whitespace().nth(1))
            else {
                write_browser_response(&mut socket, 400, false).await?;
                continue;
            };
            let Ok(callback) = Url::parse(&format!("http://127.0.0.1{target}")) else {
                write_browser_response(&mut socket, 400, false).await?;
                continue;
            };
            if callback.path() != "/callback" {
                write_browser_response(&mut socket, 404, false).await?;
                continue;
            }

            let params = callback
                .query_pairs()
                .collect::<std::collections::HashMap<_, _>>();
            if params.get("state").map(|value| value.as_ref()) != Some(expected_state) {
                write_browser_response(&mut socket, 400, false).await?;
                continue;
            }

            if let Some(error) = params.get("error") {
                write_browser_response(&mut socket, 200, false).await?;
                return Err(match error.as_ref() {
                    "account_not_allowed" => {
                        "That Google account is not allowed to use this VoxType workspace.".into()
                    }
                    _ => "Google sign-in was not completed. Please try again.".into(),
                });
            }

            let token = params
                .get("token")
                .filter(|token| (20..=512).contains(&token.len()))
                .map(ToString::to_string)
                .ok_or_else(|| "The sign-in callback did not contain a valid token.".to_string())?;
            write_browser_response(&mut socket, 200, true).await?;
            return Ok(token);
        }
    })
    .await
    .map_err(|_| "Google sign-in timed out. Please try again.".to_string())?
}

async fn write_browser_response(
    socket: &mut tokio::net::TcpStream,
    status: u16,
    success: bool,
) -> Result<(), String> {
    let title = if success {
        format!("Signed in to {}", environment::app_name())
    } else {
        format!("{} sign-in was not completed", environment::app_name())
    };
    let message = if success {
        format!(
            "You can close this window and return to {}.",
            environment::app_name()
        )
    } else {
        format!("Return to {} and try again.", environment::app_name())
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width\"><title>{title}</title><style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f4f1;color:#22231f;font:15px/1.6 system-ui,sans-serif}}main{{width:min(420px,calc(100% - 40px));padding:28px;border:1px solid #dedfd9;border-radius:14px;background:#fcfcfa}}h1{{margin:0;font-size:24px}}p{{margin:8px 0 0;color:#62645e}}</style></head><body><main><h1>{title}</h1><p>{message}</p></main></body></html>"
    );
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{body}",
        body.len()
    );
    socket
        .write_all(response.as_bytes())
        .await
        .map_err(|_| "The browser confirmation could not be written.".into())
}
