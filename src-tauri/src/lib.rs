mod commands;
mod parser;

use commands::process::{process_lote, scan_folder};
use tauri::Manager;

fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![
    tauri_plugin_sql::Migration {
        version: 1,
        description: "create_schema",
        sql: "
            CREATE TABLE IF NOT EXISTS empresas (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                cnpj TEXT DEFAULT '',
                ordem INTEGER DEFAULT 0,
                criada_em TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS lotes (
                id TEXT PRIMARY KEY,
                empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
                nome TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                data_upload TEXT DEFAULT (datetime('now')),
                total_arquivos INTEGER DEFAULT 0,
                total_valido INTEGER DEFAULT 0,
                resumo TEXT DEFAULT NULL,
                ordem INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS notas (
                id TEXT PRIMARY KEY,
                lote_id TEXT NOT NULL REFERENCES lotes(id) ON DELETE CASCADE,
                chave TEXT NOT NULL,
                data_emissao TEXT DEFAULT '',
                cfop TEXT DEFAULT '',
                uf_destino TEXT DEFAULT '',
                ie_dest TEXT DEFAULT '',
                cnpj_dest TEXT DEFAULT '',
                x_nome TEXT DEFAULT '',
                ind_final INTEGER DEFAULT 0,
                n_nf TEXT DEFAULT '',
                mod_nf TEXT DEFAULT '',
                serie TEXT DEFAULT '',
                v_nf REAL DEFAULT 0,
                v_prod REAL DEFAULT 0,
                v_icms REAL DEFAULT 0,
                v_st REAL DEFAULT 0,
                cnpj_emit TEXT DEFAULT '',
                x_nome_emit TEXT DEFAULT '',
                natureza_operacao TEXT DEFAULT '',
                municipio TEXT DEFAULT '',
                uf_end TEXT DEFAULT ''
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_notas_chave_lote ON notas(chave, lote_id);
            CREATE INDEX IF NOT EXISTS idx_notas_lote ON notas(lote_id);
            CREATE INDEX IF NOT EXISTS idx_notas_ie ON notas(ie_dest);
            CREATE INDEX IF NOT EXISTS idx_lotes_empresa ON lotes(empresa_id);

            CREATE TABLE IF NOT EXISTS preferencias (
                id INTEGER PRIMARY KEY DEFAULT 1,
                empresa_ativa TEXT DEFAULT NULL,
                lote_ativo TEXT DEFAULT NULL
            );

            INSERT OR IGNORE INTO preferencias (id) VALUES (1);
        ",
        kind: tauri_plugin_sql::MigrationKind::Up,
    },
    tauri_plugin_sql::Migration {
        version: 2,
        description: "add_search_indexes",
        sql: "
            CREATE INDEX IF NOT EXISTS idx_notas_lote_cfop_uf ON notas(lote_id, cfop, uf_destino);
            CREATE INDEX IF NOT EXISTS idx_notas_xnome ON notas(x_nome);
            CREATE INDEX IF NOT EXISTS idx_notas_ie_cnpj ON notas(ie_dest, cnpj_dest);
        ",
        kind: tauri_plugin_sql::MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:analyzer.db", migrations())
                .build(),
        )
        .setup(|app| {
            if let Some(win) = app.get_webview_window("main") {
                // Encolhe o tamanho de "restaurar" para caber no monitor atual.
                // Sem isso, em telas antigas (1024x768) a janela de 1400x900
                // transborda para o monitor vizinho ao sair do maximizado.
                if let Ok(Some(monitor)) = win.current_monitor() {
                    let scale = monitor.scale_factor();
                    let area = monitor.work_area().size.to_logical::<f64>(scale);
                    let w = (area.width * 0.9).min(1400.0).max(900.0);
                    let h = (area.height * 0.9).min(900.0).max(600.0);
                    let _ = win.set_size(tauri::LogicalSize::new(w, h));
                    let _ = win.center();
                }
                let _ = win.maximize();
                // Sempre, mesmo se algo acima falhar — a janela nasce invisible.
                let _ = win.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scan_folder, process_lote])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
