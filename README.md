# Analisador NF-e

Aplicativo desktop para apurar **IEs distintas** a partir de XMLs de NF-e, no
contexto do **Decreto 9.025 (RIOLOG/RJ)**. Roda 100% local: nenhum dado sai da
máquina.

O objetivo do fluxo é acompanhar quantas Inscrições Estaduais distintas e
elegíveis a empresa alcançou no período, contra a meta configurada (600 por
padrão).

## Como funciona

1. **Empresa** → você cria uma empresa na barra lateral.
2. **Lote** → clica no `+` da empresa e aponta para uma pasta de XMLs. O
   backend em Rust varre a pasta, faz o parse em paralelo e grava no SQLite.
3. **Análise** → o Dashboard mostra o panorama e o Tabelão detalha as IEs, com
   filtros, comparação entre períodos e exportação para Excel e PDF.

## Regras de negócio

Configuráveis em **Configurações → Regras de Negócio**, com estes padrões:

| Regra | Padrão |
|---|---|
| UF de destino | `RJ` |
| CFOPs aceitos | `5102`, `5403`, `5405` (correspondência exata, sem faixas) |
| Meta de IEs | 600 |
| Valor mínimo por IE | 0 (sem filtro) |

Além disso, e não configurável:

- **Cancelamento**: uma nota é descartada se a mesma pasta contiver um evento de
  cancelamento (`tpEvento` 110111, 110112 ou 110114) apontando para a chave dela.
- **Consumidor Final**: decidido por IE, não por nota — uma IE só é considerada
  Consumidor Final se **todas** as suas notas tiverem `indFinal=1`. IEs não
  Consumidor Final são as que contam para a meta.

## Stack

- **Frontend**: Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui (Base UI),
  Recharts, xlsx, jsPDF
- **Backend**: Rust (Tauri v2), `roxmltree` + `rayon` para o parse paralelo
- **Banco**: SQLite — leituras pelo `tauri-plugin-sql`, escrita em lote via
  `rusqlite`

## Desenvolvimento

```powershell
.\dev.ps1
```

O script cuida do PATH e das variáveis necessárias. Para build de release:

```powershell
$env:CARGO_TARGET_DIR = "$env:USERPROFILE\dev\target"
npm run tauri build
```

### Pegadinha do caminho com espaços

O caminho do projeto contém espaços (`02 - GitHub`), o que quebra o `windres`.
A solução é apontar `CARGO_TARGET_DIR` para fora dele — é o que o `dev.ps1` faz.

**Não rode o build a partir da junção `%USERPROFILE%\dev\a600`.** Por ela, o Vite
resolve o `index.html` pelo caminho real e o Rollup falha. A junção só serve para
comandos exclusivamente Rust, como `cargo check`.

### Migrations

O schema é versionado em `src-tauri/src/lib.rs`. O `sqlx` compara o checksum das
migrations já aplicadas: **editar o SQL de uma versão existente faz o app deixar
de abrir** para quem já tem banco. Toda mudança entra numa versão nova, aditiva.

## Qualidade

```bash
npm run lint        # ESLint
npx tsc --noEmit    # checagem de tipos
```
