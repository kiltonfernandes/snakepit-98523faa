import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import { RivaldoProvider } from "@/contexts/RivaldoContext";
import { RivaldoBulkProvider } from "@/contexts/RivaldoBulkContext";
import { AppLayout } from "@/layouts/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Releases from "@/pages/Releases";
import Pautas from "@/pages/Pautas";
import PautasStandalone from "@/pages/PautasStandalone";
import Materials from "@/pages/Materials";
import Rivaldo from "@/pages/Rivaldo";
import CalendarView from "@/pages/CalendarView";
import Settings from "@/pages/Settings";
import ReleaseAnalytics from "@/pages/ReleaseAnalytics";
import PublicWeekView from "@/pages/PublicWeekView";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppProvider>
    <RivaldoProvider>
    <RivaldoBulkProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/releases" element={<Releases />} />
            <Route path="/pautas" element={<PautasStandalone />} />
            <Route path="/pautas-legacy" element={<Pautas />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/rivaldo" element={<Rivaldo />} />
            <Route path="/calendar" element={<CalendarView />} />
            <Route path="/analytics" element={<ReleaseAnalytics />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="/week/:weekId" element={<PublicWeekView />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
    </RivaldoBulkProvider>
    </RivaldoProvider>
    </AppProvider>
  </QueryClientProvider>
);

export default App;
