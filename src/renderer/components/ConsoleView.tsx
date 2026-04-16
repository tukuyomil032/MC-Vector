import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { FC } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import {
  type AnsiSegment as RustAnsiSegmentDto,
  parseAnsiLines,
} from '../../lib/performance-commands';
import { sendCommand } from '../../lib/server-commands';
import { tauriListen } from '../../lib/tauri-api';
import { type MinecraftServer } from '../components/../shared/server declaration';
import { useConsoleStore } from '../../store/consoleStore';
import { useToast } from './ToastProvider';

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

const ANSI_COLOR_MAP: Record<string, string> = {
  '30': '#000000',
  '31': '#ef4444',
  '32': '#22c55e',
  '33': '#eab308',
  '34': '#3b82f6',
  '35': '#a855f7',
  '36': '#06b6d4',
  '37': '#e5e7eb',
  '90': '#6b7280',
  '91': '#f87171',
  '92': '#4ade80',
  '93': '#facc15',
  '94': '#60a5fa',
  '95': '#c084fc',
  '96': '#22d3ee',
  '97': '#f8fafc',
};

const ANSI_BG_MAP: Record<string, string> = {
  '40': '#000000',
  '41': '#7f1d1d',
  '42': '#14532d',
  '43': '#78350f',
  '44': '#1e3a8a',
  '45': '#4c1d95',
  '46': '#0f766e',
  '47': '#374151',
  '100': '#1f2937',
  '101': '#9f1239',
  '102': '#166534',
  '103': '#854d0e',
  '104': '#1e40af',
  '105': '#581c87',
  '106': '#115e59',
  '107': '#f3f4f6',
};

const ansiToSegments = (text: string): AnsiSegment[] => {
  const regex = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
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
        delete currentStyle.fontWeight;
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
  text.replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const countMatches = (text: string, query: string): number => {
  if (!query) {
    return 0;
  }

  const regex = new RegExp(escapeRegExp(query), 'gi');
  let count = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    count += 1;
    if (match[0].length === 0) {
      regex.lastIndex += 1;
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
      return { color: '#f43f5e', fontWeight: 700 };
    case 'ERROR':
      return { color: '#ef4444', fontWeight: 700 };
    case 'WARN':
      return { color: '#f59e0b', fontWeight: 700 };
    default:
      return { color: '#d1d5db' };
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

const EMPTY_LOGS: string[] = [];

const ConsoleView: FC<ConsoleViewProps> = ({ server, ngrokUrl }) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const logs = useConsoleStore((state) => state.serverLogs[server.id] ?? EMPTY_LOGS);
  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyCursor, setHistoryCursor] = useState(-1);
  const [historyDraft, setHistoryDraft] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);
  const [currentAddressIndex, setCurrentAddressIndex] = useState(0);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [logFilter, setLogFilter] = useState<LogLevelFilter>('ALL');
  const [rustParsedSegments, setRustParsedSegments] = useState<RustAnsiSegmentDto[][] | null>(null);
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
        const appendOnly =
          Array.isArray(prevParsed) &&
          logs.length >= prevLogs.length &&
          prevLogs.every((line, index) => logs[index] === line);

        if (appendOnly) {
          const newLines = logs.slice(prevLogs.length);
          if (newLines.length === 0) {
            if (!cancelled) {
              setRustParsedSegments(prevParsed);
            }
            return;
          }
          const parsedTail = await parseAnsiLines(newLines);
          const normalizedTail = Array.isArray(parsedTail) ? parsedTail : null;
          if (!cancelled) {
            const merged = normalizedTail ? [...prevParsed, ...normalizedTail] : null;
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
  const lowerSearchQuery = normalizedSearchQuery.toLowerCase();
  const totalMatches = useMemo(() => {
    if (!normalizedSearchQuery) {
      return 0;
    }

    return visibleLogs.reduce((total, entry) => {
      return total + countMatches(entry.plainLine, normalizedSearchQuery);
    }, 0);
  }, [visibleLogs, normalizedSearchQuery]);

  const openSearch = () => {
    setIsSearchOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setActiveMatchIndex(0);
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

  // Ngrok status is now event-driven; cycle the display address periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAddressIndex((prev) => (prev === 0 ? 1 : 0));
    }, 3000);
    return () => clearInterval(interval);
  }, [server.id]);

  const handleSend = () => {
    const normalizedCommand = command.trim();
    if (!normalizedCommand) {
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

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(displayAddress);
  };

  const handleExportLogs = async () => {
    if (visibleLogs.length === 0) {
      showToast(t('console.toast.noLogsToSave'), 'info');
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
      const targetPath = await save({
        defaultPath: defaultFileName,
        filters: [
          { name: 'Log File', extensions: ['log'] },
          { name: 'Text File', extensions: ['txt'] },
        ],
      });

      if (!targetPath) {
        return;
      }

      const output = visibleLogs.map((entry) => entry.plainLine.replace(/\r\n/g, '\n')).join('\n');

      await writeTextFile(targetPath, output);
      showToast(t('console.toast.logsSaved'), 'success');
    } catch (error) {
      console.error(error);
      showToast(t('console.toast.logsSaveFailed'), 'error');
    }
  };

  const formatMemoryDetailed = (usageBytes: number, allocatedMb: number) => {
    const usageMb = (usageBytes / 1024 / 1024).toFixed(0);
    return `${usageMb} / ${allocatedMb} MB`;
  };

  return (
    <div className="console-view">
      <section className="console-view__status-strip surface-card">
        <div className="console-view__status-col console-view__status-col--with-divider">
          <div className="console-view__status-label">{t('console.status.address')}</div>
          <button
            type="button"
            onClick={handleCopyAddress}
            title={t('console.status.clickToCopy')}
            className={`console-view__address ${ngrokUrl && currentAddressIndex === 1 ? 'is-public' : 'is-local'}`}
          >
            {displayAddress}
          </button>
        </div>

        <div className="console-view__status-col console-view__status-col--with-divider">
          <div className="console-view__status-label">{t('console.status.status')}</div>
          <div
            className={`console-view__status-value console-view__status-value--${server.status}`}
          >
            {server.status.toUpperCase()}
          </div>
        </div>

        <div className="console-view__status-col">
          <div className="console-view__status-label">{t('console.status.memory')}</div>
          <div className="console-view__memory-value">
            {server.status === 'online'
              ? formatMemoryDetailed(memoryUsage, server.memory)
              : '- / - MB'}
          </div>
        </div>
      </section>

      <section
        className={`console-view__search-strip surface-card ${isSearchOpen ? 'is-open' : 'is-closed'}`}
      >
        <span className="console-view__search-label">{t('console.search.label')}</span>
        {isSearchOpen ? (
          <>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
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
              className="console-view__search-input"
            />

            <div className="console-view__search-count">
              {totalMatches === 0 ? '0 / 0' : `${activeMatchIndex + 1} / ${totalMatches}`}
            </div>

            <button
              type="button"
              className="console-view__search-nav-btn control-chip"
              onClick={() => jumpToMatch(-1)}
              disabled={totalMatches === 0}
            >
              {t('console.search.prev')}
            </button>

            <button
              type="button"
              className="console-view__search-nav-btn control-chip"
              onClick={() => jumpToMatch(1)}
              disabled={totalMatches === 0}
            >
              {t('console.search.next')}
            </button>

            <button
              type="button"
              className="console-view__search-close-btn control-chip"
              onClick={closeSearch}
            >
              {t('common.close')}
            </button>
          </>
        ) : (
          <>
            <span className="console-view__search-placeholder">
              {t('console.search.placeholder')}
            </span>
            <button
              type="button"
              className="console-view__search-open-btn control-chip"
              onClick={openSearch}
            >
              {t('console.actions.find')}
            </button>
          </>
        )}
      </section>

      <section className="console-view__log-viewport surface-card">
        <div
          ref={logContainerRef}
          className="console-view__log-pane"
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
                className={`console-view__log-line console-view__log-line--${entry.level.toLowerCase()} break-words`}
              >
                {(() => {
                  const severityStyle = getSeverityStyle(entry.level);
                  return entry.segments.map((seg, i) => {
                    const style = { ...seg.style } as AnsiStyle;
                    if (severityStyle) {
                      if (!style.color) {
                        style.color = severityStyle.color;
                      }
                      if (!style.fontWeight) style.fontWeight = severityStyle.fontWeight;
                    }

                    if (!normalizedSearchQuery) {
                      return (
                        <span key={i} style={style}>
                          {seg.text}
                        </span>
                      );
                    }

                    const parts = seg.text.split(
                      new RegExp(`(${escapeRegExp(normalizedSearchQuery)})`, 'gi'),
                    );

                    return (
                      <span key={i} style={style}>
                        {parts.map((part, partIndex) => {
                          if (!part) {
                            return null;
                          }

                          if (part.toLowerCase() === lowerSearchQuery) {
                            renderedMatchIndex += 1;
                            const currentMatchIndex = renderedMatchIndex;
                            const refKey = `m-${currentMatchIndex}`;
                            const isActive = currentMatchIndex === activeMatchIndex;

                            return (
                              <mark
                                key={`${i}-${partIndex}-match`}
                                ref={(element) => {
                                  matchRefs.current[refKey] = element;
                                }}
                                className={`console-view__search-hit ${isActive ? 'is-active' : ''}`}
                              >
                                {part}
                              </mark>
                            );
                          }

                          return <span key={`${i}-${partIndex}`}>{part}</span>;
                        })}
                      </span>
                    );
                  });
                })()}
              </div>
            ));
          })()}

          <div ref={logEndRef} />

          {visibleLogs.length === 0 && (
            <div className="console-view__empty-log">
              {logFilter === 'ALL'
                ? t('console.emptyLog.waiting')
                : t('console.emptyLog.notFound', { level: logFilter })}
            </div>
          )}
        </div>
      </section>

      <section className="console-view__command-strip surface-card">
        <div className="console-view__command-actions">
          <button
            type="button"
            className="console-view__save-button control-chip"
            onClick={() => void handleExportLogs()}
          >
            {t('console.actions.saveLogs')}
          </button>

          <div className="console-view__filter-wrap">
            <span className="console-view__filter-label">{t('console.filter.label')}</span>
            <div
              className="console-view__filter-pills"
              role="tablist"
              aria-label={t('console.filter.ariaLabel')}
            >
              {LOG_FILTER_OPTIONS.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="tab"
                  aria-selected={logFilter === level}
                  className={`console-view__filter-pill control-chip ${logFilter === level ? 'is-active' : ''}`}
                  onClick={() => {
                    setLogFilter(level);
                    setActiveMatchIndex(0);
                  }}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="console-view__command-entry">
          <span className="console-view__command-prefix">&gt;</span>
          <input
            type="text"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              if (historyCursor !== -1) {
                setHistoryCursor(-1);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('console.command.placeholder')}
            className="console-view__command-input"
          />
          <button type="button" onClick={handleSend} className="console-view__send-button">
            {t('console.actions.send')}
          </button>
        </div>

        <div className="console-view__history-hint">{t('console.historyHint')}</div>
      </section>
    </div>
  );
};

export default ConsoleView;
