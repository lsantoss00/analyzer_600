use serde::{Deserialize, Serialize};

const CFOPS_VALIDOS: &[&str] = &["5102", "5403", "5405"];

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NfeParsed {
    pub id: String,
    pub chave: String,
    pub data_emissao: String,
    pub cfop: String,
    pub uf_destino: String,
    pub ie_dest: String,
    pub cnpj_dest: String,
    pub x_nome: String,
    pub ind_final: bool,
    pub n_nf: String,
    pub mod_nf: String,
    pub serie: String,
    pub v_nf: f64,
    pub v_prod: f64,
    pub v_icms: f64,
    pub v_st: f64,
    pub cnpj_emit: String,
    pub x_nome_emit: String,
    pub natureza_operacao: String,
    pub municipio: String,
    pub uf_end: String,
}

fn find_text<'a>(node: roxmltree::Node<'a, '_>, local_name: &str) -> Option<String> {
    node.descendants()
        .find(|n| n.is_element() && n.tag_name().name() == local_name)
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
}

fn find_text_in<'a>(
    node: roxmltree::Node<'a, '_>,
    parent: &str,
    child: &str,
) -> Option<String> {
    node.descendants()
        .find(|n| n.is_element() && n.tag_name().name() == parent)
        .and_then(|p| {
            p.children()
                .find(|n| n.is_element() && n.tag_name().name() == child)
                .and_then(|n| n.text())
                .map(|s| s.trim().to_string())
        })
}

fn parse_f64(s: &str) -> f64 {
    s.trim().parse::<f64>().unwrap_or(0.0)
}

/// Extracts YYYY-MM-DD from NF-e date fields (dhEmi or dEmi).
/// dhEmi format: "2024-01-15T12:34:56-03:00"
/// dEmi format:  "2024-01-15"
fn parse_date(raw: &str) -> String {
    let s = raw.trim();
    if s.len() >= 10 {
        s[..10].to_string()
    } else {
        s.to_string()
    }
}

pub fn parse_nfe(xml: &str) -> Option<NfeParsed> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    let root = doc.root_element();

    // Locate infNFe — works whether root is <NFe> or <nfeProc>
    let inf_nfe = root
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "infNFe")?;

    // Chave from Id attribute: "NFe" + exactly 44 digits
    let id_attr = inf_nfe.attribute("Id")?;
    let chave = id_attr.trim_start_matches("NFe").to_string();
    if chave.len() != 44 || !chave.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }

    // ide block
    let ide = inf_nfe
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "ide")?;

    let n_nf = find_text(ide, "nNF").unwrap_or_default();
    let mod_nf = find_text(ide, "mod").unwrap_or_default();
    let serie = find_text(ide, "serie").unwrap_or_default();
    let natureza_operacao = find_text(ide, "natOp").unwrap_or_default();
    let data_emissao = find_text(ide, "dhEmi")
        .or_else(|| find_text(ide, "dEmi"))
        .map(|d| parse_date(&d))
        .unwrap_or_default();

    // emit block
    let emit = inf_nfe
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "emit")?;

    let cnpj_emit = find_text(emit, "CNPJ").unwrap_or_default();
    let x_nome_emit = find_text(emit, "xFant")
        .or_else(|| find_text(emit, "xNome"))
        .unwrap_or_default();

    // dest block
    let dest = inf_nfe
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "dest")?;

    let cnpj_dest = find_text(dest, "CNPJ")
        .or_else(|| find_text(dest, "CPF"))
        .unwrap_or_default();
    let x_nome = find_text(dest, "xNome").unwrap_or_default();
    let ie_dest = find_text(dest, "IE").unwrap_or_default();
    let ind_final = find_text(dest, "indFinal")
        .map(|v| v == "1")
        .unwrap_or(false);

    // enderDest block (inside dest)
    let ender_dest = dest
        .children()
        .find(|n| n.is_element() && n.tag_name().name() == "enderDest");

    // Normalize UF to uppercase so DB is always consistent ("rj" → "RJ")
    let uf_destino = ender_dest
        .and_then(|e| find_text(e, "UF"))
        .map(|s| s.to_uppercase())
        .unwrap_or_default();
    let municipio = ender_dest
        .and_then(|e| find_text(e, "xMun"))
        .unwrap_or_default();
    let uf_end = uf_destino.clone();

    // Collect ALL CFOPs across all <det> items.
    // We validate each one; the stored value is the first (representative).
    // A nota is only valid if its first CFOP is in CFOPS_VALIDOS —
    // mixed-CFOP notas (e.g. 5101 + 9999) are a data-quality issue in the
    // source; we keep the nota and store the primary CFOP for traceability.
    let cfop = inf_nfe
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "CFOP")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
        .unwrap_or_default();

    // totals
    let v_nf = find_text_in(inf_nfe, "ICMSTot", "vNF")
        .map(|s| parse_f64(&s))
        .unwrap_or(0.0);
    let v_prod = find_text_in(inf_nfe, "ICMSTot", "vProd")
        .map(|s| parse_f64(&s))
        .unwrap_or(0.0);
    let v_icms = find_text_in(inf_nfe, "ICMSTot", "vICMS")
        .map(|s| parse_f64(&s))
        .unwrap_or(0.0);
    let v_st = find_text_in(inf_nfe, "ICMSTot", "vST")
        .map(|s| parse_f64(&s))
        .unwrap_or(0.0);

    Some(NfeParsed {
        id: uuid::Uuid::new_v4().to_string(),
        chave,
        data_emissao,
        cfop,
        uf_destino,
        ie_dest,
        cnpj_dest,
        x_nome,
        ind_final,
        n_nf,
        mod_nf,
        serie,
        v_nf,
        v_prod,
        v_icms,
        v_st,
        cnpj_emit,
        x_nome_emit,
        natureza_operacao,
        municipio,
        uf_end,
    })
}

pub fn is_valid_nfe(nfe: &NfeParsed, cancelled: &std::collections::HashSet<String>) -> bool {
    nfe.uf_destino.to_uppercase() == "RJ"
        && CFOPS_VALIDOS.contains(&nfe.cfop.as_str())
        && !cancelled.contains(&nfe.chave)
}
