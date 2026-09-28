pub fn is_development() -> bool {
    match option_env!("VOXTYPE_ENV") {
        Some("production") => false,
        Some("development") => true,
        _ => cfg!(debug_assertions),
    }
}

pub fn app_name() -> &'static str {
    if is_development() {
        "VoxType Dev"
    } else {
        "VoxType"
    }
}

pub fn keyring_service() -> &'static str {
    if is_development() {
        "com.voxtype.dictation.dev"
    } else {
        "com.voxtype.dictation"
    }
}

pub fn store_file() -> &'static str {
    if is_development() {
        "voxtype-dev.json"
    } else {
        "voxtype.json"
    }
}

pub fn shortcut_path() -> &'static str {
    if is_development() {
        "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/voxtype-dictation-dev/"
    } else {
        "/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/voxtype-dictation/"
    }
}

pub fn shortcut_binding() -> &'static str {
    if is_development() {
        "<Control><Alt>space"
    } else {
        "0x6c"
    }
}

pub fn shortcut_label() -> &'static str {
    if is_development() {
        "Ctrl Alt Space"
    } else {
        "Right Alt"
    }
}

pub fn audio_client_name() -> &'static str {
    app_name()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_builds_use_the_development_namespace() {
        assert!(is_development());
        assert_eq!(app_name(), "VoxType Dev");
        assert_eq!(keyring_service(), "com.voxtype.dictation.dev");
        assert_eq!(store_file(), "voxtype-dev.json");
        assert_eq!(shortcut_label(), "Ctrl Alt Space");
    }
}
