import { useState } from 'react';
import { Archive, File, MoveRight, PackageOpen, Pencil, Trash2 } from 'lucide-react';
import { ContextMenu, type ContextMenuItem } from '@/components/arc/context-menu/context-menu';
import { HoldToConfirm } from '@/components/arc/hold-to-confirm/hold-to-confirm';
import { LabCaption } from './shared';

const FILE_ROWS = [
  { id: 'essentialsx', name: 'EssentialsX-2.21.jar', size: '4.1 MB' },
  { id: 'server-properties', name: 'server.properties', size: '2 KB' },
  { id: 'latest-log', name: 'logs/latest.log', size: '480 KB' },
];

export function ContextMenuDemo() {
  const [last, setLast] = useState<string | null>(null);

  const itemsFor = (name: string): ContextMenuItem[] => {
    const pick = (action: string) => () => setLast(`${action}: ${name}`);
    return [
      {
        id: 'rename',
        label: '名前の変更',
        icon: <Pencil size={15} />,
        onSelect: pick('名前の変更'),
      },
      { id: 'move', label: '移動', icon: <MoveRight size={15} />, onSelect: pick('移動') },
      { id: 'compress', label: '圧縮', icon: <Archive size={15} />, onSelect: pick('圧縮') },
      { id: 'extract', label: '解凍', icon: <PackageOpen size={15} />, onSelect: pick('解凍') },
      {
        id: 'delete',
        label: '削除',
        icon: <Trash2 size={15} />,
        destructive: true,
        onSelect: pick('削除'),
      },
    ];
  };

  return (
    <div className="flex flex-col gap-2">
      {FILE_ROWS.map((row) => (
        <ContextMenu key={row.id} items={itemsFor(row.name)} label={`${row.name} の操作`}>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]">
            <span className="flex min-w-0 items-center gap-2">
              <File size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="truncate">{row.name}</span>
            </span>
            <span className="shrink-0 text-[var(--text-muted)]">{row.size}</span>
          </div>
        </ContextMenu>
      ))}
      <LabCaption>{last ?? '行を右クリックしてください'}</LabCaption>
    </div>
  );
}

export function HoldToConfirmDemo() {
  const [deleted, setDeleted] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <HoldToConfirm
        label="ワールドを削除"
        confirmedLabel="削除しました"
        tone="danger"
        confirmed={deleted}
        onConfirm={() => setDeleted(true)}
      />
      <LabCaption>
        長押しで確定します。このラボでは表示が変わるだけで、実際には削除しません。
      </LabCaption>
    </div>
  );
}
