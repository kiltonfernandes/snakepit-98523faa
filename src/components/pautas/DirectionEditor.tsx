import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Compass, Check, Trash2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Build a contextual Google search query for a given section, based on the
 * raw inputs already filled by the editor. Returns an empty string when
 * there is not enough context to suggest a meaningful search.
 *
 * Intent per section:
 * - anniversary       → "história curiosidades recepção entrevistas <texto do aniversário>"
 * - news              → "o que aconteceu <link da notícia>"
 * - review_rafa       → "review do disco e entrevistas <Album> <Artista>"
 * - review_kilton     → "review do disco e entrevistas <Album> <Artista>"
 * - next_week_releases → "lançamentos heavy metal <semana> review"
 */
export interface DirectionValue {
  direction: string;
  mandatory: string;
}

export function buildSectionSearchQuery(
  sectionKey: string,
  ctx: {
    anniversary?: string;
    newsLink?: string;
    releaseArtist?: string;
    releaseAlbum?: string;
    publicationDate?: string;
  },
): string {
  const clean = (s?: string) => (s || "").trim();
  switch (sectionKey) {
    case "anniversary": {
      const txt = clean(ctx.anniversary);
      if (!txt) return "";
      return `história detalhes curiosidades recepção entrevistas ${txt}`;
    }
    case "news": {
      const link = clean(ctx.newsLink);
      if (!link) return "";
      return `o que aconteceu ${link}`;
    }
    case "review_rafa":
    case "review_kilton": {
      const artist = clean(ctx.releaseArtist);
      const album = clean(ctx.releaseAlbum);
      if (!artist && !album) return "";
      return `review do disco e entrevistas ${album} ${artist}`.trim();
    }
    case "next_week_releases": {
      const date = clean(ctx.publicationDate);
      return `lançamentos heavy metal ${date ? `semana de ${date}` : "novos álbuns"} review`;
    }
    default:
      return "";
  }
}

interface DirectionEditorProps {
  /**
   * Current value. Accepts either a legacy string (treated as `direction`,
   * `mandatory` empty) or the full {direction, mandatory} object.
   */
  value: string | DirectionValue;
  /** Persist the new value. Always called with the full object. */
  onChange: (value: DirectionValue) => void;
  /** Section label shown in the modal header (e.g. "Aniversário", "Notícias"). */
  sectionLabel: string;
  /** Compact label for the button text (defaults to "Direção"). */
  buttonLabel?: string;
  /** Optional className for the button. */
  className?: string;
  /**
   * Optional Google search query to expose as a quick-research button inside
   * the modal. When omitted (or empty), the search button is hidden.
   * Caller assembles a query that is contextually relevant to the section
   * (e.g. "review do disco e entrevistas Powerslave Iron Maiden").
   */
  searchQuery?: string;
  /** Optional label for the search button (defaults to "Pesquisar no Google"). */
  searchLabel?: string;
}

function normalizeValue(v: string | DirectionValue | undefined | null): DirectionValue {
  if (!v) return { direction: "", mandatory: "" };
  if (typeof v === "string") return { direction: v, mandatory: "" };
  return { direction: v.direction || "", mandatory: v.mandatory || "" };
}

/**
 * DirectionEditor — Direção editorial + Informação Mandatória.
 *
 * Two long-form fields:
 *  - Direção: free editorial guidance (priority for the prompt).
 *  - Informação mandatória: text that MUST appear in the response and does
 *    NOT count toward the section's word target.
 */
export function DirectionEditor({
  value,
  onChange,
  sectionLabel,
  buttonLabel = "Direção",
  className,
  searchQuery,
  searchLabel = "Pesquisar no Google",
}: DirectionEditorProps) {
  const current = normalizeValue(value);
  const [open, setOpen] = useState(false);
  const [draftDirection, setDraftDirection] = useState(current.direction);
  const [draftMandatory, setDraftMandatory] = useState(current.mandatory);

  useEffect(() => {
    if (open) {
      const v = normalizeValue(value);
      setDraftDirection(v.direction);
      setDraftMandatory(v.mandatory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hasDirection = !!current.direction.trim();
  const hasMandatory = !!current.mandatory.trim();
  const hasContent = hasDirection || hasMandatory;

  const handleSave = () => {
    onChange({
      direction: draftDirection.trim(),
      mandatory: draftMandatory.trim(),
    });
    setOpen(false);
  };

  const handleClear = () => {
    setDraftDirection("");
    setDraftMandatory("");
    onChange({ direction: "", mandatory: "" });
    setOpen(false);
  };

  const trimmedQuery = (searchQuery || "").trim();
  const googleHref = trimmedQuery
    ? `https://www.google.com/search?q=${encodeURIComponent(trimmedQuery)}`
    : null;

  const tooltip = [
    hasDirection ? `Direção: ${current.direction}` : "",
    hasMandatory ? `Mandatório: ${current.mandatory}` : "",
  ].filter(Boolean).join("\n\n") || `Adicionar direção editorial para ${sectionLabel}`;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={hasContent ? "secondary" : "outline"}
        onClick={() => setOpen(true)}
        className={cn(
          "h-7 w-full justify-start gap-1.5 text-[10px] font-medium",
          hasContent && "border-primary/40",
          className,
        )}
        title={tooltip}
      >
        <Compass className="h-3 w-3" />
        <span className="truncate">
          {buttonLabel}
          {hasContent ? ` ✓${hasMandatory ? "!" : ""}` : ""}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              Direção editorial — {sectionLabel}
            </DialogTitle>
            <DialogDescription>
              Use os dois campos abaixo. A "Direção" guia o ângulo da geração.
              A "Informação mandatória" precisa aparecer na response, parafraseada
              de forma coerente — e NÃO conta no limite de palavras da seção.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Direção editorial
              </label>
              <Textarea
                value={draftDirection}
                onChange={(e) => setDraftDirection(e.target.value)}
                placeholder={`Ex: Foque na recepção crítica do álbum, mencione a turnê de 2024, evite comparar com o Master of Puppets...`}
                className="min-h-[140px] text-sm leading-relaxed"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">
                Informação mandatória
                <span className="ml-2 font-normal normal-case tracking-normal text-[10px] text-muted-foreground">
                  (precisa aparecer na response · NÃO conta no limite de palavras)
                </span>
              </label>
              <Textarea
                value={draftMandatory}
                onChange={(e) => setDraftMandatory(e.target.value)}
                placeholder={`Ex: Citar que a banda toca no Bangers Open Air em abril de 2027; mencionar que o vocalista deixou o grupo em 2024...`}
                className="min-h-[140px] text-sm leading-relaxed border-amber-500/20 focus-visible:ring-amber-500/40"
              />
            </div>
          </div>

          {googleHref && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pesquisa sugerida
                </p>
                <p className="truncate text-xs text-foreground/80" title={trimmedQuery}>
                  {trimmedQuery}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                asChild
                className="gap-1.5 shrink-0"
              >
                <a href={googleHref} target="_blank" rel="noopener noreferrer">
                  <Search className="h-3.5 w-3.5" /> {searchLabel}
                </a>
              </Button>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!hasContent && !draftDirection && !draftMandatory}
              className="gap-1.5 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" /> Limpar
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={handleSave} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Salvar direção
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}