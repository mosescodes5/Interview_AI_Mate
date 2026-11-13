#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // No custom commands, no shell access: the app talks to the local Python backend over HTTP on 127.0.0.1.
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running InterviewMate AI");
}
