import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { notify } from '@/lib/notify';
import { useAppData } from '@/contexts/AppDataContext';
import type { Empresa, Resumo } from '@/lib/types';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import LoteItem from './LoteItem';

interface Props {
  empresa: Empresa;
}

type ImportPhase = 'idle' | 'config' | 'processing';

export default function EmpresaItem({ empresa }: Props) {
  const { data, editEmpresa, removeEmpresa, setEmpresaAtiva, addLote, setLoteAtivo, refresh } =
    useAppData();
  const isActive = data.empresaAtiva === empresa.id;

  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [nome, setNome] = useState(empresa.nome);
  const [cnpj, setCnpj] = useState(empresa.cnpj);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Import flow
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [scanned, setScanned] = useState<string[]>([]);
  const [folderPath, setFolderPath] = useState('');
  const [loteNome, setLoteNome] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const unlistenRef = useRef<(() => void) | null>(null);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: empresa.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  async function handleEdit() {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      await editEmpresa(empresa.id, nome.trim(), cnpj.trim());
      toast.success('Empresa atualizada');
      setEditOpen(false);
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    setPendingDelete(true);

    const tid = setTimeout(async () => {
      try {
        await removeEmpresa(empresa.id);
      } catch {
        toast.error('Erro ao remover empresa');
        setPendingDelete(false);
      }
    }, 6000);
    deleteTimerRef.current = tid;

    toast(`Empresa "${empresa.nome}" removida`, {
      description: `${empresa.lotes.length} lote(s) serão excluídos`,
      action: {
        label: 'Desfazer',
        onClick: () => {
          clearTimeout(tid);
          deleteTimerRef.current = null;
          setPendingDelete(false);
        },
      },
      duration: 6000,
    });
  }

  async function handlePickFolder() {
    const selected = await openDialog({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;

    let paths: string[] = [];
    try {
      paths = await invoke<string[]>('scan_folder', { path: selected });
    } catch {
      toast.error('Erro ao escanear pasta');
      return;
    }

    if (paths.length === 0) {
      toast.warning('Nenhum arquivo XML encontrado na pasta selecionada.');
      return;
    }

    const parts = selected.replace(/\\/g, '/').split('/');
    setFolderPath(selected);
    setScanned(paths);
    setLoteNome(parts[parts.length - 1] ?? 'Novo Lote');
    setImportPhase('config');
  }

  async function handleProcess() {
    if (!loteNome.trim()) return;
    setImportPhase('processing');
    setProgress({ done: 0, total: scanned.length });

    const unlisten = await listen<{ done: number; total: number }>('process-progress', (e) => {
      setProgress({ done: e.payload.done, total: e.payload.total });
    });
    unlistenRef.current = unlisten;

    try {
      const loteId = await addLote(empresa.id, loteNome.trim());
      const resumo: Resumo = await invoke('process_lote', { loteId, xmlPaths: scanned });
      await refresh();
      setLoteAtivo(loteId);
      const msg = `${resumo.notasTotais.toLocaleString('pt-BR')} notas válidas de ${scanned.length.toLocaleString('pt-BR')} arquivos`;
      toast.success(`Lote processado: ${msg}`);
      notify(`Lote "${loteNome}" processado`, msg);
    } catch (err) {
      toast.error(`Erro ao processar: ${String(err)}`);
    } finally {
      unlisten();
      unlistenRef.current = null;
      setImportPhase('idle');
      setScanned([]);
      setFolderPath('');
    }
  }

  function closeImportDialog() {
    if (importPhase === 'processing') return; // cannot close while processing
    setImportPhase('idle');
    setScanned([]);
    setFolderPath('');
  }

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  if (pendingDelete) {
    return (
      <div ref={setNodeRef} style={style} className="mb-1 opacity-40 select-none">
        <div className="flex items-center gap-1 rounded-md px-1 py-1">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-sm font-medium line-through">{empresa.nome}</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="mb-1">
      {/* Empresa row */}
      <div
        className={[
          'group flex items-center gap-1 rounded-md px-1 py-1 cursor-pointer select-none',
          isActive ? 'bg-sidebar-accent' : 'hover:bg-sidebar-accent/40',
        ].join(' ')}
        onClick={() => {
          setExpanded((v) => !v);
          setEmpresaAtiva(empresa.id);
        }}
      >
        <span {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-50 p-0.5">
          <GripVertical className="h-3 w-3" />
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-sm font-medium">{empresa.nome}</span>
        <span className="ml-auto flex opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            title="Novo lote"
            onClick={(e) => { e.stopPropagation(); handlePickFolder(); }}
          >
            <Plus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); setNome(empresa.nome); setCnpj(empresa.cnpj); setEditOpen(true); }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </span>
      </div>

      {/* Lotes */}
      {expanded && (
        <div className="pl-4">
          {empresa.lotes.map((lote) => (
            <LoteItem key={lote.id} lote={lote} empresaId={empresa.id} />
          ))}
        </div>
      )}

      {/* Edit empresa dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Empresa</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleEdit()} />
            </div>
            <div className="grid gap-1.5">
              <Label>CNPJ</Label>
              <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNome(empresa.nome); setCnpj(empresa.cnpj); setEditOpen(false); }}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!nome.trim() || saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import lote dialog */}
      <Dialog open={importPhase !== 'idle'} onOpenChange={() => closeImportDialog()}>
        <DialogContent>
          {importPhase === 'config' && (
            <>
              <DialogHeader>
                <DialogTitle>Novo Lote — {empresa.nome}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                  <p className="font-medium">
                    {scanned.length.toLocaleString('pt-BR')} arquivos XML encontrados
                  </p>
                  <p className="text-muted-foreground truncate text-xs mt-0.5">{folderPath}</p>
                </div>
                <div className="grid gap-1.5">
                  <Label>Nome do lote *</Label>
                  <Input
                    value={loteNome}
                    onChange={(e) => setLoteNome(e.target.value.slice(0, 200))}
                    onKeyDown={(e) => e.key === 'Enter' && handleProcess()}
                    maxLength={200}
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeImportDialog}>Cancelar</Button>
                <Button onClick={handleProcess} disabled={!loteNome.trim()}>Processar</Button>
              </DialogFooter>
            </>
          )}

          {importPhase === 'processing' && (
            <>
              <DialogHeader>
                <DialogTitle>Processando XMLs...</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{loteNome}</p>
                    <p className="text-xs text-muted-foreground">
                      {progress.done.toLocaleString('pt-BR')} de {progress.total.toLocaleString('pt-BR')} arquivos
                    </p>
                  </div>
                  <span className="text-sm font-mono">{Math.round(pct)}%</span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
