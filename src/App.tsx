import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect } from "react";
import { toast } from "sonner";
import Index from "./pages/Index";
import Send from "./pages/Send";
import Receive from "./pages/ReceiveNew";
import QuickShare from "./pages/QuickShare";
import Auth from "./pages/Auth";
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
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
