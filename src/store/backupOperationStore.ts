import { create } from 'zustand';

export type ManualBackupOperationKind = 'create';

export interface ManualBackupOperation {
  id: string;
  kind: ManualBackupOperationKind;
}

interface BackupOperationStoreState {
  activeManualOperations: Record<string, ManualBackupOperation>;
  completionRevisions: Record<string, number>;
  beginManualOperation: (
    serverId: string,
    operationId: string,
    kind: ManualBackupOperationKind,
  ) => boolean;
  finishManualOperation: (serverId: string, operationId: string) => boolean;
}

export function getManualBackupOperationId(serverId: string): string {
  return `manual-backup:create:${serverId}`;
}

export const useBackupOperationStore = create<BackupOperationStoreState>((set) => ({
  activeManualOperations: {},
  completionRevisions: {},
  beginManualOperation: (serverId, operationId, kind) => {
    let started = false;
    set((state) => {
      if (state.activeManualOperations[serverId]) {
        return state;
      }

      started = true;
      return {
        activeManualOperations: {
          ...state.activeManualOperations,
          [serverId]: { id: operationId, kind },
        },
      };
    });
    return started;
  },
  finishManualOperation: (serverId, operationId) => {
    let finished = false;
    set((state) => {
      const activeOperation = state.activeManualOperations[serverId];
      if (!activeOperation || activeOperation.id !== operationId) {
        return state;
      }

      const { [serverId]: _finishedOperation, ...remainingOperations } =
        state.activeManualOperations;
      finished = true;
      return {
        activeManualOperations: remainingOperations,
        completionRevisions: {
          ...state.completionRevisions,
          [serverId]: (state.completionRevisions[serverId] ?? 0) + 1,
        },
      };
    });
    return finished;
  },
}));
