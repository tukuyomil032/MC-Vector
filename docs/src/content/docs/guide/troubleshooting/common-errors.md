---
title: Common Errors
description: Solutions to the most common issues encountered when using MC-Vector.
sidebar:
  order: 1
---

## Server Won't Start

### "Java not found" or "Invalid Java path"

**Cause:** No Java is assigned to this server, or the configured path no longer exists.

**Fix:**
1. Open **General Settings** for the server.
2. Under **Java Version**, click **"Manage Java"**.
3. Download the appropriate version (Java 21 for Minecraft 1.21+).
4. Select it in the dropdown and save.

### "Failed to start server process"

**Cause:** The server JAR is missing, corrupt, or the configured path is wrong.

**Fix:**
1. Navigate to the **Files** tab and confirm `server.jar` (or the configured JAR) exists.
2. If missing, use the **Version Upgrade Wizard** or re-create the server to re-download the JAR.

### Server starts but immediately stops

**Cause:** The EULA has not been accepted, or `server.properties` has an invalid value.

**Fix:**
1. Open the **Files** tab and open `eula.txt`.
2. Change `eula=false` to `eula=true` and save.
3. Check the Console for the specific error line before the shutdown.

---

## Server Crashes

### Repeated crashes with "Out of memory" in logs

**Fix:** Increase the memory allocation in **General Settings → Memory**. Ensure your system has sufficient free RAM.

### Crash after installing a plugin

**Fix:**
1. Open the **Files** tab → `plugins/` folder.
2. Remove the newly added plugin JAR.
3. Restart the server and check if it stays online.
4. Check the Console for the error before the crash — it usually names the offending plugin.

### Auto-restart keeps looping

**Cause:** A plugin or config issue causes an immediate crash on every start.

**Fix:** Disable **Auto-Restart** in **General Settings** temporarily, fix the root cause, then re-enable it.

---

## Connection Issues

### Players cannot connect to the server

1. Confirm the server is **Running** (green status in Dashboard).
2. Check the server port in **Properties → Server Port** (default: 25565).
3. If using Ngrok, verify the public address is current — it changes on every Ngrok restart.
4. If using a router, confirm port forwarding is configured for the correct port.

### "Connection refused" when using Ngrok

**Fix:**
- Verify the Ngrok authtoken in **General Settings**.
- Free Ngrok accounts allow only one active tunnel — check you don't have another session open.
- Re-enable the Ngrok toggle in General Settings to force a reconnect.

---

## MC-Vector App Issues

### MC-Vector won't launch (macOS Gatekeeper)

**Fix:** Open **System Settings → Privacy & Security** and click **"Open Anyway"** next to MC-Vector.

### "Port already in use"

**Cause:** Another process (or another MC-Vector server) is using the same port.

**Fix:** Change the port in **General Settings** or stop the conflicting server.

### Backup fails with "permission denied"

**Cause:** MC-Vector doesn't have write permission to the backup destination.

**Fix:** Check that the server's data directory is writable by your user account.

---

## Logs and Diagnostics

The Console tab is the first place to check for any server error. Look for lines containing `ERROR`, `FATAL`, or `Exception` near the time of the problem.

For MC-Vector app-level issues, quit and relaunch the app. If problems persist, open a [GitHub issue](https://github.com/tukuyomil032/mc-vector/issues) with a description and the relevant log lines.
