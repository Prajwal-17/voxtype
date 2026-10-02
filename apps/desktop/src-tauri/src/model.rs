use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: String,
    pub microphone: String,
    pub auto_paste: bool,
    pub cleanup_enabled: bool,
    pub voice_detection: bool,
    pub launch_at_login: bool,
    pub vocabulary: Vec<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".into(),
            microphone: String::new(),
            auto_paste: true,
            cleanup_enabled: false,
            voice_detection: true,
            launch_at_login: true,
            vocabulary: vec![],
        }
    }
}
impl Settings {
    pub fn validate(&self) -> Result<(), String> {
        if ![
            "en", "en-US", "en-GB", "hi", "multi", "es", "fr", "de", "pt", "ja",
        ]
        .contains(&self.language.as_str())
        {
            return Err("Choose a supported transcription language.".into());
        }
        if self.microphone.len() > 512 || self.microphone.contains('\0') {
            return Err("Invalid microphone name.".into());
        }
        if self.vocabulary.len() > 100
            || self
                .vocabulary
                .iter()
                .any(|x| x.is_empty() || x.len() > 100)
        {
            return Err("Use at most 100 vocabulary entries, each 1–100 characters.".into());
        }
        Ok(())
    }
}

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: String,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
    pub created_at: u64,
    pub duration_ms: u64,
    pub words: usize,
    pub delivery: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub user_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub audio_file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upload_api_url: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub session_id: String,
    pub phase: Phase,
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_text: Option<String>,
    pub interim: String,
    pub level: f32,
    pub speech_active: bool,
    pub elapsed_ms: u64,
    pub message: String,
    pub delivery: String,
    pub is_test: bool,
    pub external: bool,
    pub cleanup_warning: String,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    #[default]
    Idle,
    Listening,
    Finishing,
    Cleaning,
    Done,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub startup_available: bool,
    pub settings: Settings,
    pub snapshot: Snapshot,
    pub shortcut_registered: bool,
    pub version: String,
    pub environment: String,
    pub shortcut_id: String,
    pub shortcut_label: String,
    pub shortcut_options: Vec<ShortcutOption>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutOption {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub image: Option<String>,
}

#[derive(Serialize)]
pub struct Microphone {
    pub id: String,
    pub name: String,
}

#[derive(Serialize)]
pub struct Diagnostic {
    pub name: String,
    pub status: String,
    pub detail: String,
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
