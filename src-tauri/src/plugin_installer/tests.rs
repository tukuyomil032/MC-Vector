use super::*;
use std::time::Duration;

struct Temp {
    path: PathBuf,
}
impl Temp {
    fn new() -> Self {
        let path =
            std::env::temp_dir().join(format!("mc-vector-plugin-installer-{}", Uuid::new_v4()));
        fs::create_dir_all(&path).unwrap();
        Self { path }
    }
}
impl Drop for Temp {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn artifact(target: &str, original: Option<&str>, dependency: bool) -> Artifact {
    Artifact {
        preview: ArtifactPreview {
            id: target.into(),
            project: ProjectRef::Modrinth {
                project_id: target.into(),
            },
            title: target.into(),
            version: "1".into(),
            file_name: target.into(),
            installed_file_name: None,
            dependency,
            verified: true,
            compatibility: "compatible".into(),
            supported_versions: vec!["1.21.4".into()],
        },
        provider: "modrinth".into(),
        url: "https://cdn.modrinth.com/a.jar".into(),
        checksum: None,
        original_name: original.map(str::to_owned),
        original_sha256: original.map(|_| format!("{:x}", Sha256::digest(b"old"))),
        identity_candidates: vec![],
    }
}
fn profile(path: &Path) -> MinecraftServer {
    serde_json::from_value(serde_json::json!({"id":"s1","name":"Server","software":"paper","version":"1.21.4","path":path,"port":25565,"memory":2048})).unwrap()
}
fn fixture() -> (Temp, ServerRegistry, MinecraftServer, PathBuf) {
    let temp = Temp::new();
    let root = temp.path.join("servers/s1");
    fs::create_dir_all(&root).unwrap();
    let server = profile(&root);
    let registry = ServerRegistry::open(&temp.path).unwrap();
    registry.add_server(&server).unwrap();
    let directory = directory(&temp.path, &server).unwrap().0;
    fs::create_dir(&directory).unwrap();
    (temp, registry, server, directory)
}
fn plan(server: &MinecraftServer, directory: &Path) -> Plan {
    Plan {
        server_id: server.id.clone(),
        profile: profile_fingerprint(server),
        directory: directory.into(),
        directory_snapshot: snapshot(directory).unwrap(),
        created: Instant::now(),
        artifacts: vec![],
        dependencies: vec!["dependency-v1".into()],
    }
}
fn execute(token: &str, confirmed: &[&str]) -> ExecuteRequest {
    ExecuteRequest {
        token: token.into(),
        confirmed_dependency_ids: confirmed.iter().map(|value| value.to_string()).collect(),
    }
}

#[test]
fn project_refs_and_requests_reject_renderer_artifact_authority() {
    assert!(serde_json::from_value::<PrepareRequest>(serde_json::json!({"serverId":"s1","project":{"provider":"modrinth","projectId":"x"},"url":"https://evil.test/a.jar"})).is_err());
    assert!(serde_json::from_value::<ProjectRef>(
        serde_json::json!({"provider":"modrinth","projectId":"x","checksum":"fake"})
    )
    .is_err());
    assert!(serde_json::from_value::<ExecuteRequest>(serde_json::json!({"token":"t"})).is_err());
}

#[test]
fn required_graph_collapses_cycles_and_duplicates_but_rejects_conflicts() {
    let mut seen = HashMap::new();
    assert!(add_graph_identity(&mut seen, "a", "v1").unwrap());
    assert!(add_graph_identity(&mut seen, "b", "v2").unwrap());
    assert!(!add_graph_identity(&mut seen, "a", "v1").unwrap());
    assert!(!add_graph_identity(&mut seen, "b", "v2").unwrap());
    assert!(add_graph_identity(&mut seen, "a", "v3").is_err());
    for index in 2..MAX_GRAPH {
        assert!(add_graph_identity(&mut seen, &format!("p{index}"), "v").unwrap());
    }
    assert!(add_graph_identity(&mut seen, "overflow", "v").is_err());
}

#[test]
fn expired_and_confirmed_plans_are_one_use_capabilities() {
    let (_temp, _registry, server, directory) = fixture();
    let installer = PluginInstaller::default();
    let mut expired = plan(&server, &directory);
    expired.created = Instant::now() - PLAN_LIFETIME - Duration::from_secs(1);
    installer
        .plans
        .lock()
        .unwrap()
        .insert("expired".into(), expired);
    assert!(installer
        .consume(&execute("expired", &["dependency-v1"]))
        .err()
        .unwrap()
        .contains("expired"));
    installer
        .plans
        .lock()
        .unwrap()
        .insert("valid".into(), plan(&server, &directory));
    assert!(installer.consume(&execute("valid", &[])).is_err());
    assert!(installer
        .consume(&execute("valid", &["dependency-v1"]))
        .is_err());
    installer
        .plans
        .lock()
        .unwrap()
        .insert("valid".into(), plan(&server, &directory));
    assert!(installer
        .consume(&execute("valid", &["dependency-v1", "dependency-v1"]))
        .is_err());
    installer
        .plans
        .lock()
        .unwrap()
        .insert("valid".into(), plan(&server, &directory));
    assert!(installer
        .consume(&execute("valid", &["dependency-v1"]))
        .is_ok());
    assert!(installer
        .consume(&execute("valid", &["dependency-v1"]))
        .is_err());
}

#[test]
fn plans_invalidate_after_profile_or_same_size_artifact_changes() {
    let (temp, registry, mut server, directory) = fixture();
    fs::write(directory.join("old.jar"), b"old").unwrap();
    let prepared = plan(&server, &directory);
    assert!(validate_plan(&prepared, &temp.path, &registry).is_ok());
    fs::write(directory.join("old.jar"), b"NEW").unwrap();
    assert!(validate_plan(&prepared, &temp.path, &registry).is_err());
    fs::write(directory.join("old.jar"), b"old").unwrap();
    server.version = "1.22".into();
    registry.update_server(&server).unwrap();
    assert!(validate_plan(&prepared, &temp.path, &registry).is_err());
}

#[test]
fn failed_dependency_staging_preserves_every_existing_file() {
    let temp = Temp::new();
    fs::write(
        temp.path.join("old.jar.disabled"),
        b"original disabled bytes",
    )
    .unwrap();
    let mut artifacts = vec![
        artifact("new.jar.disabled", Some("old.jar.disabled"), false),
        artifact("dependency.jar", None, true),
    ];
    artifacts[0].original_sha256 = Some(file_sha256(&temp.path.join("old.jar.disabled")).unwrap());
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"verified primary").unwrap();
    // A failed second download (including checksum mismatch) discards private
    // stages before commit; neither the primary nor dependencies are published.
    fs::write(transaction.stage(1), b"rejected dependency bytes").unwrap();
    transaction.discard().unwrap();
    assert_eq!(
        fs::read(temp.path.join("old.jar.disabled")).unwrap(),
        b"original disabled bytes"
    );
    assert!(!temp.path.join("new.jar.disabled").exists());
    assert!(!temp.path.join("dependency.jar").exists());
}

#[test]
fn successful_commit_publishes_all_files_and_preserves_disabled_state() {
    let temp = Temp::new();
    fs::write(temp.path.join("old.jar.disabled"), b"old").unwrap();
    let artifacts = vec![
        artifact("new.jar.disabled", Some("old.jar.disabled"), false),
        artifact("dependency.jar", None, true),
    ];
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"verified primary").unwrap();
    fs::write(transaction.stage(1), b"verified dependency").unwrap();
    assert_eq!(
        transaction.commit().unwrap(),
        vec!["new.jar.disabled", "dependency.jar"]
    );
    assert!(!temp.path.join("old.jar.disabled").exists());
    assert_eq!(
        fs::read(temp.path.join("new.jar.disabled")).unwrap(),
        b"verified primary"
    );
    assert_eq!(fs::read_dir(&temp.path).unwrap().count(), 2);
}

#[test]
fn dependency_commit_failure_restores_previous_filename_and_disabled_bytes() {
    let temp = Temp::new();
    fs::write(temp.path.join("old.jar.disabled"), b"old").unwrap();
    let artifacts = vec![
        artifact("new.jar.disabled", Some("old.jar.disabled"), false),
        artifact("dependency.jar", None, true),
    ];
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"primary").unwrap();
    fs::write(transaction.stage(1), b"dependency").unwrap();
    // Inject a destination failure after all stages have been verified.
    fs::create_dir(temp.path.join("dependency.jar")).unwrap();
    assert!(transaction.commit().unwrap_err().contains("restored"));
    assert_eq!(
        fs::read(temp.path.join("old.jar.disabled")).unwrap(),
        b"old"
    );
    assert!(!temp.path.join("new.jar.disabled").exists());
}

#[test]
fn startup_recovery_rolls_back_primary_and_dependencies() {
    let (temp, registry, _server, directory) = fixture();
    fs::write(directory.join("old.jar.disabled"), b"old").unwrap();
    let artifacts = vec![
        artifact("new.jar.disabled", Some("old.jar.disabled"), false),
        artifact("dependency.jar", None, true),
    ];
    transaction::simulate_interrupted_commit(&directory, &artifacts, 2).unwrap();
    assert!(directory.join("dependency.jar").exists());
    recover(&temp.path, &registry).unwrap();
    recover(&temp.path, &registry).unwrap();
    assert_eq!(
        fs::read(directory.join("old.jar.disabled")).unwrap(),
        b"old"
    );
    assert!(!directory.join("new.jar.disabled").exists());
    assert!(!directory.join("dependency.jar").exists());
}

#[test]
fn recovery_restores_replaced_same_name_and_staging_is_discarded() {
    let temp = Temp::new();
    fs::write(temp.path.join("same.jar"), b"old").unwrap();
    transaction::simulate_interrupted_commit(
        &temp.path,
        &[artifact("same.jar", Some("same.jar"), false)],
        1,
    )
    .unwrap();
    transaction::recover_directory(&temp.path).unwrap();
    assert_eq!(fs::read(temp.path.join("same.jar")).unwrap(), b"old");
    let staging =
        transaction::Transaction::new(&temp.path, &[artifact("same.jar", Some("same.jar"), false)])
            .unwrap();
    fs::write(staging.stage(0), b"partial download").unwrap();
    transaction::recover_directory(&temp.path).unwrap();
    assert_eq!(fs::read(temp.path.join("same.jar")).unwrap(), b"old");
}

#[test]
fn traversal_and_wrong_managed_profile_roots_are_refused() {
    for value in [
        "../a.jar",
        "/a.jar",
        "a\\b.jar",
        "a.jar:stream",
        "a.jar\n",
        "a.jar/../b.jar",
        "CON.jar",
        "a.jar.",
        "file.zip",
    ] {
        assert!(basename(value).is_err(), "{value}");
    }
    let (temp, registry, mut server, _directory) = fixture();
    server.path = temp.path.to_string_lossy().into();
    registry.update_server(&server).unwrap();
    assert!(toggle(
        &temp.path,
        &registry,
        MutationRequest {
            server_id: "s1".into(),
            file_name: "x.jar".into()
        }
    )
    .is_err());
}

#[test]
fn toggle_and_uninstall_only_mutate_valid_managed_plugin_basenames() {
    let (temp, registry, _server, directory) = fixture();
    fs::write(directory.join("p.jar"), b"plugin").unwrap();
    let request = || MutationRequest {
        server_id: "s1".into(),
        file_name: "p.jar".into(),
    };
    assert_eq!(
        toggle(&temp.path, &registry, request()).unwrap(),
        "p.jar.disabled"
    );
    assert_eq!(
        fs::read(directory.join("p.jar.disabled")).unwrap(),
        b"plugin"
    );
    uninstall(
        &temp.path,
        &registry,
        MutationRequest {
            server_id: "s1".into(),
            file_name: "p.jar.disabled".into(),
        },
    )
    .unwrap();
    assert!(!directory.join("p.jar.disabled").exists());
}

#[cfg(unix)]
#[test]
fn symlink_targets_and_directories_are_refused_for_plans_mutations_and_recovery() {
    use std::os::unix::fs::symlink;
    let (temp, registry, server, directory) = fixture();
    let outside = temp.path.join("outside.jar");
    fs::write(&outside, b"outside").unwrap();
    symlink(&outside, directory.join("p.jar")).unwrap();
    assert!(snapshot(&directory).is_err());
    assert!(toggle(
        &temp.path,
        &registry,
        MutationRequest {
            server_id: "s1".into(),
            file_name: "p.jar".into()
        }
    )
    .is_err());
    assert!(uninstall(
        &temp.path,
        &registry,
        MutationRequest {
            server_id: "s1".into(),
            file_name: "p.jar".into()
        }
    )
    .is_err());
    assert!(transaction::Transaction::new(&directory, &[artifact("p.jar", None, false)]).is_err());
    fs::remove_file(directory.join("p.jar")).unwrap();
    fs::remove_dir(&directory).unwrap();
    symlink(&temp.path, &directory).unwrap();
    assert!(super::directory(&temp.path, &server).is_err());
    assert!(recover(&temp.path, &registry).is_err());
    assert_eq!(fs::read(outside).unwrap(), b"outside");
}

#[test]
fn dependency_identity_detection_rejects_unverified_installed_versions() {
    let candidates = vec!["abcdef12".into(), "world-edit".into(), "World Edit".into()];
    for file in [
        "abcdef12.jar",
        "world-edit.jar",
        "World Edit.jar.disabled",
        "World_Edit.jar",
        "world-edit-7.4.3.jar",
        "world-editv2.0.jar",
        "world-edit-bukkit-7.4.3-beta-01.jar.disabled",
    ] {
        assert!(identity_match(file, &candidates), "{file}");
    }
    for file in ["world-edit-tools.jar", "world-edit-helpers.jar"] {
        assert!(identity_match(file, &candidates), "{file}");
    }
    for file in [
        "world-editaddon.jar",
        "prefix-world-edit.jar",
        "abcdef12345addon.jar",
    ] {
        assert!(!identity_match(file, &candidates), "{file}");
    }
    let temp = Temp::new();
    fs::write(temp.path.join("world-edit-7.4.3.jar"), b"installed").unwrap();
    assert!(
        match_installed_identity(&temp.path, "current.jar", &candidates)
            .unwrap_err()
            .contains("different")
    );
    fs::remove_file(temp.path.join("world-edit-7.4.3.jar")).unwrap();
    fs::write(
        temp.path.join("world-edit-tools.jar"),
        b"unverifiable identity",
    )
    .unwrap();
    assert!(match_installed_identity(&temp.path, "current.jar", &candidates).is_err());
    fs::write(temp.path.join("World Edit.jar.disabled"), b"duplicate").unwrap();
    assert!(match_installed_identity(&temp.path, "current.jar", &candidates).is_err());
}

#[test]
fn required_dependency_is_satisfied_only_by_the_exact_enabled_artifact() {
    let candidates = vec!["project-id".into(), "example-plugin".into()];

    let exact = Temp::new();
    fs::write(exact.path.join("example-plugin-2.0.jar"), b"expected").unwrap();
    assert_eq!(
        match_installed_identity(&exact.path, "example-plugin-2.0.jar", &candidates).unwrap(),
        Some("example-plugin-2.0.jar".into())
    );

    let disabled = Temp::new();
    fs::write(
        disabled.path.join("example-plugin-2.0.jar.disabled"),
        b"disabled",
    )
    .unwrap();
    assert!(
        match_installed_identity(&disabled.path, "example-plugin-2.0.jar", &candidates)
            .unwrap_err()
            .contains("disabled")
    );

    let wrong_version = Temp::new();
    fs::write(
        wrong_version.path.join("example-plugin-1.9.jar"),
        b"different version",
    )
    .unwrap();
    assert!(
        match_installed_identity(&wrong_version.path, "example-plugin-2.0.jar", &candidates)
            .unwrap_err()
            .contains("different")
    );

    let ambiguous = Temp::new();
    fs::write(ambiguous.path.join("example-plugin-1.9.jar"), b"old").unwrap();
    fs::write(
        ambiguous.path.join("example-plugin-2.0.jar.disabled"),
        b"disabled",
    )
    .unwrap();
    assert!(
        match_installed_identity(&ambiguous.path, "example-plugin-2.0.jar", &candidates)
            .unwrap_err()
            .contains("Ambiguous")
    );

    let exact_with_old_copy = Temp::new();
    fs::write(
        exact_with_old_copy.path.join("example-plugin-2.0.jar"),
        b"expected",
    )
    .unwrap();
    fs::write(
        exact_with_old_copy.path.join("example-plugin-1.9.jar"),
        b"old duplicate",
    )
    .unwrap();
    assert!(match_installed_identity(
        &exact_with_old_copy.path,
        "example-plugin-2.0.jar",
        &candidates
    )
    .unwrap_err()
    .contains("Ambiguous"));
}

#[test]
fn persisted_leafmc_and_craftbukkit_names_use_their_plugin_loaders() {
    assert_eq!(loader("LeafMC").unwrap(), ("paper", "plugins"));
    assert_eq!(loader("CraftBukkit").unwrap(), ("spigot", "plugins"));
}

#[test]
fn installed_file_resolution_preserves_actual_letter_case() {
    let temp = Temp::new();
    fs::write(temp.path.join("OldPlugin.JAR.DISABLED"), b"bytes").unwrap();
    assert_eq!(
        installed_name(&temp.path, "oldplugin.jar").unwrap(),
        Some("OldPlugin.JAR.DISABLED".into())
    );
}

#[test]
fn interrupted_cleanup_never_removes_committed_or_restored_plugins() {
    for rolled_back in [true, false] {
        let temp = Temp::new();
        fs::write(temp.path.join("same.jar"), b"old").unwrap();
        transaction::simulate_interrupted_cleanup(
            &temp.path,
            &[artifact("same.jar", Some("same.jar"), false)],
            rolled_back,
        )
        .unwrap();
        transaction::recover_directory(&temp.path).unwrap();
        assert_eq!(
            fs::read(temp.path.join("same.jar")).unwrap(),
            if rolled_back {
                b"old".to_vec()
            } else {
                b"new-0".to_vec()
            }
        );
    }
}

#[test]
fn recovery_rejects_traversal_in_a_tampered_journal_before_touching_files() {
    let temp = Temp::new();
    fs::write(temp.path.join("old.jar"), b"old").unwrap();
    transaction::simulate_interrupted_commit(
        &temp.path,
        &[artifact("new.jar", Some("old.jar"), false)],
        1,
    )
    .unwrap();
    let work = fs::read_dir(&temp.path)
        .unwrap()
        .filter_map(Result::ok)
        .find(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with(".mc-vector-install-")
        })
        .unwrap()
        .path();
    let journal_path = work.join("journal.json");
    let mut journal: Value = serde_json::from_slice(&fs::read(&journal_path).unwrap()).unwrap();
    journal["entries"][0]["target"] = serde_json::json!("../outside.jar");
    fs::write(journal_path, serde_json::to_vec(&journal).unwrap()).unwrap();
    assert!(transaction::recover_directory(&temp.path).is_err());
    assert_eq!(fs::read(temp.path.join("new.jar")).unwrap(), b"new-0");
}

#[cfg(unix)]
#[test]
fn recovery_refuses_a_symlink_inserted_at_an_installed_target() {
    use std::os::unix::fs::symlink;
    let temp = Temp::new();
    let outside = Temp::new();
    fs::write(outside.path.join("outside.jar"), b"untouched").unwrap();
    fs::write(temp.path.join("old.jar"), b"old").unwrap();
    transaction::simulate_interrupted_commit(
        &temp.path,
        &[artifact("new.jar", Some("old.jar"), false)],
        1,
    )
    .unwrap();
    fs::remove_file(temp.path.join("new.jar")).unwrap();
    symlink(outside.path.join("outside.jar"), temp.path.join("new.jar")).unwrap();
    assert!(transaction::recover_directory(&temp.path).is_err());
    assert_eq!(
        fs::read(outside.path.join("outside.jar")).unwrap(),
        b"untouched"
    );
}

#[test]
fn unresolved_transaction_blocks_another_install_until_recovery() {
    let temp = Temp::new();
    fs::write(temp.path.join("old.jar"), b"old").unwrap();
    let artifacts = [artifact("new.jar", Some("old.jar"), false)];
    transaction::simulate_interrupted_commit(&temp.path, &artifacts, 1).unwrap();
    assert!(
        transaction::Transaction::new(&temp.path, &[artifact("other.jar", None, false)]).is_err()
    );
    transaction::recover_directory(&temp.path).unwrap();
    transaction::Transaction::new(&temp.path, &[artifact("other.jar", None, false)])
        .unwrap()
        .discard()
        .unwrap();
}

#[test]
fn changed_replacement_content_after_staging_is_preserved() {
    let temp = Temp::new();
    fs::write(temp.path.join("old.jar.disabled"), b"old").unwrap();
    let artifacts = [
        artifact("new.jar.disabled", Some("old.jar.disabled"), false),
        artifact("dependency.jar", None, true),
    ];
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"primary").unwrap();
    fs::write(transaction.stage(1), b"dependency").unwrap();
    fs::write(temp.path.join("old.jar.disabled"), b"external edit").unwrap();
    assert!(transaction
        .commit()
        .unwrap_err()
        .contains("content changed"));
    assert_eq!(
        fs::read(temp.path.join("old.jar.disabled")).unwrap(),
        b"external edit"
    );
    assert!(!temp.path.join("new.jar.disabled").exists());
    assert!(!temp.path.join("dependency.jar").exists());
}

#[test]
fn directory_resolution_and_inventory_do_not_create_missing_plugin_directory() {
    let temp = Temp::new();
    let root = temp.path.join("servers/s1");
    fs::create_dir_all(&root).unwrap();
    let server = profile(&root);
    let target = directory(&temp.path, &server).unwrap().0;
    assert!(!target.exists());
    assert_eq!(snapshot(&target).unwrap(), "{}");
    assert!(installed_name(&target, "plugin.jar").unwrap().is_none());
    assert!(!target.exists());
}

#[test]
fn late_changed_replacement_rolls_back_earlier_installs_and_preserves_external_edit() {
    let temp = Temp::new();
    fs::write(temp.path.join("first.jar"), b"old").unwrap();
    fs::write(temp.path.join("second.jar.disabled"), b"old").unwrap();
    let artifacts = [
        artifact("first-new.jar", Some("first.jar"), false),
        artifact("second-new.jar.disabled", Some("second.jar.disabled"), true),
    ];
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"primary").unwrap();
    fs::write(transaction.stage(1), b"dependency").unwrap();
    fs::write(temp.path.join("second.jar.disabled"), b"external edit").unwrap();
    assert!(transaction
        .commit()
        .unwrap_err()
        .contains("content changed"));
    assert_eq!(fs::read(temp.path.join("first.jar")).unwrap(), b"old");
    assert_eq!(
        fs::read(temp.path.join("second.jar.disabled")).unwrap(),
        b"external edit"
    );
    assert!(!temp.path.join("first-new.jar").exists());
    assert!(!temp.path.join("second-new.jar.disabled").exists());
    transaction::recover_directory(&temp.path).unwrap();
}

#[cfg(unix)]
#[test]
fn transaction_hashing_refuses_replacement_symlinks_before_construction_and_commit() {
    use std::os::unix::fs::symlink;
    let temp = Temp::new();
    let outside = Temp::new();
    let outside_file = outside.path.join("outside.jar");
    fs::write(&outside_file, b"old").unwrap();
    let source = temp.path.join("old.jar");
    symlink(&outside_file, &source).unwrap();
    let artifacts = [artifact("new.jar", Some("old.jar"), false)];
    assert!(transaction::Transaction::new(&temp.path, &artifacts).is_err());
    fs::remove_file(&source).unwrap();
    fs::write(&source, b"old").unwrap();
    let transaction = transaction::Transaction::new(&temp.path, &artifacts).unwrap();
    fs::write(transaction.stage(0), b"new").unwrap();
    fs::remove_file(&source).unwrap();
    symlink(&outside_file, &source).unwrap();
    assert!(transaction.commit().unwrap_err().contains("symbolic links"));
    assert!(fs::symlink_metadata(&source)
        .unwrap()
        .file_type()
        .is_symlink());
    assert_eq!(fs::read(outside_file).unwrap(), b"old");
    assert!(!temp.path.join("new.jar").exists());
}

#[cfg(unix)]
#[test]
fn transaction_backup_hashing_refuses_a_symlink_even_when_bytes_match() {
    use std::os::unix::fs::symlink;
    let temp = Temp::new();
    let outside = Temp::new();
    let outside_file = outside.path.join("outside.jar");
    fs::write(&outside_file, b"old").unwrap();
    let backup = temp.path.join("backup-0");
    symlink(&outside_file, &backup).unwrap();
    assert!(file_sha256(&backup).unwrap_err().contains("symbolic links"));
    assert_eq!(fs::read(outside_file).unwrap(), b"old");
}

#[test]
fn startup_recovery_isolates_corrupt_server_and_recovers_other_servers() {
    let (temp, registry, _server, first_directory) = fixture();
    fs::write(first_directory.join("existing.jar"), b"existing").unwrap();
    let corrupt = first_directory.join(format!(".mc-vector-install-{}", Uuid::new_v4()));
    fs::create_dir(&corrupt).unwrap();
    fs::write(corrupt.join("journal.json"), b"{broken journal").unwrap();
    let second_root = temp.path.join("servers/s2");
    fs::create_dir(&second_root).unwrap();
    let mut second = profile(&second_root);
    second.id = "s2".into();
    registry.add_server(&second).unwrap();
    let second_directory = directory(&temp.path, &second).unwrap().0;
    fs::create_dir(&second_directory).unwrap();
    fs::write(second_directory.join("old.jar"), b"old").unwrap();
    transaction::simulate_interrupted_commit(
        &second_directory,
        &[artifact("new.jar", Some("old.jar"), false)],
        1,
    )
    .unwrap();
    let failures = recover_startup(&temp.path, &registry);
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].server_id.as_deref(), Some("s1"));
    assert!(failures[0].error.contains("Invalid transaction journal"));
    let unavailable_reason = registry
        .get_servers()
        .unwrap()
        .into_iter()
        .find(|server| server.id == "s1")
        .unwrap()
        .unavailable_reason
        .unwrap();
    assert!(unavailable_reason.starts_with(PLUGIN_RECOVERY_UNAVAILABLE_PREFIX));
    assert!(
        unavailable_reason.contains("Keep this server's transaction journal and backups intact")
    );
    assert_eq!(fs::read(second_directory.join("old.jar")).unwrap(), b"old");
    assert!(!second_directory.join("new.jar").exists());
    assert!(prepare_files(&temp.path, &registry, "s1").is_err());
    let request = || MutationRequest {
        server_id: "s1".into(),
        file_name: "existing.jar".into(),
    };
    assert!(toggle(&temp.path, &registry, request())
        .unwrap_err()
        .contains("Invalid transaction journal"));
    assert!(uninstall(&temp.path, &registry, request())
        .unwrap_err()
        .contains("Invalid transaction journal"));
    assert_eq!(
        fs::read(first_directory.join("existing.jar")).unwrap(),
        b"existing"
    );
    assert!(corrupt.join("journal.json").exists());
}

#[test]
fn startup_recovery_clears_only_its_marker_after_recovery_succeeds() {
    let (temp, registry, mut server, directory) = fixture();
    server.unavailable_reason = Some("Another subsystem needs attention".into());
    registry.update_server(&server).unwrap();

    let corrupt = directory.join(format!(".mc-vector-install-{}", Uuid::new_v4()));
    fs::create_dir(&corrupt).unwrap();
    fs::write(corrupt.join("journal.json"), b"{broken journal").unwrap();
    let failures = recover_startup(&temp.path, &registry);
    assert_eq!(failures.len(), 1);
    assert_eq!(failures[0].server_id.as_deref(), Some("s1"));

    let reason = registry
        .get_servers()
        .unwrap()
        .remove(0)
        .unavailable_reason
        .unwrap();
    assert!(reason.contains("Another subsystem needs attention"));
    assert!(reason.contains(PLUGIN_RECOVERY_UNAVAILABLE_PREFIX));

    fs::remove_dir_all(corrupt).unwrap();
    assert!(recover_startup(&temp.path, &registry).is_empty());
    assert_eq!(
        registry
            .get_servers()
            .unwrap()
            .remove(0)
            .unavailable_reason
            .as_deref(),
        Some("Another subsystem needs attention")
    );
}

#[test]
fn startup_recovery_reports_registry_read_failure_as_global() {
    let (temp, registry, _server, _directory) = fixture();
    let connection = rusqlite::Connection::open(temp.path.join("server-registry.sqlite3")).unwrap();
    connection
        .execute(
            "UPDATE server_registry_entries SET payload = '{broken' WHERE server_id = 's1'",
            [],
        )
        .unwrap();

    let failures = recover_startup(&temp.path, &registry);

    assert_eq!(failures.len(), 1);
    assert!(failures[0].server_id.is_none());
    assert!(failures[0]
        .error
        .contains("Could not read server registry for plugin recovery"));
}

#[cfg(unix)]
#[test]
fn journal_recovery_ignores_unrelated_non_utf8_filenames() {
    use std::os::unix::ffi::OsStringExt;
    let temp = Temp::new();
    // macOS filesystems reject creating invalid Unicode filenames, so exercise
    // the exact entry-name filter without relying on host filename support.
    let unrelated = std::ffi::OsString::from_vec(b"unrelated-\xff.jar".to_vec());
    assert!(transaction::transaction_identifier(&unrelated)
        .unwrap()
        .is_none());
    fs::write(temp.path.join("old.jar"), b"old").unwrap();
    transaction::simulate_interrupted_commit(
        &temp.path,
        &[artifact("new.jar", Some("old.jar"), false)],
        1,
    )
    .unwrap();
    transaction::recover_directory(&temp.path).unwrap();
    assert!(transaction::transaction_identifier(&unrelated)
        .unwrap()
        .is_none());
    assert_eq!(fs::read(temp.path.join("old.jar")).unwrap(), b"old");
}

#[tokio::test(flavor = "current_thread")]
async fn blocking_filesystem_batches_leave_the_async_worker_responsive() {
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    let started = Arc::new(AtomicBool::new(false));
    let finished = Arc::new(AtomicBool::new(false));
    let worker_started = started.clone();
    let worker_finished = finished.clone();
    let operation = tokio::spawn(async move {
        blocking(move || {
            worker_started.store(true, Ordering::SeqCst);
            std::thread::sleep(Duration::from_millis(100));
            worker_finished.store(true, Ordering::SeqCst);
            Ok(())
        })
        .await
        .unwrap();
    });
    while !started.load(Ordering::SeqCst) {
        tokio::task::yield_now().await;
    }
    tokio::time::sleep(Duration::from_millis(5)).await;
    assert!(
        !finished.load(Ordering::SeqCst),
        "blocking filesystem batch occupied the async worker"
    );
    operation.await.unwrap();
}
