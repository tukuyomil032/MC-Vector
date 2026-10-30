import type { ReactNode } from 'react';
import { Badge, type BadgeTone } from '@/components/arc/badge/badge';
import { Button, type ButtonSize, type ButtonVariant } from '@/components/arc/button/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog';
import { Input } from '@/components/arc/input/input';
import { Progress } from '@/components/arc/progress/progress';
import { Select } from '@/components/arc/select/select';
import { Switch } from '@/components/arc/switch/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs';
import {
  ToastStack,
  ToastStackProvider,
  useToastStack,
} from '@/components/arc/toast-stack/toast-stack';

/* Dev-only evaluation page for the Arc components. Reached from the command palette in dev builds. */

const COLOR_TOKENS = [
  '--background',
  '--surface',
  '--surface-raised',
  '--surface-muted',
  '--foreground',
  '--text-secondary',
  '--text-muted',
  '--border',
  '--accent',
  '--success',
  '--warning',
  '--danger',
] as const;

const RADIUS_TOKENS = ['--radius-control', '--radius-panel', '--radius-surface'] as const;

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['sm', 'md', 'lg'];
const TONES: BadgeTone[] = ['neutral', 'success', 'info', 'warning', 'danger'];

const MINECRAFT_VERSIONS = [
  { value: '1.21.4', label: '1.21.4' },
  { value: '1.21.1', label: '1.21.1' },
  { value: '1.20.6', label: '1.20.6' },
  { value: '1.19.4', label: '1.19.4' },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-6 first:border-t-0 first:pt-0">
      <h2 className="text-[length:var(--text-lg)] font-semibold text-[var(--foreground)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TokenSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {COLOR_TOKENS.map((token) => (
          <div
            key={token}
            className="flex flex-col gap-2 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-3"
          >
            <div
              className="h-10 rounded-[var(--radius-control)] border border-[var(--border-subtle)]"
              style={{ background: `var(${token})` }}
            />
            <code className="font-mono text-[11px] text-[var(--text-secondary)]">{token}</code>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {RADIUS_TOKENS.map((token) => (
          <div
            key={token}
            className="flex h-20 w-36 items-end border border-[var(--border-strong)] bg-[var(--surface-raised)] p-2"
            style={{ borderRadius: `var(${token})` }}
          >
            <code className="font-mono text-[11px] text-[var(--text-secondary)]">{token}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypographySection() {
  return (
    <div className="flex flex-col gap-3 text-[var(--foreground)]">
      <p
        className="text-[length:var(--text-4xl)] leading-[var(--leading-display)] tracking-[var(--tracking-display)]"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Server Dashboard
      </p>
      <p
        className="text-[length:var(--text-base)] leading-[var(--leading-body)] tracking-[var(--tracking-body)]"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        Body: Inter と日本語フォールバックの確認用テキストです。
      </p>
      <p className="text-[length:var(--text-lg)] font-medium">「サーバーを起動しました」</p>
      <p
        className="font-mono text-[length:var(--text-sm)] text-[var(--text-secondary)]"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        mc-vector 2.0.64 · port 25565 · paper-1.21.4
      </p>
    </div>
  );
}

function ButtonSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {VARIANTS.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SIZES.map((size) => (
          <Button key={size} size={size}>
            size {size}
          </Button>
        ))}
        <Button loading>読み込み中</Button>
        <Button disabled>無効</Button>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-[var(--text-muted)]">サーバー操作（評価用）</span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">起動</Button>
          <Button variant="secondary">再起動</Button>
          <Button variant="danger">停止</Button>
        </div>
      </div>
    </div>
  );
}

function InputSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Input
        label="サーバー名"
        description="一覧に表示される名前です"
        defaultValue="survival-main"
      />
      <Input label="ポート" error="25565 は既に使用されています" defaultValue="25565" />
      <Select
        label="Minecraft バージョン"
        description="起動に使う Paper のバージョンです"
        options={MINECRAFT_VERSIONS}
        defaultValue="1.21.4"
      />
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-panel)] border border-[var(--border)] bg-[var(--surface)] p-4">
        <span className="text-sm text-[var(--foreground)]">起動時に自動で開始</span>
        <Switch label="起動時に自動で開始" defaultChecked />
      </div>
    </div>
  );
}

function TabsSection() {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">概要</TabsTrigger>
        <TabsTrigger value="console">コンソール</TabsTrigger>
        <TabsTrigger value="plugins">プラグイン</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="p-3 text-sm text-[var(--text-secondary)]">
          サーバーの概要パネルです。タブ切り替えの動きを確認できます。
        </p>
      </TabsContent>
      <TabsContent value="console">
        <p className="p-3 text-sm text-[var(--text-secondary)]">
          コンソールの出力がここに並びます。
        </p>
      </TabsContent>
      <TabsContent value="plugins">
        <p className="p-3 text-sm text-[var(--text-secondary)]">
          インストール済みのプラグインを表示します。
        </p>
      </TabsContent>
    </Tabs>
  );
}

function BadgeSection() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Badge key={tone} tone={tone}>
          {tone}
        </Badge>
      ))}
      <Badge tone="success" size="sm">
        オンライン
      </Badge>
      <Badge tone="danger" size="sm">
        停止中
      </Badge>
    </div>
  );
}

function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">ダイアログを開く</Button>
      </DialogTrigger>
      <DialogContent title="プラグインをインストールしますか？">
        <ul className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          <li>EssentialsX</li>
          <li>Vault</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">キャンセル</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="primary">インストール</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToastDemo() {
  const { toast, update } = useToastStack();

  const run = () => {
    const id = toast({
      type: 'loading',
      title: 'プラグインをインストール中…',
      description: 'EssentialsX',
      duration: Infinity,
    });
    window.setTimeout(() => {
      update(id, {
        type: 'success',
        title: 'インストールが完了しました',
        description: 'EssentialsX を追加しました',
        duration: 4000,
      });
    }, 2000);
  };

  return (
    <Button variant="secondary" onClick={run}>
      ローディング → 成功のトースト
    </Button>
  );
}

function ProgressSection() {
  return <Progress value={31} label="ワールドをダウンロード" showValue />;
}

function ActionsSection() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <DialogDemo />
      <ToastDemo />
    </div>
  );
}

export default function UiLabView() {
  return (
    <ToastStackProvider>
      <div data-testid="ui-lab" className="relative flex h-full min-h-0 flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto p-6">
          <header className="flex flex-col gap-1">
            <h1 className="text-[length:var(--text-2xl)] font-semibold text-[var(--foreground)]">
              UI Lab
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              Arc UI の評価用ページです（開発ビルドのみ）。
            </p>
          </header>
          <Section title="Tokens">
            <TokenSection />
          </Section>
          <Section title="Typography">
            <TypographySection />
          </Section>
          <Section title="Buttons">
            <ButtonSection />
          </Section>
          <Section title="Inputs">
            <InputSection />
          </Section>
          <Section title="Tabs">
            <TabsSection />
          </Section>
          <Section title="Badge">
            <BadgeSection />
          </Section>
          <Section title="Progress">
            <ProgressSection />
          </Section>
          <Section title="Dialog / Toast">
            <ActionsSection />
          </Section>
        </div>
        <ToastStack label="UI Lab の通知" contained />
      </div>
    </ToastStackProvider>
  );
}
