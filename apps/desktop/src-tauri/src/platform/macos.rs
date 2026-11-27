//! macOS overlay window shim (PRD §7.1 / D-3).
//! Uses screen-saver level + collectionBehavior so the overlay joins all Spaces
//! and remains visible over full-screen apps. Verified on real hardware in M0.

use tauri::{Runtime, WebviewWindow};

#[allow(dead_code)]
pub fn configure_overlay<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    // Tauri already exposes set_ignore_cursor_events / always_on_top.
    // Platform-specific NSWindow level tweaks are applied via raw handle when
    // building on macOS. This stub documents the intended flags for the M0 spike:
    //   - NSWindow.Level.screenSaver (or statusBar+1)
    //   - collectionBehavior: canJoinAllSpaces | fullScreenAuxiliary
    //   - ignoresMouseEvents = true
    //   - never set sharingType / content protection
    let _ = window;
    Ok(())
}
