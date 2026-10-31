export type PropertyType = 'boolean' | 'number' | 'string' | 'select';
export type PropertyCategory =
  | 'General'
  | 'Gameplay'
  | 'World'
  | 'Network'
  | 'Security'
  | 'Advanced';

export interface PropertyDefinition {
  key: string;
  label: string;
  description: string;
  type: PropertyType;
  category: PropertyCategory;
  options?: string[];
  default: string | number | boolean;
}

export const serverPropertiesList: PropertyDefinition[] = [
  // General
  {
    key: 'motd',
    label: 'MOTD',
    description: 'サーバーリストに表示されるメッセージ。カラーコード可。',
    type: 'string',
    category: 'General',
    default: 'A Minecraft Server',
  },
  {
    key: 'bug-report-link',
    label: 'バグ報告リンク',
    description: 'クライアントに表示するバグ報告URL。空欄で非表示。',
    type: 'string',
    category: 'General',
    default: '',
  },
  {
    key: 'broadcast-console-to-ops',
    label: 'コンソールメッセージをOPに送信',
    description: 'コンソールからのメッセージをOPにも送ります。',
    type: 'boolean',
    category: 'General',
    default: true,
  },
  {
    key: 'broadcast-rcon-to-ops',
    label: 'RCONメッセージをOPに送信',
    description: 'RCONからのメッセージをOPにも送ります。',
    type: 'boolean',
    category: 'General',
    default: true,
  },
  {
    key: 'op-permission-level',
    label: 'OP権限レベル',
    description: 'OPの権限レベル(1-4)。',
    type: 'number',
    category: 'General',
    default: 4,
  },
  {
    key: 'spawn-protection',
    label: 'スポーン保護範囲',
    description: 'スポーン地点の保護範囲。0で無効。',
    type: 'number',
    category: 'General',
    default: 16,
  },
  {
    key: 'function-permission-level',
    label: '関数実行権限',
    description: 'コマンド関数実行に必要な権限レベル。',
    type: 'number',
    category: 'General',
    default: 2,
  },
  {
    key: 'allow-flight',
    label: '飛行許可',
    description: 'サバイバルでの飛行を許可するか。',
    type: 'boolean',
    category: 'General',
    default: false,
  },
  {
    key: 'debug',
    label: 'デバッグモード',
    description: 'デバッグログを有効化するか。',
    type: 'boolean',
    category: 'General',
    default: false,
  },
  {
    key: 'accepts-transfers',
    label: '転送を受け入れ',
    description: 'Proxy等からのプレイヤー転送を受け入れるか。',
    type: 'boolean',
    category: 'General',
    default: false,
  },
  {
    key: 'pause-when-empty-seconds',
    label: '空時停止までの秒数',
    description: 'プレイヤー不在時にサーバーを一時停止するまでの秒数。-1で無効。',
    type: 'number',
    category: 'General',
    default: -1,
  },
  {
    key: 'player-idle-timeout',
    label: '放置キック時間(分)',
    description: '放置プレイヤーをキックするまでの分数。0で無効。',
    type: 'number',
    category: 'General',
    default: 0,
  },

  // Gameplay
  {
    key: 'gamemode',
    label: 'ゲームモード',
    description: '新規プレイヤーのデフォルトゲームモード。',
    type: 'select',
    options: ['survival', 'creative', 'adventure', 'spectator'],
    category: 'Gameplay',
    default: 'survival',
  },
  {
    key: 'force-gamemode',
    label: 'ゲームモード固定',
    description: 'ログイン時に常にデフォルトゲームモードへ変更するか。',
    type: 'boolean',
    category: 'Gameplay',
    default: false,
  },
  {
    key: 'difficulty',
    label: '難易度',
    description: 'ワールド難易度。',
    type: 'select',
    options: ['peaceful', 'easy', 'normal', 'hard'],
    category: 'Gameplay',
    default: 'easy',
  },
  {
    key: 'hardcore',
    label: 'ハードコア',
    description: 'ハードコアモードを有効にするか。',
    type: 'boolean',
    category: 'Gameplay',
    default: false,
  },
  {
    key: 'pvp',
    label: 'PvP許可',
    description: 'プレイヤー同士の攻撃を許可するか。',
    type: 'boolean',
    category: 'Gameplay',
    default: true,
  },

  // World
  {
    key: 'level-name',
    label: 'ワールド名',
    description: 'ワールドフォルダ名。',
    type: 'string',
    category: 'World',
    default: 'world',
  },
  {
    key: 'level-seed',
    label: 'シード値',
    description: 'ワールド生成のシード値。',
    type: 'string',
    category: 'World',
    default: '',
  },
  {
    key: 'level-type',
    label: 'ワールドタイプ',
    description: 'default/flat/large_biomes/amplified/customized等。',
    type: 'string',
    category: 'World',
    default: 'minecraft:normal',
  },
  {
    key: 'generator-settings',
    label: 'ジェネレータ設定',
    description: 'カスタムワールド用ジェネレータJSON。',
    type: 'string',
    category: 'World',
    default: '{}',
  },
  {
    key: 'initial-disabled-packs',
    label: '無効化リソースパック',
    description: '初期状態で無効にするデータ/リソースパック(カンマ区切り)。',
    type: 'string',
    category: 'World',
    default: '',
  },
  {
    key: 'initial-enabled-packs',
    label: '有効化リソースパック',
    description: '初期状態で有効にするデータ/リソースパック(カンマ区切り)。',
    type: 'string',
    category: 'World',
    default: 'vanilla',
  },
  {
    key: 'generate-structures',
    label: '構造物生成',
    description: '村や要塞などを生成するか。',
    type: 'boolean',
    category: 'World',
    default: true,
  },
  {
    key: 'simulation-distance',
    label: 'シミュレーション距離',
    description: 'エンティティやRedstoneの処理距離。',
    type: 'number',
    category: 'World',
    default: 10,
  },
  {
    key: 'view-distance',
    label: '視野距離',
    description: 'チャンク送信距離。',
    type: 'number',
    category: 'World',
    default: 10,
  },
  {
    key: 'max-world-size',
    label: 'ワールドサイズ上限',
    description: 'ワールド境界の半径(ブロック)。',
    type: 'number',
    category: 'World',
    default: 29999984,
  },
  {
    key: 'sync-chunk-writes',
    label: 'チャンク同期書き込み',
    description: 'チャンク保存を同期書き込みするか。',
    type: 'boolean',
    category: 'World',
    default: true,
  },
  {
    key: 'text-filtering-config',
    label: 'テキストフィルタ設定URL',
    description: 'チャットフィルタ設定のURL。',
    type: 'string',
    category: 'World',
    default: '',
  },
  {
    key: 'text-filtering-version',
    label: 'テキストフィルタバージョン',
    description: 'チャットフィルタ設定のバージョン。',
    type: 'number',
    category: 'World',
    default: 0,
  },

  // Network
  {
    key: 'server-port',
    label: 'サーバーポート',
    description: 'サーバーが使用するポート番号。',
    type: 'number',
    category: 'Network',
    default: 25565,
  },
  {
    key: 'server-ip',
    label: 'サーバーIP',
    description: 'バインドするIP。空欄で全インターフェイス。',
    type: 'string',
    category: 'Network',
    default: '',
  },
  {
    key: 'network-compression-threshold',
    label: '圧縮しきい値',
    description: 'パケット圧縮を開始するサイズ(bytes)。-1で無効。',
    type: 'number',
    category: 'Network',
    default: 256,
  },
  {
    key: 'use-native-transport',
    label: 'Native Transport',
    description: 'OSネイティブなネットワーク実装を使用。',
    type: 'boolean',
    category: 'Network',
    default: true,
  },
  {
    key: 'enable-query',
    label: 'Query有効化',
    description: 'サーバーQueryを有効にするか。',
    type: 'boolean',
    category: 'Network',
    default: false,
  },
  {
    key: 'query.port',
    label: 'Queryポート',
    description: 'Queryで使用するポート。',
    type: 'number',
    category: 'Network',
    default: 25565,
  },
  {
    key: 'rate-limit',
    label: '接続レート制限',
    description: '1秒あたりの接続試行数上限。0で無制限。',
    type: 'number',
    category: 'Network',
    default: 0,
  },
  {
    key: 'prevent-proxy-connections',
    label: 'プロキシ接続防止',
    description: 'プロキシ経由接続を拒否するか。',
    type: 'boolean',
    category: 'Network',
    default: false,
  },
  {
    key: 'enable-rcon',
    label: 'RCON有効化',
    description: 'RCONリモートコンソールを有効にするか。',
    type: 'boolean',
    category: 'Network',
    default: false,
  },
  {
    key: 'rcon.port',
    label: 'RCONポート',
    description: 'RCONで使用するポート。',
    type: 'number',
    category: 'Network',
    default: 25575,
  },
  {
    key: 'rcon.password',
    label: 'RCONパスワード',
    description: 'RCON接続用パスワード。',
    type: 'string',
    category: 'Network',
    default: '',
  },
  {
    key: 'enable-status',
    label: 'ステータス応答',
    description: 'サーバーリストへのステータス応答を有効にするか。',
    type: 'boolean',
    category: 'Network',
    default: true,
  },
  {
    key: 'status-heartbeat-interval',
    label: 'ステータス送信間隔',
    description: 'ハートビート送信間隔(ms)。',
    type: 'number',
    category: 'Network',
    default: 0,
  },
  {
    key: 'entity-broadcast-range-percentage',
    label: 'エンティティ送信範囲%',
    description: 'エンティティ可視範囲の倍率(%)。',
    type: 'number',
    category: 'Network',
    default: 100,
  },

  // Security
  {
    key: 'online-mode',
    label: 'オンラインモード',
    description: 'Mojang認証を行うか。falseでオフライン(クラック)許可。',
    type: 'boolean',
    category: 'Security',
    default: true,
  },
  {
    key: 'enforce-secure-profile',
    label: 'Secure Profile強制',
    description: 'クライアントのセキュアプロファイルを必須にするか。',
    type: 'boolean',
    category: 'Security',
    default: true,
  },
  {
    key: 'enforce-whitelist',
    label: 'ホワイトリスト強制',
    description: 'ホワイトリスト外をキックするか。',
    type: 'boolean',
    category: 'Security',
    default: false,
  },
  {
    key: 'white-list',
    label: 'ホワイトリスト',
    description: 'ホワイトリストを有効にするか。',
    type: 'boolean',
    category: 'Security',
    default: false,
  },

  // Resource pack
  {
    key: 'resource-pack',
    label: 'リソースパックURL',
    description: '配布するリソースパックのURL。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'resource-pack-id',
    label: 'リソースパックID',
    description: 'リソースパックID(任意)。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'resource-pack-sha1',
    label: 'リソースパックSHA1',
    description: 'リソースパックのSHA1ハッシュ。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'resource-pack-prompt',
    label: 'リソースパック同意メッセージ',
    description: 'ダウンロード前に表示する確認メッセージ。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'require-resource-pack',
    label: 'リソースパック強制',
    description: 'リソースパック適用を必須にするか。',
    type: 'boolean',
    category: 'Advanced',
    default: false,
  },

  // Management server (1.20+)
  {
    key: 'management-server-enabled',
    label: '管理サーバー有効',
    description: '管理サーバー機能を有効化するか。',
    type: 'boolean',
    category: 'Advanced',
    default: false,
  },
  {
    key: 'management-server-host',
    label: '管理サーバーホスト',
    description: '管理サーバーのホスト名。',
    type: 'string',
    category: 'Advanced',
    default: 'localhost',
  },
  {
    key: 'management-server-port',
    label: '管理サーバーポート',
    description: '管理サーバーのポート番号。',
    type: 'number',
    category: 'Advanced',
    default: 0,
  },
  {
    key: 'management-server-secret',
    label: '管理サーバーシークレット',
    description: '管理サーバー認証用シークレット。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'management-server-tls-enabled',
    label: '管理サーバーTLS',
    description: '管理サーバーでTLSを有効にするか。',
    type: 'boolean',
    category: 'Advanced',
    default: true,
  },
  {
    key: 'management-server-tls-keystore',
    label: '管理サーバーKeystore',
    description: 'TLS用キーストアパス。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },
  {
    key: 'management-server-tls-keystore-password',
    label: '管理サーバーKeystoreパスワード',
    description: 'キーストアのパスワード。',
    type: 'string',
    category: 'Advanced',
    default: '',
  },

  // RCON / Query / Logging
  {
    key: 'log-ips',
    label: 'IPログ',
    description: '接続IPをログに記録するか。',
    type: 'boolean',
    category: 'Advanced',
    default: true,
  },

  // Performance
  {
    key: 'max-players',
    label: '最大プレイヤー数',
    description: '接続可能な最大プレイヤー数。',
    type: 'number',
    category: 'Advanced',
    default: 20,
  },
  {
    key: 'max-tick-time',
    label: '最大ティック時間',
    description: '1ティックに許可される最大時間(μs)。0で無制限。',
    type: 'number',
    category: 'Advanced',
    default: 60000,
  },
  {
    key: 'max-chained-neighbor-updates',
    label: '隣接更新チェーン上限',
    description: 'ブロック更新の連鎖上限。',
    type: 'number',
    category: 'Advanced',
    default: 1000000,
  },

  // Misc

  {
    key: 'enable-jmx-monitoring',
    label: 'JMXモニタリング',
    description: 'JMXモニタリングを有効にするか。',
    type: 'boolean',
    category: 'Advanced',
    default: false,
  },
  {
    key: 'enable-code-of-conduct',
    label: '行動規範リンク表示',
    description: 'クライアントに行動規範リンクを表示するか。',
    type: 'boolean',
    category: 'Advanced',
    default: false,
  },
  {
    key: 'hide-online-players',
    label: 'オンライン人数非表示',
    description: 'サーバーリストにオンライン人数を表示しない。',
    type: 'boolean',
    category: 'Advanced',
    default: false,
  },
  {
    key: 'region-file-compression',
    label: 'リージョン圧縮方式',
    description: 'リージョンファイルの圧縮方式(deflateなど)。',
    type: 'string',
    category: 'Advanced',
    default: 'deflate',
  },
];

/**
 * English copy for serverPropertiesList, keyed by property key. The English UI reads these instead of
 * falling back to the raw key. label and description above stay in Japanese, which the Japanese UI shows.
 */
export const serverPropertyEnglish: Record<string, { label: string; description: string }> = {
  motd: {
    label: 'MOTD',
    description: 'Message shown in the server list. Color codes are allowed.',
  },
  'bug-report-link': {
    label: 'Bug report link',
    description: 'Bug report URL shown to clients. Leave blank to hide it.',
  },
  'broadcast-console-to-ops': {
    label: 'Send console messages to ops',
    description: 'Whether messages from the console are sent to operators.',
  },
  'broadcast-rcon-to-ops': {
    label: 'Send RCON messages to ops',
    description: 'Whether messages from RCON are sent to operators.',
  },
  'op-permission-level': {
    label: 'Op permission level',
    description: 'Permission level of operators (1-4).',
  },
  'spawn-protection': {
    label: 'Spawn protection radius',
    description: 'Radius of spawn protection in blocks. 0 disables it.',
  },
  'function-permission-level': {
    label: 'Function permission level',
    description: 'Permission level needed to run command functions.',
  },
  'allow-flight': { label: 'Allow flight', description: 'Whether flying is allowed in survival.' },
  debug: { label: 'Debug mode', description: 'Whether to enable debug logging.' },
  'accepts-transfers': {
    label: 'Accept transfers',
    description: 'Whether to accept players transferred from a proxy or another server.',
  },
  'pause-when-empty-seconds': {
    label: 'Pause when empty (seconds)',
    description: 'Seconds with no players before the server pauses. -1 disables it.',
  },
  'player-idle-timeout': {
    label: 'Idle kick time (minutes)',
    description: 'Minutes before idle players are kicked. 0 disables it.',
  },
  gamemode: { label: 'Game mode', description: 'Default game mode for new players.' },
  'force-gamemode': {
    label: 'Force game mode',
    description: 'Whether players always join in the default game mode.',
  },
  difficulty: { label: 'Difficulty', description: 'World difficulty.' },
  hardcore: { label: 'Hardcore', description: 'Whether hardcore mode is enabled.' },
  pvp: { label: 'PvP', description: 'Whether players can attack each other.' },
  'level-name': { label: 'World name', description: 'Name of the world folder.' },
  'level-seed': { label: 'World seed', description: 'Seed used to generate the world.' },
  'level-type': {
    label: 'World type',
    description: 'For example default, flat, large_biomes, amplified, or customized.',
  },
  'generator-settings': {
    label: 'Generator settings',
    description: 'JSON for a custom world generator.',
  },
  'initial-disabled-packs': {
    label: 'Disabled data packs',
    description: 'Data or resource packs disabled at first start, comma-separated.',
  },
  'initial-enabled-packs': {
    label: 'Enabled data packs',
    description: 'Data or resource packs enabled at first start, comma-separated.',
  },
  'generate-structures': {
    label: 'Generate structures',
    description: 'Whether villages, strongholds, and other structures are generated.',
  },
  'simulation-distance': {
    label: 'Simulation distance',
    description: 'Distance in chunks where entities and redstone are simulated.',
  },
  'view-distance': {
    label: 'View distance',
    description: 'Distance in chunks that is sent to players.',
  },
  'max-world-size': {
    label: 'Max world size',
    description: 'Radius of the world border in blocks.',
  },
  'sync-chunk-writes': {
    label: 'Synchronous chunk writes',
    description: 'Whether chunks are written synchronously.',
  },
  'text-filtering-config': {
    label: 'Text filter config URL',
    description: 'URL of the chat filter configuration.',
  },
  'text-filtering-version': {
    label: 'Text filter version',
    description: 'Version of the chat filter configuration.',
  },
  'server-port': { label: 'Server port', description: 'Port number the server uses.' },
  'server-ip': {
    label: 'Server IP',
    description: 'IP address to bind to. Leave blank to listen on all interfaces.',
  },
  'network-compression-threshold': {
    label: 'Compression threshold',
    description: 'Packet size in bytes where compression starts. -1 disables it.',
  },
  'use-native-transport': {
    label: 'Native transport',
    description: 'Whether to use the OS-native network implementation.',
  },
  'enable-query': { label: 'Enable query', description: 'Whether the server query is enabled.' },
  'query.port': { label: 'Query port', description: 'Port used by the query.' },
  'rate-limit': {
    label: 'Connection rate limit',
    description: 'Maximum connection attempts per second. 0 means unlimited.',
  },
  'prevent-proxy-connections': {
    label: 'Prevent proxy connections',
    description: 'Whether connections through a proxy are refused.',
  },
  'enable-rcon': {
    label: 'Enable RCON',
    description: 'Whether the RCON remote console is enabled.',
  },
  'rcon.port': { label: 'RCON port', description: 'Port used by RCON.' },
  'rcon.password': { label: 'RCON password', description: 'Password for RCON connections.' },
  'enable-status': {
    label: 'Server list status',
    description: 'Whether the server answers server list status requests.',
  },
  'status-heartbeat-interval': {
    label: 'Status heartbeat interval',
    description: 'Heartbeat interval in milliseconds.',
  },
  'entity-broadcast-range-percentage': {
    label: 'Entity broadcast range (%)',
    description: 'Percentage multiplier for how far entities are visible.',
  },
  'online-mode': {
    label: 'Online mode',
    description: 'Whether to verify accounts with Mojang. false allows offline (cracked) clients.',
  },
  'enforce-secure-profile': {
    label: 'Enforce secure profile',
    description: 'Whether clients must have a secure profile.',
  },
  'enforce-whitelist': {
    label: 'Enforce whitelist',
    description: 'Whether players not on the whitelist are kicked.',
  },
  'white-list': { label: 'Whitelist', description: 'Whether the whitelist is enabled.' },
  'resource-pack': { label: 'Resource pack URL', description: 'URL of the resource pack to send.' },
  'resource-pack-id': { label: 'Resource pack ID', description: 'Optional resource pack ID.' },
  'resource-pack-sha1': {
    label: 'Resource pack SHA-1',
    description: 'SHA-1 hash of the resource pack.',
  },
  'resource-pack-prompt': {
    label: 'Resource pack prompt',
    description: 'Message shown before the download.',
  },
  'require-resource-pack': {
    label: 'Require resource pack',
    description: 'Whether players must accept the resource pack.',
  },
  'management-server-enabled': {
    label: 'Enable management server',
    description: 'Whether the management server is enabled.',
  },
  'management-server-host': {
    label: 'Management server host',
    description: 'Host name of the management server.',
  },
  'management-server-port': {
    label: 'Management server port',
    description: 'Port number of the management server.',
  },
  'management-server-secret': {
    label: 'Management server secret',
    description: 'Secret used to authenticate to the management server.',
  },
  'management-server-tls-enabled': {
    label: 'Management server TLS',
    description: 'Whether TLS is enabled for the management server.',
  },
  'management-server-tls-keystore': {
    label: 'Management server keystore',
    description: 'Path to the TLS keystore.',
  },
  'management-server-tls-keystore-password': {
    label: 'Management server keystore password',
    description: 'Password for the keystore.',
  },
  'log-ips': {
    label: 'Log IP addresses',
    description: 'Whether connecting IP addresses are logged.',
  },
  'max-players': { label: 'Max players', description: 'Maximum number of players that can join.' },
  'max-tick-time': {
    label: 'Max tick time',
    description: 'Maximum time per tick in microseconds. 0 means unlimited.',
  },
  'max-chained-neighbor-updates': {
    label: 'Max chained neighbor updates',
    description: 'Limit on chained block updates.',
  },
  'enable-jmx-monitoring': {
    label: 'Enable JMX monitoring',
    description: 'Whether JMX monitoring is enabled.',
  },
  'enable-code-of-conduct': {
    label: 'Show code of conduct link',
    description: 'Whether to show the code of conduct link to clients.',
  },
  'hide-online-players': {
    label: 'Hide online players',
    description: 'Hides the online player count in the server list.',
  },
  'region-file-compression': {
    label: 'Region file compression',
    description: 'Compression format for region files, such as deflate.',
  },
};
