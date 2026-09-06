import { useCallback, useEffect, useRef, useState } from 'react';
import { toErrorMessage } from '../../lib/error-utils';
import { acceptServerEula, getServerEulaStatus } from '../../lib/eula-commands';
import type { MinecraftServer } from '../shared/server declaration';

export type EulaGateMode = 'interactive' | 'background';
export type EulaGateResult = 'accepted' | 'cancelled' | 'blocked';

export interface PendingServerEula {
  server: MinecraftServer;
  fileExists: boolean;
  error: string | null;
}

interface PendingRequest {
  server: MinecraftServer;
  resolve: (result: EulaGateResult) => void;
}

const activeServerStartRequests = new Map<string, Promise<EulaGateResult>>();

export function runExclusiveServerStart(
  serverId: string,
  operation: () => Promise<EulaGateResult>,
): Promise<EulaGateResult> {
  const existingRequest = activeServerStartRequests.get(serverId);
  if (existingRequest) {
    return existingRequest;
  }

  const request = operation();
  activeServerStartRequests.set(serverId, request);
  void request
    .finally(() => {
      if (activeServerStartRequests.get(serverId) === request) {
        activeServerStartRequests.delete(serverId);
      }
    })
    .catch(() => {});
  return request;
}

interface UseServerEulaGateResult {
  pendingEula: PendingServerEula | null;
  ensureServerEula: (server: MinecraftServer, mode: EulaGateMode) => Promise<EulaGateResult>;
  acceptPendingEula: () => Promise<boolean>;
  cancelPendingEula: () => void;
}

export function useServerEulaGate(): UseServerEulaGateResult {
  const [pendingEula, setPendingEula] = useState<PendingServerEula | null>(null);
  const pendingRequestRef = useRef<PendingRequest | null>(null);
  const requestsRef = useRef(new Map<string, Promise<EulaGateResult>>());

  const clearPendingRequest = useCallback(() => {
    pendingRequestRef.current = null;
    setPendingEula(null);
  }, []);

  const ensureServerEula = useCallback(
    async (server: MinecraftServer, mode: EulaGateMode): Promise<EulaGateResult> => {
      const existingRequest = requestsRef.current.get(server.id);
      if (existingRequest) {
        return existingRequest;
      }

      const request = (async (): Promise<EulaGateResult> => {
        const status = await getServerEulaStatus(server.id);
        if (status.accepted) {
          return 'accepted';
        }
        if (mode === 'background') {
          return 'blocked';
        }

        return new Promise<EulaGateResult>((resolve) => {
          pendingRequestRef.current = {
            server,
            resolve,
          };
          setPendingEula({
            server,
            fileExists: status.fileExists,
            error: null,
          });
        });
      })();

      requestsRef.current.set(server.id, request);
      void request
        .finally(() => {
          if (requestsRef.current.get(server.id) === request) {
            requestsRef.current.delete(server.id);
          }
        })
        .catch(() => {});
      return request;
    },
    [],
  );

  const acceptPendingEula = useCallback(async (): Promise<boolean> => {
    const pending = pendingRequestRef.current;
    if (!pending) {
      return false;
    }

    try {
      await acceptServerEula(pending.server.id);
      pending.resolve('accepted');
      clearPendingRequest();
      return true;
    } catch (error) {
      setPendingEula((current) =>
        current
          ? {
              ...current,
              error: toErrorMessage(error),
            }
          : current,
      );
      return false;
    }
  }, [clearPendingRequest]);

  const cancelPendingEula = useCallback(() => {
    const pending = pendingRequestRef.current;
    if (!pending) {
      return;
    }
    pending.resolve('cancelled');
    clearPendingRequest();
  }, [clearPendingRequest]);

  useEffect(() => {
    return () => {
      pendingRequestRef.current?.resolve('cancelled');
      pendingRequestRef.current = null;
      requestsRef.current.clear();
    };
  }, []);

  return {
    pendingEula,
    ensureServerEula,
    acceptPendingEula,
    cancelPendingEula,
  };
}
