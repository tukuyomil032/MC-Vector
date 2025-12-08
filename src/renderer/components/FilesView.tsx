import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { type MinecraftServer } from '../components/../shared/server declaration';
import '../../main.css';

import iconFolder from '../../assets/icons/folder.svg';
import iconFile from '../../assets/icons/file.svg';
import iconOpenLocation from '../../assets/icons/open-folder.svg';
import iconMove from '../../assets/icons/move.svg';
import iconZip from '../../assets/icons/zip.svg';
import iconUnzip from '../../assets/icons/unzip.svg';
import iconTrash from '../../assets/icons/trash.svg';
import iconFiles from '../../assets/icons/files.svg';
import iconImport from '../../assets/icons/import.svg';

interface Props {
  server: MinecraftServer;
}

interface FileEntry {
  name: string;
  isDirectory: boolean;
  size?: number;
}

export default function FilesView({ server }: Props) {
  const [currentPath, setCurrentPath] = useState(server.path);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [serversRootAbsPath, setServersRootAbsPath] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);

  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: FileEntry | null } | null>(null);
  const [modalType, setModalType] = useState<string | null>(null);

  const [newFileName, setNewFileName] = useState('');
  const [createMode, setCreateMode] = useState<'folder' | 'file'>('folder');

  const [moveDestPath, setMoveDestPath] = useState('');
  const [renameFileName, setRenameFileName] = useState('');

  useEffect(() => {
    const loadRoot = async () => {
      const root = await window.electronAPI.getServerRoot();
      setServersRootAbsPath(root.replace(/\\/g, '/'));
    };
    loadRoot();
  }, []);

  useEffect(() => {
    loadFiles(currentPath);
  }, [currentPath]);

  const loadFiles = async (path: string) => {
    try {
      const entries = await window.electronAPI.listFiles(path);
      setFiles(entries);
    } catch (e) {
      console.error("Failed to list files", e);
    }
  };

  const renderBreadcrumbs = () => {
    if (!serversRootAbsPath) return <span style={{ fontFamily: 'monospace' }}>Loading...</span>;

    const normalizedCurrent = currentPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    let relativePath = '';
    if (normalizedCurrent.startsWith(normalizedRoot)) {
      relativePath = normalizedCurrent.substring(normalizedRoot.length);
    } else {
      return <span style={{ fontFamily: 'monospace' }}>{currentPath}</span>;
    }

    const segments = relativePath.split('/').filter(Boolean);

    return (
      <div className="breadcrumbs">
        <span
          className="breadcrumb-item"
          onClick={() => setCurrentPath(normalizedRoot)}
        >
          servers
        </span>

        {segments.map((seg, index) => {
          const pathUpToHere = `${normalizedRoot}/${segments.slice(0, index + 1).join('/')}`;

          return (
            <span key={index} style={{ display: 'flex', alignItems: 'center' }}>
              <span className="breadcrumb-separator">/</span>
              <span
                className="breadcrumb-item"
                onClick={() => setCurrentPath(pathUpToHere)}
              >
                {seg}
              </span>
            </span>
          );
        })}
      </div>
    );
  };

  const getDisplayPath = (fullPath: string) => {
    const normalizedFull = fullPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    if (normalizedFull.startsWith(normalizedRoot)) {
      return normalizedFull.replace(normalizedRoot, 'servers');
    }
    return normalizedFull;
  };


  const handleRowClick = (fileName: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelect(fileName);
    } else {
      setSelectedFiles([fileName]);
    }
  };

  const handleCheckboxClick = (fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSelect(fileName);
  };

  const toggleSelect = (name: string) => {
    if (selectedFiles.includes(name)) {
        setSelectedFiles(selectedFiles.filter(f => f !== name));
    } else {
        setSelectedFiles([...selectedFiles, name]);
    }
  };

  const handleFileDoubleClick = async (fileName: string) => {
    const target = files.find(f => f.name === fileName);
    if (!target) return;

    if (target.isDirectory) {
      setCurrentPath(prev => `${prev}/${fileName}`.replace(/\/+/g, '/'));
      setSelectedFiles([]);
    } else {
      try {
        const content = await window.electronAPI.readFile(`${currentPath}/${fileName}`);
        setEditingFile(fileName);
        setFileContent(content);
        setIsEditorOpen(true);
      } catch (e) {
        console.error("Failed to read file", e);
      }
    }
  };

  const handleGoUp = () => {
    if (currentPath === server.path) return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || server.path;
    setCurrentPath(parent);
    setSelectedFiles([]);
  };

  const handleSaveFile = async () => {
    if (!editingFile) return;
    setIsSaving(true);
    await window.electronAPI.saveFile(`${currentPath}/${editingFile}`, fileContent);
    setIsSaving(false);
    setIsEditorOpen(false);
    setEditingFile(null);
  };

  const handleContextMenu = (e: React.MouseEvent, file: FileEntry | null) => {
    e.preventDefault();
    if (file && !selectedFiles.includes(file.name)) {
      setSelectedFiles([file.name]);
    }
    setContextMenu({ x: e.pageX, y: e.pageY, file });
  };

  const handleDelete = async () => {
    if (selectedFiles.length === 0) return;
    if (!window.confirm(`${selectedFiles.length}個の項目を削除しますか？`)) return;

    for (const name of selectedFiles) {
      await window.electronAPI.deletePath(`${currentPath}/${name}`);
    }
    setSelectedFiles([]);
    loadFiles(currentPath);
    setContextMenu(null);
  };

  const handleCreate = async () => {
    if (!newFileName) return;
    const target = `${currentPath}/${newFileName}`;

    if (createMode === 'folder') {
      await window.electronAPI.createDirectory(target);
    } else {
      await window.electronAPI.saveFile(target, '');
    }

    setModalType(null);
    setNewFileName('');
    loadFiles(currentPath);
  };

  const handleImport = async () => {
    setModalType(null);
    const result = await window.electronAPI.importFilesDialog(currentPath);

    if (result.success) {
      loadFiles(currentPath);
    } else if (result.message !== 'キャンセルされました') {
      alert(result.message);
    }
  };

  const handleMove = async () => {
    if (!moveDestPath) return;

    let realDest = moveDestPath.replace(/\\/g, '/');
    const normalizedRoot = serversRootAbsPath.replace(/\\/g, '/');

    if (realDest.startsWith('servers/')) {
       realDest = realDest.replace('servers', normalizedRoot);
    }
    realDest = realDest.replace(/\/+/g, '/');

    if (modalType === 'moveCurrent') {
      await window.electronAPI.movePath(currentPath, realDest);
      handleGoUp();
    } else {
      for (const name of selectedFiles) {
          const src = `${currentPath}/${name}`;
          const dest = `${realDest}/${name}`.replace(/\/+/g, '/');
          await window.electronAPI.movePath(src, dest);
      }
      setSelectedFiles([]);
      loadFiles(currentPath);
    }
    setModalType(null);
  };

  const openMoveModal = (isCurrentDir: boolean) => {
    const displayPath = getDisplayPath(isCurrentDir ? currentPath : currentPath);
    setMoveDestPath(displayPath);
    setModalType(isCurrentDir ? 'moveCurrent' : 'move');
  };

  const handleRename = async () => {
    if (!renameFileName || !contextMenu?.file) return;
    const src = `${currentPath}/${contextMenu.file.name}`;
    const dest = `${currentPath}/${renameFileName}`;
    await window.electronAPI.movePath(src, dest);
    setModalType(null);
    setRenameFileName('');
    loadFiles(currentPath);
  };

  const handleZip = async () => {
    if (selectedFiles.length === 0) return;
    const targets = selectedFiles.map(f => `${currentPath}/${f}`);
    const dest = `${currentPath}/archive-${Date.now()}.zip`;
    await window.electronAPI.compressFiles(targets, dest);
    loadFiles(currentPath);
    setContextMenu(null);
  };

  const handleUnzip = async () => {
    if (selectedFiles.length === 0) return;
    for (const f of selectedFiles) {
        if (f.endsWith('.zip')) {
            await window.electronAPI.extractArchive(`${currentPath}/${f}`, currentPath);
        }
    }
    loadFiles(currentPath);
    setContextMenu(null);
  };

  const handleOpenExplorer = () => {
    window.electronAPI.openPathInExplorer(currentPath);
  };

  const handleDragStart = (e: React.DragEvent, fileName: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ fileName, fromPath: currentPath }));
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderName: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
        const data = JSON.parse(e.dataTransfer.getData('text/plain'));
        if (data.fromPath === currentPath && data.fileName !== folderName) {
            const src = `${currentPath}/${data.fileName}`;
            const dest = `${currentPath}/${folderName}/${data.fileName}`;
            await window.electronAPI.movePath(src, dest);
            loadFiles(currentPath);
        }
    } catch (err) {
    }
  };


  const styles = {
    modalOverlay: {
      position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', justifyContent: 'center', alignItems: 'center'
    },
    modalContent: {
      background: '#252526', padding: '25px', borderRadius: '12px',
      width: '450px', border: '1px solid #3e3e42', color: '#fff',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
    },
    modalTitle: {
      marginTop: 0, marginBottom: '20px', fontSize: '1.2rem',
      borderBottom: '1px solid #444', paddingBottom: '10px'
    },
    input: {
      width: '100%', padding: '10px', marginTop: '15px', marginBottom: '20px',
      background: '#1e1e1e', border: '1px solid #444', color: '#fff',
      borderRadius: '6px', fontSize: '1rem', boxSizing: 'border-box' as const
    },
    buttonRow: {
      display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px'
    },
    roundedButtonSecondary: {
      padding: '8px 16px', borderRadius: '8px', border: '1px solid #444',
      background: 'transparent', color: '#ccc', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' as const
    },
    roundedButtonPrimary: {
      padding: '8px 16px', borderRadius: '8px', border: 'none',
      background: '#5865F2', color: '#fff', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' as const
    },
    selectionContainer: {
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px'
    },
    selectionCard: (isActive: boolean) => ({
      display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center',
      gap: '8px', padding: '20px 5px', borderRadius: '8px', cursor: 'pointer',
      border: isActive ? '2px solid #5865F2' : '2px solid transparent',
      background: isActive ? 'rgba(88, 101, 242, 0.15)' : '#333',
      color: isActive ? '#fff' : '#aaa', transition: 'all 0.2s ease'
    }),
    iconImg: {
      width: '32px', height: '32px', objectFit: 'contain' as const
    }
  };

  return (
    <div className="files-view" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#ccc' }} onClick={() => setContextMenu(null)}>
      {/* ツールバー */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '10px', background: '#252526' }}>
        <button className="btn-icon" onClick={handleGoUp} disabled={currentPath === server.path} title="上の階層へ">⬆</button>

        {/* パンくずリスト */}
        <div style={{ flex: 1, background: '#1e1e1e', padding: '5px 10px', borderRadius: '4px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
            {renderBreadcrumbs()}
        </div>

        <button className="btn-icon" onClick={() => setModalType('create')} title="新規作成 / インポート">+</button>
        <button className="btn-icon" onClick={handleOpenExplorer} title="エクスプローラーで開く"><img src={iconOpenLocation} style={{width:16}} alt="Open" /></button>
        {selectedFiles.length > 0 && (
            <>
                <div style={{width: 1, height: 20, background:'#444', margin:'0 5px'}}></div>
                <button className="btn-icon" onClick={() => openMoveModal(false)} title="移動"><img src={iconMove} style={{width:16}} alt="Move" /></button>
                <button className="btn-icon" onClick={handleZip} title="圧縮"><img src={iconZip} style={{width:16}} alt="Zip" /></button>
                <button className="btn-icon" onClick={handleUnzip} title="解凍"><img src={iconUnzip} style={{width:16}} alt="Unzip" /></button>
                <button className="btn-icon danger" onClick={handleDelete} title="削除"><img src={iconTrash} style={{width:16}} alt="Delete" /></button>
            </>
        )}
      </div>

      {/* ファイルリスト表示エリア */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0', backgroundColor: '#1e1e1e' }} onContextMenu={(e) => handleContextMenu(e, null)}>
          <div className="file-list-container">
            {files.map(file => (
              <div
                key={file.name}
                className={`file-item ${selectedFiles.includes(file.name) ? 'selected' : ''}`}
                onContextMenu={(e) => { e.stopPropagation(); handleContextMenu(e, file); }}
                onClick={(e) => handleRowClick(file.name, e)}
                onDoubleClick={() => handleFileDoubleClick(file.name)}
                draggable
                onDragStart={(e) => handleDragStart(e, file.name)}
                onDragOver={(e) => { if(file.isDirectory) { e.preventDefault(); e.stopPropagation(); } }}
                onDrop={(e) => { if(file.isDirectory) handleDropOnFolder(e, file.name); }}
              >
                <input
                    type="checkbox"
                    checked={selectedFiles.includes(file.name)}
                    onChange={() => {}}
                    onClick={(e) => handleCheckboxClick(file.name, e)}
                    style={{ cursor: 'pointer', marginRight: '10px', marginLeft: '10px' }}
                />
                <img
                  src={file.isDirectory ? iconFolder : iconFile}
                  alt={file.isDirectory ? 'Folder' : 'File'}
                  style={{ width: '20px', height: '20px', objectFit: 'contain', marginRight: '10px' }}
                />
                <span style={{ flex: 1, fontWeight: file.isDirectory ? 'bold' : 'normal', color: file.isDirectory ? 'var(--accent)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', minWidth: '80px', textAlign: 'right', marginRight: '10px' }}>{file.isDirectory ? '-' : (file.size ? (file.size / 1024).toFixed(1) + ' KB' : '0 KB')}</span>
              </div>
            ))}
            {files.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>フォルダは空です</div>}
          </div>
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#1e1e1e', zIndex: 2000, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px', background: '#252526', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{editingFile}</span>
                <div>
                    <button className="btn-secondary" onClick={() => setIsEditorOpen(false)} style={{ marginRight: '10px' }}>閉じる</button>
                    <button className="btn-primary" onClick={handleSaveFile} disabled={isSaving}>{isSaving ? '保存中...' : '保存'}</button>
                </div>
            </div>
            <Editor
                height="100%"
                defaultLanguage={editingFile?.endsWith('.json') ? 'json' : editingFile?.endsWith('.yml') || editingFile?.endsWith('.yaml') ? 'yaml' : editingFile?.endsWith('.properties') ? 'ini' : 'plaintext'}
                theme="vs-dark"
                value={fileContent}
                onChange={(val) => setFileContent(val || '')}
            />
        </div>
      )}

      {/* New Create / Import Modal */}
      {modalType === 'create' && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>新規作成 / インポート</h3>

            <div style={styles.selectionContainer}>
              <div
                style={styles.selectionCard(createMode === 'folder')}
                onClick={() => setCreateMode('folder')}
              >
                <img src={iconFiles} alt="Folder" style={styles.iconImg} />
                <span style={{fontSize:'0.9rem', fontWeight: createMode === 'folder' ? 'bold':'normal'}}>フォルダ</span>
              </div>

              <div
                style={styles.selectionCard(createMode === 'file')}
                onClick={() => setCreateMode('file')}
              >
                <img src={iconFile} alt="File" style={styles.iconImg} />
                <span style={{fontSize:'0.9rem', fontWeight: createMode === 'file' ? 'bold':'normal'}}>ファイル</span>
              </div>

              <div
                style={styles.selectionCard(false)}
                onClick={handleImport}
              >
                <img src={iconImport} alt="Import" style={styles.iconImg} />
                <span style={{fontSize:'0.9rem'}}>インポート</span>
              </div>
            </div>

            <label style={{display: 'block', color: '#aaa', fontSize: '0.9rem'}}>名前:</label>
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={createMode === 'folder' ? "新しいフォルダ名" : "新しいファイル名.txt"}
              style={styles.input}
              autoFocus
              onKeyDown={(e) => { if(e.key === 'Enter') handleCreate(); }}
            />

            <div style={styles.buttonRow}>
              <button
                onClick={() => setModalType(null)}
                style={styles.roundedButtonSecondary}
              >
                キャンセル
              </button>
              <button
                onClick={handleCreate}
                style={styles.roundedButtonPrimary}
                disabled={!newFileName}
              >
                作成
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {(modalType === 'move' || modalType === 'moveCurrent') && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>
               {modalType === 'moveCurrent' ? 'ディレクトリの移動' : '移動'}
            </h3>
            <p style={{color: '#aaa', fontSize: '0.9rem', marginBottom: '10px'}}>
                {modalType === 'moveCurrent'
                  ? '現在のディレクトリ全体を移動します。'
                  : `選択した ${selectedFiles.length} 個の項目を移動します。`}
            </p>
            <input
              type="text"
              value={moveDestPath}
              onChange={(e) => setMoveDestPath(e.target.value)}
              placeholder="移動先のパス (例: servers/myserver/plugins)"
              style={styles.input}
            />
            <div style={styles.buttonRow}>
              <button
                onClick={() => setModalType(null)}
                style={styles.roundedButtonSecondary}
              >
                キャンセル
              </button>
              <button
                onClick={handleMove}
                style={styles.roundedButtonPrimary}
              >
                移動
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {modalType === 'rename' && (
         <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>名前の変更</h3>
            <input
              type="text"
              value={renameFileName}
              onChange={(e) => setRenameFileName(e.target.value)}
              style={styles.input}
              autoFocus
            />
            <div style={styles.buttonRow}>
              <button onClick={() => setModalType(null)} style={styles.roundedButtonSecondary}>キャンセル</button>
              <button onClick={handleRename} style={styles.roundedButtonPrimary}>変更</button>
            </div>
          </div>
         </div>
      )}

      {/* Context Menu (機能追加・画像付き) */}
      {contextMenu && (
        <div style={{
            position: 'fixed', top: contextMenu.y, left: contextMenu.x,
            background: '#252526', border: '1px solid #444', borderRadius: '6px',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)', zIndex: 3000,
            minWidth: '180px', padding: '5px'
        }}>
            {contextMenu.file ? (
                <>
                    {/* 1. 名前の変更 (画像なしのため透明なスペースで位置合わせ) */}
                    <div className="ctx-item" onClick={() => { setRenameFileName(contextMenu.file!.name); setModalType('rename'); setContextMenu(null); }}>
                        <div style={{ width: '16px', height: '16px', display: 'inline-block' }}></div>
                        名前の変更
                    </div>

                    {/* 2. アイテムを移動 */}
                    <div className="ctx-item" onClick={() => { openMoveModal(false); setContextMenu(null); }}>
                        <img src={iconMove} className="ctx-icon" alt="" />
                        アイテムを移動...
                    </div>

                    {/* 3. アイテムを圧縮 */}
                    <div className="ctx-item" onClick={() => { handleZip(); setContextMenu(null); }}>
                        <img src={iconZip} className="ctx-icon" alt="" />
                        アイテムを圧縮
                    </div>

                    {/* 4. アイテムを解凍 */}
                    <div className="ctx-item" onClick={() => { handleUnzip(); setContextMenu(null); }}>
                        <img src={iconUnzip} className="ctx-icon" alt="" />
                        アイテムを解凍
                    </div>

                    {/* 5. アイテムを削除 */}
                    <div className="ctx-item delete" onClick={handleDelete}>
                        <img src={iconTrash} className="ctx-icon" alt="" />
                        アイテムを削除
                    </div>
                </>
            ) : (
                <>
                    <div className="ctx-item" onClick={() => { setModalType('create'); setContextMenu(null); }}>
                        <div style={{ width: '16px', height: '16px', display: 'inline-block' }}></div>
                        新規作成...
                    </div>
                    <div className="ctx-item" onClick={() => { handleImport(); setContextMenu(null); }}>
                        <div style={{ width: '16px', height: '16px', display: 'inline-block' }}></div>
                        インポート...
                    </div>
                    <div className="ctx-item" onClick={() => { openMoveModal(true); setContextMenu(null); }}>
                        <img src={iconMove} className="ctx-icon" alt="" />
                        移動...
                    </div>
                </>
            )}
        </div>
      )}

      <style>{`
        /* パンくずリスト用のスタイル */
        .breadcrumbs {
          display: flex;
          align-items: center;
          font-family: monospace;
          color: #ccc;
        }
        .breadcrumb-item {
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
        }
        .breadcrumb-item:hover {
          background-color: #333;
          color: #fff;
          text-decoration: underline;
        }
        .breadcrumb-separator {
          margin: 0 5px;
          color: #666;
        }

        .file-list-container {
            display: flex;
            flex-direction: column;
            gap: 0;
        }
        .file-item {
            display: flex; alignItems: center; padding: 10px 10px;
            background: transparent;
            border-bottom: 1px solid #333;
            cursor: pointer;
            user-select: none;
        }
        .file-item:last-child {
            border-bottom: none;
        }
        .file-item:hover { background: #2a2d31; }
        .file-item.selected { background: #37373d; }

        .btn-icon { background: none; border: none; cursor: pointer; color: #aaa; padding: 5px; border-radius: 4px; }
        .btn-icon:hover { background: #333; color: #fff; }
        .btn-icon.danger:hover { background: rgba(255, 0, 0, 0.2); color: #ff5555; }

        /* Context Menu Styles */
        .ctx-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 0.9rem;
          border-radius: 4px;
        }
        .ctx-item:hover { background: #5865F2; color: #fff; }
        .ctx-item.delete:hover { background: #ff4757; }
        .ctx-icon {
           width: 16px;
           height: 16px;
           object-fit: contain;
           /* アイコンが黒い場合は反転させるなどの調整が必要ですが、元画像に依存します */
           /* filter: invert(0.8); 必要であればコメントアウトを外してください */
        }
      `}</style>
    </div>
  );
}