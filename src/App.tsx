import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Send from "./pages/Send";
import Receive from "./pages/ReceiveNew";
import QuickShare from "./pages/QuickShare";
import OfflineShare from "./pages/OfflineShareNew";
import P2PShare from "./pages/P2PShare";
import Auth from "./pages/Auth";
import History from "./pages/History";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";

const queryClient = new QueryClient();

const AppContent = () => {
  useEffect(() => {
    // Add online/offline listeners
    const handleOnline = () => {
      toast.success('You are back online!');
    };

    const handleOffline = () => {
      toast.error('You are offline. Some features may not work.', {
        duration: 5000,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/send" element={<Send />} />
        <Route path="/quickshare" element={<QuickShare />} />
        <Route path="/receive" element={<Receive />} />
        <Route path="/offline-share" element={<OfflineShare />} />
        <Route path="/p2p" element={<P2PShare />} />
        <Route path="/history" element={<History />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppContent />
          <Analytics />
          <SpeedInsights />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
