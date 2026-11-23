use super::*;
use crate::test_http::{LoopbackServer, Route};
use sha2::{Digest, Sha256};

struct Fixture {
    _dir: tempfile::TempDir,
    data: PathBuf,
    store: Arc<dyn JavaRegistryStore>,
    operations: ServerOperationManager,
    servers: ServerManager,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().unwrap();
        let data = dir.path().canonicalize().unwrap().join("data");
        std::fs::create_dir_all(&data).unwrap();
        Self {
            store: Arc::new(ConfigJavaRegistry::new(&data)),
            _dir: dir,
            data,
            operations: ServerOperationManager::default(),
            servers: ServerManager::default(),
        }
    }

    fn context(&self) -> JavaContext<'_> {
        JavaContext {
            data_dir: &self.data,
            store: self.store.clone(),
            operations: &self.operations,
            servers: &self.servers,
        }
    }

    fn entries(&self) -> Vec<JavaVersion> {
        registry::read_java_versions(self.store.as_ref()).unwrap()
    }
}

fn jdk_archive(release: &str) -> Vec<u8> {
    let mut builder = tar::Builder::new(flate2::write::GzEncoder::new(
        Vec::new(),
        flate2::Compression::default(),
    ));
    let mut add = |path: &str, body: &[u8], mode: u32| {
        let mut header = tar::Header::new_gnu();
        header.set_size(body.len() as u64);
        header.set_mode(mode);
        header.set_entry_type(tar::EntryType::Regular);
        builder.append_data(&mut header, path, body).unwrap();
    };
    // `java.exe` on Windows, where the runtime is only available under that name.
    add(
        &format!("jdk-21.0.5+11/bin/{}", super::probe::executable_name()),
        b"#!/bin/sh\n",
        0o755,
    );
    add(
        "jdk-21.0.5+11/release",
        format!("IMPLEMENTOR=\"Eclipse Adoptium\"\nJAVA_VERSION=\"{release}\"\n").as_bytes(),
        0o644,
    );
    builder.into_inner().unwrap().finish().unwrap()
}

fn package_for(server: &LoopbackServer, body: &[u8], sha256: Option<String>) -> JavaPackage {
    JavaPackage {
        url: server.url("/jdk.tar.gz"),
        sha256: sha256.unwrap_or_else(|| format!("{:x}", Sha256::digest(body))),
        size: body.len() as u64,
        archive: extract::ArchiveKind::TarGz,
    }
}

fn java_root_entries(fixture: &Fixture) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(managed_java_root(&fixture.data))
        .map(|entries| {
            entries
                .flatten()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

#[tokio::test]
async fn install_downloads_verifies_extracts_and_registers_from_loopback() {
    let fixture = Fixture::new();
    let body = jdk_archive("21.0.5");
    let server = LoopbackServer::start(vec![Route::bytes("/jdk.tar.gz", body.clone())], 1);
    let package = package_for(&server, &body, None);
    let mut phases = Vec::new();
    let installed = install_package_locked(&fixture.context(), 21, &package, None, |event| {
        if phases.last() != Some(&event.phase) {
            phases.push(event.phase);
        }
        assert_eq!(event.total, body.len() as u64);
    })
    .await
    .unwrap();
    server.finish();

    assert_eq!(
        phases,
        [
            JavaPhase::Download,
            JavaPhase::Verify,
            JavaPhase::Extract,
            JavaPhase::Install
        ]
    );
    let home = managed_install_dir(&fixture.data, 21).join("jdk-21.0.5+11");
    assert_eq!(installed.java_home, home.to_string_lossy());
    assert_eq!(installed.runtime.major, 21);
    assert_eq!(installed.runtime.version.as_deref(), Some("21.0.5"));
    assert_eq!(
        installed.runtime.vendor.as_deref(),
        Some("Eclipse Adoptium")
    );
    assert_eq!(installed.runtime.origin, JavaOrigin::Managed);
    assert!(installed.runtime.available);
    assert_eq!(
        fixture.entries(),
        vec![JavaVersion {
            version: 21,
            path: home.to_string_lossy().into_owned(),
            name: "Java 21".into(),
            is_custom: None,
        }]
    );
    // Only the installed folder remains: no archive, staging or rollback copies.
    assert_eq!(java_root_entries(&fixture), ["jdk-21"]);

    let runtimes = installed_runtimes(fixture.store.clone()).await.unwrap();
    assert_eq!(runtimes, vec![installed.runtime.clone()]);

    // Reinstalling replaces the folder atomically and keeps one entry.
    let body = jdk_archive("21.0.6");
    let server = LoopbackServer::start(vec![Route::bytes("/jdk.tar.gz", body.clone())], 1);
    let package = package_for(&server, &body, None);
    let reinstalled = install_package_locked(&fixture.context(), 21, &package, None, |_| {})
        .await
        .unwrap();
    server.finish();
    assert_eq!(reinstalled.runtime.version.as_deref(), Some("21.0.6"));
    assert_eq!(fixture.entries().len(), 1);
    assert_eq!(java_root_entries(&fixture), ["jdk-21"]);
}

#[tokio::test]
async fn checksum_mismatch_leaves_no_files_and_no_registry_entry() {
    let fixture = Fixture::new();
    let body = jdk_archive("21.0.5");
    // The download is retried once after a failed attempt.
    let server = LoopbackServer::start(vec![Route::bytes("/jdk.tar.gz", body.clone())], 2);
    let package = package_for(&server, &body, Some("0".repeat(64)));
    let error = install_package_locked(&fixture.context(), 21, &package, None, |_| {})
        .await
        .unwrap_err();
    server.finish();
    assert_eq!(error.kind, JavaErrorKind::ChecksumMismatch);
    assert_eq!(error.code(), CoreErrorCode::DownloadChecksumMismatch);
    assert!(fixture.entries().is_empty());
    assert!(java_root_entries(&fixture).is_empty());
}

#[tokio::test]
async fn a_cancelled_install_stops_and_cleans_up() {
    let fixture = Fixture::new();
    let body = jdk_archive("21.0.5");
    let server = LoopbackServer::start(vec![Route::bytes("/jdk.tar.gz", body.clone())], 1);
    let package = package_for(&server, &body, None);
    let cancel = CancelFlag::new();
    cancel.cancel();
    let error = install_package_locked(&fixture.context(), 21, &package, Some(&cancel), |_| {})
        .await
        .unwrap_err();
    drop(server);
    assert_eq!(error.kind, JavaErrorKind::Cancelled);
    assert!(fixture.entries().is_empty());
    assert!(java_root_entries(&fixture).is_empty());

    let error = install(&fixture.context(), 21, Some(&cancel), |_| {})
        .await
        .unwrap_err();
    assert_eq!(error.kind, JavaErrorKind::Cancelled);
    let error = install(&fixture.context(), 0, None, |_| {})
        .await
        .unwrap_err();
    assert_eq!(error.code(), CoreErrorCode::JavaInvalidRequest);
}

#[tokio::test]
async fn delete_removes_managed_folders_and_custom_entries() {
    let fixture = Fixture::new();
    let managed = managed_install_dir(&fixture.data, 17);
    std::fs::create_dir_all(managed.join("bin")).unwrap();
    registry::write_java_versions(
        fixture.store.as_ref(),
        &[
            JavaVersion {
                version: 17,
                path: managed.to_string_lossy().into_owned(),
                name: "Java 17".into(),
                is_custom: None,
            },
            JavaVersion {
                version: 21,
                path: "/Library/Java/JavaVirtualMachines/x/Contents/Home".into(),
                name: "Custom".into(),
                is_custom: Some(true),
            },
            JavaVersion {
                version: 8,
                path: managed_install_dir(&fixture.data, 8)
                    .to_string_lossy()
                    .into_owned(),
                name: "Java 8".into(),
                is_custom: None,
            },
        ],
    )
    .unwrap();

    delete(&fixture.context(), 17).await.unwrap();
    assert!(!managed.exists());
    delete(&fixture.context(), 21).await.unwrap();
    // A managed entry whose folder is already gone can still be removed.
    delete(&fixture.context(), 8).await.unwrap();
    delete(&fixture.context(), 11).await.unwrap();
    assert!(fixture.entries().is_empty());
    assert!(java_root_entries(&fixture).is_empty());
}

#[cfg(unix)]
#[tokio::test]
async fn custom_runtimes_are_probed_validated_and_never_shadow_managed_ones() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new();
    // The launch policy trusts executables below the managed root.
    let home = managed_java_root(&fixture.data).join("custom-17");
    std::fs::create_dir_all(home.join("bin")).unwrap();
    let java = home.join("bin").join("java");
    std::fs::write(
        &java,
        "#!/bin/sh\necho 'openjdk version \"17.0.13\" 2024-10-15' >&2\necho 'OpenJDK Runtime Environment Zulu17.54+21-CA' >&2\n",
    )
    .unwrap();
    std::fs::set_permissions(&java, std::fs::Permissions::from_mode(0o755)).unwrap();

    let runtime = add_custom(&fixture.context(), &home.to_string_lossy())
        .await
        .unwrap();
    assert_eq!(runtime.major, 17);
    assert_eq!(runtime.origin, JavaOrigin::Custom);
    assert_eq!(runtime.version.as_deref(), Some("17.0.13"));
    assert_eq!(runtime.vendor.as_deref(), Some("Azul Zulu"));
    assert_eq!(runtime.name, "Azul Zulu 17.0.13");
    assert_eq!(runtime.path, java.canonicalize().unwrap().to_string_lossy());
    assert!(runtime.available);
    assert_eq!(fixture.entries()[0].is_custom, Some(true));

    // Re-adding replaces the custom entry.
    add_custom(&fixture.context(), &java.to_string_lossy())
        .await
        .unwrap();
    assert_eq!(fixture.entries().len(), 1);

    // A managed Java 17 is never replaced by a custom one.
    registry::write_java_versions(
        fixture.store.as_ref(),
        &[JavaVersion {
            version: 17,
            path: "/managed/jdk-17".into(),
            name: "Java 17".into(),
            is_custom: None,
        }],
    )
    .unwrap();
    let error = add_custom(&fixture.context(), &java.to_string_lossy())
        .await
        .unwrap_err();
    assert_eq!(error.kind, JavaErrorKind::Duplicate);

    for (path, kind) in [
        ("", JavaErrorKind::InvalidRequest),
        ("java", JavaErrorKind::InvalidExecutable),
        ("/tmp/definitely-not-java", JavaErrorKind::InvalidExecutable),
    ] {
        assert_eq!(
            add_custom(&fixture.context(), path).await.unwrap_err().kind,
            kind,
            "{path}"
        );
    }
}

#[tokio::test]
async fn profile_compatibility_uses_the_registered_runtime_and_the_table() {
    let fixture = Fixture::new();
    let home = managed_install_dir(&fixture.data, 17).join("jdk-17");
    std::fs::create_dir_all(home.join("bin")).unwrap();
    std::fs::write(home.join("release"), "JAVA_VERSION=\"17.0.13\"\n").unwrap();
    registry::write_java_versions(
        fixture.store.as_ref(),
        &[JavaVersion {
            version: 17,
            path: home.to_string_lossy().into_owned(),
            name: "Java 17".into(),
            is_custom: None,
        }],
    )
    .unwrap();
    let mut server: MinecraftServer = serde_json::from_value(serde_json::json!({
        "id": "s1", "name": "S", "version": "1.20.4", "software": "Paper",
        "port": 25565, "memory": 1024, "path": "/x",
        "javaPath": home.to_string_lossy()
    }))
    .unwrap();
    let report = profile_compatibility(&fixture.data, fixture.store.clone(), &server).await;
    assert_eq!(
        report.required,
        Some(JavaRequirement {
            major: 17,
            source: RequirementSource::Table
        })
    );
    assert_eq!(report.configured_major, Some(17));
    assert_eq!(report.configured_version.as_deref(), Some("17.0.13"));
    assert_eq!(report.satisfied, Some(true));

    server.version = "1.21.4".into();
    let report = profile_compatibility(&fixture.data, fixture.store.clone(), &server).await;
    assert_eq!(report.satisfied, Some(false));

    server.software = "Velocity".into();
    let report = profile_compatibility(&fixture.data, fixture.store.clone(), &server).await;
    assert_eq!(report.required, None);
    assert_eq!(report.satisfied, None);
}

#[test]
fn releases_are_newest_first_and_marked_installed() {
    let installed = vec![JavaVersion {
        version: 21,
        path: "/j".into(),
        name: "Java 21".into(),
        is_custom: Some(true),
    }];
    let merged = merge_releases(&[8, 17, 21, 25], &installed, true);
    assert!(merged.offline);
    assert_eq!(
        merged.releases,
        vec![
            JavaRelease {
                major: 25,
                installed: false
            },
            JavaRelease {
                major: 21,
                installed: true
            },
            JavaRelease {
                major: 17,
                installed: false
            },
            JavaRelease {
                major: 8,
                installed: false
            },
        ]
    );
}
