import { useState } from 'react';
import { Archive, Copy, FileText, FileUp, Folder, Play, RotateCw, Square } from 'lucide-react';
import { ButtonGroup } from '@/components/arc/button-group/button-group';
import { Checkbox } from '@/components/arc/checkbox/checkbox';
import { ChipGroup } from '@/components/arc/chip-group/chip-group';
import { Combobox } from '@/components/arc/combobox/combobox';
import { CopyButton } from '@/components/arc/copy-button/copy-button';
import { NumberField } from '@/components/arc/number-field/number-field';
import { PasswordField } from '@/components/arc/password-field/password-field';
import { RadioCards } from '@/components/arc/radio-cards/radio-cards';
import { RadioGroup } from '@/components/arc/radio-group/radio-group';
import { SearchField } from '@/components/arc/search-field/search-field';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import { Textarea } from '@/components/arc/textarea/textarea';
import { LOG_LEVELS, LabCaption, MINECRAFT_VERSIONS } from './shared';

export function SegmentedControlDemo() {
  const [level, setLevel] = useState('ALL');
  return (
    <div className="flex flex-col gap-2">
      <SegmentedControl
        label="ログレベル"
        options={LOG_LEVELS}
        value={level}
        onValueChange={setLevel}
      />
      <LabCaption>表示中のレベル: {level}</LabCaption>
    </div>
  );
}

const JVM_PRESETS = [
  { value: 'aikar', label: "Aikar's Flags" },
  { value: 'zgc', label: 'ZGC' },
  { value: 'g1gc', label: 'G1GC' },
  { value: 'shenandoah', label: 'Shenandoah' },
];

export function ChipGroupDemo() {
  const [presets, setPresets] = useState<string[]>(['aikar']);
  return (
    <ChipGroup
      label="JVM プリセット"
      options={JVM_PRESETS}
      value={presets}
      onValueChange={setPresets}
    />
  );
}

export function PasswordFieldDemo() {
  return (
    <PasswordField
      label="RCON パスワード"
      description="server.properties の rcon.password と同じ値にします"
      defaultValue="change-me"
      messages={{ showPassword: 'パスワードを表示', hidePassword: 'パスワードを隠す' }}
    />
  );
}

export function NumberFieldDemo() {
  return (
    <NumberField
      label="ポート"
      defaultValue={25565}
      min={1}
      max={65535}
      step={1}
      formatOptions={{ useGrouping: false }}
      description="1 から 65535 の間で指定します"
    />
  );
}

export function ComboboxDemo() {
  return (
    <Combobox
      label="Minecraft バージョン"
      options={MINECRAFT_VERSIONS}
      defaultValue="1.21.4"
      description="Paper が対応しているバージョン"
      placeholder="検索または選択"
      emptyMessage="一致するバージョンがありません"
    />
  );
}

const NEW_ITEM_KINDS = [
  {
    value: 'folder',
    label: 'フォルダ',
    description: '空のフォルダを作成します',
    icon: <Folder size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    value: 'file',
    label: 'ファイル',
    description: 'テキストファイルを作成します',
    icon: <FileText size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
  {
    value: 'import',
    label: 'インポート',
    description: 'ZIP や JAR を取り込みます',
    icon: <FileUp size={18} strokeWidth={1.75} aria-hidden="true" />,
  },
];

export function RadioCardsDemo() {
  return (
    <RadioCards name="new-item-kind" options={NEW_ITEM_KINDS} defaultValue="folder" layout="grid" />
  );
}

const SERVER_KINDS = [
  { value: 'paper', label: 'Paper', description: 'プラグインに対応した高速サーバー' },
  { value: 'purpur', label: 'Purpur', description: 'Paper を拡張した設定の多いサーバー' },
  { value: 'vanilla', label: 'Vanilla', description: '公式のサーバーそのまま' },
];

export function RadioGroupDemo() {
  const [kind, setKind] = useState('paper');
  return (
    <RadioGroup
      label="サーバーの種類"
      name="server-kind"
      options={SERVER_KINDS}
      value={kind}
      onValueChange={setKind}
    />
  );
}

export function CheckboxDemo() {
  return (
    <div className="flex flex-col gap-3">
      <Checkbox label="起動時に自動で開始" defaultChecked />
      <Checkbox label="クラッシュ時に自動で再起動" description="5 回続けて失敗したら止めます" />
    </div>
  );
}

export function TextareaDemo() {
  return (
    <Textarea
      label="JVM 引数"
      description="1 行に 1 つずつ書きます"
      defaultValue={'-XX:+UseZGC\n-Xms4G'}
      rows={3}
    />
  );
}

export function SearchFieldDemo() {
  const [query, setQuery] = useState('');
  return (
    <SearchField
      label="プラグインを検索"
      placeholder="名前や説明"
      value={query}
      onValueChange={setQuery}
    />
  );
}

export function CopyButtonDemo() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <code className="font-mono text-sm text-[var(--foreground)]">localhost:25565</code>
      <CopyButton value="localhost:25565" label="コピー" />
      <CopyButton value="localhost:25565" label="アドレスをコピー" iconOnly variant="plain" />
    </div>
  );
}

export function ButtonGroupDemo() {
  const [last, setLast] = useState('まだ操作していません');
  const pick = (label: string) => () => setLast(`${label} を選択`);
  return (
    <div className="flex flex-col gap-2">
      <ButtonGroup
        label="サーバー操作"
        items={[
          { id: 'start', label: '起動', icon: <Play size={15} />, onSelect: pick('起動') },
          {
            id: 'restart',
            label: '再起動',
            icon: <RotateCw size={15} />,
            onSelect: pick('再起動'),
          },
          { id: 'stop', label: '停止', icon: <Square size={15} />, onSelect: pick('停止') },
        ]}
        menu={{
          label: 'その他の操作',
          items: [
            {
              id: 'backup',
              label: 'バックアップ',
              icon: <Archive size={15} />,
              onSelect: pick('バックアップ'),
            },
            {
              id: 'copy',
              label: 'アドレスをコピー',
              icon: <Copy size={15} />,
              onSelect: pick('コピー'),
            },
          ],
        }}
      />
      <LabCaption>{last}</LabCaption>
    </div>
  );
}
