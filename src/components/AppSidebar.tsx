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
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppData } from '@/contexts/AppDataContext';
import { useSidebarLargura } from '@/lib/useSidebarLargura';
import { MAX_CNPJ, MAX_NOME_EMPRESA, limitar } from '@/lib/limites';
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

function montarNavClass(recolhida: boolean) {
  return ({ isActive }: { isActive: boolean }) =>
    [
      'flex items-center rounded-lg text-sm font-medium transition-colors',
      recolhida ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-2',
      isActive
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
    ].join(' ');
}

export default function AppSidebar() {
  const { data, addEmpresa, reorderEmpresas } = useAppData();
  const [open, setOpen] = useState(false);
  const { largura, recolhida, arrastando, alternarRecolhida, iniciarArrasto } =
    useSidebarLargura();
  const navClass = montarNavClass(recolhida);
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
    // O reorder é otimista: se a gravação falhar, a ordem da UI divergiria da do
    // banco silenciosamente até a próxima abertura.
    reorderEmpresas(arrayMove(ids, oldIdx, newIdx)).catch((err) => {
      console.error(err);
      toast.error('Não foi possível salvar a nova ordem das empresas.');
    });
  }

  return (
    <aside
      className="relative flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground shrink-0"
      style={{
        width: largura,
        // Sem transição durante o arrasto, senão a borda "persegue" o cursor.
        transition: arrastando ? undefined : 'width 150ms ease',
      }}
    >
      {/* Alça de redimensionamento na borda direita. */}
      <div
        onPointerDown={iniciarArrasto}
        onDoubleClick={alternarRecolhida}
        title={recolhida ? 'Arraste ou clique duas vezes para expandir' : 'Arraste para redimensionar'}
        className={[
          'absolute right-0 top-0 z-20 h-full w-1.5 translate-x-1/2',
          recolhida ? 'cursor-e-resize' : 'cursor-col-resize',
          'hover:bg-primary/40 transition-colors',
          arrastando ? 'bg-primary/60' : 'bg-transparent',
        ].join(' ')}
      />

      {/* Logo */}
      <div
        className={[
          'flex items-center border-b py-4',
          recolhida ? 'justify-center px-2' : 'gap-2 px-4',
        ].join(' ')}
      >
        <div
          className={[
            'rounded-xl bg-primary shrink-0 flex items-center justify-center overflow-hidden',
            recolhida ? 'h-9 w-9' : 'h-12 w-12',
          ].join(' ')}
        >
          <img
            src="/icon.png"
            alt="logo"
            className={recolhida ? 'h-7 w-7 object-contain' : 'h-10 w-10 object-contain'}
          />
        </div>
        {!recolhida && (
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight truncate">Analisador</p>
            <p className="text-xs text-muted-foreground">NF-e</p>
          </div>
        )}
        {!recolhida && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-7 w-7 shrink-0"
            title="Recolher barra lateral"
            aria-label="Recolher barra lateral"
            onClick={alternarRecolhida}
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        )}
      </div>

      {recolhida && (
        <div className="flex justify-center border-b py-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Expandir barra lateral"
            aria-label="Expandir barra lateral"
            onClick={alternarRecolhida}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2 py-3 border-b">
        <NavLink to="/dashboard" className={navClass} title="Dashboard">
          <BarChart3 className="h-4 w-4 shrink-0" />
          {!recolhida && 'Dashboard'}
        </NavLink>
        <NavLink to="/tabelao" className={navClass} title="Tabelão">
          <LayoutGrid className="h-4 w-4 shrink-0" />
          {!recolhida && 'Tabelão'}
        </NavLink>
      </nav>

      {/* Empresas */}
      {recolhida ? (
        <div className="flex flex-1 justify-center pt-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Nova empresa"
            aria-label="Nova empresa"
            onClick={() => {
              alternarRecolhida();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Empresas
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Nova empresa"
          aria-label="Nova empresa"
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
        </>
      )}

      {/* Bottom */}
      <div className="border-t px-2 py-2">
        <NavLink to="/settings" className={navClass} title="Configurações">
          <Settings className="h-4 w-4 shrink-0" />
          {!recolhida && 'Configurações'}
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
                onChange={(e) => setNome(limitar(e.target.value, MAX_NOME_EMPRESA))}
                maxLength={MAX_NOME_EMPRESA}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>CNPJ</Label>
              <Input
                placeholder="00.000.000/0000-00"
                value={cnpj}
                onChange={(e) => setCnpj(limitar(e.target.value, MAX_CNPJ))}
                maxLength={MAX_CNPJ}
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
