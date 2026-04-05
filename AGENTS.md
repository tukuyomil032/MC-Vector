# AGENTS Guide

## Project Summary

MC-Vector is a desktop app (Tauri + React + TypeScript) for Minecraft server management.
Frontend UI is built with React and Tailwind, with SCSS partials used to keep repetitive view styling out of TSX.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, TailwindCSS, SCSS
- Desktop shell: Tauri v2 (Rust backend in src-tauri)
- Package manager: pnpm

## Common Commands

- Install dependencies: `pnpm install`
- Dev frontend: `pnpm dev`
- Dev with Tauri: `pnpm tauri:dev`
- Build frontend: `pnpm build`
- Build desktop app: `pnpm tauri:build`
- Lint/format: `pnpm biome:check`, `pnpm lint`, `pnpm format`

## Frontend Styling Rules

1. Keep short utility usage in TSX when it is local and truly one-off.
2. Move long/repeated class chains into SCSS classes under `src/styles`.
3. Group styles by responsibility:
   - `src/styles/base`: global base/reset rules
   - `src/styles/components`: reusable UI primitives
   - `src/styles/layout`: app shell/layout rules
   - `src/styles/modals`: modal-specific styles
   - `src/styles/views`: per-view styles
4. Import styles only through `src/styles/index.scss` from `src/main.tsx`.
5. Avoid invalid Tailwind `@apply` values (for example `bg-white/3`). Use explicit CSS color values when needed.

## TypeScript/React Conventions

1. Prefer explicit interfaces for component props and shared data structures.
2. Keep async file/system operations in `src/lib` wrappers; UI components should call wrappers, not raw APIs.
3. Preserve existing user-facing behavior when refactoring.
4. When extracting repeated UI patterns, prefer semantic class names over anonymous utility chains.

## Type Safety Guardrails

1. Do not introduce `any` in production code. Use `unknown` for external input and narrow with type guards.
2. Every API payload consumed from Modrinth/Hangar/Spigot must be parsed through runtime guards before UI use.
3. Keep discriminated unions explicit for platform-specific behavior (for example plugin source switching).
4. Treat optional properties as nullable and provide safe fallbacks in rendering and install flows.
5. If a guard cannot prove shape safety, fail with a user-visible error instead of unsafe casting.

### Type Guard Example (Required Pattern)

```ts
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null;
}

function parseProject(value: unknown): { id: string; title: string } | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = typeof value.id === 'string' ? value.id : '';
  const title = typeof value.title === 'string' ? value.title : '';
  if (!id || !title) {
    return null;
  }
  return { id, title };
}
```

### Adapter Layer Example (Required Pattern)

```ts
interface PluginSourceAdapter {
  search(query: string, gameVersion: string, page: number): Promise<PluginProject[]>;
  resolveDownload(project: PluginProject, gameVersion: string): Promise<PluginDownload | null>;
}
```

Keep source-specific parsing and fallback logic inside adapters under `src/lib/adapters`.
UI components must never consume raw API payloads directly.

## Phase Execution Rules

1. Implement large requests by phase, not by scattered partial edits.
2. Complete all tasks in the active phase before proposing the next phase.
3. After each phase, run build and diagnostics, then report unresolved risks.
4. Keep one commit scope per phase unless a single phase becomes too large and must be split.
5. Align feature phases with `docs/engineering-requirements.md` and update status after significant changes.

## Delivery Tracking Files

1. Keep `docs/engineering-requirements.md` aligned with current implementation constraints.
2. Keep `docs/next-phase-plan.md` updated after each substantial implementation.
3. When task status changes, update the status matrix in `docs/next-phase-plan.md` in the same prompt.

## Refactor Checklist

Before finishing a refactor:

1. Run `pnpm build` and ensure it succeeds.
2. Confirm there are no stale style imports/paths.
3. Update README structure notes when directory layout changed.
4. Keep diffs focused; avoid unrelated formatting churn.

## Safety Notes

1. Do not use destructive git commands (`reset --hard`, `checkout --`) unless explicitly requested.
2. Do not revert user changes outside the requested scope.
3. If unexpected modifications are detected, pause and ask for confirmation before proceeding.

### 共通

- コミットメッセージは英語で feat:, fix:, refactor:, docs: のプレフィックスを使う
- 実装や編集、1プロンプトの作業が終わったあと、同Phase内での未実装ポイント、あるいは今のPhaseでのすべての実装が終わった場合は次のPhaseで実装すべき点があるか確認し、ある場合はどこから実装を進めていくかユーザーに質問モードで選択肢で質問をすること。これは全てのPhaseの全ての実装を終えるまで、つまりリリースできる段階になるまで実装後に毎回質問をすること。また、その質問の後、その実装ごとの変更内容にふさわしいコミットメッセージを含めたコマンドを生成し、実際にそのコマンドを実行するかしないかユーザーに質問モードで質問をすること。同Phase内での変更や実装ごとにはコミットコマンドの生成は質問はしないこと。ただし、同フェーズ内での変更や実装の場合でも、1つ1つの実装の規模が大きい場合は例外とする。更に、コミットコマンドを実行しないを選んだ場合にも、まだ実装すべき同フェーズ内の作業や、次のフェーズが残っている場合は、実装を続け、実装を完了するまで半永久的に質問→実装→質問を繰り返すこと。ここで言う質問とは、あなたが出力する文章で聞くのではなく、Planモードで要件定義をするときに使用する選択式の質問のこと。コミットコマンドのフォーマットは、git commit -m "message" -m "message" -m "message"のように、実装した内容を大まかにまとめて、-mオプションでそれぞれ改行すること。
- git操作には、VSCode内のターミナルからコマンドで行うこと。MCPなどを通さず、直接コマンドを叩くこと。
  - ファイルの追加：git add .
  - コミット：↑1つ上の箇条書きで述べている通り、その実装ごとの変更内容にふさわしいコミットメッセージを含めた形式にすること。git commit -m "message" -m "message" -m "message"
  - プッシュ：git push origin main
    - 何らかの事象によりgit reset --soft HEAD^などのリセットコマンドを打った場合には私がそう伝えるので、その場合はforce pushをしないとコンフリクトが出て拒否されるので、git push -f -u origin mainを実行してください
- 当該プロンプトで実装や編集を終えたあと、ビルドをする前にバックグラウンドから全ファイル(.java / .ts / .json / .ymlなど)を読み取り、エラーや警告がある場合、エラーの内容と原因を調査し、それも修正すること。1度の修正で直らない場合もあるため、修正後にもう一度バックグラウンドからエラーを取得し、エラー及び警告が0件になるまで処理を続行すること。
- 複数の更新・追加作業内容がある場合、段階ごとに1,2,3と番号をつけて振り分けること。また、この番号付きの作業内容は1度のプロンプトで全て実装すること。段階ごとに実装を進め、段階ごとに実装内容をユーザに逐一報告しながら進めること。
- 例えば、1.バイナリIPC化（Base64撤廃, 2.適応FPS制御, 3.Java側の矩形差分描画拡張の3つのタスクがある場合、1〜3のタスクをこなしてくださいと命令されたら、その1回のプロンプトで全て実装を終えてください。
