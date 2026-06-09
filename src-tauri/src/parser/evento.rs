/// Cancellation event types in NF-e ecosystem
const CANCEL_EVENTS: &[&str] = &[
    "110111", // Cancelamento da NF-e
    "110112", // Cancelamento da NF-e por Substituição
    "110114", // NF-e não realizada (treated as cancelled)
];

/// Returns the chave of the nota if this XML is a cancellation evento, None otherwise.
pub fn parse_evento(xml: &str) -> Option<String> {
    let doc = roxmltree::Document::parse(xml).ok()?;
    let root = doc.root_element();

    let inf_evento = root
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "infEvento")?;

    let tp_evento = inf_evento
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "tpEvento")
        .and_then(|n| n.text())
        .map(|s| s.trim())?;

    if !CANCEL_EVENTS.contains(&tp_evento) {
        return None;
    }

    inf_evento
        .descendants()
        .find(|n| n.is_element() && n.tag_name().name() == "chNFe")
        .and_then(|n| n.text())
        .map(|s| s.trim().to_string())
}
