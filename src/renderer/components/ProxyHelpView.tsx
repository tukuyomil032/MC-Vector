import React from 'react';
import '../../main.css';

const ProxyHelpView: React.FC = () => {
  return (
    <div style={{
      padding: '30px',
      color: '#e0e0e0',
      backgroundColor: '#1e1e1e',
      height: '100vh',
      overflowY: 'auto',
      fontFamily: 'sans-serif'
    }}>
      <h2 style={{
        borderBottom: '1px solid #444',
        paddingBottom: '15px',
        marginBottom: '20px',
        color: '#fff'
      }}>
        Proxy Network ヘルプ
      </h2>

      <div style={{ lineHeight: '1.8', fontSize: '0.95rem' }}>
        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>① ソフトウェアを選びます。</strong>
          <p style={{ margin: '5px 0 0 15px', color: '#aaa' }}>
            ※BungeeCord, Waterfall, Velocityの3つが使えますが、Velocityを推奨しています。
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>② 公開ポートを設定します。</strong>
          <p style={{ margin: '5px 0 0 15px' }}>
            接続したいサーバーのポートと絶対に被らないようにしてください。
          </p>
          <p style={{ margin: '5px 0 0 15px', color: '#aaa' }}>
            ※接続先にしたいサーバーAのポートが25565、サーバーBのポートが25566の場合、25565, 25566以外のポートを使用するようにしてください。
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>③ 接続したいサーバーをリストから選択します。</strong>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>④ 「ネットワーク構築を実行」を押します。</strong>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>⑤ "Files"タブから、「移動」ボタンを押し、以下のように入力します：</strong>
          <div style={{
            background: '#333',
            padding: '10px',
            borderRadius: '4px',
            marginTop: '8px',
            marginLeft: '15px',
            fontFamily: 'monospace',
            display: 'inline-block'
          }}>
            servers/Proxy-Server
          </div>
        </div>

        <div style={{ marginBottom: '20px'}}>
            <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>⑥ <a style={{ color: '#28c1beff' }} target='_blank' href='https://papermc.io/downloads/velocity'>Paper公式からVelocityのJarファイルをダウンロード</a>し、ファイル名を以下のように変更し、Proxy-Server内に格納します。</strong>
            <div style={{
                background: '#333',
                padding: '10px',
                borderRadius: '4px',
                marginTop: '8px',
                marginLeft: '15px',
                fontFamily: 'monospace',
                display: 'inline-block'
            }}>
                ファイル名：server.jar
            </div>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>⑦ 設定ファイルの編集</strong>
          <p style={{ margin: '5px 0 0 15px' }}>
            servers/Proxy-Server/内にある、<span style={{color: '#fff', fontWeight: 'bold'}}>velocity.toml</span>(ネットワーク構築を実行で自動生成されたファイル)を開き、ファイル内の説明文に従って設定を変更してください。
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <strong style={{ color: '#4daafc', fontSize: '1.1rem' }}>⑧ 右上の保存ボタンを押し、保存してください。</strong>
        </div>

        <div style={{ marginTop: '30px', borderTop: '1px solid #444', paddingTop: '20px', textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>
          以上で設定完了です。
        </div>
      </div>
    </div>
  );
};

export default ProxyHelpView;