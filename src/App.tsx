import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Toaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { AppDataProvider } from '@/contexts/AppDataContext';

// Carregadas sob demanda: o Dashboard traz o recharts e o Tabelão o jspdf,
// que antes iam para o chunk de entrada e eram baixados no boot mesmo que o
// usuário nunca abrisse aquelas telas.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Import = lazy(() => import('@/pages/Import'));
const NotFound = lazy(() => import('@/pages/NotFound'));
const Settings = lazy(() => import('@/pages/Settings'));
const Tabelao = lazy(() => import('@/pages/Tabelao'));

function Carregando() {
  return (
    <div className="flex h-screen items-center justify-center gap-2 bg-background text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Carregando...</span>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppDataProvider>
        <BrowserRouter>
          <Suspense fallback={<Carregando />}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/import" element={<Import />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tabelao" element={<Tabelao />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        {/* O sonner tem tema próprio, fora dos tokens do index.css, e o default
            é light — sem isto todo toast sai claro sobre a UI escura. */}
        <Toaster richColors theme="dark" position="bottom-right" />
      </AppDataProvider>
    </ErrorBoundary>
  );
}
