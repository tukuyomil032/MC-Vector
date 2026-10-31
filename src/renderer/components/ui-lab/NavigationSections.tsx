import { useState } from 'react';
import { Copy, Ellipsis, File, Folder, Play, RotateCw, Save, Server, Trash2 } from 'lucide-react';
import { Breadcrumb } from '@/components/arc/breadcrumb/breadcrumb';
import { Button } from '@/components/arc/button/button';
import { CommandPalette, type CommandItem } from '@/components/arc/command-palette/command-palette';
import { DropdownMenu } from '@/components/arc/dropdown-menu/dropdown-menu';
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/drawer';
import { Pagination } from '@/components/arc/pagination/pagination';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/arc/popover/popover';
import { Stepper, type StepperStep } from '@/components/arc/stepper/stepper';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import { TreeView, type TreeNode } from '@/components/arc/tree-view/tree-view';
import { LabCaption } from './shared';

export function BreadcrumbDemo() {
  const [last, setLast] = useState('plugins');
  return (
    <div className="flex flex-col gap-2">
      <Breadcrumb
        items={[
          { label: 'サーバー', onClick: () => setLast('サーバー') },
          { label: 'A', onClick: () => setLast('A') },
          { label: 'plugins' },
        ]}
      />
      <LabCaption>直前に選んだ項目: {last}</LabCaption>
    </div>
  );
}

export function PaginationDemo() {
  const [page, setPage] = useState(3);
  return (
    <Pagination page={page} pageCount={12} onPageChange={setPage} label="バックアップのページ" />
  );
}

const UPGRADE_STEPS: StepperStep[] = [
  { id: 'check', label: '現在のバージョンを確認', description: '1.21.1 → 1.21.4' },
  { id: 'backup', label: 'バックアップを作成', description: 'ワールド 3.2 GB を保存します' },
  { id: 'download', label: '1.21.4 をダウンロード' },
  { id: 'done', label: '完了' },
];

export function StepperDemo() {
  const [current, setCurrent] = useState(1);
  return (
    <div className="flex flex-col items-start gap-3">
      <Stepper
        steps={UPGRADE_STEPS}
        current={current}
        onStepSelect={setCurrent}
        label="バージョンアップ"
        completeLabel="すべての手順が完了しました"
      />
      <Button
        size="sm"
        variant="secondary"
        disabled={current >= UPGRADE_STEPS.length}
        onClick={() => setCurrent((step) => Math.min(step + 1, UPGRADE_STEPS.length))}
      >
        次の手順へ
      </Button>
    </div>
  );
}

const SERVER_TREE: TreeNode[] = [
  {
    id: 'survival-main',
    label: 'survival-main',
    icon: <Server size={15} strokeWidth={1.75} />,
    children: [
      { id: 'world', label: 'world', icon: <Folder size={15} strokeWidth={1.75} /> },
      { id: 'world_nether', label: 'world_nether', icon: <Folder size={15} strokeWidth={1.75} /> },
      {
        id: 'plugins',
        label: 'plugins',
        icon: <Folder size={15} strokeWidth={1.75} />,
        children: [
          {
            id: 'essentialsx',
            label: 'EssentialsX',
            icon: <Folder size={15} strokeWidth={1.75} />,
            children: [
              {
                id: 'config',
                label: 'config.yml',
                icon: <File size={15} strokeWidth={1.75} />,
              },
            ],
          },
          { id: 'luckperms', label: 'LuckPerms', icon: <Folder size={15} strokeWidth={1.75} /> },
        ],
      },
      {
        id: 'server-properties',
        label: 'server.properties',
        icon: <File size={15} strokeWidth={1.75} />,
      },
    ],
  },
];

export function TreeViewDemo() {
  const [selected, setSelected] = useState('survival-main');
  return (
    <div className="flex flex-col gap-2">
      <TreeView
        nodes={SERVER_TREE}
        defaultExpandedIds={['survival-main', 'plugins']}
        aria-label="サーバーのフォルダ"
        onSelect={(node) => setSelected(node.label)}
      />
      <LabCaption>選択中: {selected}</LabCaption>
    </div>
  );
}

export function DropdownMenuDemo() {
  const [last, setLast] = useState('まだ操作していません');
  const pick = (label: string) => () => setLast(`${label} を実行`);
  return (
    <div className="flex flex-col items-start gap-2">
      <DropdownMenu
        label="その他の操作"
        icon={<Ellipsis size={16} strokeWidth={1.75} />}
        items={[
          { label: '複製', icon: <Copy size={15} />, onSelect: pick('複製') },
          { label: 'テンプレートとして保存', icon: <Save size={15} />, onSelect: pick('保存') },
          {
            label: 'サーバーを削除',
            icon: <Trash2 size={15} />,
            destructive: true,
            separatorBefore: true,
            onSelect: pick('削除'),
          },
        ]}
      />
      <LabCaption>{last}</LabCaption>
    </div>
  );
}

export function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">接続情報</Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col gap-1 p-3 text-sm text-[var(--foreground)]">
          <span>アドレス: localhost:25565</span>
          <span>RCON ポート: 25575</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TooltipDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Tooltip content="サーバーを再起動します" side="bottom">
        <Button variant="ghost" size="sm" aria-label="再起動">
          <RotateCw size={16} strokeWidth={1.75} />
        </Button>
      </Tooltip>
      <Tooltip content="サーバーを起動します" side="top">
        <Button variant="ghost" size="sm" aria-label="起動">
          <Play size={16} strokeWidth={1.75} />
        </Button>
      </Tooltip>
    </div>
  );
}

export function DrawerDemo() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="secondary">バックアップの詳細</Button>
      </DrawerTrigger>
      <DrawerContent title="バックアップの詳細" description="survival-main / 2026-10-30 14:30">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            フルバックアップ（3.2 GB）。保存先は backups/ フォルダです。
          </p>
          <DrawerClose asChild>
            <Button variant="secondary">閉じる</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const PALETTE_ITEMS: CommandItem[] = [
  { id: 'start', label: 'サーバーを起動', group: 'サーバー操作', shortcut: 'Cmd+R' },
  { id: 'stop', label: 'サーバーを停止', group: 'サーバー操作' },
  { id: 'restart', label: 'サーバーを再起動', group: 'サーバー操作' },
  { id: 'console', label: 'コンソールを開く', group: '画面' },
  { id: 'plugins', label: 'プラグインを開く', group: '画面', keywords: ['mod', 'plugin'] },
];

export function CommandPaletteDemo() {
  const [last, setLast] = useState('まだ選択していません');
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-[300px] overflow-hidden rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)]">
        <CommandPalette
          items={PALETTE_ITEMS}
          label="コマンド"
          placeholder="コマンドを検索"
          onSelect={(item) => setLast(item.label)}
        />
      </div>
      <LabCaption>直前に選んだコマンド: {last}</LabCaption>
    </div>
  );
}
