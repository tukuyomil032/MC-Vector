use std::collections::HashMap;
use std::fmt;
use std::sync::Arc;

use tokio::sync::{Mutex, OwnedMutexGuard};

/// Operations that must not overlap for the same managed server.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OperationKind {
    Start,
    Stop,
    BackupCreate,
    BackupRestore,
    BackupDelete,
    BackupMove,
    FileMutation,
    ArtifactInstall,
}

impl fmt::Display for OperationKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let name = match self {
            Self::Start => "start",
            Self::Stop => "stop",
            Self::BackupCreate => "backup-create",
            Self::BackupRestore => "backup-restore",
            Self::BackupDelete => "backup-delete",
            Self::BackupMove => "backup-move",
            Self::FileMutation => "file-mutation",
            Self::ArtifactInstall => "artifact-install",
        };
        formatter.write_str(name)
    }
}

/// Application-wide operation coordinator.
///
/// The renderer may prevent duplicate clicks for UX, but this state is the
/// authoritative boundary shared by manual, automatic, and direct IPC calls.
#[derive(Clone, Default)]
pub struct ServerOperationManager {
    locks: Arc<Mutex<HashMap<String, Arc<Mutex<()>>>>>,
}

pub struct OperationGuard {
    _server_id: String,
    _kind: OperationKind,
    _guard: OwnedMutexGuard<()>,
}

impl ServerOperationManager {
    pub async fn acquire(
        &self,
        server_id: &str,
        kind: OperationKind,
    ) -> Result<OperationGuard, String> {
        let normalized_id = server_id.trim();
        if normalized_id.is_empty() {
            return Err("Server ID is empty".to_string());
        }

        let lock = {
            let mut locks = self.locks.lock().await;
            locks
                .entry(normalized_id.to_string())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };

        let guard = lock.lock_owned().await;
        Ok(OperationGuard {
            _server_id: normalized_id.to_string(),
            _kind: kind,
            _guard: guard,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{OperationKind, ServerOperationManager};
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
}
