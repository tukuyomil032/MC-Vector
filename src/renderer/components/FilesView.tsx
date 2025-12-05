import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { type MinecraftServer } from '../shared/server declaration';
import '../../main.css';

interface Props {
  server: MinecraftServer;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

export default function FilesView({ server }: Props) {
  // --- State ---
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  
  // システム上の「servers」フォルダの絶対パス (例: C:\Users\...\mc-vector\servers)
  const [serversRootAbsPath, setServersRootAbsPath] = useState('');

  // 選択系
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  // エディタ系
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // UI系
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileEntry | null } | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveDestPath, setMoveDestPath] = useState('');
  const [moveTargetName, setMoveTargetName] = useState('');
  
  // オートコンプリート系
  const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // OSごとのパス区切り文字判定
  const sep = server.path.includes('\\') ? '\\' : '/';

  // 初期ロード & ルートパス特定
  useEffect(() => {
    loadFiles(currentPath);
    setSelectedFiles([]);

    // サーバーのパスは ".../servers/server-id" となっているはずなので、
    // その親ディレクトリを servers のルートとする
    const parts = server.path.split(sep);
    // 末尾のサーバーフォルダ名を除去
    const rootParts = parts.slice(0, parts.length - 1);
    setServersRootAbsPath(rootParts.join(sep));

  }, [currentPath, server.path, sep]);

  const loadFiles = async (path: string) => {
    try {
      const list = await window.electronAPI.listFiles(path);
      setFiles(list);
    } catch (e) {
      console.error(e);
    }
  };

  // --- パス変換ロジック ---

  // 絶対パス -> 表示用パス (servers/...)
  const toDisplayPath = (absPath: string) => {
    if (!serversRootAbsPath) return absPath;
    if (absPath.startsWith(serversRootAbsPath)) {
      // 先頭の絶対パス部分を除去し、"servers" を付与
      const relative = absPath.substring(serversRootAbsPath.length);
      // 先頭のセパレータを調整
      const cleanRelative = relative.startsWith(sep) ? relative.substring(1) : relative;
      return `servers${sep}${cleanRelative}`;
    }
    return absPath;
  };

  // 表示用パス (servers/...) -> 絶対パス
  const toAbsolutePath = (displayPath: string) => {
    if (!serversRootAbsPath) return displayPath;
    // "servers" で始まっていれば置換
    if (displayPath.startsWith('servers')) {
      // "servers" (7文字) + セパレータ分を除去して結合
      // 入力が "servers" そのものの場合はルートを返す
      if (displayPath === 'servers' || displayPath === 'servers/') return serversRootAbsPath;
      
      const relative = displayPath.replace(/^servers[/\\]?/, '');
      return `${serversRootAbsPath}${sep}${relative}`;
    }
    return displayPath;
  };

  // --- パンくずリスト ---
  const handleBreadcrumbClick = (index: number) => {
    const displayPath = toDisplayPath(currentPath);
    const parts = displayPath.split(sep);
    // クリックされた階層までのパス (例: servers/test)
    const targetDisplayPath = parts.slice(0, index + 1).join(sep);
    const newAbsPath = toAbsolutePath(targetDisplayPath);
    setCurrentPath(newAbsPath);
  };

  // --- アクション ---
  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath.endsWith(sep) ? `${currentPath}${folderName}` : `${currentPath}${sep}${folderName}`;
    setCurrentPath(newPath);
  };

  const handleGoUp = () => {
    // serversルートより上には行かせない
    if (currentPath === serversRootAbsPath) return;
    
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf(sep));
    // 安全策: ルートより短くならないように
    if (parentPath.length < serversRootAbsPath.length) {
      setCurrentPath(serversRootAbsPath);
    } else {
      setCurrentPath(parentPath);
    }
  };

  const handleFileClick = async (fileName: string) => {
    const filePath = `${currentPath}${sep}${fileName}`;
    try {
        const content = await window.electronAPI.readFile(filePath);
        setEditingFile(fileName);
        setFileContent(content);
        setIsEditorOpen(true);
    } catch {
        alert("ファイルを開けません（バイナリ等の可能性）");
    }
  };

  const handleSave = async () => {
    if (!editingFile) return;
    setIsSaving(true);
    const filePath = `${currentPath}${sep}${editingFile}`;
    await window.electronAPI.saveFile(filePath, fileContent);
    setIsSaving(false);
    alert('保存しました！');
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingFile(null);
  };

  // チェックボックス
  const toggleSelect = (fileName: string) => {
    setSelectedFiles(prev => 
      prev.includes(fileName) ? prev.filter(f => f !== fileName) : [...prev, fileName]
    );
  };

  // 右クリック
  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFiles.includes(file.name)) {
        setSelectedFiles([file.name]);
    }
    setContextMenu({ x: e.pageX, y: e.pageY, file });
  };

  // --- メニューアクション ---
  const handleDelete = async () => {
    if (!window.confirm(`選択した ${selectedFiles.length} 項目を削除しますか？`)) return;
    for (const name of selectedFiles) {
        await window.electronAPI.deletePath(`${currentPath}${sep}${name}`);
    }
    loadFiles(currentPath);
    setContextMenu(null);
    setSelectedFiles([]);
  };

  const handleCompress = async () => {
    const paths = selectedFiles.map(name => `${currentPath}${sep}${name}`);
    const dest = `${currentPath}${sep}${selectedFiles[0]}.zip`; 
    await window.electronAPI.compressFiles(paths, dest);
    loadFiles(currentPath);
    setContextMenu(null);
  };

  const handleExtract = async () => {
    if (contextMenu?.file) {
        const archive = `${currentPath}${sep}${contextMenu.file.name}`;
        await window.electronAPI.extractArchive(archive, currentPath);
        loadFiles(currentPath);
    }
    setContextMenu(null);
  };

  // --- 移動関連 & オートコンプリート ---

  const handleMovePrompt = () => {
    setMoveTargetName(selectedFiles.join(', '));
    // 初期値として現在の表示パスを入れる
    setMoveDestPath(toDisplayPath(currentPath)); 
    setShowMoveModal(true);
    setContextMenu(null);
    setPathSuggestions([]);
  };

  // 入力欄の変更時処理 (候補検索)
  const handleMoveInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setMoveDestPath(val);

    if (!val || val.length < 2) {
      setPathSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // 入力されたパスの親ディレクトリを探す
    // 例: "servers/te" -> "servers/" を検索して "test" を見つける
    const lastSepIdx = val.lastIndexOf(sep) !== -1 ? val.lastIndexOf(sep) : val.lastIndexOf('/');
    
    let searchDirDisplay = '';
    let searchPrefix = '';

    if (lastSepIdx !== -1) {
      searchDirDisplay = val.substring(0, lastSepIdx);
      searchPrefix = val.substring(lastSepIdx + 1);
    } else {
      // セパレータがない場合 (例: "ser") -> 何もしないか、ルート直下とみなすか
      // ここではservers/からの入力を前提とするので、servers直下を探すなら "servers/" と打ってもらう
      return; 
    }

    const searchDirAbs = toAbsolutePath(searchDirDisplay);
    
    try {
      const entries = await window.electronAPI.listFiles(searchDirAbs);
      // ディレクトリのみ、かつ入力と前方一致するものを抽出
      const matched = entries
        .filter(f => f.isDirectory && f.name.toLowerCase().startsWith(searchPrefix.toLowerCase()))
        .map(f => `${searchDirDisplay}${sep}${f.name}`);
      
      setPathSuggestions(matched);
      setShowSuggestions(matched.length > 0);
    } catch {
      setPathSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setMoveDestPath(suggestion);
    setShowSuggestions(false);
  };

  const executeMove = async () => {
    const targetDirAbs = toAbsolutePath(moveDestPath);

    for (const name of selectedFiles) {
        const src = `${currentPath}${sep}${name}`;
        const dest = `${targetDirAbs}${sep}${name}`;
        
        await window.electronAPI.movePath(src, dest);
    }
    
    loadFiles(currentPath);
    setShowMoveModal(false);
    setSelectedFiles([]);
  };

  // --- D&D ---
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path);
        await window.electronAPI.uploadFiles(paths, currentPath);
        loadFiles(currentPath);
    }
  };

  // 表示用パスパーツ
  const displayPathString = toDisplayPath(currentPath);
  const displayPathParts = displayPathString.split(sep).filter(p => p);

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) return 'yaml';
    if (fileName.endsWith('.properties') || fileName.endsWith('.txt')) return 'ini';
    if (fileName.endsWith('.js')) return 'javascript';
    return 'plaintext';
  };

  return (
    <div 
        style={{ display: 'flex', height: '100%', overflow: 'hidden' }}
        onClick={() => { setContextMenu(null); setShowSuggestions(false); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
    >
      {/* 移動先指定モーダル */}
      {showMoveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div 
              style={{ background: '#2c2c2c', padding: '20px', borderRadius: '8px', width: '500px', color: '#fff', border: '1px solid #444', position: 'relative' }}
              onClick={e => e.stopPropagation()} // モーダル内のクリックで閉じないように
            >
                <h3 style={{marginTop: 0}}>指定ディレクトリに移動</h3>
                <p style={{fontSize: '0.8rem', color: '#aaa', marginBottom: '10px'}}>移動するアイテム: {moveTargetName}</p>
                
                <div style={{ position: 'relative' }}>
                  <input 
                      type="text" 
                      value={moveDestPath} 
                      onChange={handleMoveInputChange}
                      onFocus={() => { if(pathSuggestions.length > 0) setShowSuggestions(true); }}
                      placeholder="例: servers/test/plugins"
                      style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#111', border: '1px solid #444', color: '#fff', fontSize: '1rem' }}
                  />
                  {/* オートコンプリート候補リスト */}
                  {showSuggestions && (
                    <ul style={{
                      position: 'absolute', top: '38px', left: 0, right: 0,
                      background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px',
                      listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto', zIndex: 1000
                    }}>
                      {pathSuggestions.map(s => (
                        <li 
                          key={s} 
                          onClick={() => handleSuggestionClick(s)}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #333' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#007acc'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ textAlign: 'right', marginTop: '10px' }}>
                    <button onClick={() => setShowMoveModal(false)} style={{ marginRight: '10px', padding: '8px 16px', background: 'transparent', color: '#ccc', border: '1px solid #666', cursor: 'pointer' }}>キャンセル</button>
                    <button onClick={executeMove} style={{ padding: '8px 20px', background: '#5865F2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>移動</button>
                </div>
            </div>
        </div>
      )}

      {/* コンテキストメニュー */}
      {contextMenu && (
        <div style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: '#252526', border: '1px solid #444', borderRadius: '4px', zIndex: 10000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '160px', padding: '5px 0'
        }}>
            <div onClick={handleMovePrompt} style={{ padding: '8px 15px', cursor: 'pointer', color: '#ecf0f1', fontSize: '14px' }} onMouseEnter={e => e.currentTarget.style.background = '#3a3a3a'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
               ➡ このアイテムを移動...
            </div>
            <div onClick={handleCompress} style={{ padding: '8px 15px', cursor: 'pointer', color: '#ecf0f1', fontSize: '14px' }} onMouseEnter={e => e.currentTarget.style.background = '#3a3a3a'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
               📦 圧縮 (Zip)
            </div>
            {contextMenu.file?.name.endsWith('.zip') && (
                <div onClick={handleExtract} style={{ padding: '8px 15px', cursor: 'pointer', color: '#ecf0f1', fontSize: '14px' }} onMouseEnter={e => e.currentTarget.style.background = '#3a3a3a'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                   📂 解凍
                </div>
            )}
            <div style={{ borderTop: '1px solid #444', margin: '5px 0' }}></div>
            <div onClick={handleDelete} style={{ padding: '8px 15px', cursor: 'pointer', color: '#ff6b6b', fontSize: '14px' }} onMouseEnter={e => e.currentTarget.style.background = '#3a3a3a'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
               🗑 削除
            </div>
        </div>
      )}

      {isEditorOpen ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ height: '50px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', padding: '0 20px', justifyContent: 'space-between', backgroundColor: 'var(--bg-secondary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button className="btn-secondary" onClick={handleCloseEditor}>← 戻る</button>
              <span style={{ fontWeight: 'bold' }}>{editingFile}</span>
            </div>
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>{isSaving ? '保存中...' : '保存 (Ctrl+S)'}</button>
          </div>
          <div style={{ flex: 1 }}>
            <Editor height="100%" defaultLanguage={editingFile ? getLanguage(editingFile) : 'plaintext'} value={fileContent} onChange={(v) => setFileContent(v || '')} theme="vs-dark" />
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px' }}>
          {/* ナビゲーションバー */}
          <div style={{ marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button className="btn-secondary" onClick={handleGoUp} disabled={currentPath === serversRootAbsPath}>↑</button>
            <button className="btn-secondary" onClick={() => { setMoveTargetName('カレントディレクトリ'); setMoveDestPath(toDisplayPath(currentPath)); setShowMoveModal(true); }}>移動</button>

            <div style={{ 
              backgroundColor: 'var(--bg-tertiary)', padding: '8px 12px', borderRadius: '4px', flex: 1, 
              fontFamily: 'monospace', border: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '5px' 
            }}>
                <span style={{color: '#888', cursor: 'default'}}>/</span>
                {displayPathParts.map((part, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center' }}>
                        <span onClick={() => handleBreadcrumbClick(i)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>{part}</span>
                        <span style={{color: '#888', margin: '0 5px'}}>/</span>
                    </span>
                ))}
            </div>
          </div>

          {/* ファイルリスト */}
          <div style={{ flex: 1, backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', overflowY: 'auto' }}>
            {files.map((file) => (
              <div 
                key={file.name}
                onContextMenu={(e) => handleContextMenu(e, file)}
                className="file-row"
                style={{
                    padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px',
                    backgroundColor: selectedFiles.includes(file.name) ? 'rgba(88, 101, 242, 0.2)' : 'transparent',
                    cursor: 'pointer'
                }}
                onClick={() => file.isDirectory ? handleFolderClick(file.name) : handleFileClick(file.name)}
              >
                <input 
                    type="checkbox" 
                    checked={selectedFiles.includes(file.name)}
                    onChange={() => toggleSelect(file.name)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer' }}
                />
                <span style={{ fontSize: '1.2rem' }}>{file.isDirectory ? '📁' : '📄'}</span>
                <span style={{ flex: 1, fontWeight: file.isDirectory ? 'bold' : 'normal', color: file.isDirectory ? 'var(--accent)' : 'var(--text-primary)' }}>{file.name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{file.isDirectory ? '-' : (file.size ? (file.size / 1024).toFixed(1) + ' KB' : '0 KB')}</span>
              </div>
            ))}
            {files.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>フォルダは空です</div>}
          </div>
        </div>
      )}
    </div>
  );
}