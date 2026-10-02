//! Recover the graphical session when launched from tmux, a TTY, or an IDE.
use gio::prelude::*;

const DISPLAY_KEYS: [&str; 4] = [
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XAUTHORITY",
    "XDG_SESSION_TYPE",
];

fn graphical_environment(entries: &[String]) -> Vec<(&str, &str)> {
    entries
        .iter()
        .filter_map(|entry| entry.split_once('='))
        .filter(|(key, value)| DISPLAY_KEYS.contains(key) && !value.is_empty())
        .collect()
}

pub fn configure() {
    // Respect explicitly selected displays (including isolated test displays).
    if std::env::var_os("DISPLAY").is_none() && std::env::var_os("WAYLAND_DISPLAY").is_none() {
        if let Some(entries) = session_environment() {
            for (key, value) in graphical_environment(&entries) {
                std::env::set_var(key, value);
            }
        }
    }
    // GTK otherwise discovers the default Wayland socket even in a TTY session.
    // GNOME does not allow those windows to position themselves. Keep clipboard
    // and input selection tied to the session, but render through XWayland.
    if std::env::var_os("DISPLAY").is_some() {
        std::env::set_var("GDK_BACKEND", "x11");
    }
}

fn session_environment() -> Option<Vec<String>> {
    let bus = gio::bus_get_sync(gio::BusType::Session, gio::Cancellable::NONE).ok()?;
    let reply = bus
        .call_sync(
            Some("org.freedesktop.systemd1"),
            "/org/freedesktop/systemd1",
            "org.freedesktop.DBus.Properties",
            "Get",
            Some(&("org.freedesktop.systemd1.Manager", "Environment").to_variant()),
            None,
            gio::DBusCallFlags::NONE,
            1000,
            gio::Cancellable::NONE,
        )
        .ok()?;
    reply.child_value(0).as_variant()?.get()
}
