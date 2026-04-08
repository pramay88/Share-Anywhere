import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export interface GA4Overview {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  engagementRate: number;
  avgSessionDuration: number;
  pageViews: number;
  bounceRate: number;
}

export interface GA4TopPage {
  path: string;
  views: number;
  avgDuration: number;
  bounceRate: number;
}

export interface GA4TrafficSource {
  source: string;
  medium: string;
  sessions: number;
  users: number;
  engagementRate: number;
}

export interface GA4Device {
  device: string;
  users: number;
  sessions: number;
  engagementRate: number;
}

export interface GA4Country {
  country: string;
  users: number;
  sessions: number;
}

export interface GA4TimeSeries {
  date: string;
  activeUsers: number;
  sessions: number;
  pageViews: number;
}

export interface GA4Data {
  overview: GA4Overview;
  topPages: GA4TopPage[];
  trafficSources: GA4TrafficSource[];
  devices: GA4Device[];
  countries: GA4Country[];
  timeSeries: GA4TimeSeries[];
  realtimeUsers: number;
}

export interface GSCOverview {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCCountry {
  country: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCDevice {
  device: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCTimeSeries {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GSCSitemap {
  path: string;
  lastSubmitted: string;
  isPending: boolean;
  warnings: number;
  errors: number;
}

export interface GSCIndexCoverage {
  sitemapsCount: number;
  sitemaps: GSCSitemap[];
}

export interface GSCData {
  overview: GSCOverview;
  topQueries: GSCQuery[];
  topPages: GSCPage[];
  countries: GSCCountry[];
  devices: GSCDevice[];
  timeSeries: GSCTimeSeries[];
  indexCoverage: GSCIndexCoverage | null;
}

export interface AnalyticsResponse {
  timestamp: string;
  dateRange: string;
  cached: boolean;
  cacheAge?: number;
  ga4: {
    error: string | null;
    data: GA4Data | null;
  };
  gsc: {
    error: string | null;
    data: GSCData | null;
  };
  errors: {
    ga4: string | null;
    gsc: string | null;
  };
}

export type DateRange = '7daysAgo' | '30daysAgo' | '90daysAgo';

async function fetchAnalytics(token: string, range: DateRange): Promise<AnalyticsResponse> {
  const response = await fetch(`/api/admin/analytics?range=${range}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch analytics');
  }

  return response.json();
}

export function useAnalytics(range: DateRange = '30daysAgo') {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['admin-analytics', range],
    queryFn: async () => {
      const token = await user?.getIdToken();
      if (!token) throw new Error('Not authenticated');
      return fetchAnalytics(token, range);
    },
    enabled: !!user,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes auto-refresh
    retry: 2,
  });
}
