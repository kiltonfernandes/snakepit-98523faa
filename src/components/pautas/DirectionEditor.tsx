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
import { Compass, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface DirectionEditorProps {
  /** Current direction text (raw input value). */
  value: string;
  /** Persist a new value (debounced/immediate is up to caller). */
  onChange: (value: string) => void;
  /** Section label shown in the modal header (e.g. "Aniversário", "Notícias"). */
  sectionLabel: string;
  /** Compact label for the button text (defaults to "Direção"). */
  buttonLabel?: string;
  /** Optional className for the button. */
  className?: string;
}

/**
 * DirectionEditor — replaces the inline "Direção: ..." text inputs.
 *
 * Renders as a small button. Clicking opens a modal where the editor can
 * write rich (multi-line) editorial guidance for a specific section. The
 * direction is saved on "Salvar" and is then injected into the prompt for
 * that section (see SECTION_DIRECTION_KEYS in src/lib/prompt-builder.ts).
 */
export function DirectionEditor({
  value,
  onChange,
  sectionLabel,
  buttonLabel = "Direção",
  className,
}: DirectionEditorProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value || "");

  // Sync draft when modal opens (or external value changes while closed)
  useEffect(() => {
    if (open) setDraft(value || "");
  }, [open, value]);

  const hasContent = !!(value && value.trim());

  const handleSave = () => {
    onChange(draft.trim());
    setOpen(false);
  };

  const handleClear = () => {
    setDraft("");
    onChange("");
    setOpen(false);
  };

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
        title={hasContent ? value : `Adicionar direção editorial para ${sectionLabel}`}
      >
        <Compass className="h-3 w-3" />
        <span className="truncate">
          {buttonLabel}
          {hasContent ? " ✓" : ""}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              Direção editorial — {sectionLabel}
            </DialogTitle>
            <DialogDescription>
              Escreva instruções livres para guiar a geração desta seção
              (ângulo, tom, fatos a destacar, o que evitar, etc.). Esse texto
              é injetado no prompt da seção como prioridade máxima.
            </DialogDescription>
          </DialogHeader>

          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Ex: Foque na recepção crítica do álbum, mencione a turnê de 2024, evite comparar com o Master of Puppets...`}
            className="min-h-[220px] text-sm leading-relaxed"
            autoFocus
          />

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!hasContent && !draft}
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