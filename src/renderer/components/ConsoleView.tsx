import type { FC, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Tooltip } from '@/components/arc/tooltip/tooltip';
import { Button } from '@/components/arc/button/button';
import { ButtonGroup } from '@/components/arc/button-group/button-group';
import { SearchField } from '@/components/arc/search-field/search-field';
import { Input } from '@/components/arc/input/input';
import SegmentedControl from '@/components/arc/segmented-control/segmented-control';
import {
  ArrowDown,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Pin,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import { useArcMessages } from '../shared/arc-messages';
import { EmptyLine } from './ui/EmptyLine';
import { copyToClipboard } from '../../lib/clipboard-commands';
import { loadCommandHistory, saveCommandHistory } from '../../lib/console-history-commands';
import { logError } from '../../lib/error-utils';
import {
  type AnsiSegment as RustAnsiSegmentDto,
  parseAnsiLines,
} from '../../lib/performance-commands';
import { sendCommand } from '../../lib/server-commands';
import { notify } from '../shared/notify';
import { tauriInvoke, tauriListen } from '../../lib/tauri-api';
import { useConsoleStore } from '../../store/consoleStore';
import type { MinecraftServer } from '../components/../shared/server declaration';
import styles from './ConsoleView.module.css';

/** Status labels come from the server namespace, so the console and the rest of the app show the same words. */
const STATUS_LABEL_KEYS = {
  online: 'server.status.online',
  offline: 'server.status.offline',
  starting: 'server.status.starting',
  stopping: 'server.status.stopping',
  restarting: 'server.status.restarting',
  crashed: 'server.status.crashed',
} as const;

type AnsiStyle = {
  color?: string;
  backgroundColor?: string;
  fontWeight?: number;
};

type AnsiSegment = {
  text: string;
  style: AnsiStyle;
};

type LogLevelFilter = 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

const LOG_FILTER_OPTIONS: LogLevelFilter[] = ['ALL', 'INFO', 'WARN', 'ERROR', 'FATAL'];
const MAX_PINNED_LOGS = 5;

// ANSI codes map to the token variables defined in ConsoleView.module.css, so the palette follows the theme.
const ANSI_COLOR_MAP: Record<string, string> = {
  '30': 'var(--ansi-black)',
  '31': 'var(--ansi-red)',
  '32': 'var(--ansi-green)',
  '33': 'var(--ansi-yellow)',
  '34': 'var(--ansi-blue)',
  '35': 'var(--ansi-magenta)',
  '36': 'var(--ansi-cyan)',
  '37': 'var(--ansi-white)',
  '90': 'var(--ansi-bright-black)',
  '91': 'var(--ansi-red)',
  '92': 'var(--ansi-green)',
  '93': 'var(--ansi-yellow)',
  '94': 'var(--ansi-blue)',
  '95': 'var(--ansi-magenta)',
  '96': 'var(--ansi-cyan)',
  '97': 'var(--ansi-white)',
};

const ANSI_BG_MAP: Record<string, string> = {
  '40': 'var(--ansi-bg-black)',
  '41': 'var(--ansi-bg-red)',
  '42': 'var(--ansi-bg-green)',
  '43': 'var(--ansi-bg-yellow)',
  '44': 'var(--ansi-bg-blue)',
  '45': 'var(--ansi-bg-magenta)',
  '46': 'var(--ansi-bg-cyan)',
  '47': 'var(--ansi-bg-white)',
  '100': 'var(--ansi-bg-black)',
  '101': 'var(--ansi-bg-red)',
  '102': 'var(--ansi-bg-green)',
  '103': 'var(--ansi-bg-yellow)',
  '104': 'var(--ansi-bg-blue)',
  '105': 'var(--ansi-bg-magenta)',
  '106': 'var(--ansi-bg-cyan)',
  '107': 'var(--ansi-bg-white)',
};

const ansiToSegments = (text: string): AnsiSegment[] => {
  const regex = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
  let currentStyle: AnsiStyle = {};
  let lastIndex = 0;
  const segments: AnsiSegment[] = [];

  const pushText = (end: number) => {
    if (end <= lastIndex) {
      return;
    }
    segments.push({ text: text.slice(lastIndex, end), style: { ...currentStyle } });
    lastIndex = end;
  };

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    pushText(match.index);

    const codes = match[0].slice(2, -1).split(';').filter(Boolean);

    if (codes.length === 0) {
      currentStyle = {};
      lastIndex = regex.lastIndex;
      continue;
    }

    for (const code of codes) {
      if (code === '0') {
        currentStyle = {};
      } else if (code === '1') {
        currentStyle.fontWeight = 700;
      } else if (code === '22') {
        currentStyle.fontWeight = undefined;
      } else if (ANSI_COLOR_MAP[code]) {
        currentStyle.color = ANSI_COLOR_MAP[code];
      } else if (ANSI_BG_MAP[code]) {
        currentStyle.backgroundColor = ANSI_BG_MAP[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...currentStyle } });
  }

  if (segments.length === 0) {
    return [{ text, style: {} }];
  }

  return segments;
};

const stripAnsiCodes = (text: string): string =>
  text.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countMatches = (text: string, regex: RegExp | null): number => {
  if (!regex) {
    return 0;
  }

  const matcher = new RegExp(regex.source, regex.flags);
  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(text)) !== null) {
    count += 1;
    if (match[0].length === 0) {
      matcher.lastIndex += 1;
    }
  }

  return count;
};

const detectLogLevel = (text: string): Exclude<LogLevelFilter, 'ALL'> => {
  const upper = text.toUpperCase();

  if (upper.includes('FATAL')) {
    return 'FATAL';
  }
  if (upper.includes('ERROR') || upper.includes('SEVERE')) {
    return 'ERROR';
  }
  if (upper.includes('WARN') || upper.includes('WARNING')) {
    return 'WARN';
  }
  return 'INFO';
};

const getSeverityStyle = (level: Exclude<LogLevelFilter, 'ALL'>): AnsiStyle => {
  switch (level) {
    case 'FATAL':
      return { color: 'var(--danger)', fontWeight: 700 };
    case 'ERROR':
      return { color: 'var(--danger)', fontWeight: 700 };
    case 'WARN':
      return { color: 'var(--warning)', fontWeight: 700 };
    default:
      return { color: 'var(--text-secondary)' };
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toLocalAnsiSegments = (segments: unknown): AnsiSegment[] | null => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return null;
  }

  const mapped: AnsiSegment[] = [];
  for (const segment of segments) {
    if (!isRecord(segment) || typeof segment.text !== 'string') {
      return null;
    }

    // The Rust parser sends its own palette hex values. A colored line uses the local parser, whose colors are tokens.
    if (typeof segment.color === 'string' || typeof segment.backgroundColor === 'string') {
      return null;
    }

    const color = segment.color;
    if (color !== null && color !== undefined && typeof color !== 'string') {
      return null;
    }

    const backgroundColor = segment.backgroundColor;
    if (
      backgroundColor !== null &&
      backgroundColor !== undefined &&
      typeof backgroundColor !== 'string'
    ) {
      return null;
    }

    const fontWeight = segment.fontWeight;
    if (
      fontWeight !== null &&
      fontWeight !== undefined &&
      (typeof fontWeight !== 'number' || !Number.isFinite(fontWeight))
    ) {
      return null;
    }

    const style: AnsiStyle = {};
    if (typeof color === 'string') {
      style.color = color;
    }
    if (typeof backgroundColor === 'string') {
      style.backgroundColor = backgroundColor;
    }
    if (typeof fontWeight === 'number') {
      style.fontWeight = fontWeight;
    }

    mapped.push({
      text: segment.text,
      style,
    });
  }

  return mapped;
};

interface ConsoleViewProps {
  server: MinecraftServer;
  ngrokUrl: string | null;
}

type ParsedLogEntry = {
  line: string;
  plainLine: string;
  originalIndex: number;
  level: Exclude<LogLevelFilter, 'ALL'>;
  segments: AnsiSegment[];
};

type PinnedLogEntry = {
  key: string;
  text: string;
  level: Exclude<LogLevelFilter, 'ALL'>;
};

const EMPTY_LOGS: string[] = [];

const findLogOverlapLength = (previousLogs: string[], nextLogs: string[]): number => {
  if (previousLogs.length === 0 || nextLogs.length === 0) {
    return 0;
  }

  const maxOverlap = Math.min(previousLogs.length, nextLogs.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const previousStart = previousLogs.length - overlap;
    let matched = true;
    for (let index = 0; index < overlap; index += 1) {
      if (previousLogs[previousStart + index] !== nextLogs[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return overlap;
    }
  }
  return 0;
};

const ConsoleView: FC<ConsoleViewProps> = ({ server, ngrokUrl }) => {
  const { t, locale } = useTranslation();
  const arc = useArcMessages();
  const memoryFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }),
    [locale],
  );
  const logs = useConsoleStore((state) => state.serverLogs[server.id] ?? EMPTY_LOGS);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  const [addressCopied, setAddressCopied] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRegexSearchMode, setIsRegexSearchMode] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [logFilter, setLogFilter] = useState<LogLevelFilter>('ALL');
  const [rustParsedSegments, setRustParsedSegments] = useState<RustAnsiSegmentDto[][] | null>(null);
  const [pinnedLogs, setPinnedLogs] = useState<PinnedLogEntry[]>([]);
  const prevLogsRef = useRef<string[]>([]);
  const prevParsedRef = useRef<RustAnsiSegmentDto[][] | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const matchRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    const loadParsedSegments = async () => {
      try {
        const prevLogs = prevLogsRef.current;
        const prevParsed = prevParsedRef.current;
        const canReuseParsed = Array.isArray(prevParsed) && prevParsed.length === prevLogs.length;
        const overlapLength = canReuseParsed ? findLogOverlapLength(prevLogs, logs) : 0;

        if (canReuseParsed && overlapLength > 0) {
          const preservedParsed = prevParsed.slice(prevParsed.length - overlapLength);
          const newLines = logs.slice(overlapLength);
          if (newLines.length === 0) {
            if (!cancelled) {
              setRustParsedSegments(preservedParsed);
              prevParsedRef.current = preservedParsed;
              prevLogsRef.current = logs;
            }
            return;
          }
          const parsedTail = await parseAnsiLines(newLines);
          const normalizedTail = Array.isArray(parsedTail) ? parsedTail : null;
          if (!cancelled) {
            const merged = normalizedTail ? [...preservedParsed, ...normalizedTail] : null;
            setRustParsedSegments(merged);
            prevParsedRef.current = merged;
            prevLogsRef.current = logs;
          }
          return;
        }

        const parsedAll = await parseAnsiLines(logs);
        const normalizedAll = Array.isArray(parsedAll) ? parsedAll : null;
        if (!cancelled) {
          setRustParsedSegments(normalizedAll);
          prevParsedRef.current = normalizedAll;
          prevLogsRef.current = logs;
        }
      } catch {
        if (!cancelled) {
          setRustParsedSegments(null);
          prevParsedRef.current = null;
          prevLogsRef.current = logs;
        }
      }
    };

    void loadParsedSegments();
    return () => {
      cancelled = true;
    };
  }, [logs]);

  const parsedLogs = useMemo<ParsedLogEntry[]>(() => {
    return logs.map((line, originalIndex) => {
      const plainLine = stripAnsiCodes(line);
      const rustSegments = toLocalAnsiSegments(rustParsedSegments?.[originalIndex]);
      return {
        line,
        plainLine,
        originalIndex,
        level: detectLogLevel(plainLine),
        segments: rustSegments ?? ansiToSegments(line),
      };
    });
  }, [logs, rustParsedSegments]);

  const visibleLogs = useMemo(() => {
    if (logFilter === 'ALL') {
      return parsedLogs;
    }

    return parsedLogs.filter((entry) => entry.level === logFilter);
  }, [parsedLogs, logFilter]);

  const normalizedSearchQuery = searchQuery.trim();
  const activeSearchRegex = useMemo(() => {
    if (!normalizedSearchQuery) {
      return null;
    }
    try {
      const pattern = isRegexSearchMode
        ? normalizedSearchQuery
        : escapeRegExp(normalizedSearchQuery);
      return new RegExp(`(${pattern})`, 'gi');
    } catch {
      return null;
    }
  }, [normalizedSearchQuery, isRegexSearchMode]);
  const isRegexInvalid =
    isRegexSearchMode && normalizedSearchQuery.length > 0 && activeSearchRegex === null;
  const totalMatches = useMemo(() => {
    if (!normalizedSearchQuery) {
      return 0;
    }

    return visibleLogs.reduce((total, entry) => {
      return total + countMatches(entry.plainLine, activeSearchRegex);
    }, 0);
  }, [visibleLogs, normalizedSearchQuery, activeSearchRegex]);
  const pinnedLogKeySet = useMemo(
    () => new Set(pinnedLogs.map((entry) => entry.key)),
    [pinnedLogs],
  );

  const openSearch = () => {
    setIsSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveMatchIndex(0);
  };

  const togglePinnedLog = (entry: ParsedLogEntry) => {
    const pinKey = String(entry.originalIndex);
    setPinnedLogs((prev) => {
      const exists = prev.some((item) => item.key === pinKey);
      if (exists) {
        return prev.filter((item) => item.key !== pinKey);
      }
      if (prev.length >= MAX_PINNED_LOGS) {
        notify.info(t('console.toast.pinLimitReached', { max: MAX_PINNED_LOGS }));
        return prev;
      }
      return [...prev, { key: pinKey, text: entry.plainLine, level: entry.level }];
    });
  };

  const jumpToMatch = (direction: 1 | -1) => {
    if (totalMatches === 0) {
      return;
    }

    setActiveMatchIndex((prev) => {
      const next = prev + direction;
      if (next < 0) {
        return totalMatches - 1;
      }
      if (next >= totalMatches) {
        return 0;
      }
      return next;
    });
  };

  useEffect(() => {
    if (autoScroll && !(isSearchOpen && normalizedSearchQuery)) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [visibleLogs, autoScroll, isSearchOpen, normalizedSearchQuery]);

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        openSearch();
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, []);

  useEffect(() => {
    if (!isSearchOpen) {
      return;
    }
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [isSearchOpen]);

  useEffect(() => {
    if (totalMatches === 0) {
      setActiveMatchIndex(0);
      return;
    }
    setActiveMatchIndex((prev) => (prev >= totalMatches ? 0 : prev));
  }, [totalMatches]);

  useEffect(() => {
    if (!isSearchOpen || !normalizedSearchQuery || totalMatches === 0) {
      return;
    }

    const activeElement = matchRefs.current[`m-${activeMatchIndex}`];
    activeElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeMatchIndex, totalMatches, isSearchOpen, normalizedSearchQuery, visibleLogs.length]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void tauriListen<{ serverId: string; memory: number }>('server-stats', (data) => {
      if (data.serverId === server.id) {
        setMemoryUsage(data.memory);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return;
      }
      unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [server.id]);

  useEffect(() => {
    void loadCommandHistory(server.id).then((history) => {
      if (history.length > 0) {
        setCommandHistory(history);
      }
    });
  }, [server.id]);

  // The copied state clears on its own after a short time.
  useEffect(() => {
    if (!addressCopied) {
      return;
    }
    const timer = window.setTimeout(() => setAddressCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [addressCopied]);

  // Ngrok status is now event-driven; cycle the display address periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAddressIndex((prev) => (prev === 0 ? 1 : 0));
    }, 3000);
    return () => clearInterval(interval);
  }, [server.id]);

  // Commands only reach a running server. Other states show the hint and refuse the send.
  const canSendCommand = server.status === 'online';

  const handleSend = () => {
    const normalizedCommand = command.trim();
    if (!canSendCommand || !normalizedCommand) {
      return;
    }

    sendCommand(server.id, normalizedCommand);
    setCommandHistory((prev) => {
      const next = [...prev];
      if (next[next.length - 1] !== normalizedCommand) {
        next.push(normalizedCommand);
      }
      if (next.length > 100) {
        next.shift();
      }
      void saveCommandHistory(server.id, next);
      return next;
    });
    setHistoryCursor(-1);
    setHistoryDraft('');
    setCommand('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
      return;
    }

    if (e.key === 'ArrowUp') {
      if (commandHistory.length === 0) {
        return;
      }

      e.preventDefault();

      if (historyCursor === -1) {
        setHistoryDraft(command);
        const nextIndex = commandHistory.length - 1;
        setHistoryCursor(nextIndex);
        setCommand(commandHistory[nextIndex] ?? '');
        return;
      }

      if (historyCursor > 0) {
        const nextIndex = historyCursor - 1;
        setHistoryCursor(nextIndex);
        setCommand(commandHistory[nextIndex] ?? '');
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      if (commandHistory.length === 0 || historyCursor === -1) {
        return;
      }

      e.preventDefault();

      if (historyCursor < commandHistory.length - 1) {
        const nextIndex = historyCursor + 1;
        setHistoryCursor(nextIndex);
        setCommand(commandHistory[nextIndex] ?? '');
        return;
      }

      setHistoryCursor(-1);
      setCommand(historyDraft);
    }
  };

  const localAddress = `localhost:${server.port}`;
  const publicAddress = ngrokUrl ? ngrokUrl.replace('tcp://', '') : localAddress;

  const displayAddress = !ngrokUrl
    ? localAddress
    : currentAddressIndex === 0
      ? localAddress
      : publicAddress;

  // The address shows "Copied" for a moment, so a click visibly does something even though the clipboard has no UI.
  const handleCopyAddress = () => {
    void copyToClipboard(displayAddress)
      .then(() => setAddressCopied(true))
      .catch((error) => {
        logError('Failed to copy console address', error, { serverId: server.id });
        notify.error(t('console.toast.copyFailed'));
      });
  };

  const handleExportLogs = async () => {
    if (visibleLogs.length === 0) {
      notify.info(t('console.toast.noLogsToSave'));
      return;
    }

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    const defaultFileName = `${server.name}-console-${yyyy}${mm}${dd}-${hh}${min}${sec}.log`;

    try {
      const output = visibleLogs.map((entry) => entry.plainLine.replace(/\r\n/g, '\n')).join('\n');
      const exported = await tauriInvoke<boolean>('export_text_file', {
        content: output,
        suggestedName: defaultFileName,
      });
      if (exported) {
        notify.success(t('console.toast.logsSaved'));
      }
    } catch (error) {
      logError('Failed to export console logs', error, {
        serverId: server.id,
        serverName: server.name,
      });
      notify.error(t('console.toast.logsSaveFailed'));
    }
  };

  // Memory is shown in megabytes; the numbers follow the app language and the unit comes from the locale.
  const memoryUnit = t('console.memory.unit');
  const memoryLabel =
    server.status === 'online'
      ? t('console.memory.value', {
          used: memoryFormatter.format(memoryUsage / 1024 / 1024),
          total: memoryFormatter.format(server.memory),
          unit: memoryUnit,
        })
      : t('console.memory.value', { used: '-', total: '-', unit: memoryUnit });

  return (
    <div className={styles.view} data-testid="console-view">
      <section className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <Tooltip content={t('console.status.clickToCopy')} side="bottom">
            <button
              type="button"
              onClick={handleCopyAddress}
              className={`${styles.address} ${ngrokUrl && currentAddressIndex === 1 ? styles.addressPublic : styles.addressLocal}`}
            >
              {displayAddress}
              <span className={styles.copyFeedback} aria-live="polite">
                {addressCopied ? (
                  <>
                    <Check aria-hidden="true" size={14} strokeWidth={2} />
                    {t('console.status.copied')}
                  </>
                ) : (
                  <Copy aria-hidden="true" size={14} strokeWidth={1.75} />
                )}
              </span>
            </button>
          </Tooltip>

          <span className={styles.divider} aria-hidden="true" />

          <span className={styles.statusItem}>
            <span className={styles.statusDot} data-status={server.status} aria-hidden="true" />
            <span className={styles.statusValue} data-testid="console-status">
              {t(STATUS_LABEL_KEYS[server.status])}
            </span>
          </span>

          <span className={styles.divider} aria-hidden="true" />

          <span className={styles.memoryItem}>
            <span className={styles.itemLabel}>{t('console.status.memory')}</span>
            <span className={styles.memoryValue}>{memoryLabel}</span>
          </span>
        </div>

        <div className={styles.toolbarGroup}>
          {isSearchOpen ? (
            <div className={styles.searchOpen} data-testid="console-search-bar">
              <div className={styles.searchWrap}>
                <SearchField
                  ref={searchInputRef}
                  label={t('console.search.label')}
                  clearLabel={arc.search.clear}
                  value={searchQuery}
                  onValueChange={(value) => {
                    setSearchQuery(value);
                    setActiveMatchIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      jumpToMatch(event.shiftKey ? -1 : 1);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeSearch();
                    }
                  }}
                  placeholder={t('console.search.placeholder')}
                  data-testid="console-search-input"
                />
              </div>

              <span
                className={styles.matchCount}
                data-testid="console-search-count"
                aria-live="polite"
              >
                {t('console.search.count', {
                  current: totalMatches === 0 ? 0 : activeMatchIndex + 1,
                  total: totalMatches,
                })}
              </span>

              <Button
                type="button"
                size="sm"
                variant={isRegexSearchMode ? 'primary' : 'secondary'}
                aria-pressed={isRegexSearchMode}
                onClick={() => {
                  setIsRegexSearchMode((prev) => !prev);
                  setActiveMatchIndex(0);
                }}
              >
                {t('console.search.regex')}
              </Button>

              <ButtonGroup
                label={t('console.search.navigate')}
                size="sm"
                items={[
                  {
                    id: 'prev',
                    label: t('console.search.prev'),
                    icon: <ChevronUp aria-hidden="true" size={14} strokeWidth={1.75} />,
                    iconOnly: true,
                    disabled: totalMatches === 0,
                    onSelect: () => jumpToMatch(-1),
                  },
                  {
                    id: 'next',
                    label: t('console.search.next'),
                    icon: <ChevronDown aria-hidden="true" size={14} strokeWidth={1.75} />,
                    iconOnly: true,
                    disabled: totalMatches === 0,
                    onSelect: () => jumpToMatch(1),
                  },
                ]}
              />

              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={styles.iconButton}
                aria-label={t('common.close')}
                onClick={closeSearch}
              >
                <X aria-hidden="true" size={16} strokeWidth={1.75} />
              </Button>

              {isRegexInvalid && (
                <span role="alert" className={styles.searchError}>
                  {t('console.search.invalidRegex')}
                </span>
              )}
            </div>
          ) : (
            <Tooltip content={t('console.actions.find')} side="bottom">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className={styles.iconButton}
                aria-label={t('console.actions.find')}
                data-testid="console-search-open-button"
                onClick={openSearch}
              >
                <Search aria-hidden="true" size={16} strokeWidth={1.75} />
              </Button>
            </Tooltip>
          )}

          <SegmentedControl
            label={t('console.filter.ariaLabel')}
            value={logFilter}
            options={LOG_FILTER_OPTIONS.map((level) => ({
              value: level,
              label: level === 'ALL' ? t('console.filter.all') : level,
            }))}
            onValueChange={(value) => {
              setLogFilter(value as LogLevelFilter);
              setActiveMatchIndex(0);
            }}
          />

          <Tooltip content={t('console.actions.saveLogs')} side="bottom">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={styles.iconButton}
              aria-label={t('console.actions.saveLogs')}
              data-testid="console-save-button"
              onClick={() => void handleExportLogs()}
            >
              <Download aria-hidden="true" size={16} strokeWidth={1.75} />
            </Button>
          </Tooltip>
        </div>
      </section>

      <section className={styles.logViewport}>
        {pinnedLogs.length > 0 && (
          <div className={styles.pinnedArea}>
            <div className={styles.pinnedTitle}>
              <Pin aria-hidden="true" size={14} strokeWidth={1.75} />
              {t('console.pinned.title')}
            </div>
            <div className={styles.pinnedList}>
              {pinnedLogs.map((entry) => (
                <div
                  key={entry.key}
                  className={styles.pinnedItem}
                  data-level={entry.level.toLowerCase()}
                >
                  <span className={styles.pinnedText}>{entry.text}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setPinnedLogs((prev) => prev.filter((item) => item.key !== entry.key))
                    }
                  >
                    {t('console.pinned.unpin')}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          ref={logContainerRef}
          className={styles.logPane}
          onScroll={() => {
            const el = logContainerRef.current;
            if (!el) return;
            const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
            setAutoScroll(distanceFromBottom < 120);
          }}
        >
          {(() => {
            let renderedMatchIndex = -1;

            return visibleLogs.map((entry) => (
              <div
                key={entry.originalIndex}
                className={styles.logLine}
                data-level={entry.level.toLowerCase()}
              >
                <div className={`${styles.logContent} break-words`}>
                  {(() => {
                    const severityStyle = getSeverityStyle(entry.level);
                    const segmentKeyCounts = new Map<string, number>();

                    return entry.segments.map((seg) => {
                      const segmentKeyBase = `${seg.text}:${JSON.stringify(seg.style)}`;
                      const segmentOccurrence = segmentKeyCounts.get(segmentKeyBase) ?? 0;
                      segmentKeyCounts.set(segmentKeyBase, segmentOccurrence + 1);
                      const segmentKey = `${segmentKeyBase}:${segmentOccurrence}`;
                      const style = { ...seg.style } as AnsiStyle;
                      if (severityStyle) {
                        if (!style.color) {
                          style.color = severityStyle.color;
                        }
                        if (!style.fontWeight) style.fontWeight = severityStyle.fontWeight;
                      }

                      if (!normalizedSearchQuery || !activeSearchRegex) {
                        return (
                          <span key={segmentKey} style={style}>
                            {seg.text}
                          </span>
                        );
                      }

                      const regexForSegment = new RegExp(
                        activeSearchRegex.source,
                        activeSearchRegex.flags,
                      );
                      const renderedParts: ReactNode[] = [];
                      let cursor = 0;
                      let match: RegExpExecArray | null;
                      let sequence = 0;

                      while ((match = regexForSegment.exec(seg.text)) !== null) {
                        const matchedText = match[0];
                        if (matchedText.length === 0) {
                          regexForSegment.lastIndex += 1;
                          continue;
                        }

                        const start = match.index;
                        const end = start + matchedText.length;
                        if (start > cursor) {
                          renderedParts.push(
                            <span key={`${segmentKey}-${sequence}-text`}>
                              {seg.text.slice(cursor, start)}
                            </span>,
                          );
                          sequence += 1;
                        }

                        renderedMatchIndex += 1;
                        const currentMatchIndex = renderedMatchIndex;
                        const refKey = `m-${currentMatchIndex}`;
                        const isActive = currentMatchIndex === activeMatchIndex;
                        renderedParts.push(
                          <mark
                            key={`${segmentKey}-${sequence}-match`}
                            ref={(element) => {
                              matchRefs.current[refKey] = element;
                            }}
                            className={isActive ? styles.searchHitActive : styles.searchHit}
                          >
                            {matchedText}
                          </mark>,
                        );
                        sequence += 1;
                        cursor = end;
                      }

                      if (cursor < seg.text.length) {
                        renderedParts.push(
                          <span key={`${segmentKey}-${sequence}-tail`}>
                            {seg.text.slice(cursor)}
                          </span>,
                        );
                      }

                      return (
                        <span key={segmentKey} style={style}>
                          {renderedParts}
                        </span>
                      );
                    });
                  })()}
                </div>

                <Tooltip
                  content={
                    pinnedLogKeySet.has(String(entry.originalIndex))
                      ? t('console.pinned.unpin')
                      : t('console.pinned.pin')
                  }
                  side="left"
                >
                  <button
                    type="button"
                    className={`${styles.pinButton} ${pinnedLogKeySet.has(String(entry.originalIndex)) ? styles.pinButtonActive : ''}`}
                    aria-pressed={pinnedLogKeySet.has(String(entry.originalIndex))}
                    aria-label={
                      pinnedLogKeySet.has(String(entry.originalIndex))
                        ? t('console.pinned.unpin')
                        : t('console.pinned.pin')
                    }
                    onClick={() => togglePinnedLog(entry)}
                  >
                    <Pin aria-hidden="true" size={14} strokeWidth={1.75} />
                  </button>
                </Tooltip>
              </div>
            ));
          })()}

          <div ref={logEndRef} />

          {visibleLogs.length === 0 && (
            <EmptyLine
              className={styles.emptyLog}
              title={
                logFilter === 'ALL'
                  ? t('console.emptyLog.waiting')
                  : t('console.emptyLog.notFound', { level: logFilter })
              }
            />
          )}
        </div>

        {!autoScroll && visibleLogs.length > 0 && (
          <div className={styles.jumpLatest}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setAutoScroll(true);
                logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
              }}
            >
              <ArrowDown aria-hidden="true" size={14} strokeWidth={1.75} />
              {t('console.actions.jumpLatest')}
            </Button>
          </div>
        )}
      </section>

      <section className={styles.commandStrip}>
        <div className={styles.commandEntry}>
          <span className={styles.commandPrefix} aria-hidden="true">
            &gt;
          </span>
          <div className={styles.commandField}>
            <Input
              label={t('console.command.label')}
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
                if (historyCursor !== -1) {
                  setHistoryCursor(-1);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={t('console.command.placeholder')}
              description={canSendCommand ? undefined : t('console.command.offlineHint')}
              disabled={!canSendCommand}
              data-testid="console-command-input"
            />
          </div>
          <Button
            type="button"
            variant="primary"
            data-testid="console-send-button"
            disabled={!canSendCommand}
            onClick={handleSend}
          >
            <Send aria-hidden="true" size={14} strokeWidth={1.75} />
            {t('console.actions.send')}
          </Button>
        </div>

        <div className={styles.historyHint}>{t('console.historyHint')}</div>
      </section>
    </div>
  );
};

export default ConsoleView;
