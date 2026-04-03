import { useState } from 'react';
import { RotateCcw, Save, FileCode, ChevronRight, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PROMPT_BLOCKS, type PromptOverrides } from '@/lib/prompt-defaults';
import { toast } from 'sonner';

interface PromptManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  overrides: PromptOverrides;
  onSave: (overrides: PromptOverrides) => void;
}

const GROUPS = ['Compartilhado', 'Seções', 'Materiais'] as const;

export function PromptManager({ open, onOpenChange, overrides, onSave }: PromptManagerProps) {
  const [localOverrides, setLocalOverrides] = useState<PromptOverrides>({ ...overrides });
  const [selectedKey, setSelectedKey] = useState<string>(PROMPT_BLOCKS[0].key);
  const [hasChanges, setHasChanges] = useState(false);

  const selectedBlock = PROMPT_BLOCKS.find(b => b.key === selectedKey)!;
  const currentText = localOverrides[selectedKey] || selectedBlock.defaultText;
  const isOverridden = !!localOverrides[selectedKey];

  const handleTextChange = (text: string) => {
    const next = { ...localOverrides };
    if (text === selectedBlock.defaultText) {
      delete next[selectedKey];
    } else {
      next[selectedKey] = text;
    }
    setLocalOverrides(next);
    setHasChanges(true);
  };

  const handleReset = () => {
    const next = { ...localOverrides };
    delete next[selectedKey];
    setLocalOverrides(next);
    setHasChanges(true);
    toast.info(`"${selectedBlock.label}" restaurado ao padrão`);
  };

  const handleSaveAll = () => {
    onSave(localOverrides);
    setHasChanges(false);
    toast.success('Prompts salvos');
  };

  const handleResetAll = () => {
    setLocalOverrides({});
    setHasChanges(true);
    toast.info('Todos os prompts restaurados ao padrão');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v && hasChanges) {
        if (!confirm('Você tem alterações não salvas. Deseja sair?')) return;
      }
      onOpenChange(v);
    }}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            Gerenciador de Prompts
          </DialogTitle>
          <DialogDescription>
            Edite os blocos de prompt. Cada bloco tem uma seção de <strong>Ingest</strong> (contexto que a IA lê) ou <strong>Output</strong> (instruções de formato).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar - block list */}
          <div className="w-64 border-r border-border flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-4">
                {GROUPS.map(group => {
                  const blocks = PROMPT_BLOCKS.filter(b => b.group === group);
                  return (
                    <div key={group}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">{group}</p>
                      <div className="space-y-0.5">
                        {blocks.map(block => {
                          const hasOverride = !!localOverrides[block.key];
                          return (
                            <button
                              key={block.key}
                              onClick={() => setSelectedKey(block.key)}
                              className={cn(
                                'w-full text-left px-2.5 py-2 rounded-md text-xs transition-colors flex items-center gap-2',
                                selectedKey === block.key
                                  ? 'bg-primary/10 text-primary font-medium'
                                  : 'hover:bg-muted text-foreground'
                              )}
                            >
                              <Tag className="h-3 w-3 shrink-0" />
                              <span className="flex-1 truncate">{block.label}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <Badge variant={block.category === 'ingest' ? 'secondary' : 'outline'} className="text-[8px] px-1 py-0">
                                  {block.category === 'ingest' ? 'IN' : 'OUT'}
                                </Badge>
                                {hasOverride && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                              </div>
                              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Bottom actions */}
            <div className="p-3 border-t border-border space-y-2">
              <Button size="sm" className="w-full gap-1.5" onClick={handleSaveAll} disabled={!hasChanges}>
                <Save className="h-3.5 w-3.5" /> Salvar Todos
              </Button>
              <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" onClick={handleResetAll}>
                <RotateCcw className="h-3 w-3" /> Resetar Todos
              </Button>
            </div>
          </div>

          {/* Main editor */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="px-6 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{selectedBlock.label}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={selectedBlock.category === 'ingest' ? 'secondary' : 'outline'} className="text-[10px]">
                      {selectedBlock.category === 'ingest' ? 'Ingest — Contexto' : 'Output — Instruções'}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{selectedBlock.group}</span>
                    {isOverridden && (
                      <Badge variant="default" className="text-[10px] bg-primary/20 text-primary">Customizado</Badge>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={handleReset} disabled={!isOverridden}>
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              </div>
            </div>

            <div className="flex-1 p-6 min-h-0">
              <Textarea
                className="h-full resize-none font-mono text-xs"
                value={currentText}
                onChange={e => handleTextChange(e.target.value)}
                placeholder="Texto do prompt..."
              />
            </div>

            <div className="px-6 py-3 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{currentText.length} caracteres · ~{Math.ceil(currentText.split(/\s+/).length * 1.3)} tokens estimados</span>
              <span>{isOverridden ? 'Usando versão customizada' : 'Usando padrão do sistema'}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
