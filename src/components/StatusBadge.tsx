import { cn } from '@/lib/utils';

type StatusVariant = 'draft' | 'in_progress' | 'review' | 'finalized' | 'generated' | 'needs_review' | 'pending' | 'processing' | 'ready' | 'published' | 'used' | 'archived' | 'reviewed' | 'pesquisa' | 'revisao' | 'criando_materiais' | 'pronto_gravar' | 'pronto_agendar' | 'agendado' | 'publicado';

const variantStyles: Record<StatusVariant, string> = {
  draft: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/20 text-primary',
  review: 'bg-yellow-500/20 text-yellow-400',
  needs_review: 'bg-yellow-500/20 text-yellow-400',
  finalized: 'bg-emerald-500/20 text-emerald-400',
  generated: 'bg-primary/20 text-primary',
  pending: 'bg-muted text-muted-foreground',
  processing: 'bg-blue-500/20 text-blue-400',
  ready: 'bg-emerald-500/20 text-emerald-400',
  published: 'bg-lavender/20 text-lavender',
  used: 'bg-emerald-500/20 text-emerald-400',
  archived: 'bg-muted text-muted-foreground',
  reviewed: 'bg-primary/20 text-primary',
  pesquisa: 'bg-blue-500/20 text-blue-400',
  revisao: 'bg-yellow-500/20 text-yellow-400',
  criando_materiais: 'bg-primary/20 text-primary',
  pronto_gravar: 'bg-orange-500/20 text-orange-400',
  pronto_agendar: 'bg-emerald-500/20 text-emerald-400',
  agendado: 'bg-cyan-500/20 text-cyan-400',
  publicado: 'bg-lavender/20 text-lavender',
};

const labels: Record<StatusVariant, string> = {
  draft: 'Rascunho',
  in_progress: 'Em Progresso',
  review: 'Revisão',
  needs_review: 'Precisa Revisão',
  finalized: 'Finalizado',
  generated: 'Gerado',
  pending: 'Pendente',
  processing: 'Processando',
  ready: 'Pronto',
  published: 'Publicado',
  used: 'Usado',
  archived: 'Arquivado',
  reviewed: 'Revisado',
  pesquisa: 'Pesquisa',
  revisao: 'Revisão',
  criando_materiais: 'Criando Materiais',
  pronto_gravar: 'Pronto p/ Gravar',
  pronto_agendar: 'Pronto p/ Agendar',
  agendado: 'Agendado',
  publicado: 'Publicado',
};

interface StatusBadgeProps {
  status: StatusVariant;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = variantStyles[status] || variantStyles.draft;
  const label = labels[status] || status;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      style,
      className
    )}>
      {label}
    </span>
  );
}