import { useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BgmLibraryModal } from './BgmLibraryModal';

interface BgmPickerCardProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  suggestedGenres?: string[];
}

export function BgmPickerCard({ file, onFileChange, suggestedGenres = [] }: BgmPickerCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        className={`relative group rounded-lg p-6 transition-all duration-200 bg-card hover:bg-accent/10 ${file ? 'ring-1 ring-primary/30' : ''}`}
        style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
      >
        <div className="absolute top-2 left-3">
          <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">BGM</span>
        </div>
        <div className="flex flex-col items-center gap-3 justify-center min-h-[80px]">
          {file ? (
            <>
              <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center"><Sparkles className="w-4 h-4 text-primary" /></div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground truncate max-w-[180px]">{file.name}</p>
                <p className="text-xs text-muted-foreground font-mono mt-1">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
              </div>
            </>
          ) : (
            <>
              <Layers className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">BGM</p>
                <p className="text-xs text-muted-foreground">A Trilha</p>
              </div>
            </>
          )}
          <Button size="sm" variant={file ? 'outline' : 'default'} onClick={() => setOpen(true)}>
            {file ? 'Trocar BGM' : 'Selecionar BGM'}
          </Button>
        </div>
        {file && (
          <button
            onClick={() => onFileChange(null)}
            className="absolute top-2 right-2 p-1 rounded-full bg-secondary hover:bg-destructive/20 transition-colors"
            aria-label="Remover BGM"
          >
            <span className="text-xs">×</span>
          </button>
        )}
      </motion.div>
      <BgmLibraryModal open={open} onOpenChange={setOpen} onPick={(nextFile) => onFileChange(nextFile)} preferredGenres={suggestedGenres} />
    </>
  );
}
