import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { useApp } from '@/contexts/AppContext';
import { normalizePreprodPauta, type PreprodPauta } from '@/lib/preprod-calendar';
import { syncAllPreprodToRivaldo } from '@/lib/preprod-rivaldo-sync';
import { buildRivaldoPreprodGroups, type RivaldoPreprodEpisode } from '@/lib/rivaldo-episodes';
import { supabase } from '@/integrations/supabase/client';
import { EpisodePickerModal } from './EpisodePickerModal';

interface EpisodePickerControlProps {
  filename: string;
  selectedId: string | null;
  onSelect: (episode: RivaldoPreprodEpisode) => void;
}

export function EpisodePickerControl({ filename, selectedId, onSelect }: EpisodePickerControlProps) {
  const { materials, refreshMaterials } = useApp();
  const [open, setOpen] = useState(false);
  const [pautas, setPautas] = useState<PreprodPauta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCachedPautas = useRef(false);

  const loadPautas = useCallback(async (showBlockingLoader: boolean) => {
    if (showBlockingLoader && !hasCachedPautas.current) setLoading(true);
    const { data, error: loadError } = await supabase
      .from('preprod_pautas')
      .select('*')
      .order('publication_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (loadError) {
      if (!hasCachedPautas.current) setError(`Falha ao carregar Pré-produção: ${loadError.message}`);
    } else {
      const next = (data || []).map(normalizePreprodPauta);
      hasCachedPautas.current = next.length > 0;
      setPautas(next);
      setError(null);
    }
    setLoading(false);
  }, []);

  const refreshMirrors = useCallback(() => {
    void syncAllPreprodToRivaldo()
      .catch((syncError) => console.warn('[rivaldo] falha ao sincronizar pré-produção', syncError))
      .finally(() => void refreshMaterials());
  }, [refreshMaterials]);

  useEffect(() => {
    void loadPautas(true);
    refreshMirrors();
  }, [loadPautas, refreshMirrors]);

  const groups = useMemo(() => buildRivaldoPreprodGroups(pautas, materials), [materials, pautas]);

  const handleOpen = () => {
    setOpen(true);
    void loadPautas(false);
    refreshMirrors();
  };

  return (
    <div className="flex-1 max-w-md ml-8">
      <Label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        Nome do episódio
      </Label>
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center justify-between gap-2 border-0 border-b border-border bg-transparent pb-2 pt-1 text-left text-sm font-mono hover:border-primary/60 focus:outline-none"
        title="Selecionar episódio"
      >
        <span className={filename ? 'truncate' : 'truncate text-muted-foreground'}>
          {filename || 'Selecione o episódio...'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      <EpisodePickerModal
        open={open}
        onClose={() => setOpen(false)}
        onSelect={onSelect}
        selectedId={selectedId}
        groups={groups}
        loading={loading}
        error={error}
      />
    </div>
  );
}
