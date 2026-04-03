import { motion } from 'framer-motion';
import badgeUrl from '@/assets/heavynauta-badge.svg';

interface HeavynautaBrandProps {
  compact?: boolean;
}

export function HeavynautaBrand({ compact = false }: HeavynautaBrandProps) {
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-3"
      >
        <div className="relative h-12 w-12 overflow-hidden rounded-2xl border border-primary/20 bg-card/80 shadow-[0_0_24px_hsl(192_100%_52%_/_0.16)]">
          <img src={badgeUrl} alt="Heavynauta" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-semibold tracking-tight text-foreground">
            Rivaldo by Heavynauta <span className="text-primary font-normal text-sm">3.2.0</span>
          </div>
          <div className="text-[11px] font-mono text-muted-foreground">
            Desktop queue, tray render e limpeza de voz com assinatura Heavynauta.
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-2xl border border-primary/20 bg-[linear-gradient(135deg,rgba(97,212,255,0.08),rgba(250,95,165,0.12),rgba(78,45,116,0.2))]"
      style={{ boxShadow: '0 12px 40px -24px hsl(192 100% 52% / 0.4)' }}
    >
      <div className="flex items-center gap-4 p-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <img src={badgeUrl} alt="Heavynauta" className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="text-xs font-mono uppercase tracking-[0.22em] text-primary">Heavynauta Signal</div>
          <div className="text-sm font-semibold text-foreground">Rivaldo 3.2.0 Desktop Engine</div>
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            Fila local, render em bandeja e polimento de voz com identidade visual Heavynauta.
          </div>
        </div>
      </div>
    </motion.div>
  );
}
