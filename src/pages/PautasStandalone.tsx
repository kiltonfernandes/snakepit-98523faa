/**
 * Pautas (avulsas) — página dedicada.
 *
 * Substitui a antiga `/pautas` baseada em semanas. Aqui o foco é o fluxo
 * editorial por episódio individual (resenha, notícia, aniversário,
 * entrevista, custom). A organização semanal completa (Insumos / Conteúdo /
 * Flow / Management) virou "Pautas Legacy" e mora dentro de Configurações.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AutosaveBadge } from '@/components/shared/AutosaveBadge';
import { NovaPautaWizard } from '@/components/pautas/NovaPautaWizard';
import { StandaloneEpisodesTable } from '@/components/pautas/StandaloneEpisodesTable';
import { ShortlistDialog } from '@/components/pautas/ShortlistDialog';

export default function PautasStandalone() {
  const [novaPautaOpen, setNovaPautaOpen] = useState(false);
  const [shortlistOpen, setShortlistOpen] = useState(false);

  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Pautas
          </h1>
          <p className="text-muted-foreground mt-1">
            Episódios avulsos — resenha, notícia, aniversário, entrevista e custom.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AutosaveBadge />
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setShortlistOpen(true)}>
            <Star className="h-3.5 w-3.5" />
            Shortlist
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setNovaPautaOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <Sparkles className="h-3.5 w-3.5" />
            Nova pauta
          </Button>
        </div>
      </div>

      <StandaloneEpisodesTable onCreateNew={() => setNovaPautaOpen(true)} />

      <NovaPautaWizard
        open={novaPautaOpen}
        onClose={() => setNovaPautaOpen(false)}
        onCreated={() => setNovaPautaOpen(false)}
      />
      <ShortlistDialog
        open={shortlistOpen}
        onClose={() => setShortlistOpen(false)}
        onCreatePautaFromRelease={() => setNovaPautaOpen(true)}
      />
    </motion.div>
  );
}