import { useState } from 'react';
import { Palette, Sparkles, Image, ExternalLink, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { WorkspaceShell } from '@/components/workspace/WorkspaceShell';
import { useApp } from '@/contexts/AppContext';
import { TitleOption, DaySlot } from '@/lib/types';

function parseProperNouns(title: string): string {
  return title.split(' ').filter(w => w.length > 2 && w[0] === w[0].toUpperCase()).join(' ');
}

export default function Materials() {
  const { weeks, materials, getMaterialsForWeek, updateMaterial } = useApp();
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [coverDaySlot, setCoverDaySlot] = useState<DaySlot | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const selectedWeek = weeks.find(w => w.id === selectedWeekId) || weeks[0];
  const weekMaterials = selectedWeek ? getMaterialsForWeek(selectedWeek.id) : [];

  const getTitle = (mat: { title_options_json: any[]; selected_title_index: number | null }) => {
    if (mat.selected_title_index != null && mat.title_options_json[mat.selected_title_index]) {
      return (mat.title_options_json[mat.selected_title_index] as any)?.text || '';
    }
    return '';
  };

  const generateTitles = (materialId: string) => {
    const options: TitleOption[] = [
      { text: 'Título estilo clickbait aqui', style: 'clickbait' },
      { text: 'Título estilo curiosidade aqui', style: 'curiosity' },
      { text: 'Título estilo impacto aqui', style: 'impact' },
    ];
    updateMaterial(materialId, { title_options_json: options as any });
  };

  const selectTitle = (materialId: string, index: number) => {
    updateMaterial(materialId, { selected_title_index: index });
  };

  const openCoverCreator = (daySlot: DaySlot) => {
    setCoverDaySlot(daySlot);
    setImageUrl('');
    setCoverPreview(null);
    setCoverDialogOpen(true);
  };

  const generateCover = () => {
    if (!imageUrl || !coverDaySlot || !selectedWeek) return;
    const mat = weekMaterials.find(m => m.slot_key === coverDaySlot);
    if (!mat) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#1a0e2e';
    ctx.fillRect(0, 0, 1080, 1080);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, 40, 40, 1000, 600);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(0, 650, 1080, 6);
      ctx.fillStyle = '#C8A2C8'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Heavynauta', 50, 710);
      ctx.fillStyle = '#e8d5f5'; ctx.font = 'bold 42px sans-serif';
      ctx.fillText(getTitle(mat) || `Episódio ${coverDaySlot}`, 50, 800, 900);
      ctx.fillStyle = '#8a7a9a'; ctx.font = '22px sans-serif';
      ctx.fillText('Papo Sério Sobre Música Pesada', 50, 860);
      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { cover_url: dataUrl });
    };
    img.onerror = () => {
      ctx.fillStyle = '#C8A2C8'; ctx.font = 'bold 28px sans-serif'; ctx.fillText('Heavynauta', 50, 710);
      ctx.fillStyle = '#e8d5f5'; ctx.font = 'bold 42px sans-serif';
      ctx.fillText(getTitle(mat) || 'Episódio', 50, 800, 900);
      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { cover_url: dataUrl });
    };
    img.src = imageUrl;
  };

  const searchQuery = (daySlot: DaySlot) => {
    const mat = weekMaterials.find(m => m.slot_key === daySlot);
    const title = mat ? getTitle(mat) : '';
    return encodeURIComponent(parseProperNouns(title) || 'metal band');
  };

  const handleBulkTitles = () => weekMaterials.forEach(m => generateTitles(m.id));

  const handleExportMaterials = () => {
    const content = weekMaterials.map(m => ({
      slot: m.slot_key,
      date: m.episode_date,
      title: getTitle(m),
      description: m.description_html,
      cover: m.cover_url ? '(gerada)' : null,
      spotify: m.spotify_link,
    }));
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `materiais_${selectedWeek?.start_date}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  // Traffic light for material completeness
  const matLight = (mat: { selected_title_index: number | null; description_html: string | null; cover_url: string | null; spotify_link: string | null }) => {
    const count = [mat.selected_title_index != null, !!mat.description_html, !!mat.cover_url, !!mat.spotify_link].filter(Boolean).length;
    if (count >= 3) return 'bg-emerald-500';
    if (count >= 1) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (weeks.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
        </div>
        <Card><CardContent className="flex flex-col items-center justify-center py-16">
          <Palette className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Crie uma semana na aba Pautas primeiro.</p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Palette className="h-6 w-6 text-primary" />
            Materiais
          </h1>
          <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
        </div>
        {selectedWeek && (
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExportMaterials}>
            <Download className="h-3.5 w-3.5" /> Exportar
          </Button>
        )}
      </div>

      {weeks.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map(w => (
            <Button key={w.id} variant={selectedWeek?.id === w.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(w.id)}>
              {new Date(w.start_date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
            </Button>
          ))}
        </div>
      )}

      <Tabs defaultValue="titles" className="space-y-4">
        <TabsList>
          <TabsTrigger value="titles">Títulos</TabsTrigger>
          <TabsTrigger value="descriptions">Descrições</TabsTrigger>
          <TabsTrigger value="covers">Capas</TabsTrigger>
        </TabsList>

        <TabsContent value="titles">
          <WorkspaceShell
            weekLabel="Títulos da Semana"
            actions={
              <Button size="sm" onClick={handleBulkTitles}>
                <Sparkles className="h-4 w-4 mr-1" /> Gerar Todos
              </Button>
            }
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              const opts = mat.title_options_json as TitleOption[];
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                  </div>
                  {opts.length > 0 ? (
                    opts.map((opt, i) => (
                      <button
                        key={i}
                        className={`w-full text-left p-2 rounded-md text-xs border transition-colors ${
                          mat.selected_title_index === i ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-primary/30 text-muted-foreground'
                        }`}
                        onClick={() => selectTitle(mat.id, i)}
                      >
                        <Badge variant="secondary" className="text-[9px] mb-1">{opt.style}</Badge>
                        <p>{opt.text}</p>
                      </button>
                    ))
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Sem títulos gerados</p>
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => generateTitles(mat.id)}>
                        <Sparkles className="h-3 w-3 mr-1" /> Gerar
                      </Button>
                    </div>
                  )}
                  {mat.selected_title_index != null && (
                    <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                      <p className="text-[10px] text-primary font-medium">Selecionado:</p>
                      <p className="text-xs">{getTitle(mat)}</p>
                    </div>
                  )}
                </div>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="descriptions">
          <WorkspaceShell
            weekLabel="Descrições da Semana"
            actions={<Button size="sm"><Sparkles className="h-4 w-4 mr-1" /> Gerar Todas</Button>}
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                  </div>
                  <Textarea
                    className="min-h-[120px] text-xs resize-none"
                    placeholder="Descrição HTML do episódio..."
                    value={mat.description_html || ''}
                    onChange={e => updateMaterial(mat.id, { description_html: e.target.value })}
                  />
                </div>
              );
            }}
          />
        </TabsContent>

        <TabsContent value="covers">
          <WorkspaceShell
            weekLabel="Capas da Semana"
            actions={<Button size="sm"><Image className="h-4 w-4 mr-1" /> Criar Todas</Button>}
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.slot_key === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`h-2 w-2 rounded-full ${matLight(mat)}`} />
                    <span className="text-[10px] text-muted-foreground">{mat.episode_date}</span>
                  </div>
                  {mat.cover_url ? (
                    <div className="space-y-2">
                      <img src={mat.cover_url} alt="Capa" className="w-full aspect-square rounded-md object-cover" />
                      <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => openCoverCreator(day.key)}>
                        Refazer Capa
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full h-24 flex-col gap-2" onClick={() => openCoverCreator(day.key)}>
                      <Image className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Criar Capa</span>
                    </Button>
                  )}
                </div>
              );
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Cover Creator Dialog */}
      <Dialog open={coverDialogOpen} onOpenChange={setCoverDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar Capa</DialogTitle>
            <DialogDescription>Busque uma imagem e gere a capa proceduralmente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                if (coverDaySlot) window.open(`https://images.google.com/search?q=${searchQuery(coverDaySlot)}&tbm=isch`, '_blank');
              }}>
                <ExternalLink className="h-3.5 w-3.5" /> Buscar Imagens
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>URL da Imagem</Label>
              <Input placeholder="Cole aqui a URL da imagem..." value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
            </div>
            {imageUrl && (
              <div className="flex-1 space-y-2">
                <Label>Preview</Label>
                <img src={imageUrl} alt="Preview" className="w-full aspect-video rounded-md object-cover bg-muted" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
              </div>
            )}
            <Button onClick={generateCover} disabled={!imageUrl} className="w-full gap-2">
              <Sparkles className="h-4 w-4" /> Gerar Capa
            </Button>
            {coverPreview && (
              <div className="space-y-2">
                <Label>Capa Gerada</Label>
                <img src={coverPreview} alt="Capa final" className="w-full max-w-[300px] mx-auto aspect-square rounded-md" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoverDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
