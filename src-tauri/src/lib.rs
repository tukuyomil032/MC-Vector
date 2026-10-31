mod commands;
pub mod metric_history;
mod plugin_catalog;
mod plugin_installer;
pub mod server_stdout;
mod state;
#[cfg(test)]
mod test_support;

use std::sync::{
    atomic::{AtomicU8, Ordering},
    Arc,
};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::default().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // 既存のウィンドウにフォーカス
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }));

    // Register this before Tauri creates the configured windows so its JS init
    // script is injected into the main webview. The plugin is available in macOS
    // debug builds and opt-in release QA builds via the updater-e2e feature.
    #[cfg(all(target_os = "macos", any(debug_assertions, feature = "updater-e2e")))]
    {
        builder = builder.plugin(tauri_plugin_webdriver_automation::init());
    }

    let exit_cleanup_phase = Arc::new(AtomicU8::new(0));

    let app = builder
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let app_data_dir_for_registry = app_data_dir.clone();
            let registry_worker = std::thread::Builder::new()
                .name("server-registry-init".to_string())
                .spawn(move || {
                    let registry = commands::server_registry::ServerRegistry::open(
                        &app_data_dir_for_registry,
                    )?;
                    let recovery_failures = commands::recovery_journal::recover_startup(
                        &app_data_dir_for_registry,
                        &registry,
                    );
                    if let Some(failure) = recovery_failures
                        .iter()
                        .find(|failure| failure.server_id.is_none())
                    {
                        return Err(format!(
                            "Server transaction recovery could not read its journal: {}",
                            failure.error
                        ));
                    }
                    let plugin_failures =
                        plugin_installer::recover_startup(&app_data_dir_for_registry, &registry);
                    if let Some(failure) = plugin_failures
                        .iter()
                        .find(|failure| failure.server_id.is_none())
                    {
                        return Err(failure.error.clone());
                    }
                    Ok::<_, String>(registry)
                })?;
            let registry_result = registry_worker
                .join()
                .map_err(|_| std::io::Error::other("Server registry initialization panicked"))?;
            let server_registry = match registry_result {
                Ok(registry) => registry,
                Err(error) => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                    let message = format_startup_recovery_error(&app_data_dir, &error);
                    let app_handle = app.handle().clone();
                    app.dialog()
                        .message(message)
                        .title("MC-Vector could not start")
                        .kind(MessageDialogKind::Error)
                        .buttons(MessageDialogButtons::Ok)
                        .show(move |_| app_handle.exit(1));
                    return Ok(());
                }
            };
            app.manage(server_registry);
            commands::automation::start_service(
                app.handle().clone(),
                app.state::<commands::automation::AutomationManager>()
                    .inner()
                    .clone(),
                app.state::<commands::server_registry::ServerRegistry>()
                    .inner()
                    .clone(),
                app.state::<commands::server::ServerManager>()
                    .inner()
                    .clone(),
                app.state::<commands::server::CommandLimiter>()
                    .inner()
                    .clone(),
                app.state::<state::operation_manager::ServerOperationManager>()
                    .inner()
                    .clone(),
            );

            // Only register the updater in release builds. Debug builds (including E2E
            // CI tests) skip it so the update-check error dialog cannot block the UI.
            #[cfg(not(debug_assertions))]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;

            #[cfg(target_os = "macos")]
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Dark));
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(plugin_installer::PluginInstaller::default())
        .manage(commands::server::ServerManager::default())
        .manage(commands::server::CommandLimiter::default())
        .manage(state::operation_manager::ServerOperationManager::default())
        .manage(commands::ngrok::NgrokManager::default())
        .manage(commands::file_utils::ServerImportManager::default())
        .manage(commands::server_jar::ServerJarInstaller::default())
        .manage(commands::automation::AutomationManager::default())
        .manage(commands::health_check::ProbeLimiter::default())
        .invoke_handler(tauri::generate_handler![
            // サーバー操作
            commands::properties::get_server_properties,
            commands::properties::save_server_properties,
            commands::properties::configure_proxy_network,
            commands::players::get_player_lists,
            commands::players::mutate_player_list,
            commands::server_registry::get_servers,
            commands::server_registry::update_server,
            commands::server_registry::get_server_templates,
            commands::server_registry::save_server_template,
            commands::server_registry::delete_server_template,
            commands::server::start_server,
            commands::server::stop_server,
            commands::server::restart_server,
            commands::server::send_command,
            commands::server::is_server_running,
            commands::server::get_server_pid,
            commands::server::get_server_metric_history,
            commands::server_lifecycle::clone_server_profile,
            commands::server_lifecycle::delete_managed_server,
            commands::server_creation::create_server_profile,
            commands::automation::cancel_auto_restart,
            commands::automation::resume_auto_restart_after_eula,
            commands::eula::get_server_eula_status,
            commands::eula::accept_server_eula,
            // プロセス統計
            commands::process_stats::get_server_stats,
            // ダウンロード
            commands::server_jar::prepare_server_jar_install,
            commands::server_jar::execute_server_jar_install,
            commands::download::get_allow_unverified_plugin_downloads,
            commands::download::set_allow_unverified_plugin_downloads,
            commands::plugin_installer::prepare_plugin_install,
            commands::plugin_installer::execute_plugin_install,
            commands::plugin_installer::toggle_installed_plugin,
            commands::plugin_installer::uninstall_installed_plugin,
            commands::plugin_catalog::search_plugin_modrinth,
            commands::plugin_catalog::get_plugin_modrinth_versions,
            commands::plugin_catalog::get_plugin_modrinth_compatible_version,
            commands::plugin_catalog::get_plugin_modrinth_version,
            commands::plugin_catalog::get_plugin_modrinth_identity,
            commands::plugin_catalog::get_plugin_modrinth_body,
            commands::plugin_catalog::get_plugin_modrinth_artifact,
            commands::plugin_catalog::search_plugin_hangar,
            commands::plugin_catalog::get_plugin_hangar_versions,
            commands::plugin_catalog::resolve_plugin_hangar_download,
            commands::plugin_catalog::check_plugin_hangar_compatibility,
            commands::plugin_catalog::get_plugin_hangar_body,
            commands::plugin_catalog::search_plugin_spiget,
            commands::plugin_catalog::get_plugin_spiget_body,
            // バックアップ
            commands::backup::create_managed_backup,
            commands::backup::restore_managed_backup,
            commands::backup::list_managed_backups,
            commands::backup::delete_managed_backup,
            commands::backup::apply_managed_backup_retention,
            commands::backup::compress_managed_items,
            commands::backup::extract_managed_item,
            // Java
            commands::java::download_java,
            commands::java::get_java_versions,
            commands::java::delete_java,
            // ngrok
            commands::ngrok::start_ngrok,
            commands::ngrok::stop_ngrok,
            commands::ngrok::download_ngrok,
            commands::ngrok::is_ngrok_installed,
            commands::ngrok::get_ngrok_token_status,
            commands::ngrok::set_ngrok_token,
            commands::ngrok::clear_ngrok_token,
            // ファイルユーティリティ
            commands::file_utils::list_dir_with_metadata,
            commands::file_utils::resolve_managed_path,
            commands::file_utils::read_managed_text_file,
            commands::file_utils::write_managed_text_file,
            commands::file_utils::import_managed_files,
            commands::file_utils::pick_server_import,
            commands::file_utils::cancel_server_import,
            commands::file_utils::export_text_file,
            commands::file_utils::create_managed_directory,
            commands::file_utils::delete_managed_path,
            commands::file_utils::move_managed_path,
            commands::file_utils::get_managed_directory_size,
            // アップデートユーティリティ
            commands::updater_utils::can_update_app,
            commands::updater_utils::get_app_location,
            // パフォーマンス拡張
            commands::perf::parse_ansi_lines,
            // ヘルスチェック
            commands::health_check::ping_server,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    let exit_cleanup_phase_for_run = exit_cleanup_phase.clone();
    app.run(move |app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
            if code == Some(tauri::RESTART_EXIT_CODE) {
                // Tauri deliberately ignores prevent_exit for restart requests.
                // Stop children synchronously here so updater-driven relaunches
                // cannot bypass the asynchronous normal-exit cleanup below.
                exit_cleanup_phase_for_run.store(3, Ordering::SeqCst);
                let servers = app_handle
                    .state::<commands::server::ServerManager>()
                    .inner()
                    .clone();
                let automation = app_handle
                    .state::<commands::automation::AutomationManager>()
                    .inner()
                    .clone();
                let ngrok = app_handle
                    .state::<commands::ngrok::NgrokManager>()
                    .inner()
                    .clone();
                tauri::async_runtime::block_on(async move {
                    automation.shutdown().await;
                    loop {
                        let (servers_result, ngrok_result) =
                            tokio::join!(servers.shutdown_all(), ngrok.shutdown());
                        if servers_result.is_ok() && ngrok_result.is_ok() {
                            break;
                        }
                        if let Err(error) = servers_result {
                            eprintln!("Failed to stop Minecraft servers before restart; retrying: {error}");
                        }
                        if let Err(error) = ngrok_result {
                            eprintln!("Failed to stop ngrok before restart; retrying: {error}");
                        }
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                });
                exit_cleanup_phase_for_run.store(2, Ordering::SeqCst);
                return;
            }

            // Hold the event loop open until both process managers have stopped
            // their children. Subsequent exit requests stay deferred while the
            // single cleanup task is running.
            if exit_cleanup_phase_for_run.load(Ordering::SeqCst) == 2 {
                return;
            }
            api.prevent_exit();

            if exit_cleanup_phase_for_run
                .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                let app_handle = app_handle.clone();
                let servers = app_handle
                    .state::<commands::server::ServerManager>()
                    .inner()
                    .clone();
                let automation = app_handle
                    .state::<commands::automation::AutomationManager>()
                    .inner()
                    .clone();
                let ngrok = app_handle
                    .state::<commands::ngrok::NgrokManager>()
                    .inner()
                    .clone();
                let cleanup_phase = exit_cleanup_phase_for_run.clone();

                tauri::async_runtime::spawn(async move {
                    let (servers_result, ngrok_result) =
                        {
                            automation.shutdown().await;
                            loop {
                                let (servers_result, ngrok_result) =
                                    tokio::join!(servers.shutdown_all(), ngrok.shutdown());
                                if servers_result.is_ok() && ngrok_result.is_ok() {
                                    break (servers_result, ngrok_result);
                                }
                                if let Err(error) = servers_result {
                                    eprintln!("Failed to stop Minecraft servers before exit; retrying: {error}");
                                }
                                if let Err(error) = ngrok_result {
                                    eprintln!("Failed to stop ngrok before exit; retrying: {error}");
                                }
                                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                            }
                        };
                    if let Err(error) = servers_result {
                        eprintln!("Failed to stop Minecraft servers before exit: {error}");
                    }
                    if let Err(error) = ngrok_result {
                        eprintln!("Failed to stop ngrok before exit: {error}");
                    }

                    if cleanup_phase
                        .compare_exchange(1, 2, Ordering::SeqCst, Ordering::SeqCst)
                        .is_ok()
                    {
                        app_handle.exit(code.unwrap_or(0));
                    }
                });
            }
        }
    });
}

fn format_startup_recovery_error(app_data_dir: &std::path::Path, error: &str) -> String {
    format!(
        "MC-Vector could not safely start because its server registry could not be loaded or a server recovery step failed.\n\nApp data directory:\n{}\n\nDetails:\n{}\n\nStartup stopped before server management began, so MC-Vector did not replace your server list with an empty one. The legacy source file was left unchanged. Repair invalid JSON or restore a valid backup if the details point to registry data. If recovery failed, keep the transaction journal and backups intact and resolve the reported issue before restarting.",
        app_data_dir.display(),
        error
    )
}

#[cfg(test)]
mod tests {
    use super::format_startup_recovery_error;
    use std::path::Path;

    #[test]
    fn registry_startup_error_includes_location_details_and_recovery_guidance() {
        let error = "Could not parse legacy registry JSON at /app/servers.json: EOF. The source was left unchanged.";
        let message = format_startup_recovery_error(Path::new("/app"), error);

        assert!(message.contains("/app"));
        assert!(message.contains("/app/servers.json"));
        assert!(message.contains("EOF"));
        assert!(message.contains("Repair invalid JSON or restore a valid backup"));
        assert!(message.contains("did not replace your server list with an empty one"));
    }
}
