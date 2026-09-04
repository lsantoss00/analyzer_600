/// Cancellation event types in NF-e ecosystem
const CANCEL_EVENTS: &[&str] = &[
    "110111", // Cancelamento da NF-e
    "110112", // Cancelamento da NF-e por Substituição
    "110114", // NF-e não realizada (treated as cancelled)
];

/// Devolve a chave da nota se este XML for um evento de cancelamento.
///
/// Recebe o Document já construído: antes esta função montava o DOM só para
/// descobrir que o arquivo não era um evento, e o parse_nfe montava tudo de novo.
pub fn parse_evento(doc: &roxmltree::Document) -> Option<String> {
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
