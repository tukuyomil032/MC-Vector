export default function NgrokGuideView() {
  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="p-10 text-white h-screen box-border overflow-y-auto bg-[#1e1e1e]">
      <h1 className="border-b border-zinc-700 pb-4 mt-0">🌐 ポート開放不要化 (ngrok) 設定ガイド</h1>

      <div className="mb-8">
        <p className="leading-relaxed text-zinc-300">
          この機能を使うと、難しいルーターの設定（ポート開放）をせずに、世界中の友達をあなたのサーバーに招待できます。
          <br />
          利用には無料の <strong>ngrokアカウント</strong> と <strong>認証トークン</strong>{' '}
          が必要です。
        </p>
      </div>

      <div className="bg-[#252526] rounded-lg p-5 mb-5 border border-[#3e3e42] relative">
        <div className="absolute -top-2.5 left-5 bg-accent px-2.5 py-0.5 rounded-xl text-xs font-bold">
          Step 1
        </div>
        <h3>公式サイトへアクセス</h3>
        <p>
          ngrokの公式サイトにアクセスし、アカウントを作成（Sign up）またはログインしてください。
        </p>
        <button
          className="btn-primary mt-2"
          onClick={() => openLink('https://dashboard.ngrok.com/get-started/your-authtoken')}
        >
          ngrok ダッシュボードを開く
        </button>
      </div>

      <div className="bg-[#252526] rounded-lg p-5 mb-5 border border-[#3e3e42] relative">
        <div className="absolute -top-2.5 left-5 bg-accent px-2.5 py-0.5 rounded-xl text-xs font-bold">
          Step 2
        </div>
        <h3>Authtoken (認証トークン) をコピー</h3>
        <p>
          ダッシュボードの左メニューから <strong>"Your Authtoken"</strong> をクリックします。
          <br />
          ページ上部に表示されている <code>2A...</code>{' '}
          などから始まる長い文字列をコピーしてください。
        </p>
        <div className="bg-[#111] p-2.5 rounded font-mono text-zinc-500 mt-2.5">
          例: 2Axxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx
        </div>
      </div>

      <div className="bg-[#252526] rounded-lg p-5 mb-5 border border-[#3e3e42] relative">
        <div className="absolute -top-2.5 left-5 bg-accent px-2.5 py-0.5 rounded-xl text-xs font-bold">
          Step 3
        </div>
        <h3>アプリに入力して接続</h3>
        <p>
          このアプリの <strong>General Settings</strong> タブに戻り、スイッチをONにしてください。
          <br />
          トークンの入力を求められるので、先ほどコピーした文字列を貼り付けてください。
        </p>
        <p className="text-sm text-zinc-400 mt-2">
          ※ アドレスは毎回変わります。遊ぶたびに新しいアドレスを友達に教えてあげてください。
        </p>
      </div>
    </div>
  );
}
