import { motion } from 'framer-motion';
import { Hammer } from 'lucide-react';

export default function PreProducao() {
  return (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Hammer className="h-6 w-6 text-primary" />
          Pré-produção
        </h1>
        <p className="text-muted-foreground mt-1">
          Em construção — aguardando definição de fluxo.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
        Nada por aqui ainda.
      </div>
    </motion.div>
  );
}