import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Suspense, lazy, useEffect, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import ErrorBoundary from "./components/ErrorBoundary";
import AdminProtectedRoute from "./components/AdminProtectedRoute";

const queryClient = new QueryClient();
const Send = lazy(() => import("./pages/Send"));
const Receive = lazy(() => import("./pages/ReceiveNew"));
const QuickShare = lazy(() => import("./pages/QuickShare"));
const OfflineShare = lazy(() => import("./pages/OfflineShareNew"));
const P2PShare = lazy(() => import("./pages/P2PShare"));
const Auth = lazy(() => import("./pages/Auth"));
const History = lazy(() => import("./pages/History"));
const Admin = lazy(() => import("./pages/Admin"));
const Analytics = lazy(() => import("./pages/Analytics"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center p-6" role="status" aria-live="polite">
    <div className="h-8 w-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
  </div>
);

const DeferredInsights = () => {
  const [Insights, setInsights] = useState<null | {
    Analytics: ComponentType;
    SpeedInsights: ComponentType;
  }>(null);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const loadInsights = async () => {
      try {
        const [{ Analytics }, { SpeedInsights }] = await Promise.all([
          import("@vercel/analytics/react"),
          import("@vercel/speed-insights/react"),
        ]);

        if (mounted) {
          setInsights({ Analytics, SpeedInsights });
        }
      } catch {
        // Ignore non-critical analytics load failures
      }
    };

    if ("requestIdleCallback" in window) {
      idleId = (window as Window & {
        requestIdleCallback: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
      }).requestIdleCallback(() => {
        void loadInsights();
      }, { timeout: 2000 });
    } else {
      timeoutId = window.setTimeout(() => {
        void loadInsights();
      }, 1500);
    }

    return () => {
      mounted = false;

      if (typeof timeoutId === "number") {
        window.clearTimeout(timeoutId);
      }

      if (typeof idleId === "number" && "cancelIdleCallback" in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      }
    };
  }, []);

  if (!Insights) {
    return null;
  }

  return (
    <>
      <Insights.Analytics />
      <Insights.SpeedInsights />
    </>
  );
};

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/send" element={<Send />} />
          <Route path="/quickshare" element={<QuickShare />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/offline-share" element={<OfflineShare />} />
          <Route path="/p2p" element={<P2PShare />} />
          <Route path="/history" element={<History />} />
          <Route path="/admin" element={
            <AdminProtectedRoute>
              <Admin />
            </AdminProtectedRoute>
          } />
          <Route path="/admin/analytics" element={
            <AdminProtectedRoute>
              <Analytics />
            </AdminProtectedRoute>
          } />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
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
          <DeferredInsights />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
