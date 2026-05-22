---
title: Performance Optimization
description: Diagnose and improve Minecraft server performance using MC-Vector's monitoring tools.
sidebar:
  order: 2
---

## Reading the Dashboard Metrics

The Dashboard shows three key performance indicators updated every 2 seconds:

| Metric     | Ideal                   | Action needed                                           |
| ---------- | ----------------------- | ------------------------------------------------------- |
| **TPS**    | 18–20                   | Below 15: investigate heavy plugins or farms            |
| **CPU**    | Below 80%               | Consistently high: reduce entity count or view distance |
| **Memory** | Below 90% of allocation | Near ceiling: increase memory in General Settings       |

Use the 60-second rolling charts to identify patterns — is lag constant or does it spike at regular intervals?

## Low TPS (Server Lag)

TPS (Ticks Per Second) is the most important server health indicator. Minecraft's target is 20 TPS. Below 18 means the server is struggling.

### Quick Fixes

1. **Reduce view distance** — lower `view-distance` in Properties (try 8 or 6 instead of 10).
2. **Reduce simulation distance** — lower `simulation-distance` in Properties.
3. **Restart the server** — clears memory leaks and resets entity counts.

### Finding the Bottleneck

Use the `/timings report` command (Paper) or `/spark` (Spark plugin) via the Console to get a detailed breakdown of what's consuming server ticks.

Common causes of low TPS:

| Cause            | Fix                                                                 |
| ---------------- | ------------------------------------------------------------------- |
| Large mob farms  | Add mob limits in `bukkit.yml` or reduce render distance near farms |
| Redstone clocks  | Remove or throttle redstone contraptions                            |
| Chunk generation | Let the server pre-generate chunks using a tool like Chunky         |
| Heavy plugins    | Disable plugins one by one to find the culprit                      |

## High Memory Usage

### Increasing Memory Allocation

1. Open **General Settings**.
2. Increase the **Memory** value (in MB). Allow at least 1 GB per 10 active players.
3. Save and restart the server.

### Recommended Allocations

| Players | Minimum | Recommended |
| ------- | ------- | ----------- |
| 1–5     | 1 GB    | 2 GB        |
| 5–20    | 2 GB    | 4 GB        |
| 20–50   | 4 GB    | 8 GB        |
| 50+     | 8 GB    | 12+ GB      |

### JVM Tuning

For servers with 4+ GB of allocation, add these JVM flags in **General Settings → JVM Extra Args**:

```
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90
```

These are the [Aikar flags](https://aikar.co/2018/07/02/tuning-the-jvm-g1gc-garbage-collector-flags-for-minecraft/) — widely used by the Paper community for improved GC performance.

## High CPU Usage

High CPU is usually caused by too many active entities, a heavy plugin, or insufficient view distance throttling.

1. Use the Console to run `/tps` (Paper) to see per-world TPS.
2. Run `/spark profiler start` → wait 30 seconds → `/spark profiler stop` to get a flame graph.
3. Look for plugins that appear frequently in the profiler output.

## Backup Impact on Performance

Creating backups is CPU and disk intensive. Schedule automatic backups during low-activity hours (e.g., 4:00 AM) using the **Daily** schedule type in General Settings to minimize player impact.

## Regular Maintenance

| Action                         | Frequency                      |
| ------------------------------ | ------------------------------ |
| Restart server                 | Weekly or after plugin updates |
| Create a full backup           | Before major changes           |
| Check for plugin updates       | Monthly                        |
| Review TPS trends in Dashboard | After any change               |
