# Minecraft 1.21.4 asset adapter

## Primary metadata

- Official release entry: `https://piston-meta.mojang.com/v1/packages/c16bd1251bdf2cab3d7c3b30393427eeb19c6b2e/1.21.4.json`
- Asset index id: `19`
- Asset index SHA-1: `f08a9f07a863fe31e36f76f19b261cd0648b3c5a`
- DataVersion: `4189`
- Asset adapter: `assets::versioned::AssetVersionProfile::MINECRAFT_1_21_4`

## Required entry contract

The adapter requires the version-bound archive to contain valid entries for:

- `assets/minecraft/blockstates/stone.json`
- `assets/minecraft/models/block/stone.json`
- `assets/minecraft/textures/block/stone.png`

The required entries are a structural adapter gate, not evidence that the full
client asset set or every Dynmap material is verified.

## Evidence boundary

This version is registered in the official metadata matrix and has a typed
asset adapter. A downloaded client JAR, full asset catalog, texture atlas
golden, and pixel-parity capture remain pending.
