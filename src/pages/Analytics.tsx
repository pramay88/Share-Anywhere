import { useState } from 'react';
import { useAnalytics, DateRange } from '@/hooks/useAnalytics';
import { formatDistanceToNow } from 'date-fns';
import {
  Activity, AlertTriangle, BarChart3, Clock, ExternalLink, Globe, Loader2,
  Monitor, MousePointerClick, RefreshCw, Search, Smartphone, Tablet, TrendingUp,
  Users, Eye, ArrowUpRight, MapPin, XCircle
} from 'lucide-react';

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
};

const formatPercent = (value: number): string => {
  return (value * 100).toFixed(1) + '%';
};

const Section = ({ icon: Icon, title, children, link }: { icon: React.ElementType; title: string; children: React.ReactNode; link?: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm h-full">
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-gray-600">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600"><ExternalLink className="w-3.5 h-3.5" /></a>}
    </div>
    {children}
  </div>
);

const StatCard = ({ icon: Icon, label, value, subValue, color }: { icon: React.ElementType; label: string; value: string | number; subValue?: string; color: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 ${color} rounded-lg flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold text-gray-900">{value}</div>
        <div className="text-xs text-gray-500">{label}</div>
        {subValue && <div className="text-[10px] text-gray-400">{subValue}</div>}
      </div>
    </div>
  </div>
);

const DeviceIcon = ({ device }: { device: string }) => {
  const d = device.toLowerCase();
  if (d === 'mobile') return <Smartphone className="w-3.5 h-3.5" />;
  if (d === 'tablet') return <Tablet className="w-3.5 h-3.5" />;
  return <Monitor className="w-3.5 h-3.5" />;
};

export default function Analytics() {
  const [dateRange, setDateRange] = useState<DateRange>('30daysAgo');
  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useAnalytics(dateRange);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-800 mb-3">Failed to load analytics</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const ga4 = data?.ga4?.data;
  const gsc = data?.gsc?.data;
  const hasGA4 = ga4 && !data?.ga4?.error;
  const hasGSC = gsc && !data?.gsc?.error;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Analytics & Search Console</h1>
            <p className="text-xs text-gray-500">
              {data?.cached && <span className="text-amber-600">Cached • </span>}
              {dataUpdatedAt ? formatDistanceToNow(dataUpdatedAt) + ' ago' : 'Now'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 shadow-sm"
          >
            <option value="7daysAgo">Last 7 days</option>
            <option value="30daysAgo">Last 30 days</option>
            <option value="90daysAgo">Last 90 days</option>
          </select>
          <button onClick={() => refetch()} disabled={isRefetching}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm hover:bg-gray-50 text-gray-700 shadow-sm">
            <RefreshCw className={`w-4 h-4 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Error Banners */}
      {data?.errors && (data.errors.ga4 || data.errors.gsc) && (
        <div className="mb-4 space-y-2">
          {data.errors.ga4 && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              GA4: {data.errors.ga4}
            </div>
          )}
          {data.errors.gsc && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              GSC: {data.errors.gsc}
            </div>
          )}
        </div>
      )}

      {/* GA4 Section */}
      {hasGA4 && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Google Analytics (GA4)
          </h2>
          
          {/* GA4 Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <StatCard icon={Users} label="Total Users" value={formatNumber(ga4.overview.totalUsers)} color="bg-blue-500" />
            <StatCard icon={Activity} label="Active Users" value={formatNumber(ga4.overview.activeUsers)} subValue={`${ga4.realtimeUsers} realtime`} color="bg-green-500" />
            <StatCard icon={ArrowUpRight} label="New Users" value={formatNumber(ga4.overview.newUsers)} color="bg-purple-500" />
            <StatCard icon={Eye} label="Page Views" value={formatNumber(ga4.overview.pageViews)} color="bg-orange-500" />
            <StatCard icon={Clock} label="Avg Session" value={formatDuration(ga4.overview.avgSessionDuration)} color="bg-teal-500" />
            <StatCard icon={TrendingUp} label="Engagement" value={formatPercent(ga4.overview.engagementRate)} subValue={`${formatPercent(ga4.overview.bounceRate)} bounce`} color="bg-pink-500" />
          </div>

          {/* GA4 Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Top Pages */}
            <Section icon={Eye} title="Top Pages" link="https://analytics.google.com">
              <div className="space-y-2 max-h-48 overflow-auto">
                {ga4.topPages.slice(0, 5).map((page, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1 mr-2" title={page.path}>{page.path}</span>
                    <span className="text-gray-800 font-medium">{formatNumber(page.views)}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Traffic Sources */}
            <Section icon={Globe} title="Traffic Sources">
              <div className="space-y-2 max-h-48 overflow-auto">
                {ga4.trafficSources.slice(0, 5).map((source, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1 mr-2">
                      {source.source}/{source.medium}
                    </span>
                    <span className="text-gray-800 font-medium">{formatNumber(source.sessions)}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Devices */}
            <Section icon={Monitor} title="Devices">
              <div className="space-y-2">
                {ga4.devices.map((device, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-1.5">
                      <DeviceIcon device={device.device} />
                      {device.device}
                    </span>
                    <span className="text-gray-800 font-medium">{formatNumber(device.users)}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Countries */}
            <Section icon={MapPin} title="Top Countries">
              <div className="space-y-2 max-h-48 overflow-auto">
                {ga4.countries.slice(0, 5).map((country, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{country.country}</span>
                    <span className="text-gray-800 font-medium">{formatNumber(country.users)}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}

      {/* GSC Section */}
      {hasGSC && (
        <>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" /> Google Search Console
          </h2>
          
          {/* GSC Overview Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard icon={MousePointerClick} label="Total Clicks" value={formatNumber(gsc.overview.clicks)} color="bg-blue-500" />
            <StatCard icon={Eye} label="Impressions" value={formatNumber(gsc.overview.impressions)} color="bg-green-500" />
            <StatCard icon={TrendingUp} label="Avg CTR" value={gsc.overview.ctr.toFixed(2) + '%'} color="bg-purple-500" />
            <StatCard icon={BarChart3} label="Avg Position" value={gsc.overview.position.toFixed(1)} color="bg-orange-500" />
          </div>

          {/* GSC Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Top Queries */}
            <Section icon={Search} title="Top Search Queries" link="https://search.google.com/search-console">
              <div className="space-y-2 max-h-48 overflow-auto">
                {gsc.topQueries.slice(0, 5).map((query, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1 mr-2" title={query.query}>{query.query}</span>
                    <div className="text-right">
                      <span className="text-gray-800 font-medium">{query.clicks}</span>
                      <span className="text-gray-400 text-xs ml-1">clicks</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Top Pages */}
            <Section icon={Eye} title="Top Landing Pages">
              <div className="space-y-2 max-h-48 overflow-auto">
                {gsc.topPages.slice(0, 5).map((page, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate flex-1 mr-2" title={page.page}>
                      {new URL(page.page).pathname || '/'}
                    </span>
                    <span className="text-gray-800 font-medium">{page.clicks}</span>
                  </div>
                ))}
              </div>
            </Section>

            {/* Devices */}
            <Section icon={Monitor} title="Search by Device">
              <div className="space-y-2">
                {gsc.devices.map((device, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 flex items-center gap-1.5">
                      <DeviceIcon device={device.device} />
                      {device.device}
                    </span>
                    <div className="text-right">
                      <span className="text-gray-800 font-medium">{device.clicks}</span>
                      <span className="text-gray-400 text-xs ml-1">({device.ctr.toFixed(1)}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Countries */}
            <Section icon={MapPin} title="Search by Country">
              <div className="space-y-2 max-h-48 overflow-auto">
                {gsc.countries.slice(0, 5).map((country, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{country.country}</span>
                    <div className="text-right">
                      <span className="text-gray-800 font-medium">{country.clicks}</span>
                      <span className="text-gray-400 text-xs ml-1">clicks</span>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </>
      )}

      {/* No Data State */}
      {!hasGA4 && !hasGSC && (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-800 mb-2">Analytics Not Configured</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            To enable analytics, add the following environment variables:
          </p>
          <div className="mt-4 text-left max-w-md mx-auto bg-gray-100 rounded-lg p-4 text-sm font-mono text-gray-700">
            <div>GA4_PROPERTY_ID=your-ga4-property-id</div>
            <div>GSC_SITE_URL=https://your-site.com</div>
            <div>GOOGLE_SERVICE_ACCOUNT_KEY=base64-encoded-key</div>
          </div>
        </div>
      )}

      {/* Back Link */}
      <div className="mt-6 text-center">
        <a href="/admin" className="text-sm text-blue-600 hover:text-blue-800">
          ← Back to Dashboard
        </a>
      </div>
    </div>
  );
}
