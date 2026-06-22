import { CheckCircle2, Clock, Loader2, Pencil, Trash2, XCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import type { Lote } from '@/lib/types';
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

const statusIcon = {
  done: <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />,
  processing: <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />,
  pending: <Clock className="h-3 w-3 text-muted-foreground shrink-0" />,
  error: <XCircle className="h-3 w-3 text-destructive shrink-0" />,
};

export default function LoteItem({ lote, empresaId: _empresaId }: Props) {
  const { data, setLoteAtivo, editLoteNome, removeLote } = useAppData();
  const navigate = useNavigate();
  const isActive = data.loteAtivo === lote.id;
  const [editOpen, setEditOpen] = useState(false);
  const [nome, setNome] = useState(lote.nome);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setPendingDelete(true);

    const tid = setTimeout(async () => {
      try {
        await removeLote(lote.id);
      } catch {
        toast.error('Erro ao remover lote');
        setPendingDelete(false);
      }
    }, 5000);
    deleteTimerRef.current = tid;

    toast(`Lote "${lote.nome}" removido`, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          clearTimeout(tid);
          deleteTimerRef.current = null;
          setPendingDelete(false);
        },
      },
      duration: 5000,
    });
  }

  if (pendingDelete) {
    return (
      <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm opacity-40 select-none">
        {statusIcon[lote.status]}
        <span className="flex-1 truncate line-through">{lote.nome}</span>
      </div>
    );
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
      >
        {statusIcon[lote.status]}
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
            onClick={handleDelete}
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
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setNome(lote.nome); setEditOpen(false); }}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!nome.trim() || saving}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
