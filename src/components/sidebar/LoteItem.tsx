import { CheckCircle2, Clock, Loader2, Pencil, Trash2, XCircle } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import type { Lote } from '@/lib/types';
import { MAX_NOME_LOTE, limitar } from '@/lib/limites';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

interface Props {
  lote: Lote;
  empresaId: string;
}

const statusIcon: Record<string, ReactElement> = {
  done: <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />,
  processing: <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />,
  pending: <Clock className="h-3 w-3 text-muted-foreground shrink-0" />,
  error: <XCircle className="h-3 w-3 text-destructive shrink-0" />,
};

const statusLabel: Record<string, string> = {
  done: 'Processado',
  processing: 'Processando...',
  pending: 'Aguardando processamento',
  error: 'Falhou — reprocesse pelo botão Reprocessar ou exclua o lote',
};

// A coluna status é TEXT livre no SQLite; sem fallback um valor inesperado
// renderizaria undefined e a linha ficaria sem ícone.
function StatusIcon({ status }: { status: string }) {
  return statusIcon[status] ?? statusIcon.pending;
}

export default function LoteItem({ lote, empresaId: _empresaId }: Props) {
  const { data, setLoteAtivo, editLoteNome, removeLote } = useAppData();
  const navigate = useNavigate();
  const isActive = data.loteAtivo === lote.id;
  const [editOpen, setEditOpen] = useState(false);
  const [nome, setNome] = useState(lote.nome);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleEdit() {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      await editLoteNome(lote.id, nome.trim());
      toast.success('Lote renomeado');
      setEditOpen(false);
    } catch {
      toast.error('Erro ao renomear');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await removeLote(lote.id);
      toast.success(`Lote "${lote.nome}" excluído`);
      setDeleteOpen(false);
    } catch (err) {
      toast.error(`Erro ao remover lote: ${String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        className={[
          'group flex items-center gap-1.5 rounded-md px-2 py-1 cursor-pointer text-sm select-none',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/40 text-sidebar-foreground',
        ].join(' ')}
        onClick={() => { setLoteAtivo(lote.id); navigate('/import'); }}
        title={statusLabel[lote.status] ?? lote.status}
      >
        <StatusIcon status={lote.status} />
        <span className="flex-1 truncate">{lote.nome}</span>
        <span className="flex opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={(e) => { e.stopPropagation(); setNome(lote.nome); setEditOpen(true); }}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </span>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Renomear Lote</DialogTitle></DialogHeader>
          <Input
            value={nome}
            onChange={(e) => setNome(limitar(e.target.value, MAX_NOME_LOTE))}
            onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
            maxLength={MAX_NOME_LOTE}
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setNome(lote.nome); setEditOpen(false); }}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!nome.trim() || saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir lote?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              O lote <strong>{lote.nome}</strong> e todas as suas notas serão
              excluídos permanentemente.
            </p>
            <p className="text-muted-foreground text-xs">
              {lote.totalValido.toLocaleString('pt-BR')} notas no banco. Esta ação
              não pode ser desfeita.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? 'Excluindo...' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
