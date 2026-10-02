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

pub fn default_shortcut_id() -> &'static str {
    shortcut_id_for(is_development())
}

fn shortcut_id_for(development: bool) -> &'static str {
    if development {
        "ctrl-shift-space"
    } else {
        "right-alt"
    }
}

pub fn audio_client_name() -> &'static str {
    app_name()
}

pub fn overlay_height() -> i32 {
    if is_development() {
        64
    } else {
        56
    }
}
