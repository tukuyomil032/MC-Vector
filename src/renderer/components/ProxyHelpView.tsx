import type { FC } from 'react';

const ProxyHelpView: FC = () => {
  const openLink = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="p-10 text-white h-screen box-border overflow-y-auto bg-[#1e1e1e] font-sans">
      <h1 className="border-b border-zinc-700 pb-4 mt-0">🌐 Proxy Network 構築ガイド</h1>

      <div className="mb-8">
        <p className="leading-relaxed text-zinc-300">
          複数のサーバーを連結させる「Proxyサーバー」を構築する手順です。
          <br />
          以下のステップに従って設定を行ってください。
        </p>
      </div>

      {/* --- Step 1 --- */}
      <div className="bg-[#252526] rounded-lg px-5 pt-6 pb-5 mb-6 border border-[#3e3e42] relative shadow-md">
        <div className="absolute -top-3 left-5 bg-accent text-white px-3 py-1 rounded-xl text-sm font-bold shadow-md">
          Step 1
        </div>
        <h3>GUIでの基本設定</h3>
        <p>まずは「Proxy Network」タブの画面上で以下の操作を行います。</p>

        <ul className="text-zinc-300 leading-relaxed pl-5">
          <li>
            <strong>ソフトウェアの選択:</strong>
            <br />
            <span className="text-sm text-zinc-400">
              Velocity (推奨), Waterfall, BungeeCord から選択します。
            </span>
          </li>
          <li>
            <strong>公開ポートの設定:</strong>
            <br />
            <span className="text-sm text-zinc-400">
              他のサーバー（25565など）と<strong>絶対に被らない数値</strong>
              を設定してください。
              <br />
              例: サーバーA(25565)がある場合 → 25577 など
            </span>
          </li>
          <li>
            <strong>接続先サーバーの選択:</strong>
            <br />
            <span className="text-sm text-zinc-400">
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
      <div className="bg-[#252526] rounded-lg px-5 pt-6 pb-5 mb-6 border border-[#3e3e42] relative shadow-md">
        <div className="absolute -top-3 left-5 bg-accent text-white px-3 py-1 rounded-xl text-sm font-bold shadow-md">
          Step 2
        </div>
        <h3>サーバーファイルの配置</h3>
        <p>
          構築ボタンを押すとフォルダが生成されます。必要なファイルをダウンロードして配置します。
        </p>

        <div className="mb-4">
          <strong>1. フォルダへ移動</strong>
          <br />
          <span className="text-zinc-300 text-[0.95rem]">
            "Files"タブの「移動」ボタンなどを使い、以下のパスへ移動します。
          </span>
          <div className="bg-[#111] px-4 py-2.5 rounded border border-zinc-800 mt-1.5 mb-2.5 inline-block font-mono text-zinc-200">
            servers/Proxy-Server
          </div>
        </div>

        <div>
          <strong>2. Jarファイルのダウンロード & 配置</strong>
          <br />
          <span className="text-zinc-300 text-[0.95rem]">
            以下のリンクからJarファイルをダウンロードし、ファイル名を <code>server.jar</code>{' '}
            に変更して、上記のフォルダ内に入れてください。
          </span>
          <div className="mt-2.5">
            <button
              className="btn-primary text-sm py-1.5 px-4 mr-2.5 bg-[#28c1be] hover:bg-[#24a8a5]"
              onClick={() => openLink('https://papermc.io/downloads/velocity')}
            >
              Paper公式 (Velocity) を開く
            </button>
          </div>
        </div>
      </div>

      {/* --- Step 3 --- */}
      <div className="bg-[#252526] rounded-lg px-5 pt-6 pb-5 mb-6 border border-[#3e3e42] relative shadow-md">
        <div className="absolute -top-3 left-5 bg-accent text-white px-3 py-1 rounded-xl text-sm font-bold shadow-md">
          Step 3
        </div>
        <h3>設定ファイルの編集と完了</h3>

        <div className="mb-4">
          <strong>1. 設定ファイルの編集</strong>
          <br />
          <span className="text-zinc-300 text-[0.95rem]">
            <code>servers/Proxy-Server/</code> 内にある以下のファイルを開きます。
            <br />
            ファイル内のコメント（説明文）に従って必要な設定を変更してください。
          </span>
          <div className="bg-[#111] px-4 py-2.5 rounded border border-zinc-800 mt-1.5 mb-2.5 inline-block font-mono text-zinc-200">
            velocity.toml <span className="text-zinc-600 text-xs">(自動生成されています)</span>
          </div>
        </div>

        <div>
          <strong>2. 保存して完了</strong>
          <br />
          <span className="text-zinc-300 text-[0.95rem]">
            編集が終わったら右上の「保存」ボタンを押してください。
            <br />
            これでProxyネットワークの構築は完了です！
          </span>
        </div>
      </div>

      <div className="mt-8 p-5 text-center text-success font-bold bg-success/10 rounded-lg border border-success/30">
        🎉 以上で設定完了です。Proxyサーバーを起動して接続をテストしてください。
      </div>
    </div>
  );
};

export default ProxyHelpView;
