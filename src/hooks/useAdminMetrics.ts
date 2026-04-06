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
        avatar?: string;
      } | null;
      project: {
        id: string;
        name: string;
        framework: string;
        nodeVersion: string;
        updatedAt: number;
        createdAt: number;
        analytics: boolean;
        speedInsights: boolean;
        gitRepository: {
          repo: string;
          repoOwner: string;
          type: string;
        } | null;
      } | null;
      deployments: Array<{
        id: string;
        name: string;
        url: string;
        state: string;
        target: string;
        createdAt: number;
        buildingAt: number;
        ready: number;
        buildTime: number | null;
        meta: {
          githubCommitRef?: string;
          githubCommitSha?: string;
          githubCommitMessage?: string;
        };
      }>;
      events: Array<{
        id: string;
        type: string;
        text: string;
        createdAt: number;
        userId: string;
      }>;
      totalDeployments: number;
      avgBuildTime: number;
      domains: Array<{
        name: string;
        verified: boolean;
        configured: boolean;
      }>;
      domainsCount: number;
    } | null;
  };
  cloudinary: {
    error: string | null;
    data: {
      plan: string;
      lastUpdated: string;
      credits: {
        used: number;
        limit: number;
        percentage: number;
      };
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
      requests: number;
      resources: number;
      derivedResources: number;
      mediaLimits: {
        imageMaxSizeBytes: number;
        videoMaxSizeBytes: number;
        rawMaxSizeBytes: number;
        imageMaxPixels: number;
      };
      objects: {
        usage: number;
      };
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
