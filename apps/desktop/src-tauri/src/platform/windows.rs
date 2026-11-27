//! Windows overlay window shim (PRD §7.1 / D-3).
//! WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE + HWND_TOPMOST.

use tauri::{Runtime, WebviewWindow};

#[allow(dead_code)]
pub fn configure_overlay<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Concrete SetWindowLong / SetWindowPos calls land once the M0 spike runs on
    // Windows hardware. Flags to assert:
    //   WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
    //   HWND_TOPMOST, SWP_NOACTIVATE | SWP_SHOWWINDOW
    // Re-assert topmost on focus/display-change events (risk R4).
    let _ = window;
    Ok(())
}
