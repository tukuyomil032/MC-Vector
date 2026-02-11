mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 既存のウィンドウにフォーカス
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(commands::server::ServerManager::default())
        .manage(commands::ngrok::NgrokManager::default())
        .invoke_handler(tauri::generate_handler![
            // サーバー操作
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::send_command,
            commands::server::is_server_running,
            commands::server::get_server_pid,
            // プロセス統計
            commands::process_stats::get_server_stats,
            // ダウンロード
            commands::download::download_file,
            commands::download::download_server_jar,
            // バックアップ
            commands::backup::create_backup,
            commands::backup::restore_backup,
            commands::backup::compress_item,
            commands::backup::extract_item,
            // Java
            commands::java::download_java,
            // ngrok
            commands::ngrok::start_ngrok,
            commands::ngrok::stop_ngrok,
            commands::ngrok::download_ngrok,
            commands::ngrok::is_ngrok_installed,
            // ファイルユーティリティ
            commands::file_utils::list_dir_with_metadata,
            // アップデートユーティリティ
            commands::updater_utils::can_update_app,
            commands::updater_utils::get_app_location,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
