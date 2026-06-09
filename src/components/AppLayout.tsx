import type { ReactNode } from 'react';
import AppSidebar from './AppSidebar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
