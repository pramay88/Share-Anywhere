import { useQuery } from "@tanstack/react-query";
import { auth } from "@/integrations/firebase/config";

export interface AdminMetrics {
  timestamp: string;
  cached: boolean;
  cacheAge?: number;
  vercel: {
    error: string | null;
    data: {
      user: {
        name: string;
        email: string;
        username: string;
      } | null;
      project: {
        name: string;
        framework: string;
        nodeVersion: string;
        updatedAt: number;
        latestDeployments: Array<{
          id: string;
          state: string;
          createdAt: number;
          url: string;
        }>;
      } | null;
      domains: Array<{
        name: string;
        verified: boolean;
      }>;
    } | null;
  };
  cloudinary: {
    error: string | null;
    data: {
      plan: string;
      lastUpdated: string;
      storage: {
        used: number;
        limit: number;
        usedFormatted: string;
        percentage: number;
      };
      bandwidth: {
        used: number;
        limit: number;
        usedFormatted: string;
        percentage: number;
      };
      transformations: {
        used: number;
        limit: number;
        percentage: number;
      };
      resources: number;
      derivedResources: number;
    } | null;
  };
  firebase: {
    error: string | null;
    data: {
      users: {
        total: number;
        recentSignups: number;
      };
      firestore: {
        totalTransfers: number;
        totalFiles: number;
      };
      recentTransfers: Array<{
        id: string;
        createdAt: string;
        fileCount: number;
        totalSize: number;
        expiresAt: string;
      }>;
    } | null;
  };
  summary: {
    totalUsers: number;
    recentSignups: number;
    totalTransfers: number;
    totalFiles: number;
    storageUsed: string;
    storagePercentage: number;
    bandwidthUsed: string;
    bandwidthPercentage: number;
  };
  errors: {
    vercel: string | null;
    cloudinary: string | null;
    firebase: string | null;
  };
}

async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const idToken = await auth.currentUser?.getIdToken();
  
  if (!idToken) {
    throw new Error("Not authenticated");
  }

  const response = await fetch('/api/admin/metrics', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${idToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export function useAdminMetrics(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ['admin-metrics'],
    queryFn: fetchAdminMetrics,
    refetchInterval: options?.refetchInterval ?? 60000, // Default 60 seconds
    staleTime: 30000, // Consider data stale after 30 seconds
    retry: 2,
    refetchOnWindowFocus: true,
  });
}
