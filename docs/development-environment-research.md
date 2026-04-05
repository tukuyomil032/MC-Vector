# 開発環境整備 & README改善 調査結果

## 現状分析

### 現在の開発ワークフロー

**パッケージマネージャー**: pnpm (v10.26.2)

**利用可能なコマンド**:
- `pnpm dev` - フロントエンド開発サーバー起動
- `pnpm tauri:dev` - Tauriアプリ開発モード
- `pnpm build` - フロントエンドビルド
- `pnpm tauri:build` - デスクトップアプリビルド
- `pnpm check` - Lintとフォーマットチェック
- `pnpm lint` - Lint実行
- `pnpm format` - コードフォーマット
- `pnpm yamllint` - YAMLファイルのLint
- `pnpm rustfmt` - Rustコードフォーマット
- `pnpm install:extensions` - VS Code拡張機能インストール

**CI/CD環境**:
- GitHub Actions使用（.github/workflows/ci.yml）
- Lint、ビルドチェック、リリース自動化
- macOS/Windows対応

### 必要な前提条件

**必須ツール**:
- Node.js (v18以降推奨、CI環境ではv22)
- pnpm (v10.26.2)
- Rust (v1.77.2以降)
- Cargo (Rustに同梱)
- yamllint (Python製、v1.35.1)

### 現在のREADME構造

**現状**:
- 詳細なチュートリアル（サーバー作成・設定方法）
- プロジェクト構造の詳細な記載
- 開発手順が明確

**mapbrowserと比較して不足している要素**:
- バッジ（CI/CDステータス、ライセンス、バージョン）
- Table of Contents
- 明確なFeaturesセクション
- 簡潔なQuick Startセクション
- コマンドリファレンスの体系化

### タスクランナー選択肢

#### 1. Makefile
- **利点**: 最も広く使われている、追加インストール不要
- **欠点**: 古い構文、タブ/スペース問題、クロスプラットフォーム対応が難しい

#### 2. justfile (just)
- **利点**: モダンな構文、クロスプラットフォーム対応、読みやすい
- **欠点**: 事前にjustのインストールが必要

#### 3. Nix (flake.nix / shell.nix)
- **利点**: 完全に再現可能な開発環境、依存関係の完全な管理
- **欠点**: 学習コストが高い、Nixのインストール必須、Windows対応限定的

---

## 参照リポジトリ（mapbrowser）のREADME特徴

- プロジェクトバッジ配置
- 簡潔な説明文
- **Features**セクション（箇条書き）
- **Table of Contents**
- **Project Layout**（ディレクトリ構造）
- **Requirements**
- **Quick Start**（簡潔）
- **Build**
- **Configuration**
- **Commands**（コマンドリファレンス）
- **Documentation**
- **Safety Notes**

---

## 提案する改善内容

### A. タスクランナー導入

第三者開発者が統一されたコマンドで環境構築からビルドまで実行できるようにする。

**実装パターン案**:
1. justfile単体（シンプル、モダン）
2. Nix + justfile併用（完全な再現性）
3. Makefile + justfileの並行提供（幅広い対応）

### B. README改善

**提案する新構造**:
```
# MC-Vector
[バッジ]
簡潔な1行説明

## Features
## Table of Contents
## Requirements
## Quick Start
## Installation
## Development
## Building
## Project Structure
## Commands Reference
## Configuration
## Documentation
## Contributing
## License
```

---

## 実装フェーズ案

### Phase 1: タスクランナー導入準備
- 開発タスクの棚卸し
- タスクランナーの選定

### Phase 2: タスクランナー実装
- justfile/Makefileの作成
- 既存pnpm scriptsとの統合

### Phase 3: Nix環境（オプション）
- flake.nix/shell.nixの作成
- CI/CDとの統合

### Phase 4: README改善
- 新構造への移行
- バッジ追加
- Table of Contents生成
- チュートリアル分離検討
