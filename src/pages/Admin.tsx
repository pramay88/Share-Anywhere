import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { 
  Activity, AlertTriangle, BarChart3, CheckCircle2, Clock, Cloud, Database,
  ExternalLink, FileText, Globe, HardDrive, Image, Loader2, RefreshCw,
  Server, Settings, Users, Video, XCircle, Zap, GitBranch, Package, TrendingUp
} from 'lucide-react';

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

type DeploymentRecord = {
  id: string;
  target?: string;
  state: string;
  meta?: { sha?: string; branch?: string };
  buildTime?: number;
  createdAt: string | number | Date;
};

type ActivityRecord = {
  id: string;
  text: string;
  createdAt: string | number | Date;
};

type DomainRecord = {
  name: string;
  verified?: boolean;
};

type TransferRecord = {
  id: string;
  fileCount?: number;
  totalSize?: number;
  createdAt?: string | number | Date;
};

const StatusBadge = ({ status }: { status: string }) => {
  const colors: Record<string, string> = {
    READY: 'bg-green-100 text-green-700',
    BUILDING: 'bg-yellow-100 text-yellow-700',
    ERROR: 'bg-red-100 text-red-700',
    QUEUED: 'bg-blue-100 text-blue-700',
  };
  return <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
};

const Section = ({ icon: Icon, title, children, link }: { icon: React.ElementType; title: string; children: React.ReactNode; link?: string }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm h-full">
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-gray-500">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600"><ExternalLink className="w-3 h-3" /></a>}
    </div>
    {children}
  </div>
);

const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center">
    <span className="text-[11px] text-gray-500">{label}</span>
    <span className="text-xs font-medium text-gray-800">{value}</span>
  </div>
);

export default function Admin() {
  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useAdminMetrics();

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
          <p className="text-gray-800 text-base mb-3">Failed to load</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-blue-600 text-white rounded text-sm">Retry</button>
        </div>
      </div>
    );
  }

  const v = data?.vercel?.data;
  const c = data?.cloudinary?.data;
  const f = data?.firebase?.data;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6 flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-[10px] text-gray-500">
              {data?.cached && <span className="text-amber-600">Cached • </span>}
              {dataUpdatedAt ? formatDistanceToNow(dataUpdatedAt) + ' ago' : 'Now'}
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isRefetching}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[11px] hover:bg-gray-50 text-gray-700 shadow-sm">
          <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Error Banner */}
      {data?.errors && Object.values(data.errors).some(Boolean) && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-600 flex items-center gap-1.5 flex-shrink-0">
          <AlertTriangle className="w-4 h-4" />
          Errors: {Object.entries(data.errors).filter(([, e]) => e).map(([k]) => k).join(', ')}
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4 flex-shrink-0">
        {[
          { icon: Server, label: 'Deploys', value: v?.totalDeployments || 0, bg: 'bg-blue-50', color: 'text-blue-600' },
          { icon: Globe, label: 'Domains', value: v?.domainsCount || 0, bg: 'bg-green-50', color: 'text-green-600' },
          { icon: Users, label: 'Users', value: f?.users?.total || 0, bg: 'bg-purple-50', color: 'text-purple-600' },
          { icon: Clock, label: 'Avg Build', value: `${v?.avgBuildTime || 0}s`, bg: 'bg-orange-50', color: 'text-orange-600' },
          { icon: Package, label: 'Resources', value: c?.resources || 0, bg: 'bg-pink-50', color: 'text-pink-600' },
        ].map(({ icon: Icon, label, value, bg, color }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
            <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="min-w-0">
              <div className="text-base font-bold text-gray-900 leading-none">{value}</div>
              <div className="text-[10px] text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1 min-h-0">
        {/* Col 1: Deployments + Activity */}
        <div className="flex flex-col gap-3 min-h-0">
          <Section icon={Server} title="Deployments" link="https://vercel.com/dashboard">
            <div className="space-y-1.5 overflow-auto max-h-48 lg:max-h-[calc(100%-24px)]">
              {v?.deployments?.slice(0, 4).map((d: DeploymentRecord) => (
                <div key={d.id} className="flex items-center gap-1.5 py-1 border-b border-gray-50 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.target === 'production' ? 'bg-green-500' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[11px] font-mono text-gray-700">{d.meta?.sha || '—'}</span>
                      <span className="text-[10px] text-gray-400">→</span>
                      <span className="text-[11px] text-gray-500 truncate">{d.meta?.branch}</span>
                    </div>
                    <div className="text-[10px] text-gray-400">{d.buildTime ? `${d.buildTime}s` : '—'} • {formatDistanceToNow(new Date(d.createdAt))}</div>
                  </div>
                  <StatusBadge status={d.state} />
                </div>
              )) || <p className="text-[11px] text-gray-400">No deployments</p>}
            </div>
          </Section>

          <Section icon={Activity} title="Activity">
            <div className="space-y-1.5 overflow-auto max-h-32 lg:max-h-[calc(100%-24px)]">
              {v?.recentActivity?.slice(0, 3).map((a: ActivityRecord) => (
                <div key={a.id} className="py-1 border-b border-gray-50 last:border-0">
                  <p className="text-[11px] text-gray-600 line-clamp-1">{a.text}</p>
                  <p className="text-[10px] text-gray-400">{formatDistanceToNow(new Date(a.createdAt))} ago</p>
                </div>
              )) || <p className="text-[11px] text-gray-400">No activity</p>}
            </div>
          </Section>
        </div>

        {/* Col 2: Project + Domains + Account */}
        <div className="flex flex-col gap-3 min-h-0">
          <Section icon={FileText} title="Project">
            <div className="space-y-1">
              <Stat label="Name" value={v?.project?.name || '—'} />
              <Stat label="Framework" value={v?.project?.framework || '—'} />
              <Stat label="Node" value={v?.project?.nodeVersion || '—'} />
              <Stat label="Plan" value={<span className="capitalize">{v?.project?.plan || '—'}</span>} />
              <Stat label="Region" value={<span className="uppercase">{v?.project?.region || '—'}</span>} />
              <Stat label="Repo" value={<span className="text-blue-600 text-[11px]">{v?.project?.gitRepository ? `${v.project.gitRepository.org}/${v.project.gitRepository.repo}` : '—'}</span>} />
              <Stat label="Branch" value={<span className="flex items-center gap-0.5"><GitBranch className="w-2.5 h-2.5 text-gray-400" />{v?.project?.gitRepository?.productionBranch || 'main'}</span>} />
              <div className="flex gap-3 pt-1.5 border-t border-gray-100 mt-1.5">
                <div className="flex items-center gap-1 text-[10px]">
                  {v?.project?.analytics ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-gray-300" />}
                  <span className="text-gray-500">Analytics</span>
                </div>
                <div className="flex items-center gap-1 text-[10px]">
                  {v?.project?.speedInsights ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-gray-300" />}
                  <span className="text-gray-500">Speed</span>
                </div>
              </div>
            </div>
          </Section>

          <Section icon={Globe} title="Domains">
            <div className="space-y-1">
              {v?.domains?.map((d: DomainRecord) => (
                <div key={d.name} className="flex items-center justify-between">
                  <span className="text-[11px] font-mono text-gray-700 truncate">{d.name}</span>
                  {d.verified ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Clock className="w-3 h-3 text-yellow-500" />}
                </div>
              )) || <p className="text-[11px] text-gray-400">No domains</p>}
            </div>
          </Section>

          <Section icon={Users} title="Vercel Account">
            <div className="space-y-1">
              <Stat label="Name" value={v?.user?.name || '—'} />
              <Stat label="User" value={<span className="text-blue-600">@{v?.user?.username || '—'}</span>} />
            </div>
          </Section>
        </div>

        {/* Col 3: Cloudinary */}
        <div className="flex flex-col gap-3 min-h-0">
          <Section icon={Cloud} title="Cloudinary" link="https://cloudinary.com/console">
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-gray-500">Credits</span>
                  <span className="text-gray-700">{c?.credits?.used?.toFixed(1) || 0}/{c?.credits?.limit || 25}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${(c?.credits?.percentage || 0) > 80 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(c?.credits?.percentage || 0, 100)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                <Stat label="Storage" value={formatBytes(c?.storage?.used || 0)} />
                <Stat label="Bandwidth" value={formatBytes(c?.bandwidth?.used || 0)} />
                <Stat label="Resources" value={c?.resources || 0} />
                <Stat label="Requests" value={c?.requests || 0} />
                <Stat label="Transforms" value={c?.transformations?.used || 0} />
                <Stat label="Derived" value={c?.derivedResources || 0} />
              </div>
            </div>
          </Section>

          <Section icon={Settings} title="Media Limits">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 flex items-center gap-1"><Image className="w-3 h-3" />Image</span>
                <span className="text-[11px] text-gray-700">{formatBytes(c?.mediaLimits?.imageMaxSizeBytes || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 flex items-center gap-1"><Video className="w-3 h-3" />Video</span>
                <span className="text-[11px] text-gray-700">{formatBytes(c?.mediaLimits?.videoMaxSizeBytes || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 flex items-center gap-1"><Zap className="w-3 h-3" />Pixels</span>
                <span className="text-[11px] text-gray-700">{((c?.mediaLimits?.imageMaxPixels || 0) / 1e6).toFixed(0)} MP</span>
              </div>
            </div>
          </Section>
        </div>

        {/* Col 4: Firebase */}
        <div className="flex flex-col gap-3 min-h-0">
          <Section icon={Database} title="Firebase" link="https://console.firebase.google.com">
            <div className="space-y-1">
              <Stat label="Total Users" value={f?.users?.total || 0} />
              <Stat label="New (7d)" value={`+${f?.users?.recentSignups || 0}`} />
              <Stat label="Transfers" value={f?.firestore?.totalTransfers || 0} />
              <Stat label="Files" value={f?.firestore?.totalFiles || 0} />
            </div>
          </Section>

          <Section icon={HardDrive} title="Recent Transfers">
            <div className="space-y-1 overflow-auto max-h-32 lg:max-h-[calc(100%-24px)]">
              {f?.recentTransfers?.slice(0, 4).map((t: TransferRecord) => (
                <div key={t.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-[11px] font-mono text-gray-700">{t.id.slice(0, 8)}</div>
                    <div className="text-[10px] text-gray-400">{t.fileCount ?? 0} files • {formatBytes(t.totalSize ?? 0)}</div>
                  </div>
                  <div className="text-[10px] text-gray-400">{t.createdAt ? formatDistanceToNow(new Date(t.createdAt)) : '—'}</div>
                </div>
              )) || <p className="text-[11px] text-gray-400">No transfers</p>}
            </div>
          </Section>

          <Section icon={ExternalLink} title="Quick Links">
            <div className="space-y-1">
              <Link to="/admin/analytics" className="flex items-center gap-1.5 text-[11px] text-blue-600 hover:text-blue-800 font-medium">
                <TrendingUp className="w-3 h-3" /> Analytics & Search Console
              </Link>
              {[
                { href: 'https://vercel.com/dashboard', icon: Server, label: 'Vercel' },
                { href: 'https://console.firebase.google.com', icon: Database, label: 'Firebase' },
                { href: 'https://cloudinary.com/console', icon: Cloud, label: 'Cloudinary' },
              ].map(({ href, icon: Icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-800">
                  <Icon className="w-3 h-3" /> {label}
                </a>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
