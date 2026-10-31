import { useState } from 'react';
import { Archive, Ban, Crown, ShieldCheck, TriangleAlert, UserX } from 'lucide-react';
import { EmptyLine } from '../ui/EmptyLine';
import { IconTile, SectionTitle } from '../ui/IconTile';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { Card } from '@/components/arc/card/card';
import { CodeBlock } from '@/components/arc/code-block/code-block';
import { LineChart, type LineChartDatum } from '@/components/arc/line-chart/line-chart';
import { MetricCard } from '@/components/arc/metric-card/metric-card';
import { ScrollArea } from '@/components/arc/scroll-area/scroll-area';
import { Skeleton } from '@/components/arc/skeleton/skeleton';
import {
  SortableDataTable,
  type DataColumn,
} from '@/components/arc/sortable-data-table/sortable-data-table';
import { LabCaption } from './shared';

type BackupRow = {
  id: string;
  name: string;
  createdAt: string;
  kind: string;
  size: number;
};

const BACKUP_ROWS: BackupRow[] = [
  {
    id: 'b1',
    name: 'survival-main-1030-1430',
    createdAt: '2026-10-30 14:30',
    kind: 'フル',
    size: 3.2,
  },
  {
    id: 'b2',
    name: 'survival-main-1030-0200',
    createdAt: '2026-10-30 02:00',
    kind: '差分',
    size: 0.4,
  },
  {
    id: 'b3',
    name: 'survival-main-1029-0200',
    createdAt: '2026-10-29 02:00',
    kind: '差分',
    size: 0.3,
  },
  {
    id: 'b4',
    name: 'survival-main-1025-0900',
    createdAt: '2026-10-25 09:00',
    kind: 'フル',
    size: 3.1,
  },
];

const BACKUP_COLUMNS: DataColumn<BackupRow>[] = [
  { key: 'name', label: '名前', sortable: true },
  { key: 'createdAt', label: '作成日時', sortable: true },
  { key: 'kind', label: '種類' },
  {
    key: 'size',
    label: 'サイズ',
    sortable: true,
    numeric: true,
    render: (value) => `${Number(value).toFixed(1)} GB`,
  },
];

export function SortableTableDemo() {
  return (
    <SortableDataTable
      rows={BACKUP_ROWS}
      columns={BACKUP_COLUMNS}
      rowKey="id"
      caption="バックアップ一覧"
      emptyMessage="バックアップがありません"
      itemName={{ one: 'バックアップ', other: 'バックアップ' }}
      selectable
      defaultSort={{ key: 'createdAt', direction: 'desc' }}
    />
  );
}

/** Sixty fake CPU samples. A fixed formula keeps the screenshots and tests stable. */
const CPU_SAMPLES: LineChartDatum[] = Array.from({ length: 60 }, (_, index) => {
  const value = 38 + 14 * Math.sin(index / 5) + 6 * Math.sin(index / 1.7);
  return {
    key: `t${index}`,
    label: `${60 - index} 秒前`,
    axisLabel: index % 15 === 0 ? `${60 - index} 秒前` : undefined,
    values: { cpu: Math.round(value * 10) / 10 },
  };
});

export function LineChartDemo() {
  return (
    <LineChart
      data={CPU_SAMPLES}
      series={[{ key: 'cpu', label: 'CPU' }]}
      label="CPU 使用率（直近 60 秒）"
      unit="%"
      height={200}
      categoryLabel="経過時間"
    />
  );
}

export function MetricCardDemo() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <MetricCard label="CPU" value={42} suffix="%" context="直近 60 秒の平均" change="+3.1%" />
      <MetricCard label="メモリ" value={3.2} suffix=" GB" context="上限 6 GB" />
      <MetricCard label="TPS" value={19.9} context="20.0 が上限" change="-0.1" />
    </div>
  );
}

const START_SCRIPT = `#!/bin/sh
java -Xms4G -Xmx4G -XX:+UseZGC -jar paper-1.21.4.jar nogui`;

export function CodeBlockDemo() {
  return <CodeBlock code={START_SCRIPT} filename="start.sh" language="bash" />;
}

export function CardDemo() {
  return (
    <Card
      title="survival-main"
      description="Paper 1.21.4 · ポート 25565"
      status="2 時間前に更新"
      meta="admin"
      action={
        <Button size="sm" variant="secondary">
          開く
        </Button>
      }
      details={
        <p className="text-sm text-[var(--text-secondary)]">最終バックアップ 14:30 · TPS 19.9</p>
      }
    />
  );
}

const LOG_LINES = [
  '[14:30:01 INFO]: Starting minecraft server version 1.21.4',
  '[14:30:03 INFO]: Loading properties',
  '[14:30:04 INFO]: Preparing level "world"',
  "[14:30:09 WARN]: Can't keep up! Is the server overloaded?",
  '[14:30:12 INFO]: Done (8.2s)! For help, type "help"',
  '[14:31:40 INFO]: Steve joined the game',
  '[14:32:05 ERROR]: Could not pass event PlayerMoveEvent to EssentialsX',
  '[14:33:18 INFO]: Steve left the game',
];

export function ScrollAreaDemo() {
  return (
    <ScrollArea
      label="コンソールログ"
      maxHeight={160}
      className="rounded-[var(--radius-panel)] border border-[var(--border)]"
    >
      <pre className="p-3 font-mono text-xs leading-5 text-[var(--text-secondary)]">
        {LOG_LINES.concat(LOG_LINES).join('\n')}
      </pre>
    </ScrollArea>
  );
}

export function EmptyLineDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <EmptyLine title="バックアップはまだありません" />
      <EmptyLine
        title="サーバーがありません"
        action={<Button variant="secondary">サーバーを追加</Button>}
      />
    </div>
  );
}

export function IconTileDemo() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <IconTile icon={Archive} size="sm" />
        <IconTile icon={Archive} />
        <IconTile icon={Crown} tone="neutral" />
        <IconTile icon={ShieldCheck} tone="success" />
        <IconTile icon={TriangleAlert} tone="warning" />
        <IconTile icon={Ban} tone="danger" />
      </div>
      <LabCaption>sm は 24px、md は 36px。状態の色は、状態が伝わる場面だけで使います。</LabCaption>
    </div>
  );
}

export function SectionTitleDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SectionTitle icon={Archive} title="バックアップ管理" trailing={<span>3 件</span>} />
      <SectionTitle icon={UserX} title="BAN されたプレイヤー" tone="danger" as="h3" />
    </div>
  );
}

export function SkeletonDemo() {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton label="プラグイン一覧を読み込み中" lines={3} avatar />
        <Skeleton lines={2} loading={!loaded}>
          <p className="text-sm text-[var(--foreground)]">survival-main の設定を読み込みました。</p>
        </Skeleton>
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={() => setLoaded((value) => !value)}>
          {loaded ? '読み込み中に戻す' : '読み込みを完了する'}
        </Button>
      </div>
    </div>
  );
}

export function AlertDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Alert tone="warning" title="メモリの割り当てが少なすぎます">
        2 GB 未満では起動に失敗することがあります。
      </Alert>
      <Alert tone="danger" title="サーバーがクラッシュしました">
        ログを確認してから再起動してください。
      </Alert>
      <LabCaption>tone は info、success、warning、danger の4種類です。</LabCaption>
    </div>
  );
}
