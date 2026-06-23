mod commands;
mod parser;

use commands::process::{process_lote, scan_folder};

fn migrations() -> Vec<tauri_plugin_sql::Migration> {
    vec![
    tauri_plugin_sql::Migration {
        version: 2,
        description: "add_search_indexes",
        sql: "
            -- Composite index para filtro server-side por CFOP + UF (futuro)
            CREATE INDEX IF NOT EXISTS idx_notas_lote_cfop_uf ON notas(lote_id, cfop, uf_destino);
            -- Index para busca de texto por nome do destinatário
            CREATE INDEX IF NOT EXISTS idx_notas_xnome ON notas(x_nome);
            -- Index para busca por IE / CNPJ
            CREATE INDEX IF NOT EXISTS idx_notas_ie_cnpj ON notas(ie_dest, cnpj_dest);
        ",
        kind: tauri_plugin_sql::MigrationKind::Up,
    },
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
        .invoke_handler(tauri::generate_handler![scan_folder, process_lote])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
