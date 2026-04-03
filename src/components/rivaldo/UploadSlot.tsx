import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileAudio, X, Loader2 } from 'lucide-react';
import { loadPresetAsFile } from '@/lib/assets/presets';

interface Preset {
  label: string;
  url: string;
}

interface UploadSlotProps {
  label: string;
  sublabel: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  index: number;
  presets?: Preset[];
}

export function UploadSlot({ label, sublabel, file, onFileChange, index, presets }: UploadSlotProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [loadingPreset, setLoadingPreset] = useState<string | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f && f.type.includes('audio')) onFileChange(f);
  }, [onFileChange]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileChange(f);
  }, [onFileChange]);

  const handlePresetClick = useCallback(async (preset: Preset) => {
    setLoadingPreset(preset.label);
    try {
      onFileChange(await loadPresetAsFile(preset));
    } catch (err) {
      console.error('Failed to load preset:', err);
    } finally {
      setLoadingPreset(null);
    }
  }, [onFileChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        relative group rounded-lg p-6 transition-all duration-200 cursor-pointer
        bg-card hover:bg-accent/10
        ${isDragging ? 'ring-2 ring-primary scale-[1.02]' : ''}
        ${file ? 'ring-1 ring-primary/30' : ''}
      `}
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      <label className="flex flex-col items-center gap-3 cursor-pointer justify-center min-h-[80px]">
        <input
          type="file"
          accept="audio/mp3,audio/mpeg,.mp3"
          className="hidden"
          onChange={handleFileInput}
        />

        {file ? (
          <>
            <FileAudio className="w-8 h-8 text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground truncate max-w-[180px]">{file.name}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {(file.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{sublabel}</p>
            </div>
          </>
        )}
      </label>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={(e) => { e.stopPropagation(); handlePresetClick(preset); }}
              disabled={loadingPreset !== null}
              className="px-2 py-0.5 text-[10px] font-mono rounded-md bg-secondary hover:bg-primary/20 hover:text-primary text-muted-foreground transition-colors disabled:opacity-50"
            >
              {loadingPreset === preset.label ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                preset.label
              )}
            </button>
          ))}
        </div>
      )}

      {file && (
        <button
          onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
          className="absolute top-2 right-2 p-1 rounded-full bg-secondary hover:bg-destructive/20 transition-colors"
        >
          <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}

      <div className="absolute top-2 left-3">
        <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">{label}</span>
      </div>
    </motion.div>
  );
}
