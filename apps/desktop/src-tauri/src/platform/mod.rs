use tauri::{Runtime, WebviewWindow};

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

/// Apply OS-specific always-on-top / spaces / click-through flags for the overlay.
pub fn configure_overlay<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    {
        return macos::configure_overlay(window);
    }
    #[cfg(target_os = "windows")]
    {
        return windows::configure_overlay(window);
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        // Linux is post-MVP; keep a no-op shim so `cargo check` works in CI/Linux VMs.
        let _ = window;
        Ok(())
    }
}
