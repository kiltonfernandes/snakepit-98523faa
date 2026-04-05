import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExternalLink } from 'lucide-react';
import heavynautaBadge from '@/assets/heavynauta-badge.svg';
import { getSectionsForDay } from '@/lib/constants';
import { DaySlot } from '@/lib/types';
import { resolveAllLinks } from '@/lib/dynamic-links';

interface PublicPauta {
  id: string;
  publication_date: string;
  pauta_type: string;
  sections_json: Record<string, string>;
  raw_inputs_json: Record<string, any>;
  discovered_links_json: string[];
}

interface PublicMaterial {
  id: string;
  slot_key: string;
  episode_date: string;
  title_options_json: { text: string; style: string }[];
  selected_title_index: number | null;
  description_html: string | null;
  cover_url: string | null;
}

interface PublicWeek {
  id: string;
  start_date: string;
}

interface PublicRelease {
  id: string;
  artist: string;
  album: string;
  youtube_url?: string | null;
  spotify_url?: string | null;
  deezer_url?: string | null;
  apple_music_url?: string | null;
  bandcamp_url?: string | null;
  metal_archives_url?: string | null;
}

const DAY_LABELS: Record<string, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const SHORT_DAY: Record<string, string> = {
  monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua', thursday: 'Qui',
  friday: 'Sex', saturday: 'Sáb', sunday: 'Dom',
};

const SLOT_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const INTRO_SEGWAY = `Saudações, heavynautas!\n\nNossa nave está aterrissando em mais um episódio do nosso podcast diário com os melhores lançamentos do heavy metal. O meu nome é Kilton Fernandes e hoje eu estou com meu copiloto Rafa Ferreira. Seja muito bem-vindo!`;
const OUTRO_SEGWAY = `Kilton: Nossa nave espacial está se preparando para levantar voo e partir por hoje. Muito obrigado por nos acompanhar nessa jornada pelo universo do heavy metal.\n\nRafa: E não se esqueçam, heavynautas! Estamos de volta amanhã com mais novidades do mundo do metal. O Snakepit vai ao ar todos os dias, de segunda a sexta as 6 da manhã. Desejo a todos uma ótima noite e até a nossa próxima viagem!`;

function cleanContent(raw: string): string {
  return raw
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<\/?content>\s*/gi, '')
    .replace(/<\/?section[^>]*>\s*/gi, '')
    .trim();
}

function daySlotFromDate(dateStr: string): DaySlot {
  const wd = new Date(dateStr + 'T12:00:00').getDay();
  const map: Record<number, DaySlot> = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };
  return map[wd] || 'monday';
}

function QuickLinks({ links }: { links: { youtube: string; spotify: string; deezer: string; metal_archives: string } }) {
  const platforms = [
    { key: 'youtube' as const, label: 'YouTube', color: 'text-red-400 hover:text-red-300' },
    { key: 'spotify' as const, label: 'Spotify', color: 'text-emerald-400 hover:text-emerald-300' },
    { key: 'deezer' as const, label: 'Deezer', color: 'text-purple-400 hover:text-purple-300' },
    { key: 'metal_archives' as const, label: 'Metal Archives', color: 'text-orange-400 hover:text-orange-300' },
  ];

  return (
    <div className="mt-4 border-t border-foreground/5 pt-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Links rápidos</h4>
      <div className="flex flex-wrap items-center gap-2">
        {platforms.map((p, i, arr) => (
          <span key={p.key} className="flex items-center gap-1">
            <a href={links[p.key]} target="_blank" rel="noopener noreferrer" className={`text-sm font-medium transition-colors ${p.color}`}>
              {p.label}
            </a>
            {i < arr.length - 1 && <span className="text-foreground/20">|</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function PautaDay({ pauta, releases }: { pauta: PublicPauta; releases: PublicRelease[] }) {
  const slot = daySlotFromDate(pauta.publication_date);
  const sections = getSectionsForDay(slot);
  const data = (pauta.sections_json || {}) as Record<string, string>;
  const inputs = (pauta.raw_inputs_json || {}) as Record<string, any>;
  const allLinks = (pauta.discovered_links_json || []) as string[];
  const d = new Date(pauta.publication_date + 'T12:00:00');

  return (
    <div className="space-y-10">
      <header className="border-b border-foreground/10 pb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">SNAKEPIT</h2>
        <p className="mt-2 text-lg font-semibold text-foreground/80">
          {DAY_LABELS[slot]} — {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Roteiro organizado por blocos editoriais para facilitar a gravação.</p>
      </header>

      {/* ABERTURA */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Abertura</h2>
        <div className="border-l-4 border-primary pl-4">
          <p className="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">{INTRO_SEGWAY}</p>
        </div>
      </section>

      {/* BLOCOS DO EPISÓDIO */}
      <section className="space-y-6">
        <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Blocos do episódio</h2>
        {sections.map((sec, idx) => {
          const rawContent = data[sec.key]?.trim() || '';
          const content = rawContent ? cleanContent(rawContent) : null;

          let contextNote = '';
          let quickLinks: { youtube: string; spotify: string; deezer: string; metal_archives: string } | null = null;

          if (sec.key === 'anniversary' && inputs.anniversary) {
            contextNote = `📅 ${inputs.anniversary}`;
            const parts = inputs.anniversary.split(/\s*[-–—]\s*/);
            const artist = parts[0]?.trim() || inputs.anniversary;
            const album = parts[1]?.trim() || '';
            const links = resolveAllLinks({ artist, album: album || artist });
            quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
          }

          if (sec.key === 'review_rafa') {
            const rel = releases.find(r => r.id === inputs.review_rafa_id);
            if (rel) {
              contextNote = `🎵 ${rel.artist} — ${rel.album}`;
              const links = resolveAllLinks(rel);
              quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
            }
          }

          if (sec.key === 'review_kilton') {
            const rel = releases.find(r => r.id === inputs.review_kilton_id);
            if (rel) {
              contextNote = `🎵 ${rel.artist} — ${rel.album}`;
              const links = resolveAllLinks(rel);
              quickLinks = { youtube: links.youtube, spotify: links.spotify, deezer: links.deezer, metal_archives: links.metal_archives };
            }
          }

          if (sec.key === 'news' && inputs.news_link) {
            contextNote = `🔗 ${inputs.news_link}`;
          }

          return (
            <article key={sec.key} className={idx > 0 ? 'border-t border-foreground/10 pt-6' : ''}>
              <h3 className="mb-3 text-lg font-bold uppercase tracking-wider text-foreground">
                {sec.label}
              </h3>
              {contextNote && (
                <h4 className="mb-3 text-sm font-medium italic text-muted-foreground">{contextNote}</h4>
              )}
              {content ? (
                <div className="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">{content}</div>
              ) : (
                <p className="text-lg italic text-foreground/30">Seção não preenchida</p>
              )}
              {quickLinks && <QuickLinks links={quickLinks} />}
            </article>
          );
        })}
      </section>

      {/* ENCERRAMENTO */}
      <section className="space-y-3 border-t border-foreground/10 pt-6">
        <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Encerramento</h2>
        <div className="border-l-4 border-primary pl-4">
          <p className="text-lg leading-relaxed whitespace-pre-wrap text-foreground/90">{OUTRO_SEGWAY}</p>
        </div>
      </section>

      {/* LINKS DESCOBERTOS */}
      {allLinks.length > 0 && (
        <section className="space-y-3 border-t border-foreground/10 pt-6">
          <h2 className="text-xl font-bold uppercase tracking-wider text-primary">Links</h2>
          <div className="space-y-1.5">
            {allLinks.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary/80 hover:text-primary transition-colors">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{url}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function PublicWeekView() {
  const { weekId } = useParams<{ weekId: string }>();
  const [week, setWeek] = useState<PublicWeek | null>(null);
  const [pautas, setPautas] = useState<PublicPauta[]>([]);
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [releases, setReleases] = useState<PublicRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weekId) return;
    setLoading(true);
    Promise.all([
      supabase.from('editorial_weeks' as any).select('id, start_date').eq('id', weekId).single(),
      supabase.from('pautas' as any).select('id, publication_date, pauta_type, sections_json, raw_inputs_json, discovered_links_json').eq('week_id', weekId),
      supabase.from('episode_materials' as any).select('id, slot_key, episode_date, title_options_json, selected_title_index, description_html, cover_url').eq('week_id', weekId),
    ]).then(async ([weekRes, pautasRes, matsRes]) => {
      if (weekRes.error || !weekRes.data) { setError('Semana não encontrada'); setLoading(false); return; }
      setWeek(weekRes.data as any);
      const pautaList = (pautasRes.data as any[]) || [];
      setPautas(pautaList);
      setMaterials((matsRes.data as any[]) || []);

      // Load releases referenced by pautas
      const releaseIds = new Set<string>();
      pautaList.forEach((p: any) => {
        const inputs = p.raw_inputs_json || {};
        if (inputs.review_rafa_id) releaseIds.add(inputs.review_rafa_id);
        if (inputs.review_kilton_id) releaseIds.add(inputs.review_kilton_id);
      });
      if (releaseIds.size > 0) {
        const { data: relData } = await supabase
          .from('releases' as any)
          .select('id, artist, album, youtube_url, spotify_url, deezer_url, apple_music_url, bandcamp_url, metal_archives_url')
          .in('id', Array.from(releaseIds));
        setReleases((relData as any[]) || []);
      }
      setLoading(false);
    }).catch(() => { setError('Erro ao carregar dados'); setLoading(false); });
  }, [weekId]);

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-muted-foreground text-sm animate-pulse">Carregando semana...</div>
    </div>
  );

  if (error || !week) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-destructive font-medium">{error || 'Semana não encontrada'}</p>
        <p className="text-muted-foreground text-sm">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  const sortedPautas = [...pautas].sort((a, b) => {
    const dayA = new Date(a.publication_date + 'T12:00:00').getDay();
    const dayB = new Date(b.publication_date + 'T12:00:00').getDay();
    const orderMap: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    return (orderMap[dayA] ?? 9) - (orderMap[dayB] ?? 9);
  });

  const tabs = sortedPautas.map(p => ({
    key: daySlotFromDate(p.publication_date),
    date: p.publication_date,
    pauta: p,
  }));

  const weekStart = new Date(week.start_date + 'T12:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const headerLabel = `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} – ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-6 text-center">
        <img src={heavynautaBadge} alt="Heavynauta" className="h-10 mx-auto mb-3 opacity-80" />
        <h1 className="text-2xl font-bold tracking-tight">SNAKEPIT — Semana de Gravação</h1>
        <p className="text-muted-foreground text-sm mt-1">{headerLabel}</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {tabs.length === 0 ? (
          <p className="text-center text-muted-foreground">Nenhuma pauta disponível para esta semana.</p>
        ) : (
          <Tabs defaultValue={tabs[0]?.key} className="w-full">
            <TabsList className="w-full flex flex-wrap bg-card border border-border rounded-lg p-1 mb-8">
              {tabs.map(t => (
                <TabsTrigger key={t.key} value={t.key} className="flex-1 text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  {SHORT_DAY[t.key] || t.key}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map(t => (
              <TabsContent key={t.key} value={t.key}>
                <PautaDay pauta={t.pauta} releases={releases} />
              </TabsContent>
            ))}
          </Tabs>
        )}
      </main>

      <footer className="border-t border-border text-center py-4 text-muted-foreground/60 text-xs">
        Heavynauta © {new Date().getFullYear()} — Snakepit Workflow
      </footer>
    </div>
  );
}
