import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Sem isto, qualquer throw de render deixa a janela do Tauri completamente em
 * branco, sem console visível num build empacotado e sem caminho de volta.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro não tratado na interface', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center">
        <h1 className="text-xl font-bold">Algo deu errado</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          A interface encontrou um erro inesperado. Seus dados no banco não foram
          afetados.
        </p>
        <pre className="max-h-48 max-w-xl overflow-auto rounded-lg border border-border bg-card p-3 text-left text-xs font-mono text-muted-foreground">
          {error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent"
            onClick={() => this.setState({ error: null })}
          >
            Tentar novamente
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            onClick={() => window.location.reload()}
          >
            Recarregar o app
          </button>
        </div>
      </div>
    );
  }
}
