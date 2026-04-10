mod commands;
mod state;
mod sync;

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, WebviewWindow, WindowEvent,
};

#[cfg(desktop)]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const MAIN_WINDOW_LABEL: &str = "main";
const TRAY_SHOW_WINDOW_ID: &str = "tray_show_window";
const TRAY_QUIT_ID: &str = "tray_quit";

#[derive(Default)]
struct AppLifecycleState {
    is_quitting: AtomicBool,
    is_hidden_to_tray: AtomicBool,
}

fn get_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN_WINDOW_LABEL)
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = get_main_window(app) {
        if window.is_minimized()? {
            window.unminimize()?;
        }

        window.hide()?;
        app.state::<AppLifecycleState>()
            .is_hidden_to_tray
            .store(true, Ordering::Relaxed);
    }

    Ok(())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = get_main_window(app) {
        if window.is_minimized()? {
            window.unminimize()?;
        }

        window.show()?;
        window.set_focus()?;
        app.state::<AppLifecycleState>()
            .is_hidden_to_tray
            .store(false, Ordering::Relaxed);
    }

    Ok(())
}

fn toggle_main_window_from_shortcut<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if app
        .state::<AppLifecycleState>()
        .is_hidden_to_tray
        .load(Ordering::Relaxed)
    {
        show_main_window(app)
    } else {
        hide_main_window(app)
    }
}

fn install_close_to_tray<R: Runtime>(app: &AppHandle<R>) {
    let Some(window) = get_main_window(app) else {
        return;
    };

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if app_handle
                .state::<AppLifecycleState>()
                .is_quitting
                .load(Ordering::Relaxed)
            {
                return;
            }

            api.prevent_close();
            let _ = hide_main_window(&app_handle);
        }
    });
}

fn install_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_window =
        MenuItem::with_id(app, TRAY_SHOW_WINDOW_ID, "显示主窗口", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_window, &quit])?;

    let mut tray_builder = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("Moss Writer")
        .on_menu_event(|app, event| match event.id.as_ref() {
            TRAY_SHOW_WINDOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_QUIT_ID => {
                app.state::<AppLifecycleState>()
                    .is_quitting
                    .store(true, Ordering::Relaxed);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

#[cfg(desktop)]
fn install_global_shortcut<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let minimize_to_tray_shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::Backquote);

    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler({
                let shortcut = minimize_to_tray_shortcut;
                move |app, triggered_shortcut, event| {
                    if triggered_shortcut == &shortcut && event.state() == ShortcutState::Pressed {
                        let _ = toggle_main_window_from_shortcut(app);
                    }
                }
            })
            .build(),
    )?;

    if let Err(error) = app.global_shortcut().register(minimize_to_tray_shortcut) {
        eprintln!("failed to register Ctrl+Backquote global shortcut: {error}");
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppLifecycleState::default())
        .manage(state::ProjectState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            install_tray(app.handle())?;
            install_close_to_tray(app.handle());
            #[cfg(desktop)]
            install_global_shortcut(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_project,
            commands::read_file,
            commands::write_file,
            commands::list_files,
            commands::list_directories,
            commands::create_file,
            commands::create_directory,
            commands::rename_file,
            commands::delete_file,
            commands::rename_directory,
            commands::delete_directory,
            commands::get_sync_settings,
            commands::save_sync_settings,
            commands::test_sync_connection,
            commands::sync_push,
            commands::sync_pull,
            commands::resolve_sync_pending
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
