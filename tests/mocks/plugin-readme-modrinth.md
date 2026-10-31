<div align="center">

<img src="https://cdn.modrinth.com/data/vnmnr1ab/images/banner.png" alt="VeinMiner banner" width="100%">

# VeinMiner

**Mine a whole ore vein with a single swing.**

[![Downloads](https://img.shields.io/modrinth/dt/veinminer?logo=modrinth)](https://modrinth.com/plugin/veinminer) [![Latest](https://img.shields.io/modrinth/v/veinminer?logo=modrinth)](https://modrinth.com/plugin/veinminer/versions)

</div>

<p align="center">
  <a href="https://modrinth.com/plugin/veinminer">Modrinth</a> ·
  <a href="https://github.com/example/veinminer/issues">Report an issue</a>
</p>

## Features

- Breaks connected ore blocks of the same type in one action
- Works with diagonal veins, configurable with `diagonal: true`
- Respects claims and protected regions from WorldGuard
- Durability is charged once per vein, not once per block

## Quick start

1. Drop `VeinMiner-2.4.1.jar` into the `plugins` folder.
2. Start the server once so the config is created.
3. Hold <kbd>Shift</kbd> and break an ore block.

> **Note**
> The first run writes `plugins/VeinMiner/config.yml`. Restart the server after you edit it.

## Configuration

| Option | Default | Description |
| :-- | :-: | --: |
| `max-blocks` | `64` | Upper limit for one vein |
| `require-sneak` | `true` | Only mine while sneaking |
| `tools` | `pickaxes` | Tool groups that trigger the feature |
| `drop-mode` | `auto` | `auto`, `drop`, or `inventory` |

Units such as H<sub>2</sub>O and m<sup>3</sup> render with subscript and superscript.

<details>
<summary>Permissions</summary>

| Node | Description |
| --- | --- |
| `veinminer.use` | Allows the feature for players |
| `veinminer.bypass.limit` | Removes the block limit |
| `veinminer.admin` | Reload the config with `/veinminer reload` |

</details>

<details>
<summary>Example config</summary>

```yaml
max-blocks: 64
require-sneak: true
tools:
  - pickaxes
  - shovels
drop-mode: auto
```

</details>

## Commands

- `/veinminer toggle` turns the feature on or off for yourself
- `/veinminer reload` reloads `config.yml`
- `/veinminer stats` shows how many blocks were mined today

Inline code such as `/veinminer toggle` stays in a chip, and long identifiers like `org.example.veinminer.listener.BlockBreakListener` wrap inside the card.

---

## Support

Found a bug? Open an issue on [GitHub](https://github.com/example/veinminer/issues) or join the [Discord](https://discord.gg/example). The plugin page on [Modrinth](https://modrinth.com/plugin/veinminer) lists all releases.

- [x] Paper 1.21.x
- [x] Spigot 1.20.x
- [ ] Folia (not tested)
