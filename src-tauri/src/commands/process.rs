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

/// Por que um arquivo foi descartado. Antes tudo virava um Skip mudo e os seis
/// caminhos colapsavam no único número `total_arquivos - total_valido`.
#[derive(Debug, Clone, Copy)]
pub enum MotivoDescarte {
    /// Acima de MAX_XML_BYTES.
    ArquivoGrande,
    /// Não deu para ler: permissão, arquivo travado, sumiu entre o scan e aqui.
    ErroLeitura,
    /// XML bem-formado mas sem infNFe — outro documento fiscal, evento não-cancelamento, etc.
    NaoEhNfe,
    /// XML malformado ou NF-e sem os blocos obrigatórios.
    XmlInvalido,
}

#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Descartes {
    #[serde(rename = "arquivoGrande")]
    pub arquivo_grande: usize,
    #[serde(rename = "erroLeitura")]
    pub erro_leitura: usize,
    #[serde(rename = "naoEhNfe")]
    pub nao_eh_nfe: usize,
    #[serde(rename = "xmlInvalido")]
    pub xml_invalido: usize,
    /// Nota válida anulada por um evento de cancelamento na mesma pasta.
    pub cancelados: usize,
    /// Mesma chave aparecendo mais de uma vez (NFe_X.xml + nfeProc_X.xml).
    pub duplicados: usize,
    /// INSERT OR IGNORE recusou a linha (chave já existente).
    #[serde(rename = "jaExistiam")]
    pub ja_existiam: usize,
    /// Arquivos de evento de cancelamento. Não são erro — cumpriram seu papel
    /// anulando notas — mas também não viram nota, e sem contá-los a soma das
    /// categorias não fecha com `total_arquivos - total_valido`.
    pub eventos: usize,
}

/// Tempo de cada fase do import, em milissegundos. Sem isto não havia como
/// atribuir o tempo: o evento de progresso só cobre o parse e para de emitir
/// antes da gravação, justamente a fase silenciosa.
#[derive(Debug, Default, Serialize, Deserialize, Clone)]
pub struct Duracoes {
    #[serde(rename = "parseMs")]
    pub parse_ms: u64,
    #[serde(rename = "dedupMs")]
    pub dedup_ms: u64,
    #[serde(rename = "gravacaoMs")]
    pub gravacao_ms: u64,
    #[serde(rename = "totalMs")]
    pub total_ms: u64,
}

enum ParseResult {
    NFe(NfeParsed),
    Evento(String), // cancelled chave
    Skip(MotivoDescarte),
}

const MAX_XML_BYTES: u64 = 50 * 1024 * 1024; // 50 MB

fn parse_xml_file(path: &str) -> ParseResult {
    // Rejeita arquivos acima do limite antes de carregá-los na memória
    if let Ok(meta) = std::fs::metadata(path) {
        if meta.len() > MAX_XML_BYTES {
            return ParseResult::Skip(MotivoDescarte::ArquivoGrande);
        }
    }

    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(_) => return ParseResult::Skip(MotivoDescarte::ErroLeitura),
    };

    // NF-e exportada de ERP brasileiro costuma vir como ISO-8859-1. read_to_string
    // exigiria UTF-8 e descartaria esses arquivos em silêncio, então decodificamos
    // com fallback. Em ISO-8859-1 cada byte mapeia direto para o code point de mesmo
    // valor. Os 32 slots de pontuação exclusivos do Windows-1252 (0x80-0x9F) viram
    // mojibake; não afeta CNPJ/IE/valores. Se aparecer na prática, usar encoding_rs.
    // O roxmltree não rejeita declaração de encoding diferente de UTF-8, então basta
    // entregar a String já decodificada sem reescrever o cabeçalho do XML.
    let xml = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => e.into_bytes().iter().map(|&b| b as char).collect::<String>(),
    };

    // UM parse por arquivo. Antes parse_evento e parse_nfe montavam cada um o
    // seu Document da mesma string: para uma NF-e — o caso normal — o primeiro
    // montava a árvore inteira, varria tudo atrás de infEvento, não achava, e
    // descartava; o segundo remontava. Era metade do trabalho de parse jogada
    // fora, numa fase que responde por 91% do tempo de import.
    let doc = match roxmltree::Document::parse(&xml) {
        Ok(d) => d,
        Err(_) => return ParseResult::Skip(MotivoDescarte::XmlInvalido),
    };

    if let Some(chave) = parse_evento(&doc) {
        return ParseResult::Evento(chave);
    }

    if let Some(nfe) = parse_nfe(&doc) {
        return ParseResult::NFe(nfe);
    }

    // Agora a classificação é exata: o XML é bem-formado (senão teria caído no
    // Err acima), então ou tem infNFe e algum bloco obrigatório falta, ou não é
    // NF-e. Antes isto era uma checagem por substring, imprecisa de propósito
    // para evitar um terceiro parse.
    let tem_inf_nfe = doc
        .root_element()
        .descendants()
        .any(|n| n.is_element() && n.tag_name().name() == "infNFe");

    if tem_inf_nfe {
        ParseResult::Skip(MotivoDescarte::XmlInvalido)
    } else {
        ParseResult::Skip(MotivoDescarte::NaoEhNfe)
    }
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
    let t_inicio = std::time::Instant::now();
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
    let parse_ms = t_inicio.elapsed().as_millis() as u64;

    let t_dedup = std::time::Instant::now();

    // Separate NF-es from cancelled chaves
    let mut cancelled: HashSet<String> = HashSet::new();
    let mut nfes: Vec<NfeParsed> = Vec::new();
    let mut descartes = Descartes::default();

    for r in results {
        match r {
            ParseResult::NFe(n) => nfes.push(n),
            ParseResult::Evento(chave) => {
                descartes.eventos += 1;
                cancelled.insert(chave);
            }
            ParseResult::Skip(motivo) => match motivo {
                MotivoDescarte::ArquivoGrande => descartes.arquivo_grande += 1,
                MotivoDescarte::ErroLeitura => descartes.erro_leitura += 1,
                MotivoDescarte::NaoEhNfe => descartes.nao_eh_nfe += 1,
                MotivoDescarte::XmlInvalido => descartes.xml_invalido += 1,
            },
        }
    }

    // Deduplica por chave: a pasta pode conter tanto NFe_CHAVE.xml quanto nfeProc_CHAVE.xml
    // para a mesma nota. O INSERT OR IGNORE já descarta duplicatas no banco, mas o resumo
    // precisa ser calculado sobre o conjunto único para mostrar o número correto.
    let mut seen_chaves: HashSet<String> = HashSet::new();
    let mut valid: Vec<NfeParsed> = Vec::with_capacity(nfes.len());
    for n in nfes {
        // UM balde por ARQUIVO, nunca dois. Contar as condições em separado
        // fazia uma nota cancelada que aparece duas vezes somar 2 em
        // "cancelados" mais 1 em "duplicados" — 3 para 2 arquivos, e a soma
        // não fechava contra total_arquivos. A segunda cópia é, antes de tudo,
        // uma duplicata; a primeira é que foi cancelada.
        let nova_chave = seen_chaves.insert(n.chave.clone());
        if !nova_chave {
            descartes.duplicados += 1;
        } else if !is_valid_nfe(&n, &cancelled) {
            descartes.cancelados += 1;
        } else {
            valid.push(n);
        }
    }

    let resumo = compute_resumo(&valid);
    let dedup_ms = t_dedup.elapsed().as_millis() as u64;

    let t_gravacao = std::time::Instant::now();

    // Batch write to SQLite
    let mut conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Substituição atômica: o DELETE vive na mesma transação dos INSERTs, então ou
    // as notas novas entram ou as antigas permanecem. Antes isso era um resetLote()
    // commitado no frontend ANTES do processamento — uma falha aqui apagava o lote
    // sem repor nada. Para um lote novo o DELETE é no-op.
    tx.execute("DELETE FROM notas WHERE lote_id=?1", rusqlite::params![&lote_id])
        .map_err(|e| e.to_string())?;

    // prepare_cached uma vez, fora do loop. tx.execute(sql, ...) chama
    // Connection::prepare a cada volta (rusqlite lib.rs:623), então o INSERT de
    // 22 placeholders era recompilado pelo SQLite uma vez por nota — 80 mil
    // vezes num lote grande. O cache usa SQLITE_PREPARE_PERSISTENT.
    let mut inseridas = 0usize;
    {
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO notas (
                id, lote_id, chave, data_emissao, cfop, uf_destino,
                ie_dest, cnpj_dest, x_nome, ind_final, n_nf, mod_nf, serie,
                v_nf, v_prod, v_icms, v_st, cnpj_emit, x_nome_emit,
                natureza_operacao, municipio, uf_end
            ) VALUES (
                ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,
                ?14,?15,?16,?17,?18,?19,?20,?21,?22
            )",
            )
            .map_err(|e| e.to_string())?;

        for n in &valid {
            let n_linhas = stmt
                .execute(rusqlite::params![
                    n.id, &lote_id, n.chave, n.data_emissao, n.cfop, n.uf_destino,
                    n.ie_dest, n.cnpj_dest, n.x_nome, n.ind_final as i32,
                    n.n_nf, n.mod_nf, n.serie,
                    n.v_nf, n.v_prod, n.v_icms, n.v_st,
                    n.cnpj_emit, n.x_nome_emit, n.natureza_operacao,
                    n.municipio, n.uf_end,
                ])
                .map_err(|e| e.to_string())?;
            // total_valido era valid.len(), que SUPER-reporta se o OR IGNORE dispara.
            inseridas += n_linhas;
        }
    }
    descartes.ja_existiam = valid.len() - inseridas;

    let resumo_json = serde_json::to_string(&resumo).map_err(|e| e.to_string())?;
    let descartes_json = serde_json::to_string(&descartes).map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE lotes SET status='done', total_arquivos=?1, total_valido=?2, resumo=?3, descartes=?4 WHERE id=?5",
        rusqlite::params![total as i64, inseridas as i64, resumo_json, descartes_json, &lote_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let duracoes = Duracoes {
        parse_ms,
        dedup_ms,
        gravacao_ms: t_gravacao.elapsed().as_millis() as u64,
        total_ms: t_inicio.elapsed().as_millis() as u64,
    };
    // Gravado fora da transação: é diagnóstico, não pode derrubar o import.
    let _ = conn.execute(
        "UPDATE lotes SET duracoes=?1 WHERE id=?2",
        rusqlite::params![
            serde_json::to_string(&duracoes).unwrap_or_default(),
            &lote_id
        ],
    );

    eprintln!(
        "[import] {} arquivos | parse {}ms | dedup {}ms | gravacao {}ms | total {}ms",
        total, duracoes.parse_ms, duracoes.dedup_ms, duracoes.gravacao_ms, duracoes.total_ms
    );

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


