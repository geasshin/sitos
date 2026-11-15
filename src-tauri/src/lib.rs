mod covers;
mod data;
mod updater;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // En premier : une seconde instance rend la main à la première avant
        // que deux fenêtres n'écrivent dans les mêmes fichiers.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .manage(updater::PendingUpdate::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            data::load_data,
            data::save_collection,
            data::open_data_folder,
            data::create_backup,
            data::get_backup_info,
            data::get_data_folder,
            data::open_link,
            updater::check_for_app_update,
            updater::install_app_update,
            covers::cover_cache,
            covers::cover_cache_info,
            covers::clear_cover_cache,
        ])
        .run(tauri::generate_context!())
        .expect("impossible de lancer Sitos");
}
