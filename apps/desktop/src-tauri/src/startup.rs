use tauri_plugin_autostart::ManagerExt;

#[derive(Debug, PartialEq)]
pub enum Action {
    Background,
    Toggle,
    Cancel,
    Open,
    #[cfg(debug_assertions)]
    PreviewOverlay,
}

pub fn action(argument: &str) -> Action {
    match argument {
        "--background" => Action::Background,
        "toggle" => Action::Toggle,
        "cancel" => Action::Cancel,
        #[cfg(debug_assertions)]
        "preview-overlay" => Action::PreviewOverlay,
        _ => Action::Open,
    }
}

pub fn available() -> bool {
    // A Vite-backed debug executable cannot run independently at login.
    !cfg!(debug_assertions)
}

pub fn configure(app: &tauri::AppHandle, enabled: bool) -> Result<(), String> {
    if !available() {
        return Ok(());
    }
    let manager = app.autolaunch();
    if enabled {
        manager.enable()
    } else {
        manager.disable()
    }
    .map_err(|error| format!("Couldn’t update launch at login: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn background_and_shortcut_launches_do_not_route_to_the_main_window() {
        assert_eq!(action("--background"), Action::Background);
        assert_eq!(action("toggle"), Action::Toggle);
        assert_eq!(action("cancel"), Action::Cancel);
        assert_eq!(action(""), Action::Open);
        assert_eq!(action("settings"), Action::Open);
    }

    #[test]
    fn existing_settings_enable_login_startup_without_losing_preferences() {
        let settings: crate::model::Settings =
            serde_json::from_str(r#"{"language":"hi","cleanupEnabled":true}"#).unwrap();
        assert!(settings.launch_at_login);
        assert!(settings.cleanup_enabled);
        assert_eq!(settings.language, "hi");
        let settings: crate::model::Settings =
            serde_json::from_str(r#"{"launchAtLogin":false}"#).unwrap();
        assert!(!settings.launch_at_login);
    }
}
