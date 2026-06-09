import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppDataProvider } from '@/contexts/AppDataContext';
import Dashboard from '@/pages/Dashboard';
import Import from '@/pages/Import';
import NotFound from '@/pages/NotFound';
import Settings from '@/pages/Settings';
import Tabelao from '@/pages/Tabelao';

export default function App() {
  return (
    <AppDataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/import" element={<Import />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/tabelao" element={<Tabelao />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="bottom-right" />
    </AppDataProvider>
  );
}
