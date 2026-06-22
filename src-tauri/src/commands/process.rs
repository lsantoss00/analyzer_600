use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

use crate::parser::{evento::parse_evento, nfe::{is_valid_nfe, parse_nfe, NfeParsed}};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Resumo {
    #[serde(rename = "notasTotais")]
    pub notas_totais: usize,
    #[serde(rename = "iesTotal")]
    pub ies_total: usize,
    #[serde(rename = "iesConsumidorFinal")]
    pub ies_consumidor_final: usize,
    #[serde(rename = "iesNaoConsumidor")]
    pub ies_nao_consumidor: usize,
    #[serde(rename = "valorTotal")]
    pub valor_total: f64,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    done: usize,
    total: usize,
}

enum ParseResult {
    NFe(NfeParsed),
    Evento(String), // cancelled chave
    Skip,
}

const MAX_XML_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

fn parse_xml_file(path: &str) -> ParseResult {
    // Rejeita arquivos acima do limite antes de carregá-los na memória
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_XML_BYTES {
            return ParseResult::Skip;
        }
    }

    let xml = match std::fs::read_to_string(path) {
        Ok(s) => s,
        Err(_) => return ParseResult::Skip,
    };

    // Try evento first (smaller/faster check)
    if let Some(chave) = parse_evento(&xml) {
        return ParseResult::Evento(chave);
    }

    if let Some(nfe) = parse_nfe(&xml) {
        return ParseResult::NFe(nfe);
    }

    ParseResult::Skip
}

fn compute_resumo(notas: &[NfeParsed]) -> Resumo {
    use std::collections::HashMap;

    let mut by_ie: HashMap<&str, Vec<&NfeParsed>> = HashMap::new();
    for n in notas {
        by_ie.entry(n.ie_dest.as_str()).or_default().push(n);
    }

    let ies_total = by_ie.len();
    let ies_consumidor_final = by_ie
        .values()
        .filter(|ns| ns.iter().all(|n| n.ind_final))
        .count();
    let ies_nao_consumidor = ies_total - ies_consumidor_final;
    let valor_total: f64 = notas.iter().map(|n| n.v_nf).sum();

    Resumo {
        notas_totais: notas.len(),
        ies_total,
        ies_consumidor_final,
        ies_nao_consumidor,
        valor_total,
    }
}

fn process_files_sync(
    app: tauri::AppHandle,
    db_path: std::path::PathBuf,
    lote_id: String,
    xml_paths: Vec<String>,
) -> Result<Resumo, String> {
    let total = xml_paths.len();
    let counter = Arc::new(AtomicUsize::new(0));
    let app_arc = Arc::new(app);

    // Parallel parse
    let results: Vec<ParseResult> = xml_paths
        .par_iter()
        .map(|path| {
            let result = parse_xml_file(path);
            let done = counter.fetch_add(1, Ordering::Relaxed) + 1;
            if done % 500 == 0 || done == total {
                let _ = app_arc.emit("process-progress", ProgressPayload { done, total });
            }
            result
        })
        .collect();

    // Separate NF-es from cancelled chaves
    let mut cancelled: HashSet<String> = HashSet::new();
    let mut nfes: Vec<NfeParsed> = Vec::new();

    for r in results {
        match r {
            ParseResult::NFe(n) => nfes.push(n),
            ParseResult::Evento(chave) => {
                cancelled.insert(chave);
            }
            ParseResult::Skip => {}
        }
    }

    // Deduplica por chave: a pasta pode conter tanto NFe_CHAVE.xml quanto nfeProc_CHAVE.xml
    // para a mesma nota. O INSERT OR IGNORE já descarta duplicatas no banco, mas o resumo
    // precisa ser calculado sobre o conjunto único para mostrar o número correto.
    let mut seen_chaves: HashSet<String> = HashSet::new();
    let valid: Vec<NfeParsed> = nfes
        .into_iter()
        .filter(|n| is_valid_nfe(n, &cancelled) && seen_chaves.insert(n.chave.clone()))
        .collect();

    let resumo = compute_resumo(&valid);

    // Batch write to SQLite
    let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for n in &valid {
        tx.execute(
            "INSERT OR IGNORE INTO notas (
                id, lote_id, chave, data_emissao, cfop, uf_destino,
                ie_dest, cnpj_dest, x_nome, ind_final, n_nf, mod_nf, serie,
                v_nf, v_prod, v_icms, v_st, cnpj_emit, x_nome_emit,
                natureza_operacao, municipio, uf_end
            ) VALUES (
                ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,
                ?14,?15,?16,?17,?18,?19,?20,?21,?22
            )",
            rusqlite::params![
                n.id, &lote_id, n.chave, n.data_emissao, n.cfop, n.uf_destino,
                n.ie_dest, n.cnpj_dest, n.x_nome, n.ind_final as i32,
                n.n_nf, n.mod_nf, n.serie,
                n.v_nf, n.v_prod, n.v_icms, n.v_st,
                n.cnpj_emit, n.x_nome_emit, n.natureza_operacao,
                n.municipio, n.uf_end,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    let resumo_json = serde_json::to_string(&resumo).map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE lotes SET status='done', total_arquivos=?1, total_valido=?2, resumo=?3 WHERE id=?4",
        rusqlite::params![total as i64, valid.len() as i64, resumo_json, &lote_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(resumo)
}

#[tauri::command]
pub fn scan_folder(path: String) -> Result<Vec<String>, String> {
    use walkdir::WalkDir;

    let base = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|e| format!("Caminho inválido: {e}"))?;

    if !base.is_dir() {
        return Err("O caminho selecionado não é um diretório".to_string());
    }

    let paths: Vec<String> = WalkDir::new(&base)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            if !e.file_type().is_file() {
                return false;
            }
            // Rejeita entradas cujo caminho real sai do diretório base (symlinks)
            if let Ok(canonical) = e.path().canonicalize() {
                if !canonical.starts_with(&base) {
                    return false;
                }
            }
            e.path()
                .extension()
                .map(|ext| ext.eq_ignore_ascii_case("xml"))
                .unwrap_or(false)
        })
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();

    Ok(paths)
}

#[tauri::command]
pub async fn process_lote(
    app: tauri::AppHandle,
    lote_id: String,
    xml_paths: Vec<String>,
) -> Result<Resumo, String> {
    use tauri::Manager;

    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("analyzer.db");

    tokio::task::spawn_blocking(move || {
        process_files_sync(app, db_path, lote_id, xml_paths)
    })
    .await
    .map_err(|e| e.to_string())?
}

