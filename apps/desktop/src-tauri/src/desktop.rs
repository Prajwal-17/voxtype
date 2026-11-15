//! Ubuntu adapters. All subprocess arguments are separate: no shell or interpolated commands.
use crate::{
    environment,
    model::{Diagnostic, Microphone, ShortcutOption},
};
use gio::prelude::*;
use serde::Deserialize;
use std::time::Duration;
use tokio::{process::Command, time::timeout};

const MEDIA_KEYS: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM_KEY: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";
// Linux KEY_RIGHTALT (100) plus XKB's offset (8). Bind the physical right Alt key.
const RIGHT_ALT: &str = "0x6c";

fn gnome_settings() -> Result<(gio::Settings, gio::Settings), String> {
    let source =
        gio::SettingsSchemaSource::default().ok_or("GNOME keyboard settings are unavailable.")?;
    if source.lookup(MEDIA_KEYS, true).is_none() || source.lookup(CUSTOM_KEY, true).is_none() {
        return Err("Use your desktop's keyboard settings to bind VoxType's command.".into());
    }
    Ok((
        gio::Settings::new(MEDIA_KEYS),
        gio::Settings::with_path(CUSTOM_KEY, environment::shortcut_path()),
    ))
}
pub struct ShortcutSpec {
    pub id: String,
    pub label: String,
    binding: String,
}

const SHORTCUTS: [(&str, &str, &str); 6] = [
    ("right-alt", "Right Alt", RIGHT_ALT),
    ("ctrl-alt-space", "Ctrl Alt Space", "<Control><Alt>space"),
    (
        "ctrl-shift-space",
        "Ctrl Shift Space",
        "<Control><Shift>space",
    ),
    (
        "super-shift-space",
        "Super Shift Space",
        "<Super><Shift>space",
    ),
    ("ctrl-alt-d", "Ctrl Alt D", "<Control><Alt>d"),
    ("f8", "F8", "F8"),
];

pub fn shortcut(shortcut_id: &str) -> Option<ShortcutSpec> {
    if let Some((id, label, binding)) = SHORTCUTS.iter().find(|(id, _, _)| *id == shortcut_id) {
        return Some(ShortcutSpec {
            id: (*id).into(),
            label: (*label).into(),
            binding: (*binding).into(),
        });
    }
    let binding = shortcut_id.strip_prefix("custom:")?;
    if binding.is_empty() || binding.len() > 96 || !binding.is_ascii() {
        return None;
    }
    let mut remainder = binding;
    let mut labels = Vec::new();
    for (token, label) in [
        ("<Control>", "Ctrl"),
        ("<Alt>", "Alt"),
        ("<Shift>", "Shift"),
        ("<Super>", "Super"),
    ] {
        if let Some(rest) = remainder.strip_prefix(token) {
            labels.push(label);
            remainder = rest;
        }
    }
    if remainder.is_empty()
        || !remainder
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
        || gtk::gdk::keys::Key::from_name(remainder) == gtk::gdk::keys::constants::VoidSymbol
        || (labels.is_empty() && !is_function_key(remainder))
    {
        return None;
    }
    let key_label = match remainder {
        "space" => "Space".into(),
        "Return" => "Enter".into(),
        "BackSpace" => "Backspace".into(),
        "Page_Up" => "Page Up".into(),
        "Page_Down" => "Page Down".into(),
        "Escape" => "Esc".into(),
        "comma" => ",".into(),
        "period" => ".".into(),
        "slash" => "/".into(),
        "semicolon" => ";".into(),
        "apostrophe" => "'".into(),
        "bracketleft" => "[".into(),
        "bracketright" => "]".into(),
        "backslash" => "\\".into(),
        "minus" => "-".into(),
        "equal" => "=".into(),
        "grave" => "`".into(),
        other => other.replace('_', " ").to_uppercase(),
    };
    labels.push(&key_label);
    Some(ShortcutSpec {
        id: shortcut_id.into(),
        label: labels.join(" "),
        binding: binding.into(),
    })
}

fn is_function_key(key: &str) -> bool {
    key.strip_prefix('F')
        .and_then(|number| number.parse::<u8>().ok())
        .is_some_and(|number| (1..=24).contains(&number))
}

pub fn default_shortcut() -> ShortcutSpec {
    shortcut(environment::default_shortcut_id()).expect("default shortcut must be supported")
}

pub fn shortcut_options() -> Vec<ShortcutOption> {
    SHORTCUTS
        .iter()
        .map(|(id, label, _)| ShortcutOption {
            id: (*id).into(),
            label: (*label).into(),
        })
        .collect()
}

// A conflicting entry is stale when its command points at an executable that no
// longer exists (for example, left behind by a renamed or uninstalled app).
// Stale entries are evicted so they neither hijack the key nor block registration.
fn command_executable_missing(binding: &gio::Settings) -> bool {
    let command = binding.string("command");
    if command.is_empty() {
        return false;
    }
    match glib::shell_parse_argv(&command) {
        Ok(argv) => argv
            .first()
            .map(|exe| !std::path::Path::new(exe).exists())
            .unwrap_or(false),
        Err(_) => false,
    }
}

pub fn install_shortcut(shortcut_id: &str) -> Result<(), String> {
    let shortcut = shortcut(shortcut_id).ok_or("Choose a supported recording shortcut.")?;
    let accelerator = &shortcut.binding;
    let (settings, binding) = gnome_settings()?;
    let paths: Vec<String> = settings
        .strv("custom-keybindings")
        .iter()
        .map(|p| p.to_string())
        .collect();
    let mut kept: Vec<String> = Vec::with_capacity(paths.len());
    for path in &paths {
        if path == environment::shortcut_path() {
            kept.push(path.clone());
            continue;
        }
        let existing = gio::Settings::with_path(CUSTOM_KEY, path);
        let existing_binding = existing.string("binding");
        let conflicts = existing_binding.eq_ignore_ascii_case(accelerator)
            || (shortcut.id == "right-alt"
                && matches!(existing_binding.as_str(), "Alt_R" | "ISO_Level3_Shift"));
        if conflicts {
            if command_executable_missing(&existing) {
                continue;
            }
            return Err(format!(
                "{} is already assigned to {}. Remove that binding in Ubuntu Settings, then enable {}’s shortcut again.",
                shortcut.label,
                existing.string("name"),
                environment::app_name(),
            ));
        }
        kept.push(path.clone());
    }
    let executable =
        std::env::current_exe().map_err(|_| "Could not locate the VoxType executable.")?;
    let command = format!(
        "{} toggle",
        glib::shell_quote(executable.as_os_str()).to_string_lossy()
    );
    binding
        .set_string("name", &format!("{} dictation", environment::app_name()))
        .map_err(|e| e.to_string())?;
    binding
        .set_string("command", &command)
        .map_err(|e| e.to_string())?;
    binding
        .set_string("binding", accelerator)
        .map_err(|e| e.to_string())?;
    if !kept.iter().any(|p| p == environment::shortcut_path()) {
        kept.push(environment::shortcut_path().into());
    }
    settings
        .set_strv("custom-keybindings", kept)
        .map_err(|e| e.to_string())?;
    gio::Settings::sync();
    Ok(())
}

pub fn wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE").unwrap_or_default() == "wayland"
}

pub async fn output(program: &str, args: &[&str]) -> Result<std::process::Output, String> {
    timeout(
        Duration::from_secs(4),
        Command::new(program).args(args).kill_on_drop(true).output(),
    )
    .await
    .map_err(|_| format!("{program} took too long to respond."))?
    .map_err(|_| format!("{program} is unavailable. Check desktop setup in Settings."))
}
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct AudioSource {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

fn parse_sources(bytes: &[u8]) -> Result<Vec<AudioSource>, String> {
    let sources: Vec<AudioSource> =
        serde_json::from_slice(bytes).map_err(|_| "Could not read the microphone list.")?;
    Ok(sources
        .into_iter()
        .filter(|source| !source.name.ends_with(".monitor"))
        .collect())
}

pub async fn audio_sources() -> Result<Vec<AudioSource>, String> {
    let out = output("pactl", &["--format=json", "list", "sources"]).await?;
    if !out.status.success() {
        return Err("Cannot reach the desktop audio service. Check Sound settings.".into());
    }
    parse_sources(&out.stdout)
}

async fn pactl_text(args: &[&str]) -> Option<String> {
    let out = output("pactl", args).await.ok()?;
    if !out.status.success() {
        return None;
    }
    let value = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!value.is_empty()).then_some(value)
}

async fn default_source() -> Option<String> {
    pactl_text(&["get-default-source"]).await
}

async fn default_sink() -> Option<String> {
    pactl_text(&["get-default-sink"]).await
}

async fn bluetooth_cards() -> Result<Vec<serde_json::Value>, String> {
    let out = output("pactl", &["--format=json", "list", "cards"]).await?;
    if !out.status.success() {
        return Err("Cannot reach the desktop audio service. Check Sound settings.".into());
    }
    serde_json::from_slice(&out.stdout)
        .map_err(|_| "Could not read the Bluetooth device list.".into())
}

// CVSD is narrower but far more widely compatible than mSBC. Several widely
// reported BlueZ/PipeWire adapter combinations corrupt mSBC SCO packets while
// CVSD keeps working, so explicit call mode starts with the compatibility
// codec. The quality tradeoff is documented in the desktop README.
const HEADSET_PROFILES: [&str; 3] = [
    "headset-head-unit-cvsd",
    "headset-head-unit-msbc",
    "headset-head-unit",
];

fn headset_profile(card: &serde_json::Value) -> Option<&str> {
    let profiles = card["profiles"].as_object()?;
    HEADSET_PROFILES.iter().copied().find(|candidate| {
        profiles.get(*candidate).is_some_and(|profile| {
            profile["sources"].as_u64().unwrap_or(0) > 0
                && profile["available"].as_bool().unwrap_or(false)
        })
    })
}

/// A2DP carries playback only. A Bluetooth microphone exists only after the
/// card is switched to a headset profile, which is an explicit, disruptive
/// choice on many adapters. Automatic mode therefore never makes that switch.
pub fn bluetooth_card_microphones(cards: &[serde_json::Value]) -> Vec<Microphone> {
    let mut entries = Vec::new();
    for card in cards {
        let Some(name) = card["name"].as_str() else {
            continue;
        };
        if !name.starts_with("bluez_card.") {
            continue;
        }
        let active = card["active_profile"].as_str().unwrap_or_default();
        // An off card can still be a connected headset. Offer call mode so the
        // explicit choice can turn it back on; automatic mode does not.
        if active.is_empty() || active.starts_with("headset-head-unit") {
            continue;
        }
        if headset_profile(card).is_none() {
            continue;
        }
        let description = card["properties"]["device.description"]
            .as_str()
            .or_else(|| card["properties"]["device.product.name"].as_str())
            .unwrap_or(name);
        entries.push(Microphone {
            id: format!("bluetooth:{name}"),
            name: format!("{description} microphone (call mode)"),
        });
    }
    entries
}

pub async fn microphones() -> Result<Vec<Microphone>, String> {
    let (sources, cards) = tokio::join!(audio_sources(), bluetooth_cards());
    let mut entries: Vec<Microphone> = sources?
        .into_iter()
        .map(|source| Microphone {
            id: source.name,
            name: if source.description.is_empty() {
                "Microphone".into()
            } else {
                source.description
            },
        })
        .collect();
    if let Ok(cards) = cards {
        entries.extend(bluetooth_card_microphones(&cards));
    }
    Ok(entries)
}

fn bluez_identity(name: &str, prefix: &str) -> Option<String> {
    let identity = name.strip_prefix(prefix)?.split('.').next()?;
    if identity.is_empty() {
        None
    } else {
        Some(identity.to_ascii_lowercase())
    }
}

fn bluetooth_source_identity(name: &str) -> Option<String> {
    bluez_identity(name, "bluez_input.").or_else(|| bluez_identity(name, "bluez_source."))
}

fn is_bluetooth_source(source: &AudioSource) -> bool {
    bluetooth_source_identity(&source.name).is_some()
}

fn is_headset_source(source: &AudioSource) -> bool {
    let name = source.name.to_ascii_lowercase();
    let description = source.description.to_ascii_lowercase();
    bluetooth_source_identity(&source.name).is_some()
        || name.starts_with("alsa_input.usb-")
        || [
            "headset",
            "headphone",
            "earbud",
            "buds",
            "airpods",
            "bluetooth",
            "phone",
            "handsfree",
            "hands-free",
        ]
        .iter()
        .any(|word| description.contains(word))
}

pub fn preferred_source(
    sources: &[AudioSource],
    default_source: Option<&str>,
    default_sink: Option<&str>,
) -> Option<String> {
    let sources: Vec<&AudioSource> = sources
        .iter()
        .filter(|source| !source.name.ends_with(".monitor"))
        .collect();
    if let Some(identity) = default_sink.and_then(|sink| bluez_identity(sink, "bluez_output.")) {
        if let Some(source) = sources.iter().find(|source| {
            bluez_identity(&source.name, "bluez_input.").as_deref() == Some(identity.as_str())
        }) {
            return Some(source.name.clone());
        }
    }
    if let Some(source) = sources.iter().find(|source| is_headset_source(source)) {
        return Some(source.name.clone());
    }
    if let Some(default) = default_source {
        if let Some(source) = sources.iter().find(|source| source.name == default) {
            return Some(source.name.clone());
        }
    }
    sources.first().map(|source| source.name.clone())
}

pub fn automatic_source(
    sources: &[AudioSource],
    default_source: Option<&str>,
    default_sink: Option<&str>,
) -> Option<String> {
    let candidates: Vec<AudioSource> = sources
        .iter()
        .filter(|source| !is_bluetooth_source(source))
        .cloned()
        .collect();
    preferred_source(&candidates, default_source, default_sink)
}

#[derive(Clone, Debug, PartialEq)]
pub struct BluetoothSwitch {
    pub card: String,
    pub profile: String,
    pub previous_profile: String,
}

pub fn find_bluetooth_switch(
    cards: &[serde_json::Value],
    identity: Option<&str>,
) -> Option<BluetoothSwitch> {
    let mut fallback = None;
    for card in cards {
        let Some(name) = card["name"].as_str() else {
            continue;
        };
        if !name.starts_with("bluez_card.") {
            continue;
        }
        let active = card["active_profile"].as_str().unwrap_or_default();
        // "off" is a valid connected state; remember it so restore turns the
        // card back off after an explicit take.
        if active.is_empty() || active.starts_with("headset-head-unit") {
            continue;
        }
        let Some(profile) = headset_profile(card) else {
            continue;
        };
        let switch = BluetoothSwitch {
            card: name.to_string(),
            profile: profile.to_string(),
            previous_profile: active.to_string(),
        };
        if identity
            .is_some_and(|identity| name.eq_ignore_ascii_case(&format!("bluez_card.{identity}")))
        {
            return Some(switch);
        }
        // A missing explicitly selected card must not silently switch a
        // different connected headset.
        if identity.is_none() && fallback.is_none() {
            fallback = Some(switch);
        }
    }
    fallback
}

/// Both the synthetic tray id and a saved `bluez_input.<id>.<suffix>` name
/// identify the same Bluetooth card.
fn bluetooth_identity(value: &str) -> Option<String> {
    let rest = value
        .strip_prefix("bluetooth:")
        .and_then(|card| card.strip_prefix("bluez_card."))
        .or_else(|| value.strip_prefix("bluez_input."))
        .or_else(|| value.strip_prefix("bluez_source."))?;
    let identity = rest.split('.').next()?;
    if identity.is_empty() {
        None
    } else {
        Some(identity.to_ascii_lowercase())
    }
}

fn bluetooth_source(sources: &[AudioSource], identity: &str) -> Option<String> {
    sources
        .iter()
        .find(|source| bluetooth_source_identity(&source.name).as_deref() == Some(identity))
        .map(|source| source.name.clone())
}

#[derive(Clone, Debug, PartialEq)]
pub enum InputPlan {
    Use(String),
    Switch {
        identity: String,
        switch: BluetoothSwitch,
    },
    Unavailable,
}

pub fn plan_input(
    requested: &str,
    sources: &[AudioSource],
    cards: &[serde_json::Value],
    default_source: Option<&str>,
    default_sink: Option<&str>,
) -> InputPlan {
    if requested.is_empty() {
        return match automatic_source(sources, default_source, default_sink) {
            Some(source) => InputPlan::Use(source),
            None => InputPlan::Unavailable,
        };
    }
    if sources.iter().any(|source| source.name == requested) {
        return InputPlan::Use(requested.to_string());
    }
    // An explicit selection that is gone must fail visibly. Silently using a
    // different microphone makes the Home screen's selected device a lie.
    let Some(identity) = bluetooth_identity(requested) else {
        return InputPlan::Unavailable;
    };
    if let Some(source) = bluetooth_source(sources, &identity) {
        return InputPlan::Use(source);
    }
    match find_bluetooth_switch(cards, Some(&identity)) {
        Some(switch) => InputPlan::Switch { identity, switch },
        None => InputPlan::Unavailable,
    }
}

async fn switch_card_profile(card: &str, profile: &str) -> Result<(), String> {
    let out = output("pactl", &["set-card-profile", card, profile]).await?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!(
            "pactl set-card-profile {card} {profile} exited with {}",
            out.status
        ))
    }
}

/// A source node appearing in `pactl list sources` is not proof that the new
/// HFP transport has settled. Wait for the card to report a headset profile
/// and keep the same source visible for a short quiet period before opening
/// parec. Otherwise the first seconds can be captured during codec setup.
fn bluetooth_profile_active(cards: &[serde_json::Value], card: &str, profile: &str) -> bool {
    cards.iter().any(|candidate| {
        candidate["name"].as_str() == Some(card)
            && candidate["active_profile"]
                .as_str()
                .is_some_and(|active| active == profile || active.starts_with("headset-head-unit"))
    })
}

const BLUETOOTH_READY_BUDGET: Duration = Duration::from_secs(4);
const BLUETOOTH_READY_STABLE: Duration = Duration::from_millis(250);
const BLUETOOTH_READY_POLL: Duration = Duration::from_millis(100);

async fn probe_bluetooth_ready(
    card: &str,
    profile: &str,
    identity: &str,
) -> (bool, Option<String>) {
    let cards = bluetooth_cards().await.unwrap_or_default();
    let profile_ready = bluetooth_profile_active(&cards, card, profile);
    let source = audio_sources()
        .await
        .ok()
        .and_then(|sources| bluetooth_source(&sources, identity));
    (profile_ready, source)
}

async fn wait_for_bluetooth_ready(card: &str, profile: &str, identity: &str) -> Option<String> {
    wait_for_bluetooth_ready_with(BLUETOOTH_READY_BUDGET, || {
        probe_bluetooth_ready(card, profile, identity)
    })
    .await
}

/// Both probes are bounded by one overall budget. Sequential per-command timeouts
/// must not turn a slow audio service into minutes of waiting before a take.
async fn wait_for_bluetooth_ready_with<F, Fut>(budget: Duration, mut probe: F) -> Option<String>
where
    F: FnMut() -> Fut,
    Fut: std::future::Future<Output = (bool, Option<String>)>,
{
    let deadline = tokio::time::Instant::now() + budget;
    let mut ready_since: Option<tokio::time::Instant> = None;
    loop {
        let now = tokio::time::Instant::now();
        if now >= deadline {
            return None;
        }
        // Dropping a timed-out probe also kills its bounded pactl child.
        let (profile_ready, source) = match timeout(deadline - now, probe()).await {
            Ok(result) => result,
            Err(_) => return None,
        };
        if profile_ready && source.is_some() {
            match ready_since {
                Some(since) if since.elapsed() >= BLUETOOTH_READY_STABLE => return source,
                Some(_) => {}
                None => ready_since = Some(tokio::time::Instant::now()),
            }
        } else {
            ready_since = None;
        }
        let now = tokio::time::Instant::now();
        if now >= deadline {
            return None;
        }
        tokio::time::sleep(BLUETOOTH_READY_POLL.min(deadline - now)).await;
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct PreparedInput {
    pub device: Option<String>,
    pub restore_profile: Option<(String, String)>,
    pub bluetooth: bool,
}

fn prepared(device: Option<String>, restore_profile: Option<(String, String)>) -> PreparedInput {
    let bluetooth = device
        .as_deref()
        .is_some_and(|device| bluetooth_source_identity(device).is_some());
    PreparedInput {
        device,
        restore_profile,
        bluetooth,
    }
}

fn has_usable_headset(cards: &[serde_json::Value]) -> bool {
    cards.iter().any(|card| {
        card["name"]
            .as_str()
            .is_some_and(|name| name.starts_with("bluez_card.") && headset_profile(card).is_some())
    })
}

fn unavailable_microphone(
    requested: &str,
    sources: &[AudioSource],
    cards: &[serde_json::Value],
) -> String {
    if !requested.is_empty() {
        if bluetooth_identity(requested).is_some() {
            "The selected Bluetooth microphone is unavailable. Reconnect the headset, or choose Automatic or another microphone in Settings.".into()
        } else {
            "The selected microphone is unavailable. Choose another microphone in Settings.".into()
        }
    } else if (!sources.is_empty() && sources.iter().all(is_bluetooth_source))
        || has_usable_headset(cards)
    {
        "Automatic mode does not start Bluetooth call mode. Choose a microphone in Settings.".into()
    } else {
        "No microphone is available. Check that one is connected, then try again.".into()
    }
}

fn bluetooth_switch_failed() -> String {
    "The Bluetooth headset did not switch to call mode. Reconnect it, or choose Automatic or another microphone in Settings.".into()
}

pub(crate) async fn restore_card_profile(restore: Option<(String, String)>) -> Option<String> {
    let (card, profile) = restore?;
    for attempt in 0..2 {
        match tokio::time::timeout(
            Duration::from_secs(1),
            output("pactl", &["set-card-profile", &card, &profile]),
        )
        .await
        {
            Ok(Ok(out)) if out.status.success() => return None,
            Ok(Ok(out)) => eprintln!(
                "pactl set-card-profile {card} {profile} exited with {}",
                out.status
            ),
            Ok(Err(error)) => eprintln!("pactl set-card-profile {card} {profile} failed: {error}"),
            Err(_) => eprintln!("pactl set-card-profile {card} {profile} timed out"),
        }
        if attempt == 0 {
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
    }
    Some("Could not restore the Bluetooth headset's playback profile. Reconnect it or set it in Sound settings.".into())
}

pub async fn prepare_input(requested: &str) -> Result<PreparedInput, String> {
    let (sources, default, sink, cards) = tokio::join!(
        audio_sources(),
        default_source(),
        default_sink(),
        bluetooth_cards()
    );
    let sources = sources?;
    let cards = cards.unwrap_or_default();

    match plan_input(
        requested,
        &sources,
        &cards,
        default.as_deref(),
        sink.as_deref(),
    ) {
        InputPlan::Use(device) => Ok(prepared(Some(device), None)),
        InputPlan::Unavailable => Err(unavailable_microphone(requested, &sources, &cards)),
        InputPlan::Switch { identity, switch } => {
            if switch_card_profile(&switch.card, &switch.profile)
                .await
                .is_ok()
            {
                if let Some(source) =
                    wait_for_bluetooth_ready(&switch.card, &switch.profile, &identity).await
                {
                    return Ok(prepared(
                        Some(source),
                        Some((switch.card, switch.previous_profile)),
                    ));
                }
                let restore = restore_card_profile(Some((
                    switch.card.clone(),
                    switch.previous_profile.clone(),
                )))
                .await;
                let mut message = bluetooth_switch_failed();
                if let Some(warning) = restore {
                    message.push(' ');
                    message.push_str(&warning);
                }
                return Err(message);
            }
            Err(bluetooth_switch_failed())
        }
    }
}
pub async fn focused_window() -> Option<String> {
    if wayland() {
        return None;
    }
    let out = output("xdotool", &["getwindowfocus"]).await.ok()?;
    if !out.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_owned())
}

/// Use the application's existing GTK display; clipboard helpers can briefly map
/// a Wayland surface, steal focus and flicker the dock on compositors without data control.
pub async fn copy(app: &tauri::AppHandle, text: &str) -> Result<(), String> {
    let text = text.to_owned();
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = sender.send(set_clipboard(&text));
    })
    .map_err(|_| "Could not reach the desktop clipboard.".to_string())?;
    receiver.await.map_err(|_| {
        "Could not copy the transcript. It remains available in VoxType.".to_string()
    })?
}

fn set_clipboard(text: &str) -> Result<(), String> {
    let display = gtk::gdk::Display::default().ok_or("Desktop display is unavailable.")?;
    let clipboard = gtk::Clipboard::default(&display).ok_or("Desktop clipboard is unavailable.")?;
    clipboard.set_text(text);
    // GTK keeps serving text through the app's event loop, including when the
    // main window is hidden to the tray. No helper process or focus change.
    Ok(())
}

#[derive(Debug, PartialEq)]
pub enum KeySyntax {
    Raw,
    Symbolic,
}
pub fn key_syntax(help: &str) -> Result<KeySyntax, String> {
    let s = help.to_lowercase();
    if s.contains("keycode") {
        Ok(KeySyntax::Raw)
    } else if s.contains("key sequence") || s.contains("separated by plus") {
        Ok(KeySyntax::Symbolic)
    } else {
        Err("Unrecognized ydotool version. Text was copied; paste it manually.".into())
    }
}
pub async fn paste(target: Option<&str>) -> Result<(), String> {
    if wayland() {
        let help = output("ydotool", &["key", "--help"]).await?;
        let syntax = key_syntax(&format!(
            "{}{}",
            String::from_utf8_lossy(&help.stdout),
            String::from_utf8_lossy(&help.stderr)
        ))?;
        let args = match syntax {
            KeySyntax::Raw => vec!["key", "29:1", "47:1", "47:0", "29:0"],
            KeySyntax::Symbolic => vec!["key", "ctrl+v"],
        };
        let result = output("ydotool", &args).await?;
        let message = String::from_utf8_lossy(&result.stderr).to_lowercase();
        if !result.status.success()
            || message.contains("backend unavailable")
            || message.contains("failed")
        {
            return Err("Text copied. Automatic paste needs ydotoold and access to /dev/uinput. See Settings → Desktop setup.".into());
        }
    } else {
        let current = focused_window().await;
        if target.is_none() || current.as_deref() != target {
            return Err(
                "The focused window changed. Your text is copied; paste it where you want it."
                    .into(),
            );
        }
        let result = output("xdotool", &["key", "--clearmodifiers", "ctrl+v"]).await?;
        if !result.status.success() {
            return Err("Automatic paste failed. Your transcript is on the clipboard.".into());
        }
    }
    Ok(())
}
pub async fn diagnostics(shortcut_registered: bool, shortcut: &str) -> Vec<Diagnostic> {
    let mut checks = vec![Diagnostic {
        name: "Desktop session".into(),
        status: "ok".into(),
        detail: if wayland() {
            format!("Wayland · GNOME handles the {shortcut} toggle.")
        } else {
            format!("X11 · GNOME handles the {shortcut} toggle.")
        },
    }];
    for (program, args, name, detail) in [
        (
            "pactl",
            vec!["info"],
            "Audio service",
            "PulseAudio / PipeWire connection",
        ),
        (
            "parec",
            vec!["--version"],
            "Microphone capture",
            "Native audio capture is available",
        ),
        (
            if wayland() { "ydotool" } else { "xdotool" },
            if wayland() {
                vec!["key", "--help"]
            } else {
                vec!["--help"]
            },
            "Text insertion",
            "Input helper installed; test in your target app",
        ),
    ] {
        let available = output(program, &args)
            .await
            .is_ok_and(|o| o.status.success());
        checks.push(Diagnostic {
            name: name.into(),
            status: if available { "ok" } else { "error" }.into(),
            detail: if available {
                detail.into()
            } else {
                format!("Install {program}, then check again.")
            },
        });
    }
    if wayland() {
        let daemon = output("pgrep", &["-x", "ydotoold"])
            .await
            .is_ok_and(|o| o.status.success());
        checks.push(Diagnostic {
            name: "Paste service".into(),
            status: if daemon { "ok" } else { "warning" }.into(),
            detail: if daemon {
                "ydotoold is running; input permissions must also allow pasting."
            } else {
                "ydotoold is not running. Copy still works; enable the paste service."
            }
            .into(),
        });
    }
    checks.push(Diagnostic {
        name: "Global shortcut".into(),
        status: if shortcut_registered { "ok" } else { "warning" }.into(),
        detail: if shortcut_registered {
            format!("{shortcut} is configured to start and stop dictation.")
        } else {
            format!("Enable {shortcut} in the shortcut section above.")
        },
    });
    checks
}

#[cfg(test)]
mod microphone_tests {
    use super::*;

    fn source(name: &str, description: &str) -> AudioSource {
        AudioSource {
            name: name.into(),
            description: description.into(),
        }
    }

    #[test]
    fn prefers_bluetooth_input_that_matches_the_default_output() {
        let sources = vec![
            source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            ),
            source("bluez_input.AA_BB_CC_DD_EE_FF.0", "OPPO Enco Buds2"),
        ];
        assert_eq!(
            preferred_source(
                &sources,
                Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
                Some("bluez_output.AA_BB_CC_DD_EE_FF.1"),
            ),
            Some("bluez_input.AA_BB_CC_DD_EE_FF.0".into())
        );
    }

    #[test]
    fn falls_back_to_the_default_when_no_headset_is_connected() {
        let sources = vec![source(
            "alsa_input.pci-0000_00_1f.3.analog-stereo",
            "Built-in Audio Analog Stereo",
        )];
        assert_eq!(
            preferred_source(
                &sources,
                Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
                Some("alsa_output.pci-0000_00_1f.3.analog-stereo"),
            ),
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo".into())
        );
    }

    #[test]
    fn ignores_monitor_sources() {
        let sources = vec![
            source(
                "bluez_output.AA_BB_CC_DD_EE_FF.1.monitor",
                "Monitor of Buds",
            ),
            source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            ),
        ];
        assert_eq!(
            preferred_source(&sources, None, None),
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo".into())
        );
    }

    #[test]
    fn finds_a_connected_bluetooth_card_and_prefers_the_compatible_codec() {
        let cards = vec![serde_json::json!({
            "name": "bluez_card.AA_BB_CC_DD_EE_FF",
            "active_profile": "a2dp-sink",
            "profiles": {
                "a2dp-sink": { "sources": 0, "available": true },
                "headset-head-unit-cvsd": { "sources": 1, "available": true },
                "headset-head-unit-msbc": { "sources": 1, "available": true }
            }
        })];
        let switch = find_bluetooth_switch(&cards, Some("aa_bb_cc_dd_ee_ff")).unwrap();
        assert_eq!(switch.card, "bluez_card.AA_BB_CC_DD_EE_FF");
        assert_eq!(switch.profile, "headset-head-unit-cvsd");
        assert_eq!(switch.previous_profile, "a2dp-sink");
    }

    #[test]
    fn does_not_switch_a_card_already_in_headset_mode() {
        let cards = vec![serde_json::json!({
            "name": "bluez_card.AA_BB_CC_DD_EE_FF",
            "active_profile": "headset-head-unit-msbc",
            "profiles": {
                "headset-head-unit-msbc": { "sources": 1, "available": true }
            }
        })];
        assert!(find_bluetooth_switch(&cards, None).is_none());
    }

    fn a2dp_card() -> serde_json::Value {
        serde_json::json!({
            "name": "bluez_card.AA_BB_CC_DD_EE_FF",
            "active_profile": "a2dp-sink",
            "properties": { "device.description": "OPPO Enco Buds2" },
            "profiles": {
                "a2dp-sink": { "sources": 0, "available": true },
                "headset-head-unit-cvsd": { "sources": 1, "available": true },
                "headset-head-unit-msbc": { "sources": 1, "available": true }
            }
        })
    }

    #[test]
    fn readiness_requires_the_requested_card_to_report_a_headset_profile() {
        let mut card = a2dp_card();
        assert!(!bluetooth_profile_active(
            &[card.clone()],
            "bluez_card.AA_BB_CC_DD_EE_FF",
            "headset-head-unit-cvsd",
        ));
        card["active_profile"] = serde_json::Value::String("headset-head-unit-cvsd".into());
        assert!(bluetooth_profile_active(
            &[card.clone()],
            "bluez_card.AA_BB_CC_DD_EE_FF",
            "headset-head-unit-cvsd",
        ));
        card["active_profile"] = serde_json::Value::String("headset-head-unit-msbc".into());
        assert!(bluetooth_profile_active(
            &[card],
            "bluez_card.AA_BB_CC_DD_EE_FF",
            "headset-head-unit-cvsd",
        ));
    }

    #[test]
    fn an_explicit_missing_card_never_switches_a_different_bluetooth_headset() {
        let cards = vec![a2dp_card()];
        assert!(find_bluetooth_switch(&cards, Some("00_11_22_33_44_55")).is_none());
        let plan = plan_input(
            "bluetooth:bluez_card.00_11_22_33_44_55",
            &[source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            )],
            &cards,
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
            None,
        );
        assert_eq!(plan, InputPlan::Unavailable);
    }

    #[test]
    fn automatic_never_switches_an_a2dp_card_into_call_mode() {
        let sources = vec![
            source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            ),
            source("bluez_input.AA_BB_CC_DD_EE_FF.0", "OPPO Enco Buds2"),
        ];
        let cards = vec![a2dp_card()];
        let automatic = automatic_source(
            &sources,
            Some("bluez_input.AA_BB_CC_DD_EE_FF.0"),
            Some("bluez_output.AA_BB_CC_DD_EE_FF.1"),
        );
        assert_eq!(
            automatic,
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo".into())
        );
        assert_eq!(
            plan_input(
                "",
                &sources,
                &cards,
                Some("bluez_input.AA_BB_CC_DD_EE_FF.0"),
                Some("bluez_output.AA_BB_CC_DD_EE_FF.1"),
            ),
            InputPlan::Use("alsa_input.pci-0000_00_1f.3.analog-stereo".into())
        );
    }

    #[test]
    fn automatic_excludes_pulseaudio_bluetooth_source_names_too() {
        let sources = vec![
            source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            ),
            source("bluez_source.AA_BB_CC_DD_EE_FF", "OPPO Enco Buds2"),
        ];
        assert_eq!(
            automatic_source(&sources, Some("bluez_source.AA_BB_CC_DD_EE_FF"), None),
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo".into())
        );
        assert_eq!(
            plan_input(
                "bluez_source.AA_BB_CC_DD_EE_FF",
                &sources,
                &[a2dp_card()],
                Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
                None,
            ),
            InputPlan::Use("bluez_source.AA_BB_CC_DD_EE_FF".into())
        );
    }

    #[test]
    fn automatic_still_uses_a_wired_or_usb_headset() {
        let sources = vec![
            source(
                "alsa_input.pci-0000_00_1f.3.analog-stereo",
                "Built-in Audio Analog Stereo",
            ),
            source("alsa_input.usb-Jabra_Headset-00", "Jabra Headset"),
        ];
        assert_eq!(
            automatic_source(
                &sources,
                Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
                None,
            ),
            Some("alsa_input.usb-Jabra_Headset-00".into())
        );
    }

    #[test]
    fn explicit_bluetooth_card_microphone_switches_call_mode() {
        let sources = vec![source(
            "alsa_input.pci-0000_00_1f.3.analog-stereo",
            "Built-in Audio Analog Stereo",
        )];
        let plan = plan_input(
            "bluetooth:bluez_card.AA_BB_CC_DD_EE_FF",
            &sources,
            &[a2dp_card()],
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
            Some("bluez_output.AA_BB_CC_DD_EE_FF.1"),
        );
        assert_eq!(
            plan,
            InputPlan::Switch {
                identity: "aa_bb_cc_dd_ee_ff".into(),
                switch: BluetoothSwitch {
                    card: "bluez_card.AA_BB_CC_DD_EE_FF".into(),
                    profile: "headset-head-unit-cvsd".into(),
                    previous_profile: "a2dp-sink".into(),
                },
            }
        );
    }

    #[test]
    fn a_saved_bluetooth_input_can_still_be_reopened_explicitly() {
        let sources = vec![source(
            "alsa_input.pci-0000_00_1f.3.analog-stereo",
            "Built-in Audio Analog Stereo",
        )];
        let plan = plan_input(
            "bluez_input.AA_BB_CC_DD_EE_FF.0",
            &sources,
            &[a2dp_card()],
            Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
            None,
        );
        assert!(matches!(plan, InputPlan::Switch { .. }));
    }

    #[test]
    fn an_explicit_available_bluetooth_source_is_used_without_a_switch() {
        let sources = vec![source("bluez_input.AA_BB_CC_DD_EE_FF.0", "OPPO Enco Buds2")];
        assert_eq!(
            plan_input(
                "bluez_input.AA_BB_CC_DD_EE_FF.0",
                &sources,
                &[serde_json::json!({
                    "name": "bluez_card.AA_BB_CC_DD_EE_FF",
                    "active_profile": "headset-head-unit-msbc",
                    "profiles": { "headset-head-unit-msbc": { "sources": 1, "available": true } }
                })],
                None,
                None,
            ),
            InputPlan::Use("bluez_input.AA_BB_CC_DD_EE_FF.0".into())
        );
    }

    #[test]
    fn a_missing_selected_microphone_fails_instead_of_switching_silently() {
        let sources = vec![source(
            "alsa_input.pci-0000_00_1f.3.analog-stereo",
            "Built-in Audio Analog Stereo",
        )];
        assert_eq!(
            plan_input(
                "alsa_input.disconnected",
                &sources,
                &[],
                Some("alsa_input.pci-0000_00_1f.3.analog-stereo"),
                None,
            ),
            InputPlan::Unavailable
        );
        assert!(
            unavailable_microphone("alsa_input.disconnected", &sources, &[])
                .contains("selected microphone is unavailable")
        );
    }

    #[test]
    fn automatic_with_only_bluetooth_inputs_reports_an_actionable_error() {
        let sources = vec![source("bluez_input.AA_BB_CC_DD_EE_FF.0", "OPPO Enco Buds2")];
        assert_eq!(
            plan_input(
                "",
                &sources,
                &[a2dp_card()],
                Some("bluez_input.AA_BB_CC_DD_EE_FF.0"),
                Some("bluez_output.AA_BB_CC_DD_EE_FF.1"),
            ),
            InputPlan::Unavailable
        );
        assert!(unavailable_microphone("", &sources, &[a2dp_card()])
            .contains("does not start Bluetooth call mode"));
    }

    #[test]
    fn automatic_with_no_sources_but_an_a2dp_card_reports_call_mode() {
        assert!(unavailable_microphone("", &[], &[a2dp_card()])
            .contains("does not start Bluetooth call mode"));
        assert_eq!(
            unavailable_microphone("", &[], &[]),
            "No microphone is available. Check that one is connected, then try again."
        );
    }

    #[test]
    fn a_connected_off_card_can_be_selected_and_restores_off() {
        let mut card = a2dp_card();
        card["active_profile"] = serde_json::Value::String("off".into());
        assert_eq!(
            bluetooth_card_microphones(&[card.clone()]),
            vec![Microphone {
                id: "bluetooth:bluez_card.AA_BB_CC_DD_EE_FF".into(),
                name: "OPPO Enco Buds2 microphone (call mode)".into(),
            }]
        );
        let switch = find_bluetooth_switch(&[card], Some("aa_bb_cc_dd_ee_ff")).unwrap();
        assert_eq!(switch.previous_profile, "off");
        assert_eq!(switch.profile, "headset-head-unit-cvsd");
    }

    #[tokio::test]
    async fn bluetooth_readiness_returns_once_stable_within_the_budget() {
        let started = std::time::Instant::now();
        let source = wait_for_bluetooth_ready_with(Duration::from_secs(2), || async {
            (true, Some("bluez_input.AA_BB_CC_DD_EE_FF.0".into()))
        })
        .await;
        assert_eq!(source.as_deref(), Some("bluez_input.AA_BB_CC_DD_EE_FF.0"));
        assert!(started.elapsed() >= Duration::from_millis(250));
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[tokio::test]
    async fn bluetooth_readiness_has_one_overall_deadline() {
        let started = std::time::Instant::now();
        let source = wait_for_bluetooth_ready_with(Duration::from_millis(120), || async {
            (true, Some("bluez_input.AA_BB_CC_DD_EE_FF.0".into()))
        })
        .await;
        assert!(source.is_none());
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[tokio::test]
    async fn bluetooth_readiness_cancels_a_stalled_probe_at_the_deadline() {
        let started = std::time::Instant::now();
        let source = wait_for_bluetooth_ready_with(Duration::from_millis(80), || async {
            tokio::time::sleep(Duration::from_secs(30)).await;
            (true, Some("bluez_input.AA_BB_CC_DD_EE_FF.0".into()))
        })
        .await;
        assert!(source.is_none());
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn bluetooth_cards_offer_an_explicit_call_mode_microphone() {
        let microphones = bluetooth_card_microphones(&[a2dp_card()]);
        assert_eq!(
            microphones,
            vec![Microphone {
                id: "bluetooth:bluez_card.AA_BB_CC_DD_EE_FF".into(),
                name: "OPPO Enco Buds2 microphone (call mode)".into(),
            }]
        );
        let already_call_mode = serde_json::json!({
            "name": "bluez_card.AA_BB_CC_DD_EE_FF",
            "active_profile": "headset-head-unit-msbc",
            "properties": { "device.description": "OPPO Enco Buds2" },
            "profiles": { "headset-head-unit-msbc": { "sources": 1, "available": true } }
        });
        assert!(bluetooth_card_microphones(&[already_call_mode]).is_empty());
        let no_microphone = serde_json::json!({
            "name": "bluez_card.AA_BB_CC_DD_EE_FF",
            "active_profile": "a2dp-sink",
            "profiles": { "a2dp-sink": { "sources": 0, "available": true } }
        });
        assert!(bluetooth_card_microphones(&[no_microphone]).is_empty());
    }
}

#[cfg(test)]
mod clipboard_tests {
    use super::set_clipboard;
    use gtk::prelude::*;
    use std::{
        process::Command,
        time::{Duration, Instant},
    };

    // CI runs this explicitly under Xvfb. Ordinary headless unit tests skip it.
    #[test]
    #[ignore = "requires an X11 display and xclip; run with xvfb-run"]
    fn clipboard_round_trip_without_extra_windows() {
        gtk::init().expect("GTK display");
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        window.set_title("VoxType clipboard test");
        window.show_all();
        let context = glib::MainContext::default();
        while context.pending() {
            context.iteration(false);
        }
        let visible_windows = || {
            gtk::Window::list_toplevels()
                .iter()
                .filter(|window| window.is_visible())
                .count()
        };
        let before = visible_windows();
        for text in [
            "First transcript",
            "नमस्ते — C++\nSecond line 🟢",
            "Replacement",
        ] {
            set_clipboard(text).expect("copy");
            let mut reader = Command::new("xclip")
                .args(["-selection", "clipboard", "-out"])
                .stdout(std::process::Stdio::piped())
                .spawn()
                .expect("external clipboard reader");
            let deadline = Instant::now() + Duration::from_secs(5);
            loop {
                while context.pending() {
                    context.iteration(false);
                }
                if reader.try_wait().expect("reader status").is_some() {
                    break;
                }
                if Instant::now() > deadline {
                    let _ = reader.kill();
                    let _ = reader.wait();
                    panic!("external clipboard reader timed out");
                }
                std::thread::sleep(Duration::from_millis(5));
            }
            let output = reader.wait_with_output().expect("clipboard output");
            assert!(output.status.success());
            assert_eq!(String::from_utf8(output.stdout).unwrap(), text);
            assert_eq!(
                visible_windows(),
                before,
                "copy must not map a helper window"
            );
            assert!(window.is_visible(), "copy must not hide the app");
        }
        window.close();
    }
}
