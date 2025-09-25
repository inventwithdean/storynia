use std::sync::Mutex;

use tauri::Manager;

use crate::{
    llm::get_llm_completion,
    sd_api::{edit_image, generate_image, initialize_flux_kontext, FluxState},
};

mod llm;
mod sd_api;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            app.manage(FluxState(Mutex::new(None)));
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                println!("Initializing SD Context in background!");
                let _ = initialize_flux_kontext(app_handle);
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            generate_image,
            edit_image,
            get_llm_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
