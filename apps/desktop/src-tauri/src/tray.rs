use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime,
};

pub fn init<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let start = MenuItem::with_id(app, "start", "Start Session", true, None::<&str>)?;
    let end = MenuItem::with_id(app, "end", "End Session", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Ghost Hands", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&start, &end, &quit])?;

    // Prefer a bundled icon when present; fall back to default.
    let mut builder = TrayIconBuilder::new().menu(&menu).tooltip("Ghost Hands");

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    let _tray = builder
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            "start" => {
                if let Some(control) = app.get_webview_window("control") {
                    let _ = control.show();
                    let _ = control.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|_tray, event| {
            if let TrayIconEvent::Click { .. } = event {
                // clicks reserved for future control toggle
            }
        })
        .build(app)?;

    Ok(())
}
