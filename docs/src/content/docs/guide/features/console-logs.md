---
title: Console & Logs
description: Stream real-time server logs and send commands from the MC-Vector console.
sidebar:
  order: 2
---

The **Console** tab provides live access to server output and lets you send commands directly to the running server.

## Viewing Logs

Logs stream in real-time from the server's stdout/stderr. ANSI color codes are fully supported, so color-coded output from plugins like EssentialsX or Paper appears correctly.

The log buffer holds the last **2,000 lines** per server. Older lines are dropped automatically to keep memory usage low.

## Filtering Logs

Use the filter toolbar to show only the log levels you care about:

| Filter    | Shows                  |
| --------- | ---------------------- |
| **ALL**   | Everything             |
| **INFO**  | Standard info messages |
| **WARN**  | Warnings               |
| **ERROR** | Errors                 |
| **FATAL** | Critical errors        |

## Sending Commands

Type a command in the input field at the bottom of the Console and press **Enter** or click **"Send"**.

```
say Hello, world!
op PlayerName
gamemode creative PlayerName
time set day
weather clear
```

:::caution
Do **not** prefix commands with `/` in the Console. The server console accepts bare commands, not slash commands.
:::

### Command History

Previously entered commands are saved between sessions. Use the **Up/Down arrow keys** to cycle through history.

## Pin Important Lines

Right-click a log line to **pin** it. Pinned lines stay visible at the top of the console even as new logs scroll in. Up to 5 lines can be pinned at once.

## Copy Logs

Click the **Copy** button to copy the visible log content to your clipboard. ANSI color codes are stripped automatically so the text is clean.

## Server Address Display

The Console header shows the server's **IP address and port** so you can share it with players without leaving the app.
