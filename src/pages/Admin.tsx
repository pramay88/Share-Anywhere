import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminMetrics } from "@/hooks/useAdminMetrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  FileText, 
  HardDrive, 
  Activity, 
  RefreshCw, 
  ArrowLeft,
  Cloud,
  Database,
  Globe,
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { format } from "date-fns";

// KPI Card Component
function KPICard({ 
  title, 
  value, 
  subtitle, 
  icon: Icon, 
  trend,
  loading 
}: { 
  title: string; 
  value: string | number; 
  subtitle?: string; 
  icon: React.ElementType;
  trend?: { value: number; label: string };
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
        {trend && (
          <div className="flex items-center mt-1 text-xs">
            <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
            <span className="text-green-500">+{trend.value}</span>
            <span className="text-muted-foreground ml-1">{trend.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Usage Progress Card
function UsageCard({
  title,
  used,
  percentage,
  icon: Icon,
  loading,
}: {
  title: string;
  used: string;
  percentage: number;
  icon: React.ElementType;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-2 w-full" />
        </CardContent>
      </Card>
    );
  }

  const getProgressColor = (pct: number) => {
    if (pct >= 90) return "bg-red-500";
    if (pct >= 70) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold">{used}</span>
          <span className="text-sm text-muted-foreground">{percentage}%</span>
        </div>
        <Progress value={percentage} className={getProgressColor(percentage)} />
      </CardContent>
    </Card>
  );
}

// Service Status Card
function ServiceStatusCard({
  services,
  loading,
}: {
  services: Array<{ name: string; status: "ok" | "error"; error?: string | null }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Service Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {services.map((service) => (
          <div key={service.name} className="flex items-center justify-between">
            <span className="text-sm">{service.name}</span>
            {service.status === "ok" ? (
              <Badge variant="outline" className="text-green-500 border-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                OK
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-500 border-red-500">
                <AlertCircle className="h-3 w-3 mr-1" />
                Error
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// Recent Transfers Table
function RecentTransfersCard({
  transfers,
  loading,
}: {
  transfers: Array<{
    id: string;
    createdAt: string;
    fileCount: number;
    totalSize: number;
  }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Recent Transfers
        </CardTitle>
        <CardDescription>Last 10 file transfers</CardDescription>
      </CardHeader>
      <CardContent>
        {transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent transfers
          </p>
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-4 gap-4 text-xs font-medium text-muted-foreground pb-2 border-b">
              <span>Transfer ID</span>
              <span>Date</span>
              <span>Files</span>
              <span>Size</span>
            </div>
            {transfers.map((transfer) => (
              <div
                key={transfer.id}
                className="grid grid-cols-4 gap-4 py-2 text-sm border-b last:border-0"
              >
                <span className="font-mono text-xs truncate">{transfer.id.slice(0, 12)}...</span>
                <span className="text-muted-foreground">
                  {transfer.createdAt 
                    ? format(new Date(transfer.createdAt), "MMM d, HH:mm")
                    : "N/A"}
                </span>
                <span>{transfer.fileCount} files</span>
                <span>{formatBytes(transfer.totalSize)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Deployments Card
function DeploymentsCard({
  deployments,
  loading,
}: {
  deployments: Array<{
    id: string;
    state: string;
    createdAt: number;
    url: string;
  }>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStateColor = (state: string) => {
    switch (state?.toLowerCase()) {
      case "ready":
        return "text-green-500";
      case "building":
        return "text-yellow-500";
      case "error":
        return "text-red-500";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Globe className="h-4 w-4" />
          Recent Deployments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {deployments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No deployment data available
          </p>
        ) : (
          <div className="space-y-3">
            {deployments.slice(0, 5).map((deployment) => (
              <div key={deployment.id} className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${getStateColor(deployment.state)} bg-current`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{deployment.url || deployment.id}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {deployment.createdAt 
                      ? format(new Date(deployment.createdAt), "MMM d, HH:mm")
                      : "N/A"}
                  </p>
                </div>
                <Badge variant="outline" className={getStateColor(deployment.state)}>
                  {deployment.state}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Main Admin Page
export default function Admin() {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useAdminMetrics({
    refetchInterval: 60000,
  });

  // Prepare chart data from recent transfers
  const transferChartData = data?.firebase?.data?.recentTransfers
    ?.slice()
    .reverse()
    .map((t) => ({
      date: t.createdAt ? format(new Date(t.createdAt), "MM/dd HH:mm") : "N/A",
      files: t.fileCount,
      size: Math.round(t.totalSize / 1024), // KB
    })) || [];

  // Prepare service status
  const serviceStatus = [
    { 
      name: "Vercel", 
      status: data?.errors?.vercel ? "error" as const : "ok" as const,
      error: data?.errors?.vercel 
    },
    { 
      name: "Cloudinary", 
      status: data?.errors?.cloudinary ? "error" as const : "ok" as const,
      error: data?.errors?.cloudinary 
    },
    { 
      name: "Firebase", 
      status: data?.errors?.firebase ? "error" as const : "ok" as const,
      error: data?.errors?.firebase 
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => navigate("/")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground">
                  System metrics and analytics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {data?.cached && (
                <Badge variant="secondary" className="text-xs">
                  Cached ({data.cacheAge}s ago)
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                Last updated: {dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "Never"}
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {isError && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error loading metrics</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {error?.message || "Failed to fetch admin metrics"}
            </p>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <KPICard
            title="Total Users"
            value={data?.summary?.totalUsers ?? 0}
            icon={Users}
            trend={data?.summary?.recentSignups ? {
              value: data.summary.recentSignups,
              label: "this week"
            } : undefined}
            loading={isLoading}
          />
          <KPICard
            title="Total Transfers"
            value={data?.summary?.totalTransfers ?? 0}
            icon={FileText}
            loading={isLoading}
          />
          <KPICard
            title="Total Files"
            value={data?.summary?.totalFiles ?? 0}
            icon={Database}
            loading={isLoading}
          />
          <KPICard
            title="Cloudinary Plan"
            value={data?.cloudinary?.data?.plan || "N/A"}
            subtitle={`${data?.cloudinary?.data?.resources || 0} resources`}
            icon={Cloud}
            loading={isLoading}
          />
        </div>

        {/* Usage Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <UsageCard
            title="Storage Usage"
            used={data?.summary?.storageUsed || "0 B"}
            percentage={data?.summary?.storagePercentage || 0}
            icon={HardDrive}
            loading={isLoading}
          />
          <UsageCard
            title="Bandwidth Usage"
            used={data?.summary?.bandwidthUsed || "0 B"}
            percentage={data?.summary?.bandwidthPercentage || 0}
            icon={Activity}
            loading={isLoading}
          />
          <ServiceStatusCard services={serviceStatus} loading={isLoading} />
        </div>

        {/* Charts and Details */}
        <div className="grid gap-4 lg:grid-cols-2 mb-6">
          {/* Transfer Activity Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Transfer Activity</CardTitle>
              <CardDescription>File transfers over recent activity</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[200px] w-full" />
              ) : transferChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={transferChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 10 }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 10 }} className="text-muted-foreground" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                      }}
                    />
                    <Bar dataKey="files" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                  No transfer data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Deployments */}
          <DeploymentsCard
            deployments={data?.vercel?.data?.project?.latestDeployments || []}
            loading={isLoading}
          />
        </div>

        {/* Recent Transfers Table */}
        <RecentTransfersCard
          transfers={data?.firebase?.data?.recentTransfers || []}
          loading={isLoading}
        />

        {/* Domains */}
        {data?.vercel?.data?.domains && data.vercel.data.domains.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Domains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {data.vercel.data.domains.map((domain) => (
                  <Badge 
                    key={domain.name} 
                    variant={domain.verified ? "default" : "secondary"}
                  >
                    {domain.name}
                    {domain.verified && <CheckCircle2 className="h-3 w-3 ml-1" />}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
