//! One account dictionary, with a local cache for recording while offline.
use crate::{auth, environment, speech, storage, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Dictionary {
    pub terms: Vec<String>,
    pub sync_error: Option<String>,
}
#[derive(Deserialize)]
struct Document {
    terms: Vec<String>,
}
fn key(user: &str) -> String {
    format!("dictionary:{}", json!([auth::api_url(), user]))
}
fn owner(app: &AppHandle) -> Option<String> {
    let state = app.state::<AppState>();
    if !state.authenticated.load(Ordering::Acquire) {
        return None;
    }
    let user = state.user.lock().ok()?.as_ref()?.id.clone();
    Some(user)
}
pub fn cached(app: &AppHandle) -> Result<Vec<String>, String> {
    match owner(app) {
        Some(user) => cached_for(app, &user),
        None => Ok(vec![]),
    }
}
fn cached_for(app: &AppHandle, user: &str) -> Result<Vec<String>, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    store
        .get(key(user))
        .map(serde_json::from_value)
        .transpose()
        .map(|terms| terms.unwrap_or_default())
        .map_err(|_| "Could not read your dictionary cache.".into())
}
fn pending_import(app: &AppHandle, user: &str) -> Result<Option<Value>, String> {
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    if store.get("dictionaryLegacyOwner").is_none() {
        let terms = storage::device_settings(app)?.vocabulary;
        store.set("dictionaryLegacyOwner", json!(key(user)));
        if store.get(key(user)).is_none() {
            store.set(key(user), json!(terms));
        }
        if !terms.is_empty() {
            store.set(
                "dictionaryLegacyImport",
                json!({ "base": [], "terms": terms, "importId": uuid::Uuid::new_v4().to_string() }),
            );
        }
        // Persist the owner before any network call, including failed imports.
        store.save().map_err(|e| e.to_string())?;
    }
    if store.get("dictionaryLegacyOwner") == Some(json!(key(user))) {
        Ok(store.get("dictionaryLegacyImport"))
    } else {
        Ok(None)
    }
}
fn check_owner(app: &AppHandle, user: &str) -> Result<(), String> {
    if owner(app).as_deref() != Some(user) {
        return Err("Your account changed. Open the dictionary again.".into());
    }
    Ok(())
}
async fn fetch(
    client: &reqwest::Client,
    token: &str,
    patch: Option<Value>,
) -> Result<Vec<String>, String> {
    let url = format!("{}/v1/dictionary", auth::api_url());
    let request = match patch {
        Some(body) => client.patch(url).json(&body),
        None => client.get(url),
    };
    let response = request
        .bearer_auth(token)
        .send()
        .await
        .map_err(|_| "Couldn’t sync your dictionary. Check your connection.")?;
    if !response.status().is_success() {
        let error = speech::read_json::<Value>(response, 65_536).await.ok();
        return Err(error
            .as_ref()
            .and_then(|v| v["error"]["message"].as_str())
            .unwrap_or("Couldn’t sync your dictionary. Please try again.")
            .into());
    }
    let document = speech::read_json::<Document>(response, 65_536).await?;
    validate(&document.terms)?;
    Ok(document.terms)
}
fn validate(terms: &[String]) -> Result<(), String> {
    if terms.len() > 100
        || terms
            .iter()
            .any(|term| term.trim().is_empty() || term.chars().count() > 100)
    {
        return Err("Use at most 100 terms, each up to 100 characters.".into());
    }
    Ok(())
}
async fn exchange(
    app: &AppHandle,
    expected_user: &str,
    patch: Option<Value>,
) -> Result<Vec<String>, String> {
    let state = app.state::<AppState>();
    let _guard = state.dictionary_lock.lock().await;
    check_owner(app, expected_user)?;
    let pending = pending_import(app, expected_user)?;
    let (user, token, client) = auth::upload_session()
        .await?
        .ok_or("Sign in to sync your dictionary.")?;
    if user.id != expected_user {
        return Err("Your account changed. Open the dictionary again.".into());
    }
    check_owner(app, expected_user)?;
    let imported = if let Some(body) = pending {
        Some(fetch(&client, &token, Some(body)).await?)
    } else {
        None
    };
    check_owner(app, expected_user)?;
    let store = app
        .store(environment::store_file())
        .map_err(|e| e.to_string())?;
    if let Some(terms) = imported.as_ref() {
        store.set(key(expected_user), json!(terms));
        store.delete("dictionaryLegacyImport");
        store.save().map_err(|e| e.to_string())?;
    }
    let terms = match (patch, imported) {
        (None, Some(terms)) => terms,
        (patch, _) => fetch(&client, &token, patch).await?,
    };
    check_owner(app, expected_user)?;
    store.set(key(expected_user), json!(terms));
    store.save().map_err(|e| e.to_string())?;
    Ok(terms)
}
#[tauri::command]
pub async fn get_dictionary(
    app: AppHandle,
    expected_user_id: String,
) -> Result<Dictionary, String> {
    check_owner(&app, &expected_user_id)?;
    match exchange(&app, &expected_user_id, None).await {
        Ok(terms) => Ok(Dictionary {
            terms,
            sync_error: None,
        }),
        Err(error) => {
            check_owner(&app, &expected_user_id)?;
            Ok(Dictionary {
                terms: cached_for(&app, &expected_user_id)?,
                sync_error: Some(error),
            })
        }
    }
}
#[tauri::command]
pub async fn update_dictionary(
    app: AppHandle,
    expected_user_id: String,
    base: Vec<String>,
    terms: Vec<String>,
) -> Result<Dictionary, String> {
    validate(&base)?;
    validate(&terms)?;
    let terms = exchange(
        &app,
        &expected_user_id,
        Some(json!({ "base": base, "terms": terms })),
    )
    .await?;
    Ok(Dictionary {
        terms,
        sync_error: None,
    })
}
pub fn refresh(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        if let Some(user) = owner(&app) {
            let _ = exchange(&app, &user, None).await;
        }
    });
}
