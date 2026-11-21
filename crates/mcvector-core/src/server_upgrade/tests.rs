use super::*;
use crate::test_http::{client, LoopbackServer, Route};
use reqwest::Url;
use sha2::{Digest, Sha256};
use std::path::PathBuf;

struct Fixture {
    _dir: tempfile::TempDir,
    data: PathBuf,
    registry: ServerRegistry,
    server_dir: PathBuf,
}

impl Fixture {
    fn new(software: &str, version: &str) -> Self {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().canonicalize().unwrap();
        let server_dir = data.join("servers").join("server-id");
        std::fs::create_dir_all(&server_dir).unwrap();
        std::fs::write(server_dir.join("server.jar"), b"old server jar").unwrap();
        std::fs::write(
            data.join("servers.json"),
            serde_json::to_vec(&serde_json::json!({
                "servers": [{
                    "id": "server-id",
                    "name": "Upgrade server",
                    "version": version,
                    "software": software,
                    "port": 25565,
                    "memory": 2048,
                    "path": server_dir.to_string_lossy()
                }]
            }))
            .unwrap(),
        )
        .unwrap();
        let registry = ServerRegistry::open(&data).unwrap();
        Self {
            _dir: dir,
            data,
            registry,
            server_dir,
        }
    }

    fn server(&self) -> MinecraftServer {
        self.registry.get_servers().unwrap().remove(0)
    }

    fn plan(&self, checksum: Option<ExpectedChecksum>) -> StoredPlan {
        let server = self.server();
        StoredPlan {
            server_id: server.id,
            software: server.software,
            source_version: server.version,
            detected_source_version: None,
            target_software: "Paper".into(),
            target_version: "1.21.4".into(),
            url: "https://fill-data.papermc.io/v1/objects/x/paper.jar".into(),
            checksum,
            expires_at: Instant::now() + PLAN_TTL,
        }
    }

    fn bootstrap_files(&self) {
        for path in [
            "versions/1.20.4/old.jar",
            "versions/1.21.4/new.jar",
            "cache/mojang_1.20.4.jar",
            "world/level.dat",
            "plugins/plugin.jar",
            "libraries/library.jar",
            "mods/mod.jar",
            "server.properties",
        ] {
            let path = self.server_dir.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, b"fixture").unwrap();
        }
    }

    fn files(&self) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(&self.server_dir)
            .unwrap()
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }
}

async fn fetch_json(url: Url) -> Result<serde_json::Value, String> {
    let response = client()
        .get(url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

#[tokio::test]
async fn provider_version_lists_are_read_from_loopback() {
    let server = LoopbackServer::start(
        vec![
            Route::json(
                "/v2/projects/paper",
                serde_json::json!({"versions": ["1.20.6", "1.21.3", "1.21.4"]}),
            ),
            Route::json(
                "/mc/game/version_manifest_v2.json",
                serde_json::json!({"versions": [
                    {"id": "24w14a", "type": "snapshot"},
                    {"id": "1.21.4", "type": "release"},
                    {"id": "1.21.3", "type": "release"}
                ]}),
            ),
            Route::json(
                "/v2/versions/game",
                serde_json::json!([
                    {"version": "1.21.4", "stable": true},
                    {"version": "1.21.5-rc1", "stable": false}
                ]),
            ),
        ],
        // Paper: Fill (404) then the v2 fallback; Vanilla; Fabric.
        4,
    );
    let base = server.base.clone();
    let fetch = |url: Url| {
        let local = Url::parse(&format!("{base}{}", url.path())).unwrap();
        fetch_json(local)
    };
    assert_eq!(
        server_jar::available_versions_with("Paper", fetch)
            .await
            .unwrap(),
        Some(vec![
            "1.20.6".to_owned(),
            "1.21.3".to_owned(),
            "1.21.4".to_owned()
        ])
    );
    assert_eq!(
        server_jar::available_versions_with("Vanilla", fetch)
            .await
            .unwrap(),
        Some(vec!["1.21.4".to_owned(), "1.21.3".to_owned()])
    );
    assert_eq!(
        server_jar::available_versions_with("Fabric", fetch)
            .await
            .unwrap(),
        Some(vec!["1.21.4".to_owned()])
    );
    assert_eq!(
        server_jar::available_versions_with("Spigot", fetch)
            .await
            .unwrap(),
        None
    );
    let seen = server.finish();
    assert_eq!(seen[0], "/v3/projects/paper");
    assert_eq!(seen[1], "/v2/projects/paper");
}

#[test]
fn candidates_include_older_and_newer_releases_with_notes_and_java() {
    let fixture = Fixture::new("Paper", "1.20.4");
    let server = fixture.server();
    let listed = candidates_from(
        &server,
        "Paper",
        &server.version,
        Some(
            ["1.20.4", "1.20.6", "1.21.4", "1.21.4-pre1", "1.19.4"]
                .map(String::from)
                .to_vec(),
        ),
    );
    assert!(listed.supported);
    assert_eq!(listed.current_version, "1.20.4");
    assert_eq!(
        listed.candidates,
        vec![
            UpgradeCandidate {
                version: "1.21.4".into(),
                latest: true,
                newer: true,
                release_notes_url: release_notes_url("Paper", "1.21.4"),
                required_java: Some(21),
            },
            UpgradeCandidate {
                version: "1.20.6".into(),
                latest: false,
                newer: true,
                release_notes_url: release_notes_url("Paper", "1.20.6"),
                required_java: Some(21),
            },
            UpgradeCandidate {
                version: "1.19.4".into(),
                latest: false,
                newer: false,
                release_notes_url: release_notes_url("Paper", "1.19.4"),
                required_java: Some(17),
            },
        ]
    );

    let mut fabric = server.clone();
    fabric.software = "Fabric".into();
    let listed = candidates_from(
        &fabric,
        "Fabric",
        &fabric.version,
        Some(vec!["1.21.4".into()]),
    );
    assert!(!listed.supported);
    assert_eq!(listed.candidates.len(), 1);

    let mut spigot = server;
    spigot.software = "Spigot".into();
    let listed = candidates_from(&spigot, "Spigot", &spigot.version, None);
    assert!(!listed.supported);
    assert!(listed.candidates.is_empty());
}

#[tokio::test]
async fn execute_refuses_missing_unverified_running_and_changed_plans() {
    let fixture = Fixture::new("Paper", "1.20.4");
    let upgrader = ServerJarUpgrader::default();
    let operations = ServerOperationManager::default();
    let servers = ServerManager::default();
    let execute = |plan_id: &'static str| {
        let upgrader = upgrader.clone();
        let operations = operations.clone();
        let servers = servers.clone();
        let data = fixture.data.clone();
        let registry = fixture.registry.clone();
        async move {
            upgrader
                .execute(
                    &data,
                    &registry,
                    &operations,
                    &servers,
                    plan_id,
                    None,
                    |_| {},
                )
                .await
                .unwrap_err()
                .kind
        }
    };

    assert_eq!(execute("missing").await, UpgradeErrorKind::PlanExpired);

    upgrader
        .plans()
        .insert("unverified".into(), fixture.plan(None));
    assert_eq!(
        upgrader.plan_server("unverified").as_deref(),
        Some("server-id")
    );
    assert_eq!(execute("unverified").await, UpgradeErrorKind::Unverified);
    // A plan is consumed by its first execute.
    assert_eq!(execute("unverified").await, UpgradeErrorKind::PlanExpired);

    let mut expired = fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64))));
    expired.expires_at = Instant::now() - Duration::from_secs(1);
    upgrader.plans().insert("expired".into(), expired);
    assert_eq!(execute("expired").await, UpgradeErrorKind::PlanExpired);

    let mut changed = fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64))));
    changed.source_version = "1.19.4".into();
    upgrader.plans().insert("changed".into(), changed);
    assert_eq!(execute("changed").await, UpgradeErrorKind::ProfileChanged);

    let _running = servers
        .install_test_running_server_for_stop_recovery("server-id")
        .await;
    upgrader.plans().insert(
        "running".into(),
        fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64)))),
    );
    assert_eq!(execute("running").await, UpgradeErrorKind::Running);

    assert_eq!(fixture.files(), ["server.jar"]);
    assert_eq!(
        std::fs::read(fixture.server_dir.join("server.jar")).unwrap(),
        b"old server jar"
    );
}

fn staged_jar(fixture: &Fixture, body: &[u8], sha1: bool) -> download::VerifiedArtifact {
    let path = fixture
        .server_dir
        .join(format!(".server.jar-verified-{}.part", Uuid::new_v4()));
    std::fs::write(&path, body).unwrap();
    let checksum = if sha1 {
        // Any 40-character value stands in for Mojang's SHA-1.
        "b".repeat(40)
    } else {
        format!("{:x}", Sha256::digest(body))
    };
    download::VerifiedArtifact {
        path,
        checksum,
        size: body.len() as u64,
    }
}

#[tokio::test]
async fn a_verified_jar_is_swapped_in_and_the_registry_version_updated() {
    for sha1 in [false, true] {
        let fixture = Fixture::new("Paper", "1.20.4");
        let mut plan = fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64))));
        plan.target_software = "LeafMC".into();
        fixture.bootstrap_files();
        let (destination, managed_root) =
            server_jar::server_jar_path(&fixture.data, "server-id").unwrap();
        let mut server = fixture.server();
        let mut phases = Vec::new();
        let result = commit_verified(
            &fixture.registry,
            &mut server,
            &plan,
            staged_jar(&fixture, b"new server jar", sha1),
            destination.clone(),
            managed_root,
            None,
            |event| phases.push(event.phase),
            None,
        )
        .await
        .unwrap();
        assert_eq!(
            result,
            UpgradeResult {
                server_id: "server-id".into(),
                previous_version: "1.20.4".into(),
                previous_software: "Paper".into(),
                software: "LeafMC".into(),
                version: "1.21.4".into(),
            }
        );
        assert_eq!(phases, [UpgradePhase::Verify, UpgradePhase::Install]);
        assert_eq!(std::fs::read(&destination).unwrap(), b"new server jar");
        assert_eq!(fixture.server().version, "1.21.4");
        assert!(fixture.registry.recovery_records().unwrap().is_empty());
        assert_eq!(fixture.server().software, "LeafMC");
        assert!(!fixture.server_dir.join("versions/1.20.4").exists());
        assert!(!fixture.server_dir.join("cache/mojang_1.20.4.jar").exists());
        for path in [
            "versions/1.21.4/new.jar",
            "world/level.dat",
            "plugins/plugin.jar",
            "libraries/library.jar",
            "mods/mod.jar",
            "server.properties",
        ] {
            assert!(fixture.server_dir.join(path).exists(), "{path}");
        }
    }
}

#[tokio::test]
async fn cancelling_before_the_swap_keeps_the_old_jar() {
    let fixture = Fixture::new("Paper", "1.20.4");
    let plan = fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64))));
    let (destination, managed_root) =
        server_jar::server_jar_path(&fixture.data, "server-id").unwrap();
    fixture.bootstrap_files();
    let cancel = CancelFlag::new();
    let mut server = fixture.server();
    let error = commit_verified(
        &fixture.registry,
        &mut server,
        &plan,
        staged_jar(&fixture, b"new server jar", false),
        destination.clone(),
        managed_root,
        Some(&cancel),
        |event| {
            if event.phase == UpgradePhase::Install {
                cancel.cancel();
            }
        },
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::Cancelled);
    assert_eq!(error.code(), CoreErrorCode::OperationCancelled);
    assert_eq!(std::fs::read(&destination).unwrap(), b"old server jar");
    assert_eq!(fixture.server().version, "1.20.4");
    assert!(fixture.server_dir.join("versions/1.20.4/old.jar").exists());
    assert!(fixture.server_dir.join("cache/mojang_1.20.4.jar").exists());
}

#[tokio::test]
async fn a_failed_swap_keeps_the_old_jar_profile_and_leftovers() {
    let fixture = Fixture::new("Paper", "1.20.4");
    let mut plan = fixture.plan(Some(ExpectedChecksum::sha256("a".repeat(64))));
    // The installed jar no longer matches what prepare detected.
    plan.detected_source_version = Some("1.19.4".into());
    let (destination, managed_root) =
        server_jar::server_jar_path(&fixture.data, "server-id").unwrap();
    fixture.bootstrap_files();
    let mut server = fixture.server();
    let error = commit_verified(
        &fixture.registry,
        &mut server,
        &plan,
        staged_jar(&fixture, b"new server jar", false),
        destination.clone(),
        managed_root,
        None,
        |_| {},
        None,
    )
    .await
    .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::ProfileChanged);
    assert_eq!(std::fs::read(&destination).unwrap(), b"old server jar");
    assert_eq!(fixture.server().version, "1.20.4");
    assert_eq!(fixture.server().software, "Paper");
    assert!(fixture.registry.recovery_records().unwrap().is_empty());
    assert!(fixture.server_dir.join("versions/1.20.4/old.jar").exists());
    assert!(fixture.server_dir.join("cache/mojang_1.20.4.jar").exists());
    assert!(!fixture
        .files()
        .iter()
        .any(|name| name.starts_with(".server.jar-verified-")));
}

#[tokio::test]
async fn prepare_rejects_downgrades_and_unknown_servers_without_network() {
    let fixture = Fixture::new("Paper", "1.21.4");
    let upgrader = ServerJarUpgrader::default();
    let servers = ServerManager::default();
    let error = upgrader
        .prepare(
            &fixture.data,
            &fixture.registry,
            &servers,
            "server-id",
            Some("1.20.4"),
            None,
            false,
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::InvalidRequest);
    let error = upgrader
        .prepare(
            &fixture.data,
            &fixture.registry,
            &servers,
            "missing",
            None,
            None,
            false,
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::NotFound);
    let error = upgrader
        .prepare(
            &fixture.data,
            &fixture.registry,
            &servers,
            "../x",
            None,
            None,
            false,
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::InvalidRequest);

    let fixture = Fixture::new("Spigot", "1.21.4");
    let error = upgrader
        .prepare(
            &fixture.data,
            &fixture.registry,
            &servers,
            "server-id",
            None,
            None,
            false,
            false,
        )
        .await
        .unwrap_err();
    assert_eq!(error.kind, UpgradeErrorKind::Unsupported);
    assert_eq!(error.code(), CoreErrorCode::ServerJarUnsupported);
}

#[tokio::test]
async fn prepare_only_resolves_compatible_targets_and_passes_opt_ins() {
    let fixture = Fixture::new("Paper", "1.21.4");
    let upgrader = ServerJarUpgrader::default();
    let servers = ServerManager::default();
    let rejected = upgrader
        .prepare(
            &fixture.data,
            &fixture.registry,
            &servers,
            "server-id",
            Some("1.21.4"),
            Some("Vanilla"),
            true,
            true,
        )
        .await
        .unwrap_err();
    assert_eq!(rejected.kind, UpgradeErrorKind::InvalidRequest);

    for allow_unstable in [false, true] {
        let plan = upgrader
            .prepare_with(
                &fixture.data,
                &fixture.registry,
                &servers,
                "server-id",
                Some("1.20.4"),
                Some("LeafMC"),
                allow_unstable,
                true,
                |software, version, latest, unstable| async move {
                    assert_eq!(software, "LeafMC");
                    assert_eq!(version, "1.20.4");
                    assert!(!latest);
                    assert_eq!(unstable, allow_unstable);
                    Ok(unstable.then(|| server_jar::ResolvedArtifact {
                        channel: "experimental".into(),
                        version,
                        url: "unused".into(),
                        checksum: Some(ExpectedChecksum::sha256("a".repeat(64))),
                        file_name: "leaf.jar".into(),
                        size: None,
                    }))
                },
            )
            .await;
        if allow_unstable {
            let plan = plan.unwrap();
            assert!(plan.downgrade && plan.verified);
            assert_eq!(plan.channel, "experimental");
            assert_eq!(
                plan.software_change,
                Some(SoftwareChange {
                    from: "Paper".into(),
                    to: "LeafMC".into()
                })
            );
            assert_eq!(plan.target_version, "1.20.4");
        } else {
            assert_eq!(plan.unwrap_err().kind, UpgradeErrorKind::NotAvailable);
        }
    }
}

#[tokio::test]
async fn detects_version_and_syncs_registry_from_bounded_jar_metadata() {
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    let fixture = Fixture::new("Paper", "1.20.4");
    let jar_path = fixture.server_dir.join("server.jar");
    let write_jar = |name: &str, contents: &[u8]| {
        let mut jar = zip::ZipWriter::new(fs::File::create(&jar_path).unwrap());
        jar.start_file(name, SimpleFileOptions::default()).unwrap();
        jar.write_all(contents).unwrap();
        jar.finish().unwrap();
    };

    write_jar("version.json", &vec![b' '; 64 * 1024 + 1]);
    assert_eq!(detected_version(&fixture.server()), None);
    write_jar(
        "META-INF/versions.list",
        b"hash\t1.21.4\t1.21.4/paper.jar\n",
    );
    assert_eq!(
        detected_version(&fixture.server()).as_deref(),
        Some("1.21.4")
    );
    write_jar("version.json", br#"{"id":"26.1.1","name":"26.1.1"}"#);
    assert_eq!(
        detected_version(&fixture.server()).as_deref(),
        Some("26.1.1")
    );
    let status = version_status(&fixture.data, &fixture.registry, "server-id")
        .await
        .unwrap();
    assert!(status.mismatch);
    assert_eq!(status.registered_version, "1.20.4");
    let status = sync_version_from_jar(
        &fixture.data,
        &fixture.registry,
        &ServerOperationManager::default(),
        "server-id",
    )
    .await
    .unwrap();
    assert!(!status.mismatch);
    assert_eq!(status.registered_version, "26.1.1");
    assert_eq!(fixture.server().version, "26.1.1");
    assert_eq!(fixture.server().software, "Paper");
}
