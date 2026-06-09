import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <p className="text-6xl font-bold text-muted-foreground">404</p>
      <p className="text-muted-foreground">Página não encontrada</p>
      <Button onClick={() => navigate('/import')}>Voltar ao início</Button>
    </div>
  );
}
