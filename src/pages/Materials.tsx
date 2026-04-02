import { Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';

export default function Materials() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          Materiais
        </h1>
        <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
      </div>

      <Tabs defaultValue="titles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="titles">Títulos</TabsTrigger>
          <TabsTrigger value="descriptions">Descrições</TabsTrigger>
          <TabsTrigger value="covers">Capas</TabsTrigger>
        </TabsList>

        <TabsContent value="titles">
          <WorkspaceShell
            weekLabel="Títulos da Semana"
            actions={<Button size="sm">Gerar Todos os Títulos</Button>}
            renderDay={(day) => (
              <p className="text-xs text-muted-foreground">
                Título de {day.label} — aguardando geração
              </p>
            )}
          />
        </TabsContent>

        <TabsContent value="descriptions">
          <WorkspaceShell
            weekLabel="Descrições da Semana"
            actions={<Button size="sm">Gerar Todas as Descrições</Button>}
            renderDay={(day) => (
              <p className="text-xs text-muted-foreground">
                Descrição de {day.label} — aguardando geração
              </p>
            )}
          />
        </TabsContent>

        <TabsContent value="covers">
          <WorkspaceShell
            weekLabel="Capas da Semana"
            actions={<Button size="sm">Criar Todas as Capas</Button>}
            renderDay={(day) => (
              <div className="flex items-center justify-center h-24 rounded-md border border-dashed border-border">
                <p className="text-xs text-muted-foreground">Capa {day.short}</p>
              </div>
            )}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
