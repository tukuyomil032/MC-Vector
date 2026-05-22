---
title: Ngrok Tunnel (Port Forwarding Elimination)
description: Let friends join your server without router port forwarding using Ngrok.
sidebar:
  order: 1
---

MC-Vector integrates [Ngrok](https://ngrok.com/) to create a public TCP tunnel for your Minecraft server. Friends can connect without you needing to configure router port forwarding.

## How It Works

Ngrok creates an encrypted tunnel from your local server to a public Ngrok endpoint. Players connect to the Ngrok address, and traffic is forwarded to your server.

```
Player → tcp://0.tcp.ngrok.io:XXXXX → Ngrok Cloud → Your PC → Minecraft Server
```

## Prerequisites

- A free [Ngrok account](https://ngrok.com/signup)
- Your Ngrok authtoken (available at [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken))

:::note[Free tier limitation]
A free Ngrok account allows one active tunnel at a time. The public address changes every time Ngrok restarts.
:::

## Setup

1. Open the server's **General Settings**.
2. Enable **"Port Forwarding Elimination"**.
3. Paste your **Ngrok authtoken** in the field that appears.
4. MC-Vector automatically downloads the Ngrok binary if it's not already installed.
5. Click **"Save"**.

## Starting the Tunnel

The tunnel starts automatically when the server starts. The public address is shown in the Console and General Settings panel:

```
tcp://0.tcp.ngrok.io:12345
```

Share this with your friends. They enter it in **Minecraft → Multiplayer → Add Server**:
- **Server Address:** `0.tcp.ngrok.io:12345`

## Stopping the Tunnel

The tunnel stops when you stop the server, or you can disable Ngrok in General Settings without stopping the server.

## Troubleshooting

**Tunnel not connecting:**
- Verify the authtoken is correct in General Settings.
- Check that you don't have another Ngrok tunnel running (free tier: one at a time).
- Ensure the server is running before Ngrok tries to connect.

**Friends cannot connect:**
- Make sure you share the **current** Ngrok address — it changes on each restart.
- Try the `ping_server` debug: open the Console and run `list` to confirm the server is online.

**Ngrok binary not found:**
- Click **"Re-download Ngrok"** in General Settings to force a fresh download.
