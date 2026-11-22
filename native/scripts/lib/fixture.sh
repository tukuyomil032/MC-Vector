#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Shared capture/E2E fixture lifecycle. Caller sources log.sh first.

init_fixture_run() {
  RUN_DIR="${MCVECTOR_CAPTURE_RUN_DIR:-$HOME/Library/Caches/com.tukuyomi032.mcvector.capture}"
  case "$RUN_DIR" in
    /*) ;;
    *) log_fail "Capture runtime directory must be absolute: $RUN_DIR"; exit 2 ;;
  esac
  case "/$RUN_DIR/" in
    */../*|*/./*) log_fail "Capture runtime directory must not contain '.' or '..': $RUN_DIR"; exit 2 ;;
  esac
  case "$RUN_DIR" in /|"$HOME"|"$HOME/" ) log_fail "Unsafe runtime directory: $RUN_DIR"; exit 2 ;; esac
  RUN_DIR="$(_log_resolve_path "$RUN_DIR")"
  mkdir -p "$RUN_DIR/fixtures" "$RUN_DIR/logs"
  STAND_IN_JAVA="$RUN_DIR/fixtures/stand-in-java"
}

# ensure_inside_run <path>: refuse to touch anything outside RUN_DIR.
ensure_inside_run() {
  case "/$1/" in
    */../*|*/./*) log_fail "Refusing path with '.' or '..' components: $1"; exit 1 ;;
  esac
  local resolved
  resolved="$(_log_resolve_path "$1")" || { log_fail "Cannot resolve fixture path: $1"; exit 1; }
  case "$resolved/" in
    "$RUN_DIR"/?*) ;;
    *) log_fail "Refusing path outside $RUN_DIR: $1"; exit 1 ;;
  esac
}

# prepare_fixture <dir>: fresh data folder for one launch.
prepare_fixture() {
  local dir="$1"
  ensure_inside_run "$dir"
  rm -rf "$dir"
  mkdir -p "$dir"
  if [ "$FIXTURE" != "empty" ]; then
    sed "s#__DATA_DIR__#$dir#g" "$NATIVE_DIR/scripts/fixtures/$FIXTURE/servers.json" > "$dir/servers.json"
    # Each registered server gets its managed folder, like a real installation,
    # so clone/delete/file actions have something to work on.
    local server_id
    # Fixture IDs have no whitespace.
    # shellcheck disable=SC2013
    for server_id in $(sed -n 's/.*"id": *"\([^"]*\)".*/\1/p' "$dir/servers.json"); do
      mkdir -p "$dir/servers/$server_id"
      printf 'motd=%s\nserver-port=25565\n' "$server_id" > "$dir/servers/$server_id/server.properties"
      printf 'eula=true\n' > "$dir/servers/$server_id/eula.txt"
      printf 'stand-in jar\n' > "$dir/servers/$server_id/server.jar"
      # A small server tree for the FILES-*/EDITOR-* states.
      local tree="$dir/servers/$server_id"
      mkdir -p "$tree/config" "$tree/plugins/Essentials" "$tree/logs" "$tree/world/region" "$tree/empty"
      printf 'settings:\n  timings: true\n  view-distance: 10\n' > "$tree/config/paper.yml"
      printf 'fake plugin\n' > "$tree/plugins/Essentials.jar"
      printf 'newbies:\n  kit: tools\n' > "$tree/plugins/Essentials/config.yml"
      printf '[12:00:00 INFO]: Starting minecraft server\n' > "$tree/logs/latest.log"
      printf '\357\273\277motd=BOM and CRLF\r\nserver-port=25565\r\n' > "$tree/bom-crlf.properties"
      printf 'region\n' > "$tree/world/region/r.0.0.mca"
    done
    # Editor files (FILES-editor-*, VERIFY-editor) for the first server only.
    local editor="$dir/servers/server-1/editor"
    if [ -d "$dir/servers/server-1" ]; then
      mkdir -p "$editor"
      printf '{\n  "pack": {\n    "pack_format": 48,\n    "description": "MC-Vector sample",\n    "enabled": true\n  },\n  "max": 20\n}\n' \
        > "$editor/sample.json"
      printf 'a\r\nb\r\nc\n' > "$editor/mixed.txt"
      printf '\377\376not text' > "$editor/not-utf8.txt"
      # FILE-001: 5 MiB is the last size that opens.
      head -c 5242879 /dev/zero | tr '\0' 'a' > "$editor/size-under.txt"
      head -c 5242880 /dev/zero | tr '\0' 'a' > "$editor/size-limit.txt"
      head -c 5242881 /dev/zero | tr '\0' 'a' > "$editor/size-over.txt"
    fi
  fi
  printf '{"locale":"%s"}\n' "$LOCALE" > "$dir/config.json"
  prepare_import_sources "$(dirname "$dir")/import-source"
}

# The debug app runs this instead of Java (MCVECTOR_DEBUG_JAVA), so the
# CONSOLE-*/VERIFY-* states start, stop and crash servers without a JDK.
# stdin: "stop" exits 0, "crash" exits 1, "tps" prints a TPS line.
write_stand_in_java() {
  ensure_inside_run "$STAND_IN_JAVA"
  mkdir -p "$(dirname "$STAND_IN_JAVA")"
  local script
  read -r -d '' script <<'SCRIPT' || true
#!/bin/sh
echo "[12:00:00 INFO]: Starting minecraft server version 1.21.10"
echo "[12:00:00 INFO]: Loading properties"
echo "[12:00:00 WARN]: This server is running a stand-in for Java (MC-Vector capture)"
echo "[12:00:01 INFO]: Preparing level \"world\""
echo "stand-in: a line on stderr" 1>&2
echo "[12:00:02 INFO]: Done (1.234s)! For help, type \"help\""
while IFS= read -r line; do
  case "$line" in
    stop) echo "[12:00:09 INFO]: Stopping server"; exit 0 ;;
    crash) echo "[12:00:09 ERROR]: Encountered an unexpected exception"; exit 1 ;;
    tps) echo "[12:00:05 INFO]: TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0" ;;
    list) echo "[12:00:05 INFO]: There are 0 of a max of 20 players online:" ;;
    *) echo "[12:00:05 INFO]: Unknown or incomplete command: $line" ;;
  esac
done
SCRIPT
  printf '%s\n' "$script" > "$STAND_IN_JAVA"
  chmod +x "$STAND_IN_JAVA"
}
# prepare_import_sources <dir>: folders the IMPORT-* states pick, next to the
# data folder (outside it, like a real server folder elsewhere on disk).
prepare_import_sources() {
  local dir="$1"
  ensure_inside_run "$dir"
  rm -rf "$dir"
  mkdir -p "$dir/paper-survival/world" "$dir/no-jar-folder"
  printf 'fake paper jar\n' > "$dir/paper-survival/paper-1.21.4-123.jar"
  printf 'motd=Imported survival\nserver-port=25600\n' > "$dir/paper-survival/server.properties"
  printf 'eula=false\n' > "$dir/paper-survival/eula.txt"
  printf 'level\n' > "$dir/paper-survival/world/level.dat"
  printf 'server-port=25565\n' > "$dir/no-jar-folder/server.properties"
}

# Killing the app skips its quit path, so a real Java server started by a
# VERIFY-real-* state would keep running. Stop only processes whose working
# folder is inside the capture fixtures; nothing else is touched.
stop_fixture_servers() {
  local server_pid cwd
  for server_pid in $(pgrep -f -- "-jar .* nogui" || true); do
    cwd="$(lsof -a -p "$server_pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)"
    case "$cwd" in
      "$RUN_DIR/fixtures/"*) kill "$server_pid" 2>/dev/null || true ;;
    esac
  done
}


# Sets ready (0 timeout, 1 ready, 2 Accessibility required) and pid.
launch_fixture() {
  local id="$1" data_dir="$2" log_file="$3" timeout="$4"
  local java_override deadline
  # Launch through LaunchServices like a normal app, so macOS lets it become
  # the active app (a process exec'd from a terminal stays in the background).
  # `open --stdout/--stderr` makes the launch fail, so the app reports readiness
  # by appending to MCVECTOR_CAPTURE_SIGNAL instead.
  # VERIFY-real-* states run the real Java from PATH instead of the stand-in.
  java_override="$STAND_IN_JAVA"
  case "$id" in VERIFY-real-*) java_override="" ;; esac
  if ! open -n -F "$APP" --env "MCVECTOR_DATA_DIR=$data_dir" --env "MCVECTOR_CAPTURE_SIGNAL=$log_file" \
    --env "MCVECTOR_DEBUG_JAVA=$java_override" \
    --args --capture-state "$id" 2>>"$log_file"; then
    return 1
  fi

  ready=0
  pid=""
  # CAPTURE_TIMEOUT (seconds) lets slow states, such as real downloads, finish.
  deadline=$((SECONDS + timeout))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if [ -z "$pid" ]; then
      pid="$(pgrep -n -f "$EXE --capture-state $id" || true)"
    fi
    if rg -q "\[capture\] ready: $id" "$log_file" 2>/dev/null; then
      ready=1
      break
    fi
    # States that post mouse events need the Accessibility grant; the app
    # reports a missing grant at once (and opens the settings pane).
    if rg -q "\[capture\] accessibility required: $id" "$log_file" 2>/dev/null; then
      # Shared result read by capture.sh and e2e.sh.
      # shellcheck disable=SC2034
      ready=2
      break
    fi
    sleep 0.25
  done
  return 0
}
