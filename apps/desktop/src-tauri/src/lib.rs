mod overlay;
mod platform;
mod shortcuts;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            tray::init(app.handle())?;
            shortcuts::register(app.handle())?;

            if let Some(overlay) = app.get_webview_window("overlay") {
                // Click-through + topmost — platform shims refine this further.
                let _ = overlay.set_ignore_cursor_events(true);
                let _ = overlay.set_always_on_top(true);
                overlay::apply_platform_overlay_flags(&overlay)?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            overlay::show_overlay,
            overlay::hide_overlay,
            overlay::set_click_through
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ghost Hands");
}
