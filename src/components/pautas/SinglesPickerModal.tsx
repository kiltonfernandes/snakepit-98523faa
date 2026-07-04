/**
 * SinglesPickerModal — passo "singles_pick" do fluxo Pré-produção.
 *
 * - Cadastra canais do YouTube (nome + URL). O sistema resolve o feed RSS.
 * - Lista vídeos dos últimos N dias (configurável, padrão 5).
 * - Permite enriquecer via IA (banda / single / one-liner) em lote.
 * - Cada linha tem um insumo editável (com busca manual + IA).
 * - Ao confirmar, devolve a seleção ao pai (PreProducao) via onConfirm.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, RefreshCw, Sparkles, Trash2, Youtube, Globe, ExternalLink, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { SinglesVideoInput } from '@/lib/preprod-prompts';

interface Channel {
  id: string;
  name: string;
  channel_url: string;
  feed_url: string;
  monitor_days: number;
  active: boolean;
  last_synced_at: string | null;
}

interface Video {
  id: string;
  channel_id: string;
  video_id: string;
  video_url: string;
  title: string;
  description: string | null;
  published_at: string | null;
  band: string | null;
  single: string | null;
  one_liner: string | null;
  enriched_at: string | null;
  insumo: string | null;
}

export interface SinglesPickerModalProps {
  monitorDaysDefault?: number;
  initialSelectedIds?: string[];
  onCancel: () => void;
  onConfirm: (selection: SinglesVideoInput[]) => void;
}

export function SinglesPickerModal({
  monitorDaysDefault = 5,
  initialSelectedIds = [],
  onCancel,
  onConfirm,
}: SinglesPickerModalProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [monitorDays, setMonitorDays] = useState<number>(monitorDaysDefault);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: chs }, { data: vids }] = await Promise.all([
      supabase.from('youtube_channels').select('*').order('created_at', { ascending: true }),
      supabase.from('singles_videos').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(200),
    ]);
    setChannels((chs || []) as Channel[]);
    setVideos((vids || []) as Video[]);
    setLoading(false);
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const filteredVideos = useMemo(() => {
    if (!monitorDays || monitorDays <= 0) return videos;
    const cutoff = Date.now() - monitorDays * 24 * 60 * 60 * 1000;
    return videos.filter(v => {
      if (!v.published_at) return true;
      return new Date(v.published_at).getTime() >= cutoff;
    });
  }, [videos, monitorDays]);

  const channelName = useCallback((id: string) => channels.find(c => c.id === id)?.name || '', [channels]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const refreshFeeds = async () => {
    setRefreshing(true);
    try {
      const active = channels.filter(c => c.active);
      if (active.length === 0) {
        toast.info('Nenhum canal ativo cadastrado.');
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-youtube-channel-feed`;
      let totalNew = 0;
      for (const ch of active) {
        try {
          const resp = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({ feed_url: ch.feed_url, channel_url: ch.channel_url, since_days: monitorDays }),
          });
          if (!resp.ok) {
            const e = await resp.json().catch(() => ({}));
            toast.error(`${ch.name}: ${e.error || resp.status}`);
            continue;
          }
          const { items } = await resp.json() as { items: Array<{ video_id: string; video_url: string; title: string; description: string; published_at: string }> };
          if (!items?.length) continue;
          const rows = items.map(it => ({
            channel_id: ch.id,
            video_id: it.video_id,
            video_url: it.video_url,
            title: it.title,
            description: it.description,
            published_at: it.published_at || null,
          }));
          const { data, error } = await supabase
            .from('singles_videos')
            .upsert(rows, { onConflict: 'video_id', ignoreDuplicates: false })
            .select('id');
          if (error) {
            toast.error(`${ch.name}: ${error.message}`);
          } else {
            totalNew += data?.length || 0;
          }
          await supabase.from('youtube_channels').update({ last_synced_at: new Date().toISOString() }).eq('id', ch.id);
        } catch (e: any) {
          toast.error(`${ch.name}: ${e?.message || 'erro'}`);
        }
      }
      toast.success(`Feeds atualizados (${totalNew} v\u00eddeos).`);
      await loadAll();
    } finally {
      setRefreshing(false);
    }
  };

  const enrichSelected = async () => {
    const targets = filteredVideos.filter(v => selected.has(v.id) && !v.enriched_at);
    if (targets.length === 0) {
      // If nothing selected without enrichment, enrich ALL missing in view
      const missing = filteredVideos.filter(v => !v.enriched_at);
      if (missing.length === 0) { toast.info('Nada para enriquecer.'); return; }
      targets.push(...missing);
    }
    setEnriching(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-singles-videos`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          videos: targets.map(v => ({
            video_id: v.video_id,
            title: v.title,
            description: v.description || '',
            channel_name: channelName(v.channel_id),
          })),
        }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `Erro ${resp.status}`);
      }
      const { results } = await resp.json() as { results: Array<{ video_id: string; band?: string; single?: string; one_liner?: string; error?: string }> };
      let ok = 0;
      for (const r of results) {
        if (r.error) continue;
        const row = targets.find(t => t.video_id === r.video_id);
        if (!row) continue;
        await supabase.from('singles_videos').update({
          band: r.band || null,
          single: r.single || null,
          one_liner: r.one_liner || null,
          enriched_at: new Date().toISOString(),
        }).eq('id', row.id);
        ok++;
      }
      toast.success(`Enriquecidos ${ok}/${results.length}.`);
      await loadAll();
    } catch (e: any) {
      toast.error('Falha ao enriquecer: ' + (e?.message || 'erro'));
    } finally {
      setEnriching(false);
    }
  };

  const saveInsumo = async (id: string, value: string) => {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, insumo: value } : v));
    const { error } = await supabase.from('singles_videos').update({ insumo: value }).eq('id', id);
    if (error) toast.error('Falha ao salvar insumo: ' + error.message);
  };

  const confirm = () => {
    const chosen = filteredVideos.filter(v => selected.has(v.id));
    if (chosen.length === 0) { toast.error('Selecione ao menos um v\u00eddeo.'); return; }
    onConfirm(chosen.map(v => ({
      video_id: v.video_id,
      video_url: v.video_url,
      title: v.title,
      band: v.band || undefined,
      single: v.single || undefined,
      one_liner: v.one_liner || undefined,
      insumo: v.insumo || undefined,
    })));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex items-end gap-3">
          <div>
            <Label className="text-[11px] uppercase text-muted-foreground">Dias para monitorar</Label>
            <Input
              type="number"
              min={1}
              value={monitorDays}
              onChange={(e) => setMonitorDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="mt-1 h-8 w-24"
            />
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={refreshFeeds} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar feeds
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={enrichSelected} disabled={enriching}>
            {enriching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Enriquecer com IA
          </Button>
        </div>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowAddChannel(v => !v)}>
          <Plus className="h-3.5 w-3.5" /> Cadastrar canal do YouTube
        </Button>
      </div>

      {showAddChannel && (
        <AddChannelForm
          onCancel={() => setShowAddChannel(false)}
          onCreated={async () => { setShowAddChannel(false); await loadAll(); }}
        />
      )}

      <ChannelsList channels={channels} onChanged={loadAll} />

      <Separator />

      <div className="rounded-md border border-border overflow-hidden">
        <div className="bg-muted/40 px-3 py-2 text-[11px] uppercase font-semibold text-muted-foreground grid grid-cols-[24px_120px_120px_1fr_180px_90px_90px] gap-2">
          <span></span>
          <span>Banda</span>
          <span>Single</span>
          <span>Título do vídeo</span>
          <span>One-liner</span>
          <span>Insumo</span>
          <span>Publicado</span>
        </div>
        <ScrollArea className="h-[46vh]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> carregando…</div>
          ) : filteredVideos.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum v\u00eddeo nos últimos {monitorDays} dias. Cadastre um canal e clique em "Atualizar feeds".
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredVideos.map(v => (
                <li key={v.id} className="grid grid-cols-[24px_120px_120px_1fr_180px_90px_90px] gap-2 px-3 py-2 text-xs items-center hover:bg-muted/20">
                  <Checkbox checked={selected.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} />
                  <span className="truncate font-medium">{v.band || <span className="text-muted-foreground italic">?</span>}</span>
                  <span className="truncate">{v.single || <span className="text-muted-foreground italic">?</span>}</span>
                  <a href={v.video_url} target="_blank" rel="noreferrer" className="truncate hover:underline text-primary/90" title={v.title}>
                    {v.title}
                  </a>
                  <span className="truncate text-muted-foreground">{v.one_liner || <span className="italic">—</span>}</span>
                  <InsumoPopover
                    video={v}
                    channelName={channelName(v.channel_id)}
                    onSave={(val) => saveInsumo(v.id, val)}
                  />
                  <span className="text-muted-foreground text-[10px]">
                    {v.published_at ? new Date(v.published_at).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] text-muted-foreground">{selected.size} v\u00eddeo(s) selecionado(s)</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
          <Button size="sm" onClick={confirm} disabled={selected.size === 0}>Prosseguir</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add channel ────────────────────────────────────────────────────────────

function AddChannelForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [channelUrl, setChannelUrl] = useState('');
  const [feedUrl, setFeedUrl] = useState('');
  const [channelId, setChannelId] = useState('');
  const [monitorDays, setMonitorDays] = useState<number>(5);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !channelUrl.trim()) { toast.error('Nome e URL do canal são obrigatórios.'); return; }
    setSaving(true);
    try {
      let feed = feedUrl.trim();
      const cid = channelId.trim();
      if (!feed && /^UC[A-Za-z0-9_-]{22}$/.test(cid)) {
        feed = `https://www.youtube.com/feeds/videos.xml?channel_id=${cid}`;
      }
      if (!feed) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-youtube-channel-feed`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ channel_url: channelUrl.trim(), channel_id: cid || undefined, since_days: 1 }),
        });
        if (resp.ok) {
          const { feed_url } = await resp.json();
          feed = feed_url || '';
        } else {
          const e = await resp.json().catch(() => ({}));
          toast.warning((e.message || e.error || `Erro ${resp.status}`) + ' — canal salvo, resolva o feed depois.');
        }
      }
      const { error } = await supabase.from('youtube_channels').insert({
        name: name.trim(),
        channel_url: channelUrl.trim(),
        feed_url: feed || null,
        channel_id: cid || null,
        monitor_days: monitorDays,
        active: true,
      } as any);
      if (error) { toast.error('Falha ao salvar: ' + error.message); return; }
      toast.success(feed ? 'Canal cadastrado.' : 'Canal cadastrado (sem feed resolvido — informe o Channel ID depois).');
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Youtube className="h-3.5 w-3.5" /> Novo canal</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input placeholder="Nome do canal (ex.: Century Media)" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="URL do canal (youtube.com/@handle ou /channel/UC...)" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} />
        <Input placeholder="Channel ID (opcional — UC…, mais confiável)" value={channelId} onChange={(e) => setChannelId(e.target.value)} />
        <Input placeholder="Feed RSS (opcional — resolve automático)" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} />
        <Input type="number" min={1} placeholder="Dias para monitorar" value={monitorDays} onChange={(e) => setMonitorDays(Math.max(1, parseInt(e.target.value, 10) || 1))} />
      </div>
      <div className="text-[10px] text-muted-foreground">
        Dica: se o cadastro por @handle falhar, abra o canal no YouTube → "Compartilhar" → copie o Channel ID (começa com UC) e cole aqui.
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Cadastrar'}</Button>
      </div>
    </div>
  );
}

// ─── Channels list ──────────────────────────────────────────────────────────

function ChannelsList({ channels, onChanged }: { channels: Channel[]; onChanged: () => void }) {
  if (channels.length === 0) return null;
  const removeChannel = async (id: string) => {
    if (!confirm('Remover este canal e todos os v\u00eddeos associados?')) return;
    const { error } = await supabase.from('youtube_channels').delete().eq('id', id);
    if (error) toast.error('Falha ao remover: ' + error.message);
    else { toast.success('Canal removido.'); onChanged(); }
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {channels.map(c => (
        <div key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px]">
          <Youtube className="h-3 w-3 text-red-500" />
          <a href={c.channel_url} target="_blank" rel="noreferrer" className="hover:underline">{c.name}</a>
          <button className="text-muted-foreground hover:text-destructive" onClick={() => removeChannel(c.id)} title="Remover"><Trash2 className="h-3 w-3" /></button>
        </div>
      ))}
    </div>
  );
}

// ─── Insumo popover per row ─────────────────────────────────────────────────

function InsumoPopover({ video, channelName, onSave }: { video: Video; channelName: string; onSave: (v: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(video.insumo || '');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { setValue(video.insumo || ''); }, [video.insumo]);

  const bandSingle = `${video.band || ''} ${video.single || ''}`.trim() || video.title;
  const manualUrl = `https://www.google.com/search?q=${encodeURIComponent(bandSingle + ' single review')}`;

  const runAi = async () => {
    setAiLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-research`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ query: `Novo single "${bandSingle}" — contexto da banda, produção, letra, recepção. Canal: ${channelName}.` }),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        throw new Error(e.error || `Erro ${resp.status}`);
      }
      const { notes } = await resp.json();
      setValue(notes || '');
      await onSave(notes || '');
      toast.success('Insumo preenchido.');
    } catch (e: any) {
      toast.error('Falha na busca IA: ' + (e?.message || 'erro'));
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className={cn('h-7 rounded-md border border-border px-2 text-[11px] hover:bg-muted', video.insumo ? 'text-primary border-primary/40' : 'text-muted-foreground')}>
          {video.insumo ? '✓ Insumo' : 'Insumo'}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[440px] p-3 space-y-2" align="end">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Insumo — {video.band || video.title}</div>
          <button onClick={() => setOpen(false)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 flex-1" asChild>
            <a href={manualUrl} target="_blank" rel="noreferrer"><Globe className="h-3.5 w-3.5" /> Busca manual</a>
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 flex-1" onClick={runAi} disabled={aiLoading}>
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Busca IA
          </Button>
        </div>
        <Textarea rows={8} value={value} onChange={(e) => setValue(e.target.value)} className="text-xs" placeholder="Notas / insumo editorial deste v\u00eddeo…" />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
          <Button size="sm" onClick={async () => { await onSave(value); setOpen(false); }}>Salvar</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}