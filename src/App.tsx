import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import { RivaldoProvider } from "@/contexts/RivaldoContext";
import { RivaldoBulkProvider } from "@/contexts/RivaldoBulkContext";
import { AiCallProgressProvider } from "@/contexts/AiCallProgressContext";
import { AiCallProgressModal } from "@/components/AiCallProgressModal";
import { AppLayout } from "@/layouts/AppLayout";
import Dashboard from "@/pages/Dashboard";
import ProductionEditorial from "@/pages/ProductionEditorial";
import Rivaldo from "@/pages/Rivaldo";
import Settings from "@/pages/Settings";
import PublicWeekView from "@/pages/PublicWeekView";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();
const Router = import.meta.env.BASE_URL === "/" ? BrowserRouter : HashRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
    <RivaldoProvider>
    <RivaldoBulkProvider>
    <AiCallProgressProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AiCallProgressModal />
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pre-producao" element={<ProductionEditorial />} />
            <Route path="/releases" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/pautas" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/pautas-legacy" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/materials" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/rivaldo" element={<Rivaldo />} />
            <Route path="/calendar" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/analytics" element={<Navigate to="/pre-producao" replace />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/week/:weekId" element={<PublicWeekView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </TooltipProvider>
    </AiCallProgressProvider>
    </RivaldoBulkProvider>
    </RivaldoProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
