import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { type TranslationKey, useTranslation } from '../../i18n';
import {
  listenMapRenderProgress,
  requestMapRender,
  type MapRenderDiagnostics,
  type MapRenderProgressEvent,
  type MapUnavailableReason,
} from '../../lib/map-render-commands';
import type { UnlistenFn } from '../../lib/tauri-api';
import type { MinecraftServer } from '../shared/server declaration';
import { Button } from './ui/Button';

interface MapViewProps {
  server: MinecraftServer;
}

const RENDER_STATE_KEYS: Record<MapRenderDiagnostics['renderState'], TranslationKey> = {
  queued: 'map.states.queued',
  rendering: 'map.states.rendering',
  ready: 'map.states.ready',
  empty: 'map.states.empty',
  failed: 'map.states.failed',
  retryable: 'map.states.retryable',
  cancelled: 'map.states.cancelled',
  blocked: 'map.states.blocked',
};

const REASON_KEYS: Record<MapUnavailableReason, TranslationKey> = {
  renderer_not_connected: 'map.reasons.rendererNotConnected',
  bridge_not_connected: 'map.reasons.bridgeNotConnected',
  not_loaded: 'map.reasons.notLoaded',
  world_unavailable: 'map.reasons.worldUnavailable',
  queue_full: 'map.reasons.queueFull',
  timeout: 'map.reasons.timeout',
  invalid_snapshot: 'map.reasons.invalidSnapshot',
  missing_asset: 'map.reasons.missingAsset',
  malformed_anvil: 'map.reasons.malformedAnvil',
  unsupported_version: 'map.reasons.unsupportedVersion',
  checksum_mismatch: 'map.reasons.checksumMismatch',
  cache_corrupt: 'map.reasons.cacheCorrupt',
  no_generated_terrain: 'map.reasons.noGeneratedTerrain',
};

function createRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `map-${Date.now()}`;
}

function initialDiagnostics(minecraftVersion: string): MapRenderDiagnostics {
  return {
    bridgeState: 'disconnected',
    terrainState: 'unknown',
    renderState: 'blocked',
    source: 'none',
    liveRequestedCount: 0,
    liveReceivedCount: 0,
    renderedChunkCount: 0,
    decodeFailedChunkCount: 0,
    coverageRatio: 0,
    unavailableReason: 'renderer_not_connected',
    rendererVersion: 'unknown',
    minecraftVersion,
    assetVersion: null,
    cacheState: 'miss',
    retryable: false,
  };
}

function reasonLabel(
  diagnostics: MapRenderDiagnostics,
  t: (key: TranslationKey) => string,
): string | null {
  const reason = diagnostics.unavailableReason;
  return reason ? t(REASON_KEYS[reason]) : null;
}

export function mapRenderStateLabel(
  diagnostics: MapRenderDiagnostics,
  t: (key: TranslationKey) => string,
): string {
  return t(RENDER_STATE_KEYS[diagnostics.renderState]);
}

function StatusIcon({ connected }: { connected: boolean }) {
  return connected ? (
    <Wifi size={16} aria-hidden="true" />
  ) : (
    <WifiOff size={16} aria-hidden="true" />
  );
}

export default function MapView({ server }: MapViewProps) {
  const { t } = useTranslation();
  const [diagnostics, setDiagnostics] = useState<MapRenderDiagnostics>(() =>
    initialDiagnostics(server.version),
  );
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    let active = true;
    let unlisten: UnlistenFn | null = null;
    const requestId = createRequestId();

    const request: Parameters<typeof requestMapRender>[0] = {
      requestId,
      serverId: server.id,
      worldId: 'world',
      dimension: 'minecraft:overworld',
      minecraftVersion: server.version,
      projection: 'iso_projected',
      zoom: 8,
      width: 768,
      height: 768,
      centerX: 0,
      centerZ: 0,
      worldCenterX: null,
      worldCenterZ: null,
      tile: { x: 0, z: 0 },
    };

    async function initialize() {
      setIsRefreshing(true);
      try {
        unlisten = await listenMapRenderProgress((event: MapRenderProgressEvent) => {
          if (active && event.requestId === requestId) {
            setDiagnostics(event.diagnostics);
          }
        });

        if (!active) {
          void unlisten();
          return;
        }

        const response = await requestMapRender(request);
        if (active && response.requestId === requestId) {
          setDiagnostics(response.diagnostics);
        }
      } catch {
        if (active) {
          setDiagnostics(initialDiagnostics(server.version));
        }
      } finally {
        if (active) {
          setIsRefreshing(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
      if (unlisten) {
        void unlisten();
      }
    };
  }, [refreshToken, server.id, server.version]);

  const rendererStateLabel = mapRenderStateLabel(diagnostics, t);
  const unavailableReason = reasonLabel(diagnostics, t);
  const terrainReady = diagnostics.terrainState === 'ready' && diagnostics.renderState === 'ready';

  return (
    <div className="map-view" data-testid="map-view">
      <header className="map-view__header">
        <div>
          <p className="map-view__eyebrow">{server.name}</p>
          <h1 className="map-view__title">{t('map.title')}</h1>
          <p className="map-view__subtitle">{t('map.subtitle')}</p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="map-view__refresh-button"
          aria-label={t('map.refresh')}
          onClick={refresh}
          disabled={isRefreshing}
        >
          <RefreshCw size={16} aria-hidden="true" className={isRefreshing ? 'animate-spin' : ''} />
          <span>{t('common.refresh')}</span>
        </Button>
      </header>

      <section
        className={`map-view__status-panel ${terrainReady ? 'map-view__status-panel--ready' : 'map-view__status-panel--blocked'}`}
        aria-live="polite"
        data-testid="map-render-status"
      >
        <div className="map-view__status-icon" aria-hidden="true">
          {terrainReady ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
        </div>
        <div className="map-view__status-copy">
          <div className="map-view__status-heading">
            <span className="map-view__status-badge" data-testid="map-render-state">
              {rendererStateLabel}
            </span>
            <span className="map-view__status-version">
              Minecraft {diagnostics.minecraftVersion}
            </span>
          </div>
          <h2>{terrainReady ? t('map.states.ready') : t('map.blockedTitle')}</h2>
          <p>{terrainReady ? t('map.subtitle') : t('map.blockedDescription')}</p>
          {unavailableReason ? <p className="map-view__reason">{unavailableReason}</p> : null}
        </div>
      </section>

      <section
        className="map-view__diagnostics surface-card"
        aria-labelledby="map-diagnostics-title"
      >
        <div className="map-view__section-heading">
          <div>
            <p className="map-view__eyebrow">{t('map.diagnostics')}</p>
            <h2 id="map-diagnostics-title">{t('map.title')}</h2>
          </div>
          <span className="map-view__renderer-state">
            <CircleDashed size={16} aria-hidden="true" />
            {rendererStateLabel}
          </span>
        </div>
        <div className="map-view__diagnostic-grid">
          <DiagnosticItem
            label={t('map.status.bridge')}
            value={diagnostics.bridgeState}
            icon={<StatusIcon connected={diagnostics.bridgeState === 'connected'} />}
            tone={diagnostics.bridgeState === 'connected' ? 'positive' : 'muted'}
          />
          <DiagnosticItem
            label={t('map.status.terrain')}
            value={diagnostics.terrainState}
            tone={diagnostics.terrainState === 'ready' ? 'positive' : 'muted'}
          />
          <DiagnosticItem label={t('map.status.renderer')} value={diagnostics.rendererVersion} />
          <DiagnosticItem label={t('map.status.cache')} value={diagnostics.cacheState} />
          <DiagnosticItem label={t('map.status.source')} value={diagnostics.source} />
          <DiagnosticItem
            label={t('map.status.chunks')}
            value={`${diagnostics.renderedChunkCount} / ${diagnostics.liveReceivedCount}`}
          />
        </div>
      </section>
    </div>
  );
}

function DiagnosticItem({
  label,
  value,
  icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone?: 'default' | 'positive' | 'muted';
}) {
  return (
    <div className={`map-view__diagnostic map-view__diagnostic--${tone}`}>
      <span className="map-view__diagnostic-label">{label}</span>
      <span className="map-view__diagnostic-value">
        {icon}
        {value}
      </span>
    </div>
  );
}
