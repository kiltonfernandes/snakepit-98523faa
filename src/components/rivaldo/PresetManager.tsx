import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, Plus, Trash2, Check, Save, X, Sparkles, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, ProcessingProfile } from '@/lib/audio/types';
import { cn } from '@/lib/utils';

export interface RivaldoPreset {
  id: string;
  name: string;
  description: string | null;
  audio_params_json: AudioParams;
  processing_profile_json: ProcessingProfile;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface PresetManagerProps {
  currentParams: AudioParams;
  currentProfile: ProcessingProfile;
  onApplyPreset: (params: AudioParams, profile: ProcessingProfile) => void;
}

function genId() {
  return `prs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function PresetManager({ currentParams, currentProfile, onApplyPreset }: PresetManagerProps) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<RivaldoPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<RivaldoPreset | null>(null);

  const loadPresets = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rivaldo_presets')
      .select('*')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error('Falha ao carregar presets');
      return;
    }
    setPresets((data ?? []) as unknown as RivaldoPreset[]);
  };

  useEffect(() => {
    if (open) loadPresets();
  }, [open]);

  const handleApply = (preset: RivaldoPreset) => {
    const params = { ...DEFAULT_PARAMS, ...(preset.audio_params_json || {}) };
    const profile = { ...DEFAULT_PROCESSING_PROFILE, ...(preset.processing_profile_json || {}) };
    onApplyPreset(params, profile);
    setActiveId(preset.id);
    toast.success(`Preset "${preset.name}" aplicado`);
    setOpen(false);
  };

  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Dê um nome ao preset');
      return;
    }
    setSaving(true);
    const id = genId();
    const now = new Date().toISOString().slice(0, 19) + 'Z';
    const { error } = await supabase.from('rivaldo_presets').insert([{
      id,
      name,
      description: newDescription.trim() || null,
      audio_params_json: currentParams as unknown as never,
      processing_profile_json: currentProfile as unknown as never,
      is_default: false,
      created_at: now,
      updated_at: now,
    }]);
    setSaving(false);
    if (error) {
      toast.error('Falha ao salvar preset');
      return;
    }
    toast.success(`Preset "${name}" salvo`);
    setNewName('');
    setNewDescription('');
    setSaveOpen(false);
    setActiveId(id);
    loadPresets();
  };

  const handleOverwrite = async (preset: RivaldoPreset) => {
    const now = new Date().toISOString().slice(0, 19) + 'Z';
    const { error } = await supabase
      .from('rivaldo_presets')
      .update({
        audio_params_json: currentParams as unknown as never,
        processing_profile_json: currentProfile as unknown as never,
        updated_at: now,
      })
      .eq('id', preset.id);
    if (error) {
      toast.error('Falha ao atualizar preset');
      return;
    }
    toast.success(`"${preset.name}" atualizado com os valores atuais`);
    loadPresets();
  };

  const handleDelete = async (preset: RivaldoPreset) => {
    const { error } = await supabase.from('rivaldo_presets').delete().eq('id', preset.id);
    if (error) {
      toast.error('Falha ao remover preset');
      return;
    }
    toast.success(`"${preset.name}" removido`);
    if (activeId === preset.id) setActiveId(null);
    setConfirmDelete(null);
    loadPresets();
  };

  const handleSetDefault = async (preset: RivaldoPreset) => {
    // unset others, set this one
    const { error: unsetErr } = await supabase
      .from('rivaldo_presets')
      .update({ is_default: false })
      .neq('id', preset.id);
    if (unsetErr) {
      toast.error('Falha ao definir padrão');
      return;
    }
    const { error } = await supabase
      .from('rivaldo_presets')
      .update({ is_default: !preset.is_default })
      .eq('id', preset.id);
    if (error) {
      toast.error('Falha ao definir padrão');
      return;
    }
    toast.success(preset.is_default ? 'Removido como padrão' : `"${preset.name}" agora é o padrão`);
    loadPresets();
  };

  const activePreset = presets.find((p) => p.id === activeId);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-7 gap-1.5 text-[10px] font-mono w-full"
      >
        <Bookmark className="w-3 h-3" />
        {activePreset ? (
          <span className="truncate">{activePreset.name}</span>
        ) : (
          <span>Presets</span>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-primary" />
              Presets do Rivaldo
            </DialogTitle>
            <DialogDescription>
              Salve combinações de sliders e perfil de processamento, depois carregue com um clique.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              {loading ? 'Carregando...' : `${presets.length} preset${presets.length === 1 ? '' : 's'} salvo${presets.length === 1 ? '' : 's'}`}
            </p>
            <Button size="sm" onClick={() => setSaveOpen(true)} className="h-8 gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Salvar atual como preset
            </Button>
          </div>

          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {presets.map((preset) => (
                <motion.div
                  key={preset.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={cn(
                    'rounded-lg border p-3 transition-colors',
                    activeId === preset.id
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border bg-muted/20 hover:bg-muted/30'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {preset.is_default && (
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                        )}
                        <h4 className="text-sm font-semibold truncate">{preset.name}</h4>
                        {activeId === preset.id && (
                          <span className="flex items-center gap-0.5 text-[9px] font-mono text-primary">
                            <Check className="w-2.5 h-2.5" /> ativo
                          </span>
                        )}
                      </div>
                      {preset.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {preset.description}
                        </p>
                      )}
                      <p className="text-[10px] font-mono text-muted-foreground/60 mt-1">
                        Atualizado {preset.updated_at.slice(0, 10)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title={preset.is_default ? 'Remover padrão' : 'Definir como padrão'}
                        onClick={() => handleSetDefault(preset)}
                      >
                        <Star className={cn('w-3.5 h-3.5', preset.is_default && 'fill-amber-400 text-amber-400')} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Sobrescrever com valores atuais"
                        onClick={() => handleOverwrite(preset)}
                      >
                        <Save className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Remover"
                        onClick={() => setConfirmDelete(preset)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={activeId === preset.id ? 'default' : 'secondary'}
                    className="w-full mt-2 h-7 text-xs gap-1.5"
                    onClick={() => handleApply(preset)}
                  >
                    <Sparkles className="w-3 h-3" />
                    {activeId === preset.id ? 'Reaplicar' : 'Carregar preset'}
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>

            {!loading && presets.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Nenhum preset ainda. Configure os sliders e clique em "Salvar atual como preset".
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar preset</DialogTitle>
            <DialogDescription>
              Os valores atuais dos sliders e do perfil de processamento serão salvos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Voz limpa, BGM forte..."
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Descrição (opcional)</label>
              <Textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Quando usar este preset?"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saving}>
              <X className="w-3.5 h-3.5 mr-1" /> Cancelar
            </Button>
            <Button onClick={handleSaveNew} disabled={saving || !newName.trim()}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover preset?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" será removido permanentemente. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}