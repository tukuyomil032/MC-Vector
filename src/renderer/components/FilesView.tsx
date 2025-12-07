import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

// ★追加: アイコン画像の読み込み
import iconFolder from '../../assets/icons/folder.svg';
import iconFile from '../../assets/icons/file.svg';
import iconOpenLocation from '../../assets/icons/open-folder.svg';
import iconMove from '../../assets/icons/move.svg';
import iconZip from '../../assets/icons/zip.svg';
import iconUnzip from '../../assets/icons/unzip.svg';
import iconTrash from '../../assets/icons/trash.svg';

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

  // モーダル系
  const [modalType, setModalType] = useState<string | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [modalMoveTarget, setModalMoveTarget] = useState('');
  const [createType, setCreateType] = useState<'file' | 'folder'>('folder');

  // オートコンプリート系
  const [pathSuggestions, setPathSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // D&D状態管理
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [internalDragFile, setInternalDragFile] = useState<string | null>(null);

  const sep = server.path.includes('\\') ? '\\' : '/';

  // --- 初期化 ---
  useEffect(() => {
    // serversルートの特定
    const parts = server.path.split(sep);
    const rootParts = parts.slice(0, parts.length - 1);
    setServersRootAbsPath(rootParts.join(sep));
  }, [server.path, sep]);

  useEffect(() => {
    loadFiles(currentPath);
    setSelectedFiles([]);
  }, [currentPath]);

  const loadFiles = async (path: string) => {
    try {
      const list = await window.electronAPI.listFiles(path);
      setFiles(list);
    } catch (e) {
      console.error(e);
    }
  };

  // --- パス変換ロジック ---
  const toDisplayPath = (absPath: string) => {
    if (!serversRootAbsPath) return absPath;
    if (absPath.startsWith(serversRootAbsPath)) {
      const relative = absPath.substring(serversRootAbsPath.length);
      const cleanRelative = relative.startsWith(sep) ? relative.substring(1) : relative;
      return `servers${sep}${cleanRelative}`;
    }
    return absPath;
  };

  const toAbsolutePath = (displayPath: string) => {
    if (!serversRootAbsPath) return displayPath;
    if (displayPath.startsWith('servers')) {
      let relative = displayPath.replace(/^servers/, '');
      if (relative.startsWith('/') || relative.startsWith('\\')) {
        relative = relative.substring(1);
      }
      if (!relative) return serversRootAbsPath;
      return `${serversRootAbsPath}${sep}${relative}`;
    }
    return displayPath;
  };

  // --- アクション ---
  const handleFolderClick = (folderName: string) => {
    const newPath = currentPath.endsWith(sep) ? `${currentPath}${folderName}` : `${currentPath}${sep}${folderName}`;
    setCurrentPath(newPath);
  };

  const handleGoUp = () => {
    if (currentPath === serversRootAbsPath) return;
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf(sep));
    if (parentPath.length < serversRootAbsPath.length) {
      setCurrentPath(serversRootAbsPath);
    } else {
      setCurrentPath(parentPath);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const displayPath = toDisplayPath(currentPath);
    const parts = displayPath.split(sep);
    const targetDisplayPath = parts.slice(0, index + 1).join(sep);
    const newAbsPath = toAbsolutePath(targetDisplayPath);
    setCurrentPath(newAbsPath);
  };

  const handleFileClick = async (fileName: string) => {
    const filePath = `${currentPath}${sep}${fileName}`;
    try {
        const content = await window.electronAPI.readFile(filePath);
        setEditingFile(fileName);
        setFileContent(content);
        setIsEditorOpen(true);
    } catch {
        alert("ファイルを開けません");
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

  const openMoveItemModal = () => {
    setModalType('move-item');
    setModalMoveTarget(selectedFiles.join(', '));
    setModalInput(toDisplayPath(currentPath));
    setPathSuggestions([]);
  };

  const openNavigateModal = () => {
    setModalType('navigate');
    setModalMoveTarget('カレントディレクトリ');
    setModalInput(toDisplayPath(currentPath));
    setPathSuggestions([]);
  };

  const openCreateModal = () => {
    setModalType('create');
    setModalInput('');
    setCreateType('folder');
  };

  const executeModalAction = async () => {
    if (modalType === 'navigate') {
      const targetAbs = toAbsolutePath(modalInput);
      try {
        const check = await window.electronAPI.listFiles(targetAbs);
        if (check) {
          setCurrentPath(targetAbs);
          setModalType(null);
        }
      } catch {
        alert('指定されたディレクトリは存在しないか、アクセスできません。');
      }
    }
    else if (modalType === 'move-item') {
      const targetDirAbs = toAbsolutePath(modalInput);
      for (const name of selectedFiles) {
          const src = `${currentPath}${sep}${name}`;
          const dest = `${targetDirAbs}${sep}${name}`;
          await window.electronAPI.movePath(src, dest);
      }
      loadFiles(currentPath);
      setModalType(null);
      setSelectedFiles([]);
    }
    else if (modalType === 'create') {
      if (!modalInput) return;
      const targetPath = `${currentPath}${sep}${modalInput}`;
      if (createType === 'folder') {
        await window.electronAPI.createDirectory(targetPath);
      } else {
        await window.electronAPI.saveFile(targetPath, '');
      }
      loadFiles(currentPath);
      setModalType(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedFiles.includes(file.name)) {
        setSelectedFiles([file.name]);
    }
    setContextMenu({ x: e.pageX, y: e.pageY, file });
  };

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

  const handleOpenLocation = async () => {
    if (contextMenu?.file) {
      const targetPath = `${currentPath}${sep}${contextMenu.file.name}`;
      await window.electronAPI.openPathInExplorer(targetPath);
    }
    setContextMenu(null);
  };

  // --- D&D処理 ---

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOver) setIsDraggingOver(true);
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    // 1. 外部からのファイル (File Upload)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paths = Array.from(e.dataTransfer.files).map((f: any) => f.path);
        if (paths.some(p => !p)) {
          alert('ファイルのパスを取得できませんでした。');
          return;
        }
        await window.electronAPI.uploadFiles(paths, currentPath);
        loadFiles(currentPath);
        return;
    }

    // 2. 内部ファイル移動
    setInternalDragFile(null);
  };

  const handleDragStart = (e: React.DragEvent, fileName: string) => {
    setInternalDragFile(fileName);
    e.dataTransfer.setData('text/plain', fileName);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    const draggedFile = e.dataTransfer.getData('text/plain') || internalDragFile;
    if (!draggedFile) return;

    if (draggedFile === folderName) return;

    const src = `${currentPath}${sep}${draggedFile}`;
    const dest = `${currentPath}${sep}${folderName}${sep}${draggedFile}`;

    if (window.confirm(`"${draggedFile}" を "${folderName}" に移動しますか？`)) {
        await window.electronAPI.movePath(src, dest);
        loadFiles(currentPath);
    }
    setInternalDragFile(null);
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setModalInput(val);

    if (modalType !== 'navigate' && modalType !== 'move-item') return;
    if (!val || val.length < 2) {
      setPathSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const lastSepIdx = val.lastIndexOf(sep) !== -1 ? val.lastIndexOf(sep) : val.lastIndexOf('/');
    let searchDirDisplay = '';
    let searchPrefix = '';

    if (lastSepIdx !== -1) {
      searchDirDisplay = val.substring(0, lastSepIdx);
      searchPrefix = val.substring(lastSepIdx + 1);
    } else {
      if (val.startsWith('servers')) {
         searchDirDisplay = 'servers';
         searchPrefix = val.replace(/^servers[/\\]?/, '');
      } else {
         return;
      }
    }

    const searchDirAbs = toAbsolutePath(searchDirDisplay);

    try {
      const entries = await window.electronAPI.listFiles(searchDirAbs);
      const matched = entries
        .filter(f => f.isDirectory && f.name.toLowerCase().startsWith(searchPrefix.toLowerCase()))
        .map(f => {
            const base = searchDirDisplay.endsWith(sep) ? searchDirDisplay : searchDirDisplay + sep;
            return `${base}${f.name}`;
        });

      setPathSuggestions(matched);
      setShowSuggestions(matched.length > 0);
    } catch {
      setPathSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.json')) return 'json';
    if (fileName.endsWith('.yml') || fileName.endsWith('.yaml')) return 'yaml';
    if (fileName.endsWith('.properties') || fileName.endsWith('.txt')) return 'ini';
    if (fileName.endsWith('.js')) return 'javascript';
    return 'plaintext';
  };

  const handleCloseEditor = () => {
    setIsEditorOpen(false);
    setEditingFile(null);
  };

  const toggleSelect = (fileName: string) => {
    setSelectedFiles(prev =>
      prev.includes(fileName) ? prev.filter(f => f !== fileName) : [...prev, fileName]
    );
  };

  const displayPathString = toDisplayPath(currentPath);
  const displayPathParts = displayPathString.split(sep).filter(p => p);

  return (
    <div
        style={{ display: 'flex', height: '100%', overflow: 'hidden', position: 'relative' }}
        onClick={() => { setContextMenu(null); setShowSuggestions(false); }}
        onDragOver={handleContainerDragOver}
        onDragLeave={handleContainerDragLeave}
        onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(88, 101, 242, 0.3)',
            border: '4px dashed #5865F2',
            zIndex: 50,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            pointerEvents: 'none'
        }}>
            <h2 style={{color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>
                ファイルをドロップしてアップロード
            </h2>
        </div>
      )}

      {modalType && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <div
              style={{ background: '#2c2c2c', padding: '20px', borderRadius: '8px', width: '500px', color: '#fff', border: '1px solid #444', position: 'relative' }}
              onClick={e => e.stopPropagation()}
            >
                <h3 style={{marginTop: 0}}>
                  {modalType === 'navigate' ? '指定ディレクトリに移動' :
                   modalType === 'move-item' ? 'アイテムを移動' : '新規作成'}
                </h3>

                {modalType !== 'create' ? (
                  <>
                    <p style={{fontSize: '0.8rem', color: '#aaa', marginBottom: '10px'}}>
                      {modalType === 'move-item' ? `対象: ${modalMoveTarget}` : 'パスを入力してください'}
                    </p>
                    <div style={{ position: 'relative' }}>
                      <input
                          type="text"
                          value={modalInput}
                          onChange={handleInputChange}
                          onFocus={() => { if(pathSuggestions.length > 0) setShowSuggestions(true); }}
                          placeholder="例: servers/test/plugins"
                          style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#111', border: '1px solid #444', color: '#fff', fontSize: '1rem' }}
                      />
                      {showSuggestions && (
                        <ul style={{
                          position: 'absolute', top: '38px', left: 0, right: 0,
                          background: '#1e1e1e', border: '1px solid #444', borderRadius: '4px',
                          listStyle: 'none', padding: 0, margin: 0, maxHeight: '150px', overflowY: 'auto', zIndex: 1000
                        }}>
                          {pathSuggestions.map(s => (
                            <li
                              key={s}
                              onClick={() => { setModalInput(s); setShowSuggestions(false); }}
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
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={createType === 'folder'} onChange={() => setCreateType('folder')} style={{marginRight: '5px'}}/> フォルダ
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input type="radio" checked={createType === 'file'} onChange={() => setCreateType('file')} style={{marginRight: '5px'}}/> ファイル
                      </label>
                    </div>
                    <input
                        type="text"
                        value={modalInput}
                        onChange={e => setModalInput(e.target.value)}
                        placeholder={createType === 'folder' ? 'NewFolder' : 'config.yml'}
                        style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#111', border: '1px solid #444', color: '#fff', fontSize: '1rem' }}
                    />
                  </>
                )}

                <div style={{ textAlign: 'right', marginTop: '10px' }}>
                    <button onClick={() => setModalType(null)} style={{ marginRight: '10px', padding: '8px 16px', background: 'transparent', color: '#ccc', border: '1px solid #666', cursor: 'pointer' }}>キャンセル</button>
                    <button onClick={executeModalAction} style={{ padding: '8px 20px', background: '#5865F2', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                      {modalType === 'create' ? '作成' : '移動'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {contextMenu && (
        <div style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: '#252526', border: '1px solid #444', borderRadius: '4px', zIndex: 10000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)', minWidth: '180px', padding: '5px 0'
        }}>
            {/* ★修正: メニューアイテムに画像アイコンを追加し、Flexboxで整列 */}
            <div className="ctx-item" onClick={handleOpenLocation} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <img src={iconOpenLocation} alt="" style={{width: '16px', height: '16px', filter: 'invert(0.8)'}} />
              場所を開く
            </div>
            <div className="ctx-item" onClick={openMoveItemModal} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <img src={iconMove} alt="" style={{width: '16px', height: '16px', filter: 'invert(0.8)'}} />
              移動...
            </div>
            <div className="ctx-item" onClick={handleCompress} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <img src={iconZip} alt="" style={{width: '16px', height: '16px', filter: 'invert(0.8)'}} />
              圧縮 (Zip)
            </div>
            {contextMenu.file?.name.endsWith('.zip') && (
                <div className="ctx-item" onClick={handleExtract} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <img src={iconUnzip} alt="" style={{width: '16px', height: '16px', filter: 'invert(0.8)'}} />
                  解凍
                </div>
            )}
            <div style={{ borderTop: '1px solid #444', margin: '5px 0' }}></div>
            <div className="ctx-item delete" onClick={handleDelete} style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              <img src={iconTrash} alt="" style={{width: '16px', height: '16px', filter: 'brightness(0) saturate(100%) invert(42%) sepia(93%) saturate(1352%) hue-rotate(334deg) brightness(102%) contrast(89%)'}} />
              削除
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
            <button className="btn-primary" onClick={handleSave} disabled={isSaving}>保存 (Ctrl+S)</button>
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
            <button className="btn-secondary" onClick={openNavigateModal}>移動</button>
            <button className="btn-secondary" onClick={openCreateModal} title="新規作成">＋</button>

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
                className={`file-row ${selectedFiles.includes(file.name) ? 'selected' : ''}`}
                style={{
                    padding: '10px 15px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: '10px',
                    cursor: 'pointer'
                }}
                onClick={() => file.isDirectory ? handleFolderClick(file.name) : handleFileClick(file.name)}
                draggable
                onDragStart={(e) => handleDragStart(e, file.name)}
                onDragOver={(e) => { if(file.isDirectory) { e.preventDefault(); e.stopPropagation(); } }}
                onDrop={(e) => { if(file.isDirectory) handleDropOnFolder(e, file.name); }}
              >
                <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.name)}
                    onChange={() => toggleSelect(file.name)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ cursor: 'pointer' }}
                />
                {/* ★修正: 絵文字を画像アイコンに変更 */}
                <img
                  src={file.isDirectory ? iconFolder : iconFile}
                  alt={file.isDirectory ? 'Folder' : 'File'}
                  style={{ width: '20px', height: '20px', objectFit: 'contain' }}
                />

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