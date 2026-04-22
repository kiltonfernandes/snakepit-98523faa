import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './Sidebar';
import { AnimatePresence, motion } from 'framer-motion';
import { useRivaldoBulk } from '@/contexts/RivaldoBulkContext';
import { Layers } from 'lucide-react';

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const bulk = useRivaldoBulk();
  const showBulkIndicator = bulk.isProcessing && location.pathname !== '/rivaldo';

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b px-4 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
            <SidebarTrigger className="mr-4" />
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
        <AnimatePresence>
          {showBulkIndicator && (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={() => navigate('/rivaldo')}
              className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/40 bg-background/95 backdrop-blur px-4 py-2 text-xs font-mono shadow-lg shadow-primary/10 hover:bg-primary/10 transition-colors"
              title="Voltar ao Rivaldo"
            >
              <Layers className="w-3.5 h-3.5 text-primary" />
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full"
              />
              <span className="text-foreground/80 truncate max-w-[140px]">
                Bulk Rivaldo {bulk.currentBatchName ? `· ${bulk.currentBatchName}` : ''}
              </span>
              <span className="font-semibold text-primary">{Math.round(bulk.progress)}%</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </SidebarProvider>
  );
}
