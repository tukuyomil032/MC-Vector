const CORE_COMMANDS = [
  'start_server',
  'stop_server',
  'send_command',
  'is_server_running',
  'get_server_pid',
  'get_server_stats',
  'download_server_jar',
  'download_java',
  'start_ngrok',
  'stop_ngrok',
  'download_ngrok',
  'is_ngrok_installed',
  'create_backup',
  'restore_backup',
  'compress_item',
  'extract_item',
  'download_file',
  'list_dir_with_metadata',
  'resolve_managed_path',
  'read_managed_text_file',
  'write_managed_text_file',
  'can_update_app',
  'get_app_location',
] as const;

const SECURITY_COMMANDS = ['security_gateway'] as const;

const PERFORMANCE_COMMANDS = ['parse_ansi_lines'] as const;

export const ALLOWED_TAURI_COMMANDS = new Set<string>([
  ...CORE_COMMANDS,
  ...SECURITY_COMMANDS,
  ...PERFORMANCE_COMMANDS,
]);

export const TAURI_COMMAND_GROUPS = {
  core: CORE_COMMANDS,
  security: SECURITY_COMMANDS,
  performance: PERFORMANCE_COMMANDS,
} as const;
