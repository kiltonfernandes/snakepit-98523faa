import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AudioParams, DEFAULT_PARAMS, DEFAULT_PROCESSING_PROFILE, LogEntry, MasterReport, ProcessingProfile, TrackReport } from '@/lib/audio/types';
import { runPipeline, PipelineInput } from '@/lib/audio/pipeline';

interface RivaldoState {
  isProcessing: boolean;
  progress: number;
  progressLabel: string;
  logs: LogEntry[];
  trackReports: TrackReport[];
  masterReport: MasterReport | null;
  currentFilename: string;
}

interface RivaldoContextType extends RivaldoState {
  startPipeline: (input: PipelineInput, params: AudioParams) => Promise<void>;
  addLog: (message: string, type?: LogEntry['type']) => void;
  clearState: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
const RivaldoContext = createContext<RivaldoContextType | null>(null);

export function RivaldoProvider({ children }: { children: React.ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [trackReports, setTrackReports] = useState<TrackReport[]>([]);
  const [masterReport, setMasterReport] = useState<MasterReport | null>(null);
  const [currentFilename, setCurrentFilename] = useState('');
  const processingRef = useRef(false);

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    setLogs((prev) => [...prev, { timestamp: Date.now(), message, type }]);
  }, []);

  const clearState = useCallback(() => {
    setLogs([]);
    setTrackReports([]);
    setMasterReport(null);
    setProgress(0);
    setProgressLabel('');
    setCurrentFilename('');
  }, []);

  const startPipeline = useCallback(async (input: PipelineInput, params: AudioParams) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    setProgress(0);
    setLogs([]);
    setTrackReports([]);
    setMasterReport(null);
    setCurrentFilename(input.filename);

    try {
      const result = await runPipeline(
        input,
        params,
        (value, label) => { setProgress(value); setProgressLabel(label); },
        (message, type) => { setLogs(prev => [...prev, { timestamp: Date.now(), message, type: type || 'info' }]); }
      );
      setTrackReports(result.trackReports);
      setMasterReport(result.masterReport);
      addLog('Memória liberada após export', 'info');
    } catch (error) {
      addLog(error instanceof Error ? error.message : 'Erro no pipeline 3.2', 'error');
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  }, [addLog]);

  return (
    <RivaldoContext.Provider value={{
      isProcessing, progress, progressLabel, logs, trackReports, masterReport, currentFilename,
      startPipeline, addLog, clearState,
    }}>
      {children}
    </RivaldoContext.Provider>
  );
}

export function useRivaldo() {
  const ctx = useContext(RivaldoContext);
  if (!ctx) throw new Error('useRivaldo must be used within RivaldoProvider');
  return ctx;
}
