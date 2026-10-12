//! Ubuntu adapters. All subprocess arguments are separate: no shell or interpolated commands.
use crate::{
    environment,
    model::{Diagnostic, Microphone, ShortcutOption},
};
use gio::prelude::*;
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
pub async fn microphones() -> Result<Vec<Microphone>, String> {
    let out = output("pactl", &["--format=json", "list", "sources"]).await?;
    if !out.status.success() {
        return Err("Cannot reach the desktop audio service. Check Sound settings.".into());
    }
    let data: Vec<serde_json::Value> =
        serde_json::from_slice(&out.stdout).map_err(|_| "Could not read the microphone list.")?;
    Ok(data
        .iter()
        .filter(|v| !v["name"].as_str().unwrap_or_default().ends_with(".monitor"))
        .filter_map(|v| {
            Some(Microphone {
                id: v["name"].as_str()?.into(),
                name: v["description"].as_str().unwrap_or("Microphone").into(),
            })
        })
        .collect())
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
