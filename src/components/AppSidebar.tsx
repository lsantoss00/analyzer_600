import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  BarChart3,
  LayoutGrid,
  Plus,
  Settings,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ScrollArea } from './ui/scroll-area';
import EmpresaItem from './sidebar/EmpresaItem';

function navClass({ isActive }: { isActive: boolean }) {
  return [
    'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
      : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
  ].join(' ');
}

export default function AppSidebar() {
  const { data, addEmpresa, reorderEmpresas } = useAppData();
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  async function handleAdd() {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      await addEmpresa(nome.trim(), cnpj.trim());
      toast.success('Empresa adicionada');
      setNome('');
      setCnpj('');
      setOpen(false);
    } catch {
      toast.error('Erro ao adicionar empresa');
    } finally {
      setSaving(false);
    }
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = data.empresas.map((e) => e.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    reorderEmpresas(arrayMove(ids, oldIdx, newIdx)).catch(console.error);
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-4 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
          NF
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Analisador</p>
          <p className="text-xs text-muted-foreground">NF-e</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2 py-3 border-b">
        <NavLink to="/dashboard" className={navClass}>
          <BarChart3 className="h-4 w-4" /> Dashboard
        </NavLink>
        <NavLink to="/tabelao" className={navClass}>
          <LayoutGrid className="h-4 w-4" /> Tabelão
        </NavLink>
      </nav>

      {/* Empresas */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Empresas
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {data.empresas.length === 0 && (
            <p className="px-2 py-4 text-xs text-muted-foreground text-center">
              Nenhuma empresa. Clique em + para adicionar.
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={data.empresas.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {data.empresas.map((empresa) => (
                <EmpresaItem key={empresa.id} empresa={empresa} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>

      {/* Bottom */}
      <div className="border-t px-2 py-2">
        <NavLink to="/settings" className={navClass}>
          <Settings className="h-4 w-4" /> Configurações
        </NavLink>
      </div>

      {/* Add Empresa Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Empresa</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Nome *</Label>
              <Input
                placeholder="Nome da empresa"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>CNPJ</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={!nome.trim() || saving}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
