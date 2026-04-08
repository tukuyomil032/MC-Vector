/**
 * Japanese translations
 */
import type { TranslationDictionary } from '../types';

export const ja: TranslationDictionary = {
  common: {
    ok: 'OK',
    cancel: 'キャンセル',
    save: '保存',
    delete: '削除',
    edit: '編集',
    create: '作成',
    close: '閉じる',
    back: '戻る',
    next: '次へ',
    loading: '読み込み中...',
    error: 'エラー',
    success: '成功',
    confirm: '確認',
    yes: 'はい',
    no: 'いいえ',
    search: '検索',
    refresh: '更新',
    copy: 'コピー',
    paste: '貼り付け',
  },

  settings: {
    title: '設定',
    language: {
      title: '言語',
      description: '使用する言語を選択してください',
    },
    theme: {
      title: 'テーマ',
      description: 'アプリの外観を選択',
      options: {
        dark: 'ダーク',
        darkBlue: 'ダークブルー',
        grey: 'グレー',
        forest: 'フォレスト',
        sunset: 'サンセット',
        neon: 'ネオン',
        coffee: 'コーヒー',
        ocean: 'オーシャン',
        system: 'システム',
      },
    },
    general: {
      title: '一般',
    },
    advanced: {
      title: '詳細設定',
    },
  },

  server: {
    title: 'サーバー',
    create: {
      title: 'サーバーを作成',
      name: 'サーバー名',
      version: 'Minecraftバージョン',
      type: 'サーバータイプ',
      description: '説明',
    },
    list: {
      empty: 'サーバーがありません。最初のサーバーを作成しましょう！',
      running: '稼働中',
      stopped: '停止中',
    },
    actions: {
      start: '起動',
      stop: '停止',
      restart: '再起動',
      backup: 'バックアップ',
      delete: '削除',
      openFolder: 'フォルダを開く',
    },
    console: {
      title: 'コンソール',
      placeholder: 'コマンドを入力...',
    },
  },

  plugins: {
    title: 'プラグイン',
    search: {
      placeholder: 'プラグインを検索...',
      noResults: 'プラグインが見つかりません',
    },
    install: {
      button: 'インストール',
      success: 'プラグインをインストールしました',
      error: 'プラグインのインストールに失敗しました',
    },
    installed: {
      title: 'インストール済みプラグイン',
      empty: 'プラグインがインストールされていません',
    },
    sources: {
      modrinth: 'Modrinth',
      hangar: 'Hangar',
      spigot: 'SpigotMC',
    },
  },

  nav: {
    home: 'ホーム',
    servers: 'サーバー',
    plugins: 'プラグイン',
    settings: '設定',
  },

  errors: {
    generic: 'エラーが発生しました',
    network: 'ネットワークエラー。接続を確認してください。',
    notFound: '見つかりません',
    permission: '権限がありません',
    validation: '入力が無効です',
  },
};
