import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function Pautas() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6 text-primary" />
          Pautas
        </h1>
        <p className="text-muted-foreground mt-1">Workspace semanal de pautas editoriais</p>
      </div>

      <WorkspaceShell
        weekLabel="Semana Atual"
        actions={
          <Button size="sm" variant="outline">
            Gerar Prompts
          </Button>
        }
        renderDay={(day) => (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Pauta de {day.label} — aguardando conteúdo
            </p>
          </div>
        )}
      />
    </div>
  );
}
