import type { FC } from 'react';

const ProxyHelpView: FC = () => {
  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="proxy-help-view">
      <h1 className="proxy-help-view__title">🌐 Proxy Network 構築ガイド</h1>

      <div className="proxy-help-view__intro">
        <p className="proxy-help-view__intro-text">
          複数のサーバーを連結させる「Proxyサーバー」を構築する手順です。
          <br />
          以下のステップに従って設定を行ってください。
        </p>
      </div>

      {/* --- Step 1 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">Step 1</div>
        <h3>GUIでの基本設定</h3>
        <p>まずは「Proxy Network」タブの画面上で以下の操作を行います。</p>

        <ul className="proxy-help-view__list">
          <li>
            <strong>ソフトウェアの選択:</strong>
            <br />
            <span className="proxy-help-view__muted">
              Velocity (推奨), Waterfall, BungeeCord から選択します。
            </span>
          </li>
          <li>
            <strong>公開ポートの設定:</strong>
            <br />
            <span className="proxy-help-view__muted">
              他のサーバー（25565など）と<strong>絶対に被らない数値</strong>
              を設定してください。
              <br />
              例: サーバーA(25565)がある場合 → 25577 など
            </span>
          </li>
          <li>
            <strong>接続先サーバーの選択:</strong>
            <br />
            <span className="proxy-help-view__muted">
              連結したいサーバーをリストからチェックします。
            </span>
          </li>
        </ul>
        <p>
          設定ができたら<strong>「ネットワーク構築を実行」</strong>
          ボタンを押してください。
        </p>
      </div>

      {/* --- Step 2 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">Step 2</div>
        <h3>サーバーファイルの配置</h3>
        <p>
          構築ボタンを押すとフォルダが生成されます。必要なファイルをダウンロードして配置します。
        </p>

        <div className="mb-4">
          <strong>1. フォルダへ移動</strong>
          <br />
          <span className="proxy-help-view__muted">
            "Files"タブの「移動」ボタンなどを使い、以下のパスへ移動します。
          </span>
          <div className="proxy-help-view__code">servers/Proxy-Server</div>
        </div>

        <div>
          <strong>2. Jarファイルのダウンロード & 配置</strong>
          <br />
          <span className="proxy-help-view__muted">
            以下のリンクからJarファイルをダウンロードし、ファイル名を <code>server.jar</code>{' '}
            に変更して、上記のフォルダ内に入れてください。
          </span>
          <div className="proxy-help-view__cta-row">
            <button
              className="btn-primary proxy-help-view__cta-btn"
              onClick={() => openLink('https://papermc.io/downloads/velocity')}
            >
              Paper公式 (Velocity) を開く
            </button>
          </div>
        </div>
      </div>

      {/* --- Step 3 --- */}
      <div className="proxy-help-view__step">
        <div className="proxy-help-view__step-badge">Step 3</div>
        <h3>設定ファイルの編集と完了</h3>

        <div className="mb-4">
          <strong>1. 設定ファイルの編集</strong>
          <br />
          <span className="proxy-help-view__muted">
            <code>servers/Proxy-Server/</code> 内にある以下のファイルを開きます。
            <br />
            ファイル内のコメント（説明文）に従って必要な設定を変更してください。
          </span>
          <div className="proxy-help-view__code">
            velocity.toml <span className="text-zinc-600 text-xs">(自動生成されています)</span>
          </div>
        </div>

        <div>
          <strong>2. 保存して完了</strong>
          <br />
          <span className="proxy-help-view__muted">
            編集が終わったら右上の「保存」ボタンを押してください。
            <br />
            これでProxyネットワークの構築は完了です！
          </span>
        </div>
      </div>

      <div className="proxy-help-view__done">
        🎉 以上で設定完了です。Proxyサーバーを起動して接続をテストしてください。
      </div>
    </div>
  );
};

export default ProxyHelpView;
