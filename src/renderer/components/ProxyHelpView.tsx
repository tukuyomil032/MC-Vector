import React from 'react';
import '../../main.css';

const ProxyHelpView: React.FC = () => {
  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div style={{
      padding: '40px',
      color: '#fff',
      height: '100vh',
      boxSizing: 'border-box',
      overflowY: 'auto',
      backgroundColor: '#1e1e1e',
      fontFamily: '"Segoe UI", sans-serif'
    }}>
      <h1 style={{ borderBottom: '1px solid #444', paddingBottom: '15px', marginTop: 0 }}>
        🌐 Proxy Network 構築ガイド
      </h1>

      <div style={{ marginBottom: '30px' }}>
        <p style={{ lineHeight: '1.6', color: '#ccc' }}>
          複数のサーバーを連結させる「Proxyサーバー」を構築する手順です。<br/>
          以下のステップに従って設定を行ってください。
        </p>
      </div>

      {/* --- Step 1 --- */}
      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 1</div>
        <h3>GUIでの基本設定</h3>
        <p>まずは「Proxy Network」タブの画面上で以下の操作を行います。</p>

        <ul style={{ color: '#ccc', lineHeight: '1.8', paddingLeft: '20px' }}>
          <li>
            <strong>ソフトウェアの選択:</strong><br/>
            <span style={{ fontSize: '0.9rem', color: '#aaa' }}>Velocity (推奨), Waterfall, BungeeCord から選択します。</span>
          </li>
          <li>
            <strong>公開ポートの設定:</strong><br/>
            <span style={{ fontSize: '0.9rem', color: '#aaa' }}>
              他のサーバー（25565など）と<strong>絶対に被らない数値</strong>を設定してください。<br/>
              例: サーバーA(25565)がある場合 → 25577 など
            </span>
          </li>
          <li>
            <strong>接続先サーバーの選択:</strong><br/>
            <span style={{ fontSize: '0.9rem', color: '#aaa' }}>連結したいサーバーをリストからチェックします。</span>
          </li>
        </ul>
        <p>
          設定ができたら<strong>「ネットワーク構築を実行」</strong>ボタンを押してください。
        </p>
      </div>

      {/* --- Step 2 --- */}
      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 2</div>
        <h3>サーバーファイルの配置</h3>
        <p>
          構築ボタンを押すとフォルダが生成されます。必要なファイルをダウンロードして配置します。
        </p>

        <div style={{ marginBottom: '15px' }}>
          <strong>1. フォルダへ移動</strong><br/>
          <span style={{ color: '#ccc', fontSize: '0.95rem' }}>"Files"タブの「移動」ボタンなどを使い、以下のパスへ移動します。</span>
          <div style={styles.codeBlock}>
            servers/Proxy-Server
          </div>
        </div>

        <div>
          <strong>2. Jarファイルのダウンロード & 配置</strong><br/>
          <span style={{ color: '#ccc', fontSize: '0.95rem' }}>
            以下のリンクからJarファイルをダウンロードし、ファイル名を <code>server.jar</code> に変更して、上記のフォルダ内に入れてください。
          </span>
          <div style={{ marginTop: '10px' }}>
            <button
              className="btn-primary"
              style={{ fontSize: '0.9rem', padding: '5px 15px', marginRight: '10px', backgroundColor: '#28c1be', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
              onClick={() => openLink('https://papermc.io/downloads/velocity')}
            >
              Paper公式 (Velocity) を開く
            </button>
          </div>
        </div>
      </div>

      {/* --- Step 3 --- */}
      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 3</div>
        <h3>設定ファイルの編集と完了</h3>

        <div style={{ marginBottom: '15px' }}>
          <strong>1. 設定ファイルの編集</strong><br/>
          <span style={{ color: '#ccc', fontSize: '0.95rem' }}>
            <code>servers/Proxy-Server/</code> 内にある以下のファイルを開きます。<br/>
            ファイル内のコメント（説明文）に従って必要な設定を変更してください。
          </span>
          <div style={styles.codeBlock}>
            velocity.toml <span style={{ color: '#666', fontSize: '0.8rem' }}>(自動生成されています)</span>
          </div>
        </div>

        <div>
          <strong>2. 保存して完了</strong><br/>
          <span style={{ color: '#ccc', fontSize: '0.95rem' }}>
            編集が終わったら右上の「保存」ボタンを押してください。<br/>
            これでProxyネットワークの構築は完了です！
          </span>
        </div>
      </div>

      <div style={{
        marginTop: '30px',
        padding: '20px',
        textAlign: 'center',
        color: '#10b981',
        fontWeight: 'bold',
        background: 'rgba(16, 185, 129, 0.1)',
        borderRadius: '8px',
        border: '1px solid rgba(16, 185, 129, 0.3)'
      }}>
        🎉 以上で設定完了です。Proxyサーバーを起動して接続をテストしてください。
      </div>

    </div>
  );
};

const styles = {
  stepCard: {
    backgroundColor: '#252526',
    borderRadius: '8px',
    padding: '25px 20px 20px 20px',
    marginBottom: '25px',
    border: '1px solid #3e3e42',
    position: 'relative' as const,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
  },
  stepNum: {
    position: 'absolute' as const,
    top: '-12px',
    left: '20px',
    backgroundColor: '#5865F2',
    color: '#fff',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '0.85rem',
    fontWeight: 'bold',
    boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
  },
  codeBlock: {
    background: '#111',
    padding: '10px 15px',
    borderRadius: '4px',
    fontFamily: 'Consolas, monospace',
    color: '#e0e0e0',
    marginTop: '5px',
    marginBottom: '10px',
    border: '1px solid #333',
    display: 'inline-block'
  }
};

export default ProxyHelpView;