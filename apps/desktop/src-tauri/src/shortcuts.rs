use tauri::{AppHandle, Runtime};

/// Global hotkeys (PRD D-9): Ctrl/Cmd+Shift+H pause, Ctrl/Cmd+Shift+D debug HUD.
/// Full registration via tauri-plugin-global-shortcut lands in M3; M0 documents the bindings.
pub fn register<R: Runtime>(_app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}
