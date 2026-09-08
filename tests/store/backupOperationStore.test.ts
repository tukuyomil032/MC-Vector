import { getManualBackupOperationId, useBackupOperationStore } from '@/store/backupOperationStore';
import { beforeEach, describe, expect, it } from 'vitest';

describe('backupOperationStore', () => {
  beforeEach(() => {
    useBackupOperationStore.setState({
      activeManualOperations: {},
      completionRevisions: {},
    });
  });

  it('uses a stable manual create operation id for each server', () => {
    expect(getManualBackupOperationId('server-a')).toBe('manual-backup:create:server-a');
    expect(getManualBackupOperationId('server-a')).toBe(getManualBackupOperationId('server-a'));
    expect(getManualBackupOperationId('server-a')).not.toBe(getManualBackupOperationId('server-b'));
  });

  it('allows one active manual operation per server without blocking another server', () => {
    const store = useBackupOperationStore.getState();

    expect(store.beginManualOperation('server-a', 'operation-a', 'create')).toBe(true);
    expect(store.beginManualOperation('server-a', 'operation-a-second', 'create')).toBe(false);
    expect(store.beginManualOperation('server-b', 'operation-b', 'create')).toBe(true);

    expect(useBackupOperationStore.getState().activeManualOperations).toEqual({
      'server-a': { id: 'operation-a', kind: 'create' },
      'server-b': { id: 'operation-b', kind: 'create' },
    });
  });

  it('finishes only the matching operation and increments that server completion revision', () => {
    const store = useBackupOperationStore.getState();
    store.beginManualOperation('server-a', 'operation-a', 'create');

    expect(store.finishManualOperation('server-a', 'different-operation')).toBe(false);
    expect(useBackupOperationStore.getState().activeManualOperations['server-a']).toEqual({
      id: 'operation-a',
      kind: 'create',
    });
    expect(useBackupOperationStore.getState().completionRevisions['server-a']).toBeUndefined();

    expect(store.finishManualOperation('server-a', 'operation-a')).toBe(true);
    expect(useBackupOperationStore.getState().activeManualOperations['server-a']).toBeUndefined();
    expect(useBackupOperationStore.getState().completionRevisions['server-a']).toBe(1);

    expect(store.beginManualOperation('server-a', 'operation-a-next', 'create')).toBe(true);
    expect(store.finishManualOperation('server-a', 'operation-a-next')).toBe(true);
    expect(useBackupOperationStore.getState().completionRevisions['server-a']).toBe(2);
  });
});
