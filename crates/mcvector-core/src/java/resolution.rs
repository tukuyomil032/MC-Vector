use std::cmp::Reverse;
use std::future::Future;
use std::path::Path;
use std::sync::Arc;

use super::{
    installed_runtimes, probe, required_java, JavaOrigin, JavaRegistryStore, JavaRequirement,
    JavaRuntime,
};
use crate::registry::MinecraftServer;

/// A profile value that explicitly selects Java from PATH.
pub const SYSTEM_JAVA_SENTINEL: &str = "system";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum JavaSelectionReason {
    Exact,
    NewerMajor,
    NewestAvailable,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum JavaSelection {
    Installed {
        path: String,
        major: u16,
        version: Option<String>,
        origin: JavaOrigin,
        reason: JavaSelectionReason,
    },
    System {
        major: Option<u16>,
    },
    Explicit {
        path: String,
    },
    SystemDefault,
    Missing {
        required: u16,
        system_major: Option<u16>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct JavaResolution {
    pub required_major: Option<u16>,
    pub choice: JavaSelection,
}

impl JavaResolution {
    /// The configured candidate for launch, with PATH as the fallback
    /// even when Java is missing or below the required major.
    pub fn launch_path(&self) -> &str {
        match &self.choice {
            JavaSelection::Installed { path, .. } | JavaSelection::Explicit { path } => path,
            _ => "java",
        }
    }
}

/// Resolves the profile and reports the Minecraft requirement, if known.
pub async fn resolve_java_for_server(
    store: Arc<dyn JavaRegistryStore>,
    server: &MinecraftServer,
) -> JavaResolution {
    let required = required_java(&server.software, &server.version).await;
    resolve_java_with_requirement(store, server, required).await
}

/// Determines the requirement before the launch path takes the Java lock.
pub(crate) async fn java_requirement_for_launch(
    server: &MinecraftServer,
) -> Option<JavaRequirement> {
    if configured_selection(server.java_path.as_deref()).is_some() {
        return None;
    }
    required_java(&server.software, &server.version).await
}

pub(crate) async fn resolve_java_with_requirement(
    store: Arc<dyn JavaRegistryStore>,
    server: &MinecraftServer,
    required: Option<JavaRequirement>,
) -> JavaResolution {
    let required_major = required.map(|requirement| requirement.major);
    let (choice, _) = resolve_selection(store, server.java_path.as_deref(), required_major).await;
    JavaResolution {
        required_major,
        choice,
    }
}

fn configured_selection(path: Option<&str>) -> Option<JavaSelection> {
    match path.filter(|path| !path.trim().is_empty())? {
        SYSTEM_JAVA_SENTINEL => Some(JavaSelection::SystemDefault),
        path => Some(JavaSelection::Explicit {
            path: path.to_owned(),
        }),
    }
}

pub(super) async fn resolve_selection(
    store: Arc<dyn JavaRegistryStore>,
    configured: Option<&str>,
    required: Option<u16>,
) -> (JavaSelection, SystemJava) {
    if let Some(choice) = configured_selection(configured) {
        return (choice, SystemJava::default());
    }
    automatic_selection(
        required,
        async {
            match installed_runtimes(store).await {
                Ok(runtimes) => runtimes,
                Err(error) => {
                    log::debug!("Could not read installed Java runtimes: {error}");
                    Vec::new()
                }
            }
        },
        system_java(),
    )
    .await
}

async fn automatic_selection(
    required: Option<u16>,
    registry: impl Future<Output = Vec<JavaRuntime>>,
    probe_system: impl Future<Output = SystemJava>,
) -> (JavaSelection, SystemJava) {
    if let Some(required) = required {
        let runtimes = registry.await;
        let installed = runtimes
            .into_iter()
            .filter(|runtime| runtime.available && runtime.major >= required)
            .min_by_key(|runtime| runtime.major);
        if let Some(runtime) = installed {
            let reason = if runtime.major == required {
                JavaSelectionReason::Exact
            } else {
                JavaSelectionReason::NewerMajor
            };
            return (installed_selection(runtime, reason), SystemJava::default());
        }
        let system = probe_system.await;
        let choice = match system.major {
            Some(major) if major >= required => JavaSelection::System { major: Some(major) },
            system_major => JavaSelection::Missing {
                required,
                system_major,
            },
        };
        return (choice, system);
    }

    let system = probe_system.await;
    if !system.present {
        let installed = registry
            .await
            .into_iter()
            .filter(|runtime| runtime.available)
            .min_by_key(|runtime| Reverse(runtime.major));
        if let Some(runtime) = installed {
            let choice = installed_selection(runtime, JavaSelectionReason::NewestAvailable);
            return (choice, system);
        }
    }
    (
        JavaSelection::System {
            major: system.major,
        },
        system,
    )
}

fn installed_selection(runtime: JavaRuntime, reason: JavaSelectionReason) -> JavaSelection {
    JavaSelection::Installed {
        path: runtime.path,
        major: runtime.major,
        version: runtime.version,
        origin: runtime.origin,
        reason,
    }
}

#[derive(Default)]
pub(super) struct SystemJava {
    present: bool,
    pub major: Option<u16>,
    pub version: Option<String>,
}

/// Probes PATH. On macOS, check for a JDK before running the Java stub,
/// since that stub can open an install prompt.
pub(super) async fn system_java() -> SystemJava {
    if cfg!(target_os = "macos") {
        let has_jdk = tokio::time::timeout(
            probe::PROBE_TIMEOUT,
            tokio::process::Command::new("/usr/libexec/java_home")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true)
                .status(),
        )
        .await
        .ok()
        .and_then(Result::ok)
        .is_some_and(|status| status.success());
        if !has_jdk {
            return SystemJava::default();
        }
    }
    match probe::probe_available_executable(
        Path::new(probe::executable_name()),
        probe::PROBE_TIMEOUT,
    )
    .await
    {
        Ok(Some(probed)) => SystemJava {
            present: true,
            major: Some(probed.major),
            version: Some(probed.version),
        },
        Ok(None) => SystemJava {
            present: true,
            ..SystemJava::default()
        },
        Err(_) => SystemJava::default(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use JavaSelection::{Installed, Missing, System};
    use JavaSelectionReason::{Exact, NewerMajor, NewestAvailable};

    fn runtime(major: u16, origin: JavaOrigin, available: bool) -> JavaRuntime {
        JavaRuntime {
            major,
            origin,
            available,
            name: format!("Java {major}"),
            path: format!("/jdk-{major}"),
            executable: format!("/jdk-{major}/bin/java"),
            vendor: None,
            version: Some(format!("{major}.0.1")),
        }
    }

    fn installed(major: u16, origin: JavaOrigin, reason: JavaSelectionReason) -> JavaSelection {
        Installed {
            major,
            origin,
            reason,
            path: format!("/jdk-{major}"),
            version: Some(format!("{major}.0.1")),
        }
    }

    #[tokio::test]
    async fn automatic_selection_priorities() {
        use JavaOrigin::{Custom, Managed};

        let old = runtime(17, Managed, true);
        let exact = runtime(21, Custom, true);
        let newer = runtime(23, Managed, true);
        let newest = runtime(25, Custom, true);
        let unavailable = runtime(21, Managed, false);
        for (required, runtimes, system_major, expected) in [
            (
                Some(21),
                vec![newest.clone(), exact.clone()],
                Some(21),
                installed(21, Custom, Exact),
            ),
            (
                Some(21),
                vec![newest.clone(), unavailable, newer],
                Some(21),
                installed(23, Managed, NewerMajor),
            ),
            (
                Some(21),
                vec![old.clone()],
                Some(17),
                Missing {
                    required: 21,
                    system_major: Some(17),
                },
            ),
            (
                Some(21),
                vec![old.clone()],
                None,
                Missing {
                    required: 21,
                    system_major: None,
                },
            ),
            (
                Some(21),
                vec![old.clone()],
                Some(21),
                System { major: Some(21) },
            ),
            (Some(21), vec![], Some(25), System { major: Some(25) }),
            (
                None,
                vec![newest.clone()],
                Some(17),
                System { major: Some(17) },
            ),
            (
                None,
                vec![old, newest, exact, runtime(30, Managed, false)],
                None,
                installed(25, Custom, NewestAvailable),
            ),
            (None, vec![], None, System { major: None }),
        ] {
            let system = SystemJava {
                present: system_major.is_some(),
                major: system_major,
                version: None,
            };
            let (choice, _) =
                automatic_selection(required, async { runtimes }, async { system }).await;
            assert_eq!(choice, expected);
        }
    }

    #[tokio::test]
    async fn no_requirement_prefers_present_system_java_with_unknown_major() {
        let (choice, _) = automatic_selection(
            None,
            async { panic!("the registry should not be consulted") },
            async {
                SystemJava {
                    present: true,
                    ..Default::default()
                }
            },
        )
        .await;
        assert_eq!(choice, System { major: None });
    }

    #[test]
    fn configured_selection_preserves_explicit_paths_and_recognizes_automatic() {
        for path in [None, Some(""), Some("  ")] {
            assert_eq!(configured_selection(path), None);
        }
        assert_eq!(
            configured_selection(Some(SYSTEM_JAVA_SENTINEL)),
            Some(JavaSelection::SystemDefault)
        );
        for path in ["java", "java.exe", "/jdk-21/bin/java"] {
            assert_eq!(
                configured_selection(Some(path)),
                Some(JavaSelection::Explicit {
                    path: path.to_owned()
                })
            );
        }
    }
}
