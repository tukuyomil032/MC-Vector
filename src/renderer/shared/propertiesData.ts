export type PropertyType = 'boolean' | 'number' | 'string' | 'select';
export type PropertyCategory = 'General' | 'Gameplay' | 'World' | 'Network' | 'Security' | 'Advanced';

export interface PropertyDefinition {
  key: string;
  label: string;
  description: string;
  type: PropertyType;
  category: PropertyCategory;
  options?: string[]; // selectタイプ用
  default: string | number | boolean;
}

export const serverPropertiesList: PropertyDefinition[] = [
  // --- General (基本) ---
  {
    key: 'motd',
    label: 'MOTD',
    description: 'サーバーリストに表示されるメッセージです。カラーコードも使用可能です。',
    type: 'string',
    category: 'General',
    default: 'A Minecraft Server'
  },
  {
    key: 'max-players',
    label: '最大プレイヤー数',
    description: 'サーバーに入室できる最大人数を設定します。',
    type: 'number',
    category: 'General',
    default: 20
  },

  // --- Gameplay (ゲームプレイ) ---
  {
    key: 'gamemode',
    label: 'ゲームモード',
    description: '新規プレイヤーのデフォルトゲームモードです。',
    type: 'select',
    options: ['survival', 'creative', 'adventure', 'spectator'],
    category: 'Gameplay',
    default: 'survival'
  },
  {
    key: 'difficulty',
    label: '難易度',
    description: 'ワールドの難易度を設定します。',
    type: 'select',
    options: ['peaceful', 'easy', 'normal', 'hard'],
    category: 'Gameplay',
    default: 'normal'
  },
  {
    key: 'pvp',
    label: 'PvP許可',
    description: 'プレイヤー同士の攻撃を有効にするかどうか。',
    type: 'boolean',
    category: 'Gameplay',
    default: true
  },
  {
    key: 'hardcore',
    label: 'ハードコアモード',
    description: '死んだら復活できないハードコアモードにします（観戦モードになります）。',
    type: 'boolean',
    category: 'Gameplay',
    default: false
  },
  {
    key: 'allow-flight',
    label: '飛行の許可',
    description: 'サバイバルモードでの飛行を許可するかどうか（チート対策）。',
    type: 'boolean',
    category: 'Gameplay',
    default: false
  },

  // --- World (ワールド生成) ---
  {
    key: 'level-seed',
    label: 'シード値',
    description: 'ワールド生成時のシード値。空欄の場合はランダムになります。',
    type: 'string',
    category: 'World',
    default: ''
  },
  {
    key: 'level-type',
    label: 'ワールドタイプ',
    description: '生成されるワールドの種類（default, flat, large_biomes, amplifiedなど）。',
    type: 'string',
    category: 'World',
    default: 'default'
  },
  {
    key: 'generate-structures',
    label: '構造物の生成',
    description: '村やダンジョンなどの構造物を生成するかどうか。',
    type: 'boolean',
    category: 'World',
    default: true
  },
  {
    key: 'spawn-protection',
    label: 'スポーン保護範囲',
    description: 'スポーン地点周辺のブロック破壊を禁止する半径（OP以外）。0で無効。',
    type: 'number',
    category: 'World',
    default: 16
  },

  // --- Network (通信) ---
  {
    key: 'server-port',
    label: 'サーバーポート',
    description: 'サーバーが使用するポート番号。デフォルトは25565。',
    type: 'number',
    category: 'Network',
    default: 25565
  },
  {
    key: 'enable-rcon',
    label: 'RCON有効化',
    description: 'リモートコンソール接続を許可するかどうか。',
    type: 'boolean',
    category: 'Network',
    default: false
  },

  // --- Security (セキュリティ) ---
  {
    key: 'online-mode',
    label: 'オンラインモード',
    description: 'Mojang認証サーバーでアカウント確認を行うか。Falseにするとクラック版も接続可能になります。',
    type: 'boolean',
    category: 'Security',
    default: true
  },
  {
    key: 'white-list',
    label: 'ホワイトリスト',
    description: '許可リストに登録されたプレイヤーのみ参加可能にします。',
    type: 'boolean',
    category: 'Security',
    default: false
  },
  {
    key: 'enforce-whitelist',
    label: 'ホワイトリスト強制',
    description: 'サーバー稼働中にホワイトリストに追加されていないプレイヤーをキックします。',
    type: 'boolean',
    category: 'Security',
    default: false
  }
];