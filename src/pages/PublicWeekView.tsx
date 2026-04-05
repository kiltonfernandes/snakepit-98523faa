import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import heavynautaBadge from '@/assets/heavynauta-badge.svg';

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

const DAY_LABELS: Record<string, string> = {
  monday: 'Segunda-feira',
  tuesday: 'Terça-feira',
  wednesday: 'Quarta-feira',
  thursday: 'Quinta-feira',
  friday: 'Sexta-feira',
  saturday: 'Sábado',
  sunday: 'Domingo',
};

const SLOT_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function getTitle(mat: PublicMaterial): string {
  const opts = Array.isArray(mat.title_options_json) ? mat.title_options_json : [];
  if (mat.selected_title_index != null && opts[mat.selected_title_index]) {
    return opts[mat.selected_title_index].text;
  }
  return opts[0]?.text || mat.slot_key;
}

export default function PublicWeekView() {
  const { weekId } = useParams<{ weekId: string }>();
  const [week, setWeek] = useState<PublicWeek | null>(null);
  const [pautas, setPautas] = useState<PublicPauta[]>([]);
  const [materials, setMaterials] = useState<PublicMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weekId) return;
    setLoading(true);
    Promise.all([
      supabase.from('editorial_weeks' as any).select('id, start_date').eq('id', weekId).single(),
      supabase.from('pautas' as any).select('id, publication_date, pauta_type, sections_json, raw_inputs_json, discovered_links_json').eq('week_id', weekId),
      supabase.from('episode_materials' as any).select('id, slot_key, episode_date, title_options_json, selected_title_index, description_html, cover_url').eq('week_id', weekId),
    ]).then(([weekRes, pautasRes, matsRes]) => {
      if (weekRes.error || !weekRes.data) { setError('Semana não encontrada'); setLoading(false); return; }
      setWeek(weekRes.data as any);
      setPautas((pautasRes.data as any[]) || []);
      setMaterials((matsRes.data as any[]) || []);
      setLoading(false);
    }).catch(() => { setError('Erro ao carregar dados'); setLoading(false); });
  }, [weekId]);

  if (loading) return (
    <div className="min-h-screen bg-[hsl(270,30%,8%)] flex items-center justify-center">
      <div className="text-[hsl(270,10%,55%)] text-sm animate-pulse">Carregando semana...</div>
    </div>
  );

  if (error || !week) return (
    <div className="min-h-screen bg-[hsl(270,30%,8%)] flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-[hsl(0,70%,55%)] font-medium">{error || 'Semana não encontrada'}</p>
        <p className="text-[hsl(270,10%,55%)] text-sm">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  const sortedMats = [...materials].sort((a, b) => {
    const ai = SLOT_ORDER.indexOf(a.slot_key);
    const bi = SLOT_ORDER.indexOf(b.slot_key);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const weekStart = new Date(week.start_date + 'T12:00:00');
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const headerLabel = `${weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} – ${weekEnd.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  return (
    <div className="min-h-screen bg-[hsl(270,30%,8%)] text-[hsl(270,10%,90%)]">
      <header className="border-b border-[hsl(270,15%,16%)] px-6 py-6 text-center">
        <img src={heavynautaBadge} alt="Heavynauta" className="h-10 mx-auto mb-3 opacity-80" />
        <h1 className="text-2xl font-bold tracking-tight">SNAKEPIT — Semana de Gravação</h1>
        <p className="text-[hsl(270,10%,55%)] text-sm mt-1">{headerLabel}</p>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {sortedMats.length === 0 ? (
          <p className="text-center text-[hsl(270,10%,55%)]">Nenhum episódio disponível para esta semana.</p>
        ) : (
          <Tabs defaultValue={sortedMats[0]?.slot_key} className="w-full">
            <TabsList className="w-full flex flex-wrap bg-[hsl(270,25%,12%)] border border-[hsl(270,15%,20%)] rounded-lg p-1 mb-6">
              {sortedMats.map(mat => (
                <TabsTrigger key={mat.slot_key} value={mat.slot_key} className="flex-1 text-xs data-[state=active]:bg-[hsl(280,40%,55%)] data-[state=active]:text-white">
                  {DAY_LABELS[mat.slot_key]?.slice(0, 3) || mat.slot_key}
                </TabsTrigger>
              ))}
            </TabsList>

            {sortedMats.map(mat => {
              const pauta = pautas.find(p => p.publication_date === mat.episode_date);
              const sections = (pauta?.sections_json || {}) as Record<string, string>;
              const inputs = (pauta?.raw_inputs_json || {}) as Record<string, any>;
              const links = (pauta?.discovered_links_json || []) as string[];
              const title = getTitle(mat);
              const d = new Date(mat.episode_date + 'T12:00:00');

              return (
                <TabsContent key={mat.slot_key} value={mat.slot_key}>
                  <div className="space-y-6">
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 space-y-6">
                        <div>
                          <Badge variant="secondary" className="text-xs mb-2">{DAY_LABELS[mat.slot_key]}</Badge>
                          <h2 className="text-xl font-bold">{title}</h2>
                          <p className="text-sm text-[hsl(270,10%,55%)] mt-1">
                            {d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                          </p>
                        </div>

                        {pauta && Object.entries(sections).filter(([, v]) => v?.trim()).map(([key, content]) => (
                          <Card key={key} className="bg-[hsl(270,25%,12%)] border-[hsl(270,15%,20%)]">
                            <CardContent className="p-5">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(280,40%,55%)] mb-3">{key.replace(/_/g, ' ')}</h3>
                              <div className="text-sm leading-relaxed whitespace-pre-wrap text-[hsl(270,10%,80%)]">{content}</div>
                            </CardContent>
                          </Card>
                        ))}

                        {mat.description_html && (
                          <Card className="bg-[hsl(270,25%,12%)] border-[hsl(270,15%,20%)]">
                            <CardContent className="p-5">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(280,40%,55%)] mb-3">Descrição</h3>
                              <div className="text-sm leading-relaxed text-[hsl(270,10%,80%)]" dangerouslySetInnerHTML={{ __html: mat.description_html }} />
                            </CardContent>
                          </Card>
                        )}

                        {links.length > 0 && (
                          <Card className="bg-[hsl(270,25%,12%)] border-[hsl(270,15%,20%)]">
                            <CardContent className="p-5">
                              <h3 className="text-sm font-bold uppercase tracking-wider text-[hsl(280,40%,55%)] mb-3">Links</h3>
                              <div className="space-y-1.5">
                                {links.map((url, i) => (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-[hsl(280,40%,65%)] hover:text-[hsl(280,40%,75%)] transition-colors truncate">
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{url}</span>
                                  </a>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                      </div>

                      {mat.cover_url && (
                        <div className="lg:w-80 shrink-0">
                          <img src={mat.cover_url} alt={`Capa: ${title}`} className="w-full rounded-lg border border-[hsl(270,15%,20%)]" />
                        </div>
                      )}
                    </div>
                  </div>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </main>

      <footer className="border-t border-[hsl(270,15%,16%)] text-center py-4 text-[hsl(270,10%,40%)] text-xs">
        Heavynauta © {new Date().getFullYear()} — Snakepit Workflow
      </footer>
    </div>
  );
}
