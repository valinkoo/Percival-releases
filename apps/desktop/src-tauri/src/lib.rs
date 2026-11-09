//! Percival desktop shell.
//!
//! The only native commands are the three below, which keep the session token in the Windows
//! Credential Manager instead of the WebView's storage.

use keyring::Entry;

const KEYRING_SERVICE: &str = "Percival";
const KEYRING_ACCOUNT: &str = "session-token";

fn token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_token(token: String) -> Result<(), String> {
    token_entry()?.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_token() -> Result<(), String> {
    match token_entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![save_token, load_token, delete_token])
        .run(tauri::generate_context!())
        .expect("error while running Percival");
}
