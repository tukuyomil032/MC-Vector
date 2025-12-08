import '../../main.css';

export default function NgrokGuideView() {
  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '40px', color: '#fff', height: '100vh', boxSizing: 'border-box', overflowY: 'auto', backgroundColor: '#1e1e1e' }}>
      <h1 style={{ borderBottom: '1px solid #444', paddingBottom: '15px', marginTop: 0 }}>
        🌐 ポート開放不要化 (ngrok) 設定ガイド
      </h1>

      <div style={{ marginBottom: '30px' }}>
        <p style={{ lineHeight: '1.6', color: '#ccc' }}>
          この機能を使うと、難しいルーターの設定（ポート開放）をせずに、世界中の友達をあなたのサーバーに招待できます。<br/>
          利用には無料の <strong>ngrokアカウント</strong> と <strong>認証トークン</strong> が必要です。
        </p>
      </div>

      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 1</div>
        <h3>公式サイトへアクセス</h3>
        <p>ngrokの公式サイトにアクセスし、アカウントを作成（Sign up）またはログインしてください。</p>
        <button
          className="btn-primary"
          onClick={() => openLink('https://dashboard.ngrok.com/get-started/your-authtoken')}
        >
          ngrok ダッシュボードを開く
        </button>
      </div>

      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 2</div>
        <h3>Authtoken (認証トークン) をコピー</h3>
        <p>
          ダッシュボードの左メニューから <strong>"Your Authtoken"</strong> をクリックします。<br/>
          ページ上部に表示されている <code>2A...</code> などから始まる長い文字列をコピーしてください。
        </p>
        <div style={{ background: '#111', padding: '10px', borderRadius: '4px', fontFamily: 'monospace', color: '#888' }}>
          例: 2Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx
        </div>
      </div>

      <div className="step-card" style={styles.stepCard}>
        <div style={styles.stepNum}>Step 3</div>
        <h3>アプリに入力して接続</h3>
        <p>
          このアプリの <strong>General Settings</strong> タブに戻り、スイッチをONにしてください。<br/>
          トークンの入力を求められるので、先ほどコピーした文字列を貼り付けてください。
        </p>
        <p style={{ fontSize: '0.9rem', color: '#aaa' }}>
          ※ アドレスは毎回変わります。遊ぶたびに新しいアドレスを友達に教えてあげてください。
        </p>
      </div>

    </div>
  );
}

const styles = {
  stepCard: {
    backgroundColor: '#252526',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '20px',
    border: '1px solid #3e3e42',
    position: 'relative' as const
  },
  stepNum: {
    position: 'absolute' as const,
    top: '-10px',
    left: '20px',
    backgroundColor: '#5865F2',
    padding: '2px 10px',
    borderRadius: '12px',
    fontSize: '0.8rem',
    fontWeight: 'bold'
  }
};