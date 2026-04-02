import { useState } from 'react';
import { Palette, Sparkles, Image, ExternalLink, Eye } from 'lucide-react';
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

  const generateTitles = (materialId: string) => {
    const options: TitleOption[] = [
      { text: 'Título estilo clickbait aqui', style: 'clickbait' },
      { text: 'Título estilo curiosidade aqui', style: 'curiosity' },
      { text: 'Título estilo impacto aqui', style: 'impact' },
    ];
    updateMaterial(materialId, { titleOptions: options });
  };

  const selectTitle = (materialId: string, text: string) => {
    updateMaterial(materialId, { selectedTitle: text });
  };

  const openCoverCreator = (daySlot: DaySlot) => {
    setCoverDaySlot(daySlot);
    setImageUrl('');
    setCoverPreview(null);
    setCoverDialogOpen(true);
  };

  const generateCover = () => {
    if (!imageUrl || !coverDaySlot || !selectedWeek) return;
    const mat = weekMaterials.find(m => m.daySlot === coverDaySlot);
    if (!mat) return;

    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = '#1a0e2e';
    ctx.fillRect(0, 0, 1080, 1080);

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw image in top 60%
      ctx.drawImage(img, 40, 40, 1000, 600);

      // Gray bar
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(0, 650, 1080, 6);

      // Lavender label
      ctx.fillStyle = '#C8A2C8';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('Heavynauta', 50, 710);

      // Title
      ctx.fillStyle = '#e8d5f5';
      ctx.font = 'bold 42px sans-serif';
      const title = mat.selectedTitle || `Episódio ${coverDaySlot}`;
      ctx.fillText(title, 50, 800, 900);

      // Tagline
      ctx.fillStyle = '#8a7a9a';
      ctx.font = '22px sans-serif';
      ctx.fillText('Papo Sério Sobre Música Pesada', 50, 860);

      // Purple left border
      ctx.fillStyle = '#2D1B4E';
      ctx.fillRect(0, 0, 8, 1080);

      // Sci-fi corner cuts
      ctx.fillStyle = '#1a0e2e';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.lineTo(0, 30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1080, 0); ctx.lineTo(1050, 0); ctx.lineTo(1080, 30); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 1080); ctx.lineTo(30, 1080); ctx.lineTo(0, 1050); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1080, 1080); ctx.lineTo(1050, 1080); ctx.lineTo(1080, 1050); ctx.closePath(); ctx.fill();

      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { coverData: dataUrl, coverUrl: imageUrl });
    };
    img.onerror = () => {
      // Fallback: generate without image
      ctx.fillStyle = '#C8A2C8';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText('Heavynauta', 50, 710);
      ctx.fillStyle = '#e8d5f5';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(mat.selectedTitle || 'Episódio', 50, 800, 900);
      const dataUrl = canvas.toDataURL('image/png');
      setCoverPreview(dataUrl);
      updateMaterial(mat.id, { coverData: dataUrl });
    };
    img.src = imageUrl;
  };

  const searchQuery = (daySlot: DaySlot) => {
    const mat = weekMaterials.find(m => m.daySlot === daySlot);
    const title = mat?.selectedTitle || '';
    const nouns = parseProperNouns(title);
    return encodeURIComponent(nouns || 'metal band');
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Palette className="h-6 w-6 text-primary" />
          Materiais
        </h1>
        <p className="text-muted-foreground mt-1">Títulos, descrições e capas dos episódios</p>
      </div>

      {weeks.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {weeks.map(w => (
            <Button key={w.id} variant={selectedWeek?.id === w.id ? 'default' : 'outline'} size="sm" onClick={() => setSelectedWeekId(w.id)}>
              {new Date(w.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
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
              <Button size="sm" onClick={() => weekMaterials.forEach(m => generateTitles(m.id))}>
                <Sparkles className="h-4 w-4 mr-1" /> Gerar Todos
              </Button>
            }
            renderDay={(day) => {
              const mat = weekMaterials.find(m => m.daySlot === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  {mat.titleOptions.length > 0 ? (
                    mat.titleOptions.map((opt, i) => (
                      <button
                        key={i}
                        className={`w-full text-left p-2 rounded-md text-xs border transition-colors ${
                          mat.selectedTitle === opt.text ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:border-primary/30 text-muted-foreground'
                        }`}
                        onClick={() => selectTitle(mat.id, opt.text)}
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
                  {mat.selectedTitle && (
                    <div className="mt-2 p-2 rounded bg-primary/5 border border-primary/20">
                      <p className="text-[10px] text-primary font-medium">Selecionado:</p>
                      <p className="text-xs">{mat.selectedTitle}</p>
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
              const mat = weekMaterials.find(m => m.daySlot === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  <Textarea
                    className="min-h-[120px] text-xs resize-none"
                    placeholder="Descrição HTML do episódio..."
                    value={mat.descriptionHtml}
                    onChange={e => updateMaterial(mat.id, { descriptionHtml: e.target.value })}
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
              const mat = weekMaterials.find(m => m.daySlot === day.key);
              if (!mat) return null;
              return (
                <div className="space-y-2">
                  {mat.coverData ? (
                    <div className="space-y-2">
                      <img src={mat.coverData} alt="Capa" className="w-full aspect-square rounded-md object-cover" />
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
              <div className="flex gap-4">
                <div className="flex-1 space-y-2">
                  <Label>Preview da Imagem</Label>
                  <img src={imageUrl} alt="Preview" className="w-full aspect-video rounded-md object-cover bg-muted" onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                </div>
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
