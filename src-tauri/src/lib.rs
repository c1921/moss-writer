mod commands;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(state::ProjectState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::open_project,
            commands::read_file,
            commands::write_file,
            commands::list_files,
            commands::create_file,
            commands::rename_file,
            commands::delete_file,
            commands::sync_push,
            commands::sync_pull
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
