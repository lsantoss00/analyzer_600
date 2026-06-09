import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import type { Empresa } from '@/lib/types';
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
import LoteItem from './LoteItem';

interface Props {
  empresa: Empresa;
}

export default function EmpresaItem({ empresa }: Props) {
  const { data, editEmpresa, removeEmpresa, addLote, setEmpresaAtiva } = useAppData();
  const isActive = data.empresaAtiva === empresa.id;

  const [expanded, setExpanded] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addLoteOpen, setAddLoteOpen] = useState(false);
  const [nome, setNome] = useState(empresa.nome);
  const [cnpj, setCnpj] = useState(empresa.cnpj);
  const [loteNome, setLoteNome] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function handleDelete() {
    if (!confirm(`Excluir "${empresa.nome}" e todos os seus lotes?`)) return;
    try {
      await removeEmpresa(empresa.id);
      toast.success('Empresa removida');
    } catch {
      toast.error('Erro ao remover');
    }
  }

  async function handleAddLote() {
    if (!loteNome.trim()) return;
    setSaving(true);
    try {
      await addLote(empresa.id, loteNome.trim());
      setEmpresaAtiva(empresa.id);
      toast.success('Lote criado');
      setLoteNome('');
      setAddLoteOpen(false);
    } catch {
      toast.error('Erro ao criar lote');
    } finally {
      setSaving(false);
    }
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
            onClick={(e) => { e.stopPropagation(); setAddLoteOpen(true); }}
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

      {/* Edit dialog */}
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

      {/* Add Lote dialog */}
      <Dialog open={addLoteOpen} onOpenChange={setAddLoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Lote</DialogTitle></DialogHeader>
          <div className="grid gap-1.5 py-2">
            <Label>Nome do lote *</Label>
            <Input
              placeholder="Ex: Janeiro 2024"
              value={loteNome}
              onChange={(e) => setLoteNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddLote()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLoteOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddLote} disabled={!loteNome.trim() || saving}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
