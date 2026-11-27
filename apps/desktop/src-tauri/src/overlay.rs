use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

use crate::platform;

#[tauri::command]
pub fn show_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let overlay = app
        .get_webview_window("overlay")
        .ok_or_else(|| "overlay window missing".to_string())?;
    overlay
        .set_ignore_cursor_events(true)
        .map_err(|e| e.to_string())?;
    overlay
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    apply_platform_overlay_flags(&overlay).map_err(|e| e.to_string())?;
    overlay.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn hide_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_click_through<R: Runtime>(app: AppHandle<R>, enabled: bool) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay
            .set_ignore_cursor_events(enabled)
            .map_err(|e| e.to_string())?;
        apply_platform_overlay_flags(&overlay).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn apply_platform_overlay_flags<R: Runtime>(
    window: &WebviewWindow<R>,
) -> Result<(), Box<dyn std::error::Error>> {
    platform::configure_overlay(window)
}
