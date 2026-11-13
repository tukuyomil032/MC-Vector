//! Bundled bindgen so the generator version always matches the `uniffi`
//! version pinned in Cargo.lock (DEP-003). Used by native/build.sh.

fn main() {
    uniffi::uniffi_bindgen_main()
}
