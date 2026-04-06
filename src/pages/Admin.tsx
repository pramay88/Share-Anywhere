import { useAdminMetrics } from '@/hooks/useAdminMetrics';
import { formatDistanceToNow } from 'date-fns';
import { 
  Activity, 
  AlertTriangle, 
  BarChart3,
  CheckCircle2,
  Clock,
  Cloud,
  Database,
  ExternalLink,
  FileText,
  Globe,
  HardDrive,
  Image,
  Loader2,
  RefreshCw,
  Server,
  Settings,
  Users,
  Video,
  XCircle,
  Zap,
  GitBranch,
  Package
} from 'lucide-react';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    READY: 'bg-green-100 text-green-700 border-green-200',
    BUILDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    ERROR: 'bg-red-100 text-red-700 border-red-200',
    QUEUED: 'bg-blue-100 text-blue-700 border-blue-200',
    CANCELED: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded border ${colors[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {status}
    </span>
  );
}

function Section({ icon: Icon, title, children, link }: { icon: React.ElementType; title: string; children: React.ReactNode; link?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-2.5 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-gray-500">
          <Icon className="w-3 h-3" />
          <span className="text-[10px] font-semibold uppercase tracking-wide">{title}</span>
        </div>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600">
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[10px] text-gray-500">{label}</span>
      <div className="text-right">
        <span className="text-[11px] font-medium text-gray-800">{value}</span>
        {sub && <span className="text-[9px] text-gray-400 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

function ProgressBar({ value, color = 'blue' }: { value: number; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
  };
  const barColor = value > 80 ? colors.red : value > 60 ? colors.yellow : colors[color];
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${barColor}`} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

export default function Admin() {
  const { data, isLoading, error, refetch, isRefetching, dataUpdatedAt } = useAdminMetrics();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto mb-2" />
          <p className="text-gray-500 text-xs">Loading metrics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
          <p className="text-gray-800 text-sm mb-1">Failed to load</p>
          <p className="text-gray-500 text-xs mb-3">{error.message}</p>
          <button onClick={() => refetch()} className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const v = data?.vercel?.data;
  const c = data?.cloudinary?.data;
  const f = data?.firebase?.data;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-md flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-[9px] text-gray-500">
              {data?.cached && <span className="text-amber-600">Cached • </span>}
              {dataUpdatedAt ? formatDistanceToNow(dataUpdatedAt) + ' ago' : 'Now'}
            </p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded text-[10px] hover:bg-gray-50 text-gray-700 shadow-sm"
        >
          <RefreshCw className={`w-3 h-3 ${isRefetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {data?.errors && Object.values(data.errors).some(Boolean) && (
        <div className="mb-3 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-[10px] text-red-600 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Errors: {Object.entries(data.errors).filter(([, e]) => e).map(([k]) => k).join(', ')}
        </div>
      )}

      {/* Top Stats */}
      <div className="grid grid-cols-5 gap-2 mb-3">
        <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
          <div className="w-7 h-7 bg-blue-50 rounded flex items-center justify-center">
            <Server className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-gray-900">{v?.totalDeployments || 0}</div>
            <div className="text-[9px] text-gray-500">Deployments</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
          <div className="w-7 h-7 bg-green-50 rounded flex items-center justify-center">
            <Globe className="w-3.5 h-3.5 text-green-600" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-gray-900">{v?.domainsCount || 0}</div>
            <div className="text-[9px] text-gray-500">Domains</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
          <div className="w-7 h-7 bg-purple-50 rounded flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-purple-600" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-gray-900">{f?.users?.total || 0}</div>
            <div className="text-[9px] text-gray-500">Users</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
          <div className="w-7 h-7 bg-orange-50 rounded flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-orange-600" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-gray-900">{v?.avgBuildTime || 0}s</div>
            <div className="text-[9px] text-gray-500">Avg Build</div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-2 shadow-sm">
          <div className="w-7 h-7 bg-pink-50 rounded flex items-center justify-center">
            <Package className="w-3.5 h-3.5 text-pink-600" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-gray-900">{c?.resources || 0}</div>
            <div className="text-[9px] text-gray-500">Resources</div>
          </div>
        </div>
      </div>

      {/* Main Grid - 4 columns */}
      <div className="grid grid-cols-4 gap-2">
        {/* Column 1: Deployments + Activity */}
        <div className="space-y-2">
          <Section icon={Server} title="Deployments" link="https://vercel.com/dashboard">
            <div className="space-y-1">
              {v?.deployments?.slice(0, 5).map((d: any) => (
                <div key={d.id} className="flex items-center gap-1.5 py-1 border-b border-gray-100 last:border-0">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.target === 'production' ? 'bg-green-500' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-gray-700">{d.meta?.sha || '—'}</span>
                      <span className="text-[9px] text-gray-400">→</span>
                      <span className="text-[10px] text-gray-500 truncate">{d.meta?.branch}</span>
                    </div>
                    <div className="text-[9px] text-gray-400">
                      {d.buildTime ? `${d.buildTime}s` : '—'} • {formatDistanceToNow(d.createdAt)}
                    </div>
                  </div>
                  <StatusBadge status={d.state} />
                </div>
              )) || <p className="text-[10px] text-gray-400">No deployments</p>}
            </div>
          </Section>

          <Section icon={Activity} title="Activity">
            <div className="space-y-1">
              {v?.recentActivity?.slice(0, 4).map((a: any) => (
                <div key={a.id} className="py-1 border-b border-gray-100 last:border-0">
                  <p className="text-[10px] text-gray-600 line-clamp-2">{a.text}</p>
                  <p className="text-[9px] text-gray-400">{formatDistanceToNow(a.createdAt)} ago</p>
                </div>
              )) || <p className="text-[10px] text-gray-400">No activity</p>}
            </div>
          </Section>
        </div>

        {/* Column 2: Project + Domains */}
        <div className="space-y-2">
          <Section icon={FileText} title="Project">
            <div className="space-y-0.5">
              <StatRow label="Name" value={v?.project?.name || '—'} />
              <StatRow label="Framework" value={v?.project?.framework || '—'} />
              <StatRow label="Node" value={v?.project?.nodeVersion || '—'} />
              <StatRow label="Plan" value={<span className="capitalize">{v?.project?.plan || '—'}</span>} />
              <StatRow label="Region" value={<span className="uppercase">{v?.project?.region || '—'}</span>} />
              <StatRow 
                label="Repo" 
                value={
                  <span className="text-blue-600 text-[10px]">
                    {v?.project?.gitRepository ? `${v.project.gitRepository.org}/${v.project.gitRepository.repo}` : '—'}
                  </span>
                } 
              />
              <StatRow 
                label="Branch" 
                value={
                  <span className="flex items-center gap-0.5">
                    <GitBranch className="w-2.5 h-2.5 text-gray-400" />
                    {v?.project?.gitRepository?.productionBranch || 'main'}
                  </span>
                } 
              />
              <div className="flex gap-3 pt-1 border-t border-gray-100 mt-1">
                <div className="flex items-center gap-1 text-[9px]">
                  {v?.project?.analytics ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <XCircle className="w-2.5 h-2.5 text-gray-300" />}
                  <span className="text-gray-500">Analytics</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]">
                  {v?.project?.speedInsights ? <CheckCircle2 className="w-2.5 h-2.5 text-green-500" /> : <XCircle className="w-2.5 h-2.5 text-gray-300" />}
                  <span className="text-gray-500">Speed</span>
                </div>
              </div>
            </div>
          </Section>

          <Section icon={Globe} title="Domains">
            <div className="space-y-1">
              {v?.domains?.map((d: any) => (
                <div key={d.name} className="flex items-center justify-between py-0.5">
                  <span className="text-[10px] font-mono text-gray-700 truncate">{d.name}</span>
                  {d.verified ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                  ) : (
                    <Clock className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                  )}
                </div>
              )) || <p className="text-[10px] text-gray-400">No domains</p>}
            </div>
          </Section>

          <Section icon={Users} title="Vercel Account">
            <div className="space-y-0.5">
              <StatRow label="Name" value={v?.user?.name || '—'} />
              <StatRow label="User" value={<span className="text-blue-600">@{v?.user?.username || '—'}</span>} />
            </div>
          </Section>
        </div>

        {/* Column 3: Cloudinary */}
        <div className="space-y-2">
          <Section icon={Cloud} title="Cloudinary" link="https://cloudinary.com/console">
            <div className="space-y-2">
              {/* Credits */}
              <div>
                <div className="flex justify-between text-[10px] mb-0.5">
                  <span className="text-gray-500">Credits</span>
                  <span className="text-gray-700">{c?.credits?.used?.toFixed(2) || 0} / {c?.credits?.limit || 25}</span>
                </div>
                <ProgressBar value={c?.credits?.percentage || 0} />
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                <StatRow label="Storage" value={formatBytes(c?.storage?.used || 0)} />
                <StatRow label="Bandwidth" value={formatBytes(c?.bandwidth?.used || 0)} />
                <StatRow label="Resources" value={c?.resources || 0} />
                <StatRow label="Requests" value={c?.requests || 0} />
                <StatRow label="Transforms" value={c?.transformations?.used || 0} />
                <StatRow label="Derived" value={c?.derivedResources || 0} />
                <StatRow label="Objects" value={c?.objects || 0} />
                <StatRow label="Plan" value={<span className="capitalize">{c?.plan || 'Free'}</span>} />
              </div>
            </div>
          </Section>

          <Section icon={Settings} title="Media Limits">
            <div className="space-y-0.5">
              <div className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Image className="w-2.5 h-2.5" /> Image
                </span>
                <span className="text-[10px] text-gray-700">{formatBytes(c?.mediaLimits?.imageMaxSizeBytes || 0)}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Video className="w-2.5 h-2.5" /> Video
                </span>
                <span className="text-[10px] text-gray-700">{formatBytes(c?.mediaLimits?.videoMaxSizeBytes || 0)}</span>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <Zap className="w-2.5 h-2.5" /> Pixels
                </span>
                <span className="text-[10px] text-gray-700">{((c?.mediaLimits?.imageMaxPixels || 0) / 1000000).toFixed(0)} MP</span>
              </div>
            </div>
          </Section>
        </div>

        {/* Column 4: Firebase */}
        <div className="space-y-2">
          <Section icon={Database} title="Firebase" link="https://console.firebase.google.com">
            <div className="space-y-0.5">
              <StatRow label="Total Users" value={f?.users?.total || 0} />
              <StatRow label="New (7d)" value={`+${f?.users?.recentSignups || 0}`} />
              <StatRow label="Transfers" value={f?.firestore?.totalTransfers || 0} />
              <StatRow label="Files" value={f?.firestore?.totalFiles || 0} />
            </div>
          </Section>

          <Section icon={HardDrive} title="Recent Transfers">
            <div className="space-y-1">
              {f?.recentTransfers?.slice(0, 5).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between py-0.5 border-b border-gray-100 last:border-0">
                  <div>
                    <div className="text-[10px] font-mono text-gray-700">{t.id.slice(0, 8)}</div>
                    <div className="text-[9px] text-gray-400">{t.fileCount} files • {formatBytes(t.totalSize)}</div>
                  </div>
                  <div className="text-[9px] text-gray-400">
                    {t.createdAt ? formatDistanceToNow(new Date(t.createdAt)) : '—'}
                  </div>
                </div>
              )) || <p className="text-[10px] text-gray-400">No transfers</p>}
            </div>
          </Section>

          <Section icon={ExternalLink} title="Quick Links">
            <div className="space-y-1">
              {[
                { href: 'https://vercel.com/dashboard', icon: Server, label: 'Vercel' },
                { href: 'https://console.firebase.google.com', icon: Database, label: 'Firebase' },
                { href: 'https://cloudinary.com/console', icon: Cloud, label: 'Cloudinary' },
              ].map(({ href, icon: Icon, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" 
                   className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-gray-800 transition-colors">
                  <Icon className="w-2.5 h-2.5" /> {label}
                </a>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
