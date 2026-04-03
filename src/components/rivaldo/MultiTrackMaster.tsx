import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileAudio, X, Layers, Plus, Sparkles } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { ProcessingProfile } from '@/lib/audio/types';

interface MultiTrackMasterProps {
  mode: 'single' | 'multi';
  onModeChange: (mode: 'single' | 'multi') => void;
  singleFile: File | null;
  onSingleFileChange: (file: File | null) => void;
  multiFiles: File[];
  onMultiFilesChange: (files: File[]) => void;
  processingProfile: ProcessingProfile;
  disabled?: boolean;
}

export function MultiTrackMaster({
  mode,
  onModeChange,
  singleFile,
  onSingleFileChange,
  multiFiles,
  onMultiFilesChange,
  processingProfile,
  disabled,
}: MultiTrackMasterProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((file) => file.type.includes('audio'));
    if (mode === 'single' && files[0]) {
      onSingleFileChange(files[0]);
    } else if (mode === 'multi' && files.length > 0) {
      onMultiFilesChange([...multiFiles, ...files]);
    }
  }, [mode, multiFiles, onSingleFileChange, onMultiFilesChange]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (mode === 'single' && files[0]) {
      onSingleFileChange(files[0]);
    } else if (mode === 'multi' && files.length > 0) {
      onMultiFilesChange([...multiFiles, ...files]);
    }
    e.target.value = '';
  }, [mode, multiFiles, onSingleFileChange, onMultiFilesChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-lg bg-card"
      style={{ boxShadow: '0 4px 20px -4px hsl(220 15% 0% / 0.5)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Master</span>
            <span className="text-[10px] text-muted-foreground">A locucao</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono text-primary">
            <Sparkles className="w-3 h-3" />
            {processingProfile.uiMode === 'auto' ? 'Auto Enhance 3.2' : 'Advanced 3.2'}
            <span className="text-muted-foreground">
              RNNoise + WPE {processingProfile.dereverb.mode.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono ${mode === 'single' ? 'text-primary' : 'text-muted-foreground'}`}>
            Faixa unica
          </span>
          <Switch
            checked={mode === 'multi'}
            onCheckedChange={(checked) => onModeChange(checked ? 'multi' : 'single')}
            disabled={disabled}
            className="h-4 w-8"
          />
          <span className={`text-[10px] font-mono ${mode === 'multi' ? 'text-primary' : 'text-muted-foreground'}`}>
            Multitrack
          </span>
        </div>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`p-4 transition-all ${isDragging ? 'ring-2 ring-primary ring-inset' : ''}`}
      >
        {mode === 'single' ? (
          <label className="flex flex-col items-center gap-3 cursor-pointer justify-center min-h-[96px]">
            <input
              type="file"
              accept="audio/mp3,audio/mpeg,.mp3"
              className="hidden"
              onChange={handleFileInput}
              disabled={disabled}
            />
            {singleFile ? (
              <>
                <FileAudio className="w-8 h-8 text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground truncate max-w-[280px]">{singleFile.name}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {(singleFile.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="w-8 h-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Arraste ou clique</p>
                  <p className="text-xs text-muted-foreground">Locucao principal em MP3</p>
                </div>
              </>
            )}
          </label>
        ) : (
          <div className="space-y-3">
            {multiFiles.length > 0 && (
              <div className="space-y-1 max-h-[180px] overflow-y-auto">
                {multiFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                    <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="truncate flex-1 font-mono text-foreground">{file.name}</span>
                    <span className="text-muted-foreground font-mono shrink-0">
                      {(file.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <button
                      onClick={() => onMultiFilesChange(multiFiles.filter((_, fileIndex) => fileIndex !== index))}
                      disabled={disabled}
                      className="p-0.5 rounded hover:bg-destructive/20 transition-colors shrink-0"
                    >
                      <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label className="flex items-center justify-center gap-2 cursor-pointer py-4 border border-dashed border-border rounded-lg hover:border-primary/50 transition-colors">
              <input
                type="file"
                accept="audio/mp3,audio/mpeg,.mp3"
                multiple
                className="hidden"
                onChange={handleFileInput}
                disabled={disabled}
              />
              <Plus className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {multiFiles.length === 0 ? 'Adicionar trilhas de voz' : `Adicionar mais (${multiFiles.length})`}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted-foreground">
              <div className="rounded-md bg-muted/40 px-3 py-2">VAD {processingProfile.analysis.vadFrameMs}ms</div>
              <div className="rounded-md bg-muted/40 px-3 py-2">RNNoise {processingProfile.cleanup.denoiseAmount}%</div>
              <div className="rounded-md bg-muted/40 px-3 py-2">WPE {processingProfile.dereverb.mode}</div>
              <div className="rounded-md bg-muted/40 px-3 py-2">Smart mute {processingProfile.cleanup.smartMute ? 'on' : 'off'}</div>
            </div>
          </div>
        )}
      </div>

      {mode === 'single' && singleFile && (
        <button
          onClick={() => onSingleFileChange(null)}
          disabled={disabled}
          className="absolute top-11 right-3 p-1 rounded-full bg-secondary hover:bg-destructive/20 transition-colors"
        >
          <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
        </button>
      )}
    </motion.div>
  );
}
