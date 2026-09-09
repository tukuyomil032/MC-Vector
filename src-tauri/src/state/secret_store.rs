use keyring::Entry;

const LEGACY_SERVICE_NAME: &str = "com.mcvector.desktop";
const SERVICE_NAME_PREFIX: &str = "com.mcvector.desktop.";
pub const PRODUCTION_APP_IDENTIFIER: &str = "com.tukuyomi032.mcvector";
pub const NGROK_TOKEN_KEY: &str = "ngrok-auth-token";

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}

#[derive(Debug, Clone)]
pub struct OsSecretStore {
    service_name: String,
}

impl OsSecretStore {
    pub fn new(app_identifier: &str) -> Self {
        Self {
            service_name: service_name_for_identifier(app_identifier),
        }
    }

    fn entry(&self, key: &str) -> Result<Entry, String> {
        Entry::new(&self.service_name, key).map_err(|error| {
            format!("Failed to open the operating-system credential store: {error}")
        })
    }
}

impl SecretStore for OsSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        match self.entry(key)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!(
                "Failed to read the operating-system credential store: {error}"
            )),
        }
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        if value.trim().is_empty() {
            return Err("Credential value must not be empty".to_string());
        }
        self.entry(key)?
            .set_password(value)
            .map_err(|_error| "Failed to write the operating-system credential store".to_string())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        match self.entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!(
                "Failed to delete the operating-system credential: {error}"
            )),
        }
    }
}

fn service_name_for_identifier(app_identifier: &str) -> String {
    if app_identifier == PRODUCTION_APP_IDENTIFIER {
        LEGACY_SERVICE_NAME.to_string()
    } else {
        format!("{SERVICE_NAME_PREFIX}{app_identifier}")
    }
}

#[cfg(test)]
mod tests {
    use super::{
        service_name_for_identifier, SecretStore, NGROK_TOKEN_KEY, PRODUCTION_APP_IDENTIFIER,
    };

    const DEBUG_APP_IDENTIFIER: &str = "com.tukuyomi032.mcvector.debug";
    const E2E_APP_IDENTIFIER: &str = "com.tukuyomi032.mcvector.e2e";

    #[test]
    fn service_name_derivation_is_deterministic() {
        assert_eq!(
            service_name_for_identifier(PRODUCTION_APP_IDENTIFIER),
            "com.mcvector.desktop"
        );
        assert_eq!(
            service_name_for_identifier(DEBUG_APP_IDENTIFIER),
            service_name_for_identifier(DEBUG_APP_IDENTIFIER)
        );
        assert_eq!(
            service_name_for_identifier(DEBUG_APP_IDENTIFIER),
            "com.mcvector.desktop.com.tukuyomi032.mcvector.debug"
        );
    }

    #[test]
    fn app_identifiers_use_isolated_service_names() {
        let production = service_name_for_identifier(PRODUCTION_APP_IDENTIFIER);
        let debug = service_name_for_identifier(DEBUG_APP_IDENTIFIER);
        let e2e = service_name_for_identifier(E2E_APP_IDENTIFIER);

        assert_ne!(production, debug);
        assert_ne!(production, e2e);
        assert_ne!(debug, e2e);
    }

    struct MemorySecretStore(std::sync::Mutex<Option<String>>);

    impl SecretStore for MemorySecretStore {
        fn get(&self, _key: &str) -> Result<Option<String>, String> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn set(&self, _key: &str, value: &str) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(value.to_string());
            Ok(())
        }

        fn delete(&self, _key: &str) -> Result<(), String> {
            *self.0.lock().unwrap() = None;
            Ok(())
        }
    }

    #[test]
    fn secret_store_contract_keeps_values_out_of_status_data() {
        let store = MemorySecretStore(std::sync::Mutex::new(None));
        assert_eq!(store.get(NGROK_TOKEN_KEY).unwrap(), None);
        store.set(NGROK_TOKEN_KEY, "test-only-secret").unwrap();
        assert_eq!(
            store.get(NGROK_TOKEN_KEY).unwrap().as_deref(),
            Some("test-only-secret")
        );
        store.delete(NGROK_TOKEN_KEY).unwrap();
        assert_eq!(store.get(NGROK_TOKEN_KEY).unwrap(), None);
    }
}
