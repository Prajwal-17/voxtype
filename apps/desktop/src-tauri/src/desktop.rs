//! Ubuntu adapters. All subprocess arguments are separate: no shell or interpolated commands.
use crate::model::{Diagnostic, Microphone};
use gio::prelude::*;
use std::{process::Stdio, time::Duration};
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};

const SHORTCUT_PATH: &str =
    "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/flow-dictation/";
const MEDIA_KEYS: &str = "org.gnome.settings-daemon.plugins.media-keys";
const CUSTOM_KEY: &str = "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding";

fn gnome_settings() -> Result<(gio::Settings, gio::Settings), String> {
    let source =
        gio::SettingsSchemaSource::default().ok_or("GNOME keyboard settings are unavailable.")?;
    if source.lookup(MEDIA_KEYS, true).is_none() || source.lookup(CUSTOM_KEY, true).is_none() {
        return Err("Use your desktop's keyboard settings to bind VoxType's command.".into());
    }
    Ok((
        gio::Settings::new(MEDIA_KEYS),
        gio::Settings::with_path(CUSTOM_KEY, SHORTCUT_PATH),
    ))
}
// Linux KEY_RIGHTALT (100) + XKB's offset (8). Mutter accepts physical
// keycodes on both GNOME Wayland and X11, including AltGr keyboard layouts.
const RIGHT_ALT: &str = "0x6c";

pub fn install_shortcut() -> Result<(), String> {
    let accelerator = RIGHT_ALT;
    let (settings, binding) = gnome_settings()?;
    let mut paths: Vec<String> = settings
        .strv("custom-keybindings")
        .iter()
        .map(|p| p.to_string())
        .collect();
    for path in &paths {
        if path == SHORTCUT_PATH {
            continue;
        }
        let existing = gio::Settings::with_path(CUSTOM_KEY, path);
        if matches!(
            existing.string("binding").as_str(),
            "0x6c" | "0x6C" | "Alt_R" | "ISO_Level3_Shift"
        ) {
            return Err(format!("Right Alt is already assigned to {}. Remove that binding in Ubuntu Settings, then enable VoxType’s shortcut again.", existing.string("name")));
        }
    }
    let executable =
        std::env::current_exe().map_err(|_| "Could not locate the VoxType executable.")?;
    let command = format!(
        "{} toggle",
        glib::shell_quote(executable.as_os_str()).to_string_lossy()
    );
    binding
        .set_string("name", "VoxType dictation")
        .map_err(|e| e.to_string())?;
    binding
        .set_string("command", &command)
        .map_err(|e| e.to_string())?;
    binding
        .set_string("binding", accelerator)
        .map_err(|e| e.to_string())?;
    if !paths.iter().any(|p| p == SHORTCUT_PATH) {
        paths.push(SHORTCUT_PATH.into());
    }
    settings
        .set_strv("custom-keybindings", paths)
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
pub async fn copy(text: &str) -> Result<(), String> {
    let mut cmd = if wayland() {
        let mut c = Command::new("wl-copy");
        c.args(["--type", "text/plain;charset=utf-8"]);
        c
    } else {
        let mut c = Command::new("xclip");
        c.args(["-selection", "clipboard"]);
        c
    };
    let mut child = cmd
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "Clipboard helper missing. Install wl-clipboard (Wayland) or xclip (X11).")?;
    let mut stdin = child.stdin.take().ok_or("Cannot open the clipboard.")?;
    timeout(Duration::from_secs(3), async {
        stdin.write_all(text.as_bytes()).await?;
        drop(stdin);
        child.wait().await
    })
    .await
    .map_err(|_| "The clipboard did not respond.")?
    .map_err(|_| "Could not copy the transcript.")?
    .success()
    .then_some(())
    .ok_or_else(|| "Could not copy the transcript. It remains available in VoxType.".into())
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
pub async fn diagnostics(shortcut_registered: bool) -> Vec<Diagnostic> {
    let mut checks = vec![Diagnostic {
        name: "Desktop session".into(),
        status: "ok".into(),
        detail: if wayland() {
            "Wayland · GNOME handles the Right Alt toggle."
        } else {
            "X11 · GNOME handles the Right Alt toggle."
        }
        .into(),
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
            if wayland() { "wl-copy" } else { "xclip" },
            if wayland() {
                vec!["--version"]
            } else {
                vec!["-version"]
            },
            "Clipboard",
            "Clipboard helper installed",
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
            "Right Alt is configured to start and stop dictation."
        } else {
            "Enable Right Alt in the shortcut section above."
        }
        .into(),
    });
    checks
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn supports_ubuntu_and_recent_ydotool() {
        assert_eq!(
            key_syntax("Syntax: <keycode>:<pressed>").unwrap(),
            KeySyntax::Raw
        );
        assert_eq!(
            key_syntax("<key sequence> separated by plus (+)").unwrap(),
            KeySyntax::Symbolic
        );
        assert!(key_syntax("unknown").is_err());
    }
}
