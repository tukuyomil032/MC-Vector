const CORE_COMMANDS = [
  'start_server',
  'stop_server',
  'send_command',
  'is_server_running',
  'get_server_pid',
  'get_server_stats',
  'download_server_jar',
  'download_plugin_artifact',
  'download_java',
  'start_ngrok',
  'stop_ngrok',
  'download_ngrok',
  'is_ngrok_installed',
  'create_managed_backup',
  'restore_managed_backup',
  'compress_managed_items',
  'extract_managed_item',
  'list_dir_with_metadata',
  'resolve_managed_path',
  'read_managed_text_file',
  'write_managed_text_file',
  'create_managed_directory',
  'delete_managed_path',
  'move_managed_path',
  'import_managed_files',
  'pick_server_import',
  'complete_server_import',
  'cancel_server_import',
  'delete_managed_server_dir',
  'clone_managed_server',
  'migrate_managed_server_directory',
  'can_update_app',
  'get_app_location',
] as const;

const PERFORMANCE_COMMANDS = ['parse_ansi_lines'] as const;

export const ALLOWED_TAURI_COMMANDS = new Set<string>([...CORE_COMMANDS, ...PERFORMANCE_COMMANDS]);

export const TAURI_COMMAND_GROUPS = {
  core: CORE_COMMANDS,
  performance: PERFORMANCE_COMMANDS,
} as const;
