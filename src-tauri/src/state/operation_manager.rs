use std::collections::HashMap;
use std::fmt;
use std::sync::{Arc, Weak};

use tokio::sync::{Mutex, OwnedMutexGuard};

/// Operations that must not overlap for the same managed server.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperationKind {
    Start,
    Stop,
    Restart,
    BackupCreate,
    BackupRestore,
    BackupDelete,
    FileMutation,
    ArtifactInstall,
}

impl fmt::Display for OperationKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::Restart => "restart",
            Self::BackupCreate => "backup-create",
            Self::BackupRestore => "backup-restore",
            Self::BackupDelete => "backup-delete",
            Self::FileMutation => "file-mutation",
            Self::ArtifactInstall => "artifact-install",
        };
        formatter.write_str(name)
    }
}

/// Server IDs and application-wide resources are different lock namespaces.
/// A legacy server ID can therefore never alias a runtime installation lock.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum OperationScope {
    Server(String),
    Global(GlobalOperation),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum GlobalOperation {
    JavaRuntime,
    NgrokRuntime,
}

/// Application-wide operation coordinator.
///
/// The renderer may prevent duplicate clicks for UX, but this state is the
/// authoritative boundary shared by manual, automatic, and direct IPC calls.
#[derive(Clone, Default)]
pub struct ServerOperationManager {
    // Keep weak references so one-off/invalid server IDs do not permanently
    // grow this process-wide registry. Active and queued guards own the Arc.
    locks: Arc<Mutex<HashMap<OperationScope, Weak<Mutex<()>>>>>,
}

pub struct OperationGuard {
    _scope: OperationScope,
    _kind: OperationKind,
    _guard: OwnedMutexGuard<()>,
}

impl ServerOperationManager {
    pub async fn acquire(
        &self,
        server_id: &str,
        kind: OperationKind,
    ) -> Result<OperationGuard, String> {
        self.acquire_scope(OperationScope::Server(server_id.to_string()), kind)
            .await
    }

    pub async fn acquire_global(
        &self,
        operation: GlobalOperation,
        kind: OperationKind,
    ) -> Result<OperationGuard, String> {
        self.acquire_scope(OperationScope::Global(operation), kind)
            .await
    }

    async fn acquire_scope(
        &self,
        scope: OperationScope,
        kind: OperationKind,
    ) -> Result<OperationGuard, String> {
        let scope = match scope {
            OperationScope::Server(server_id) => {
                let normalized_id = server_id.trim();
                if normalized_id.is_empty() {
                    return Err("Server ID is empty".to_string());
                }
                OperationScope::Server(normalized_id.to_string())
            }
            scope => scope,
        };

        let lock = {
            let mut locks = self.locks.lock().await;
            locks.retain(|_, lock| lock.strong_count() > 0);
            if let Some(lock) = locks.get(&scope).and_then(Weak::upgrade) {
                lock
            } else {
                let lock = Arc::new(Mutex::new(()));
                locks.insert(scope.clone(), Arc::downgrade(&lock));
                lock
            }
        };

        let guard = lock.lock_owned().await;
        Ok(OperationGuard {
            _scope: scope,
            _kind: kind,
            _guard: guard,
        })
    }

    pub async fn acquire_many(
        &self,
        server_ids: impl IntoIterator<Item = &str>,
        kind: OperationKind,
    ) -> Result<Vec<OperationGuard>, String> {
        self.acquire_scopes(
            server_ids
                .into_iter()
                .map(|id| OperationScope::Server(id.to_string())),
            kind,
        )
        .await
    }

    pub async fn acquire_scopes(
        &self,
        scopes: impl IntoIterator<Item = OperationScope>,
        kind: OperationKind,
    ) -> Result<Vec<OperationGuard>, String> {
        let mut scopes = scopes
            .into_iter()
            .map(|scope| match scope {
                OperationScope::Server(id) if id.trim().is_empty() => {
                    Err("Server ID is empty".to_string())
                }
                OperationScope::Server(id) => Ok(OperationScope::Server(id.trim().to_string())),
                scope => Ok(scope),
            })
            .collect::<Result<Vec<_>, _>>()?;
        scopes.sort_unstable();
        scopes.dedup();

        let mut guards = Vec::with_capacity(scopes.len());
        for scope in scopes {
            guards.push(self.acquire_scope(scope, kind).await?);
        }
        Ok(guards)
    }
}

#[cfg(test)]
mod tests {
    use super::{GlobalOperation, OperationKind, ServerOperationManager};
    use tokio::time::{timeout, Duration};

    #[tokio::test]
    async fn serializes_operations_for_the_same_server() {
        let manager = ServerOperationManager::default();
        let first = manager
            .acquire("server-a", OperationKind::BackupCreate)
            .await
            .expect("first operation should acquire");

        let contender_manager = manager.clone();
        let contender = tokio::spawn(async move {
            contender_manager
                .acquire("server-a", OperationKind::BackupRestore)
                .await
        });

        assert!(timeout(Duration::from_millis(20), contender).await.is_err());
        drop(first);

        let next = timeout(
            Duration::from_secs(1),
            manager.acquire("server-a", OperationKind::BackupRestore),
        )
        .await
        .expect("second operation should not remain blocked")
        .expect("second operation should acquire");
        drop(next);
    }

    #[tokio::test]
    async fn allows_independent_servers_to_progress() {
        let manager = ServerOperationManager::default();
        let first = manager
            .acquire("server-a", OperationKind::Start)
            .await
            .expect("first operation should acquire");

        let second = timeout(
            Duration::from_secs(1),
            manager.acquire("server-b", OperationKind::Start),
        )
        .await
        .expect("independent server should not be blocked")
        .expect("independent operation should acquire");

        drop(second);
        drop(first);
    }

    #[tokio::test]
    async fn global_java_lock_does_not_collide_with_legacy_server_id() {
        let manager = ServerOperationManager::default();
        let global = manager
            .acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall)
            .await
            .expect("global Java lock should acquire");

        let server = timeout(
            Duration::from_secs(1),
            manager.acquire("java-runtime", OperationKind::Start),
        )
        .await
        .expect("a server ID must not share the global Java lock")
        .expect("server lock should acquire");

        assert!(timeout(
            Duration::from_millis(20),
            manager.acquire_global(GlobalOperation::JavaRuntime, OperationKind::ArtifactInstall),
        )
        .await
        .is_err());
        drop(server);
        drop(global);
    }

    #[tokio::test]
    async fn acquires_multiple_server_locks_in_stable_order() {
        let manager = ServerOperationManager::default();
        let guards = manager
            .acquire_many(
                ["server-b", "server-a", "server-a"],
                OperationKind::FileMutation,
            )
            .await
            .expect("multiple operation locks should acquire");
        assert_eq!(guards.len(), 2);

        let contender_manager = manager.clone();
        let contender = tokio::spawn(async move {
            contender_manager
                .acquire("server-a", OperationKind::BackupCreate)
                .await
        });
        assert!(timeout(Duration::from_millis(20), contender).await.is_err());
    }

    #[tokio::test]
    async fn prunes_locks_after_sequential_server_id_churn() {
        let manager = ServerOperationManager::default();
        for index in 0..1_000 {
            let guard = manager
                .acquire(
                    &format!("unregistered-{index}"),
                    OperationKind::FileMutation,
                )
                .await
                .expect("lock should be acquired");
            drop(guard);
        }

        let locks = manager.locks.lock().await;
        assert!(
            locks.len() <= 1,
            "stale lock entries were retained: {}",
            locks.len()
        );
    }
}
