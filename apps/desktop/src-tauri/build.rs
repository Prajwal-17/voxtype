fn main() {
    println!("cargo:rerun-if-env-changed=VOXTYPE_API_URL");
    println!("cargo:rerun-if-env-changed=VOXTYPE_ENV");

    let profile = std::env::var("PROFILE").unwrap_or_default();
    let environment = std::env::var("VOXTYPE_ENV").unwrap_or_else(|_| {
        if profile == "debug" {
            "development".into()
        } else {
            "production".into()
        }
    });
    if profile == "release" && environment == "production" {
        let api_url = std::env::var("VOXTYPE_API_URL").unwrap_or_default();
        assert!(
            api_url.starts_with("https://"),
            "production desktop builds require an HTTPS VOXTYPE_API_URL"
        );
    }

    tauri_build::build()
}
