import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  sub?: string;
  accent?: 'default' | 'green' | 'blue' | 'amber';
}

const accentColors = {
  default: 'text-muted-foreground bg-muted',
  green: 'text-green-600 bg-green-50 dark:bg-green-950',
  blue: 'text-blue-600 bg-blue-50 dark:bg-blue-950',
  amber: 'text-amber-600 bg-amber-50 dark:bg-amber-950',
};

export default function StatCard({ label, value, icon: Icon, sub, accent = 'default' }: Props) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`rounded-lg p-2 ${accentColors[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
