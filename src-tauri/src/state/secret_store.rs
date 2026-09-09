use keyring::Entry;

const SERVICE_NAME: &str = "com.mcvector.desktop";
pub const NGROK_TOKEN_KEY: &str = "ngrok-auth-token";

pub trait SecretStore: Send + Sync {
    fn get(&self, key: &str) -> Result<Option<String>, String>;
    fn set(&self, key: &str, value: &str) -> Result<(), String>;
    fn delete(&self, key: &str) -> Result<(), String>;
}

#[derive(Debug, Default, Clone, Copy)]
pub struct OsSecretStore;

impl OsSecretStore {
    fn entry(key: &str) -> Result<Entry, String> {
        Entry::new(SERVICE_NAME, key).map_err(|error| {
            format!("Failed to open the operating-system credential store: {error}")
        })
    }
}

impl SecretStore for OsSecretStore {
    fn get(&self, key: &str) -> Result<Option<String>, String> {
        match Self::entry(key)?.get_password() {
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
        Self::entry(key)?
            .set_password(value)
            .map_err(|_error| "Failed to write the operating-system credential store".to_string())
    }

    fn delete(&self, key: &str) -> Result<(), String> {
        match Self::entry(key)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(error) => Err(format!(
                "Failed to delete the operating-system credential: {error}"
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{SecretStore, NGROK_TOKEN_KEY};

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
