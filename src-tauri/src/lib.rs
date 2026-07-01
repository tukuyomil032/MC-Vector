mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 既存のウィンドウにフォーカス
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            // Only register the updater in release builds. Debug builds (including E2E
            // CI tests) skip it so the update-check error dialog cannot block the UI.
            #[cfg(not(debug_assertions))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }

            // macOS debug builds: enable WKWebView WebDriver via community plugin
            #[cfg(all(debug_assertions, target_os = "macos"))]
            app.handle()
                .plugin(tauri_plugin_webdriver_automation::init())?;

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
        .manage(commands::server::CommandLimiter::default())
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
            commands::file_utils::resolve_managed_path,
            commands::file_utils::read_managed_text_file,
            commands::file_utils::write_managed_text_file,
            // アップデートユーティリティ
            commands::updater_utils::can_update_app,
            commands::updater_utils::get_app_location,
            // セキュリティ/パフォーマンス拡張
            commands::security::security_gateway,
            commands::perf::parse_ansi_lines,
            // ヘルスチェック
            commands::health_check::ping_server,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
