import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';
import {
    AlertCircle,
    ArrowDown,
    ArrowUp,
    Clock3,
    Database,
    Download,
    Globe,
    Loader2,
    RefreshCw,
    Send,
    Share2,
    Wifi,
    TrendingUp,
    X,
    Copy,
    QrCode,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

// Simple cache for reducer debouncing
const debounce = (fn: Function, delay: number) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

interface HistoryRecord {
    id: string;
    transferId: string;
    shareCode: string | null;
    transferType: 'internet' | 'p2p';
    direction: 'send' | 'receive';
    status: 'success' | 'failed' | 'cancelled' | 'active' | 'pending';
    fileName: string | null;
    fileType: string | null;
    fileSize: number;
    totalBytes: number;
    downloadsCount?: number;
    durationMs: number;
    speedBytesPerSec: number;
    error: string | null;
    timestamp: string;
}

interface UserStats {
    totalSends: number;
    totalReceives: number;
    totalDataShared: number;
    activeShares: number;
    totalFailures: number;
    totalRetries: number;
    averageSpeedBytesPerSec: number;
}

interface QrShareState {
    open: boolean;
    code: string;
    name: string;
    url: string;
}

interface HistoryPagination {
    limit: number;
    hasMore: boolean;
    nextCursor: number | null;
}

const INITIAL_STATS: UserStats = {
    totalSends: 0,
    totalReceives: 0,
    totalDataShared: 0,
    activeShares: 0,
    totalFailures: 0,
    totalRetries: 0,
    averageSpeedBytesPerSec: 0,
};

const HISTORY_PAGE_SIZE = 20;
const CACHE_KEY_PREFIX = 'history_cache_';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper to get/set cache
const getCache = (userId: string) => {
    try {
        const cached = localStorage.getItem(CACHE_KEY_PREFIX + userId);
        if (!cached) return null;
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp > CACHE_DURATION) {
            localStorage.removeItem(CACHE_KEY_PREFIX + userId);
            return null;
        }
        return data;
    } catch {
        return null;
    }
};

const setCache = (userId: string, data: any) => {
    try {
        localStorage.setItem(CACHE_KEY_PREFIX + userId, JSON.stringify({
            data,
            timestamp: Date.now(),
        }));
    } catch {
        // Cache failure is non-fatal
    }
};

const History = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const filterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [terminatingShares, setTerminatingShares] = useState<Set<string>>(new Set());

    const [directionFilter, setDirectionFilter] = useState<'all' | 'send' | 'receive'>('all');
    const [modeFilter, setModeFilter] = useState<'all' | 'internet' | 'p2p'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'failed' | 'success' | 'cancelled'>('all');
    const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
    const [qrShare, setQrShare] = useState<QrShareState>({
        open: false,
        code: '',
        name: '',
        url: '',
    });

    const formatBytes = useCallback((bytes: number) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
        return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    }, []);

    const formatTimeAgo = useCallback((timestamp: string) => {
        try {
            return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
        } catch {
            return 'Unknown';
        }
    }, []);

    const formatDuration = useCallback((durationMs: number) => {
        if (!durationMs || durationMs <= 0) return '-';
        const seconds = Math.floor(durationMs / 1000);
        if (seconds < 60) return `${seconds}s`;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}m ${remainingSeconds}s`;
    }, []);

    const formatDownloads = useCallback((item: HistoryRecord) => {
        if (item.direction === 'receive') return '-';
        return String(item.downloadsCount || 0);
    }, []);

    const statusDotClass = useCallback((status: HistoryRecord['status'], transferType?: string) => {
        // P2P transfers can only be success or failed (never active)
        if (transferType === 'p2p') {
            if (status === 'failed') return 'border-red-500 bg-transparent';
            return 'border-emerald-500 bg-emerald-500'; // success, cancelled, etc. are filled green
        }

        // Internet shares can be active or completed
        if (status === 'active') return 'border-emerald-500 bg-transparent'; // hollow green
        if (status === 'success') return 'border-emerald-500 bg-emerald-500'; // filled green
        if (status === 'failed') return 'border-red-500 bg-transparent'; // red hollow
        if (status === 'cancelled' || status === 'pending') return 'border-emerald-500 bg-emerald-500'; // expired/terminated = filled green
        return 'border-slate-300 bg-slate-300';
    }, []);

    // Fast loading with 2 parallel calls: history + active shares
    const loadInitialData = useCallback(async () => {
        if (!user) return;

        // Try cache first for instant paint, then revalidate in background
        const cached = getCache(user.uid);
        if (cached) {
            setHistory(cached.history || []);
            setStats(cached.stats || INITIAL_STATS);
            setLoadingInitial(false);
        } else {
            setLoadingInitial(true);
        }
        setErrorMessage(null);

        try {
            const [historyResponse, activeResponse] = await Promise.all([
                apiClient.getUserHistory(user.uid, {
                    limit: 1000,
                }),
                apiClient.getActiveShares(user.uid),
            ]);

            if (!historyResponse.success) {
                throw new Error((historyResponse as any)?.error?.message || 'Failed to load history');
            }

            if (!activeResponse.success) {
                throw new Error((activeResponse as any)?.error?.message || 'Failed to load active shares');
            }

            const records = ((historyResponse as any).records || []) as HistoryRecord[];
            const activeRows = (((activeResponse as any).activeShares || []) as any[]).map((row) => {
                const startedAtMs = row.startedAt ? new Date(row.startedAt).getTime() : null;
                const timestampMs = row.timestamp ? new Date(row.timestamp).getTime() : null;
                const inferredStartMs = Number.isFinite(startedAtMs as number)
                    ? (startedAtMs as number)
                    : (Number.isFinite(timestampMs as number) ? (timestampMs as number) : null);

                // Calculate duration if durationMs not provided but we have a timestamp/start time.
                const durationMs = Number(row.durationMs || 0) > 0
                    ? Number(row.durationMs)
                    : (inferredStartMs ? Math.max(0, Date.now() - inferredStartMs) : 0);
                const totalBytes = Number(row.totalBytes || row.fileSize || row.file?.size || 0);
                
                // Calculate speed: total_bytes / duration_seconds
                const speedBytesPerSec = durationMs > 0 && totalBytes > 0
                    ? Math.round(totalBytes / (durationMs / 1000))
                    : 0;

                return {
                    id: row.id,
                    transferId: row.transferId || row.id,
                    shareCode: row.shareCode || null,
                    transferType: row.transferType === 'p2p' ? 'p2p' : 'internet',
                    direction: row.direction === 'receive' ? 'receive' : 'send',
                    status: 'active' as const,
                    fileName: row.fileName || row.file?.name || row.shareCode || 'Unknown',
                    fileType: row.fileType || row.file?.type || null,
                    fileSize: Number(row.fileSize || row.file?.size || 0),
                    totalBytes,
                    downloadsCount: Number(row.downloads_count || 0),
                    durationMs,
                    speedBytesPerSec,
                    error: null,
                    timestamp: row.timestamp || new Date().toISOString(),
                };
            }) as HistoryRecord[];

            const terminalRecords = records.filter((r) => r.status !== 'active' && r.status !== 'pending');

            // Active rows must take precedence so currently downloadable shares stay hollow-green.
            const activeKeys = new Set(
                activeRows.map((r) => r.shareCode || r.transferId || r.id).filter(Boolean)
            );

            const filteredTerminalRecords = terminalRecords.filter((r) => {
                const key = r.shareCode || r.transferId || r.id;
                return !key || !activeKeys.has(key);
            });

            const mergedRecords = [...activeRows, ...filteredTerminalRecords];

            const computedStats: UserStats = {
                totalSends: terminalRecords.filter((r) => r.direction === 'send').length,
                totalReceives: terminalRecords.filter((r) => r.direction === 'receive').length,
                totalDataShared: terminalRecords.reduce((sum, r) => sum + (r.totalBytes || r.fileSize || 0), 0),
                activeShares: activeRows.length,
                totalFailures: terminalRecords.filter((r) => r.status === 'failed').length,
                totalRetries: 0,
                // Weighted average: total_bytes / total_duration
                averageSpeedBytesPerSec: (() => {
                    const totalBytes = terminalRecords.reduce((sum, r) => sum + (r.totalBytes || r.fileSize || 0), 0);
                    const totalDurationSec = terminalRecords.reduce((sum, r) => sum + (r.durationMs || 0), 0) / 1000;
                    return totalDurationSec > 0 ? Math.round(totalBytes / totalDurationSec) : 0;
                })(),
            };

            setHistory(mergedRecords);
            setStats(computedStats);

            setCache(user.uid, { history: mergedRecords, stats: computedStats });
        } catch (error: any) {
            setErrorMessage(error.message || 'Failed to load history');
            toast.error(error.message || 'Failed to load history');
        } finally {
            setLoadingInitial(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                toast.error('Please sign in to view your history');
                navigate('/auth');
                return;
            }
            loadInitialData();
        }
    }, [authLoading, user, navigate, loadInitialData]);

    const handleRefresh = async () => {
        setRefreshing(true);
        setHistory([]);
        if (user) {
            localStorage.removeItem(CACHE_KEY_PREFIX + user.uid);
        }
        await loadInitialData();
    };

    // Memoized filter with debounce for input changes
    const handleFilterChange = useCallback((key: string, value: string) => {
        if (filterTimeoutRef.current) clearTimeout(filterTimeoutRef.current);
        
        switch (key) {
            case 'direction':
                setDirectionFilter(value as 'all' | 'send' | 'receive');
                break;
            case 'status':
                setStatusFilter(value as 'all' | 'active' | 'failed' | 'success' | 'cancelled');
                break;
            case 'mode':
                setModeFilter(value as 'all' | 'internet' | 'p2p');
                break;
            case 'time':
                setTimeFilter(value as 'all' | '24h' | '7d' | '30d');
                break;
        }
    }, []);

    const filteredHistory = useMemo(() => {
        const now = Date.now();

        return history.filter((item) => {
            if (directionFilter !== 'all' && item.direction !== directionFilter) return false;
            if (modeFilter !== 'all' && item.transferType !== modeFilter) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;

            if (timeFilter !== 'all') {
                const ts = new Date(item.timestamp).getTime();
                if (timeFilter === '24h' && ts < now - 24 * 60 * 60 * 1000) return false;
                if (timeFilter === '7d' && ts < now - 7 * 24 * 60 * 60 * 1000) return false;
                if (timeFilter === '30d' && ts < now - 30 * 24 * 60 * 60 * 1000) return false;
            }

            return true;
        });
    }, [directionFilter, modeFilter, history, statusFilter, timeFilter]);

    const historyHasData = filteredHistory.length > 0;

    const recentFailures = useMemo(
        () => history.filter((item) => item.status === 'failed' || item.status === 'cancelled').length,
        [history]
    );

    const handleTerminateShare = useCallback(async (shareId: string) => {
        if (!user) return;

        setTerminatingShares((prev) => new Set([...prev, shareId]));

        try {
            const response = await apiClient.terminateShare(user.uid, shareId);

            if (!response.success) {
                throw new Error((response as any)?.error?.message || 'Failed to terminate share');
            }

            setHistory((prev) =>
                prev.map((item) =>
                    item.id === shareId ? { ...item, status: 'cancelled' as const } : item
                )
            );

            toast.success('Share terminated successfully');
        } catch (error: any) {
            toast.error(error.message || 'Failed to terminate share');
        } finally {
            setTerminatingShares((prev) => {
                const next = new Set(prev);
                next.delete(shareId);
                return next;
            });
        }
    }, [user]);

    const handleCopyShareCode = useCallback(async (shareCode: string | null) => {
        if (!shareCode) {
            toast.error('No share code available');
            return;
        }

        try {
            await navigator.clipboard.writeText(shareCode);
            toast.success('Share code copied');
        } catch {
            toast.error('Failed to copy share code');
        }
    }, []);

    const handleOpenQrModal = useCallback((item: HistoryRecord) => {
        if (!item.shareCode) {
            toast.error('No share code available');
            return;
        }

        const url = `${window.location.origin}/receive?code=${encodeURIComponent(item.shareCode)}`;
        setQrShare({
            open: true,
            code: item.shareCode,
            name: item.fileName || 'Shared item',
            url,
        });
    }, []);

    if (authLoading || loadingInitial) {
        return (
            <div className='min-h-screen flex flex-col'>
                <Header />
                <div className='flex-1 flex items-center justify-center'>
                    <Loader2 className='h-8 w-8 animate-spin text-muted-foreground' />
                </div>
            </div>
        );
    }

    return (
        <div className='min-h-screen flex flex-col bg-slate-100/70'>
            <Header />

            <div className='flex-1 p-4 sm:p-6 lg:p-10'>
                <div className='max-w-7xl mx-auto space-y-5'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <div>
                            <h1 className='text-3xl font-bold tracking-tight text-slate-900'>Transfer History</h1>
                            <p className='text-slate-500 mt-1'>
                                Monitor your file sharing activity
                            </p>
                        </div>
                        <Button variant='outline' size='sm' className='w-full sm:w-auto rounded-xl bg-white' onClick={handleRefresh} disabled={refreshing || loadingHistory}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>

                    {errorMessage && (
                        <Card className='p-4 border-destructive/40 bg-destructive/5'>
                            <div className='flex items-start gap-3'>
                                <AlertCircle className='h-5 w-5 text-destructive mt-0.5' />
                                <div>
                                    <p className='font-medium text-destructive'>Could not load complete history data</p>
                                    <p className='text-sm text-muted-foreground mt-1'>{errorMessage}</p>
                                </div>
                            </div>
                        </Card>
                    )}

                    <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4'>
                        <Card className='p-5 rounded-2xl border-slate-200/70 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <p className='text-sm text-slate-500'>Total Transfers</p>
                                    <p className='text-4xl font-bold mt-2 text-slate-900'>{stats.totalSends}</p>
                                    <p className='text-sm text-slate-400 mt-1'>Lifetime</p>
                                </div>
                                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100'>
                                    <Send className='h-5 w-5 text-violet-500' />
                                </span>
                            </div>
                        </Card>

                        <Card className='p-5 rounded-2xl border-slate-200/70 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <p className='text-sm text-slate-500'>Data Transferred</p>
                                    <p className='text-4xl font-bold mt-2 text-slate-900'>{formatBytes(stats.totalDataShared)}</p>
                                    <p className='text-sm text-slate-400 mt-1'>All time</p>
                                </div>
                                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100'>
                                    <Database className='h-5 w-5 text-sky-500' />
                                </span>
                            </div>
                        </Card>

                        <Card className='p-5 rounded-2xl border-slate-200/70 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <p className='text-sm text-slate-500'>Active Shares</p>
                                    <p className='text-4xl font-bold mt-2 text-slate-900'>{stats.activeShares}</p>
                                    <p className='text-sm text-slate-400 mt-1'>Ongoing transfers</p>
                                </div>
                                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100'>
                                    <Share2 className='h-5 w-5 text-emerald-500' />
                                </span>
                            </div>
                        </Card>

                        <Card className='p-5 rounded-2xl border-slate-200/70 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <p className='text-sm text-slate-500'>Total Downloads</p>
                                    <p className='text-4xl font-bold mt-2 text-slate-900'>{stats.totalReceives}</p>
                                    <p className='text-sm text-slate-400 mt-1'>Internet + P2P</p>
                                </div>
                                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100'>
                                    <Download className='h-5 w-5 text-orange-500' />
                                </span>
                            </div>
                        </Card>

                        <Card className='p-5 rounded-2xl border-slate-200/70 shadow-sm'>
                            <div className='flex items-center justify-between'>
                                <div>
                                    <p className='text-sm text-slate-500'>Avg Speed</p>
                                    <p className='text-4xl font-bold mt-2 text-slate-900'>{formatBytes(stats.averageSpeedBytesPerSec)}/s</p>
                                    <p className='text-sm text-slate-400 mt-1'>{recentFailures} recent failures</p>
                                </div>
                                <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl bg-pink-100'>
                                    <TrendingUp className='h-5 w-5 text-pink-500' />
                                </span>
                            </div>
                        </Card>
                    </div>

                    <Card className='rounded-2xl border-slate-200/70 shadow-sm overflow-hidden'>
                        <div className='p-4 sm:p-5 border-b bg-white'>
                            <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3'>
                            <select
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
                                value={directionFilter}
                                onChange={(e) => handleFilterChange('direction', e.target.value)}
                            >
                                <option value='all'>All activity</option>
                                <option value='send'>Sent</option>
                                <option value='receive'>Received</option>
                            </select>

                            <select
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
                                value={statusFilter}
                                onChange={(e) => handleFilterChange('status', e.target.value)}
                            >
                                <option value='all'>All statuses</option>
                                <option value='success'>Success</option>
                                <option value='failed'>Failed</option>
                                <option value='active'>Active</option>
                                <option value='cancelled'>Cancelled</option>
                            </select>

                            <select
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
                                value={modeFilter}
                                onChange={(e) => handleFilterChange('mode', e.target.value)}
                            >
                                <option value='all'>All modes</option>
                                <option value='internet'>Internet</option>
                                <option value='p2p'>P2P</option>
                            </select>

                            <select
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
                                value={timeFilter}
                                onChange={(e) => handleFilterChange('time', e.target.value)}
                            >
                                <option value='all'>All time</option>
                                <option value='24h'>Last 24 hours</option>
                                <option value='7d'>Last 7 days</option>
                                <option value='30d'>Last 30 days</option>
                            </select>

                            <Button
                                variant='ghost'
                                className='h-10 justify-start rounded-xl text-slate-600 hover:text-slate-800'
                                onClick={() => {
                                    setDirectionFilter('all');
                                    setModeFilter('all');
                                    setStatusFilter('all');
                                    setTimeFilter('all');
                                }}
                            >
                                <RefreshCw className='mr-2 h-4 w-4' />
                                Reset Filters
                            </Button>
                        </div>
                        </div>

                        {!historyHasData && !loadingHistory ? (
                            <div className='p-10 text-center'>
                                <p className='text-muted-foreground'>No transfers match your filters yet.</p>
                            </div>
                        ) : (
                            <>
                                <div className='overflow-x-auto bg-white'>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className='pl-6'>Name</TableHead>
                                            <TableHead> </TableHead>
                                            <TableHead>Time</TableHead>
                                            <TableHead>Dur</TableHead>
                                            <TableHead>Speed</TableHead>
                                            <TableHead>Size</TableHead>
                                            <TableHead>DL</TableHead>
                                            <TableHead className='text-center'>Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredHistory.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className='pl-6 font-semibold text-slate-800'>
                                                    <span className='inline-flex items-center gap-3'>
                                                        <span className={`inline-block h-2.5 w-2.5 rounded-full border-2 ${statusDotClass(item.status, item.transferType)}`} />
                                                        <span className='truncate max-w-[240px] sm:max-w-[320px]'>{item.fileName || 'Unknown'}</span>
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className='inline-flex items-center gap-1.5 text-slate-500'>
                                                        {item.transferType === 'p2p' ? (
                                                            <Wifi className='h-3.5 w-3.5' />
                                                        ) : (
                                                            <Globe className='h-3.5 w-3.5' />
                                                        )}
                                                        {item.direction === 'send' ? (
                                                            <ArrowUp className='h-3.5 w-3.5 text-orange-500' />
                                                        ) : (
                                                            <ArrowDown className='h-3.5 w-3.5 text-sky-500' />
                                                        )}
                                                    </span>
                                                </TableCell>
                                                <TableCell className='text-slate-500'>{formatTimeAgo(item.timestamp)}</TableCell>
                                                <TableCell className='text-slate-500'>
                                                    <span className='inline-flex items-center gap-1'>
                                                        <Clock3 className='h-3.5 w-3.5 text-muted-foreground' />
                                                        {formatDuration(item.durationMs)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className='text-sky-600 font-semibold'>{formatBytes(item.speedBytesPerSec)}/s</TableCell>
                                                <TableCell className='text-slate-500'>{formatBytes(item.totalBytes || item.fileSize)}</TableCell>
                                                <TableCell className='text-slate-500'>{formatDownloads(item)}</TableCell>
                                                <TableCell className='text-center'>
                                                    {item.status === 'active' ? (
                                                        <div className='inline-flex items-center gap-1'>
                                                            <Button
                                                                variant='ghost'
                                                                size='sm'
                                                                onClick={() => handleCopyShareCode(item.shareCode)}
                                                                className='h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                                                title='Copy share code'
                                                            >
                                                                <Copy className='h-4 w-4' />
                                                            </Button>
                                                            <Button
                                                                variant='ghost'
                                                                size='sm'
                                                                onClick={() => handleOpenQrModal(item)}
                                                                className='h-8 w-8 p-0 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                                                title='View QR code'
                                                            >
                                                                <QrCode className='h-4 w-4' />
                                                            </Button>
                                                            <Button
                                                                variant='ghost'
                                                                size='sm'
                                                                onClick={() => handleTerminateShare(item.id)}
                                                                disabled={terminatingShares.has(item.id)}
                                                                className='h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10'
                                                                title='Terminate share'
                                                            >
                                                                {terminatingShares.has(item.id) ? (
                                                                    <Loader2 className='h-4 w-4 animate-spin' />
                                                                ) : (
                                                                    <X className='h-4 w-4' />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                </div>

                                <div className='p-4 border-t flex items-center justify-center'>
                                    {loadingInitial ? (
                                        <div className='flex items-center gap-2 text-sm text-muted-foreground'>
                                            <Loader2 className='h-4 w-4 animate-spin' />
                                            Loading history...
                                        </div>
                                    ) : (
                                        <p className='text-sm text-muted-foreground'>
                                            Showing {filteredHistory.length} of {history.length} transfers
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            </div>

            <Dialog
                open={qrShare.open}
                onOpenChange={(open) => setQrShare((prev) => ({ ...prev, open }))}
            >
                <DialogContent className='sm:max-w-md'>
                    <DialogHeader>
                        <DialogTitle>Share Code</DialogTitle>
                    </DialogHeader>
                    <div className='space-y-4'>
                        <div className='rounded-lg border p-4 text-center bg-primary text-primary-foreground'>
                            <p className='text-xs opacity-90 mb-1'>Code</p>
                            <p className='text-2xl font-bold tracking-wider'>{qrShare.code}</p>
                            <p className='text-xs opacity-80 mt-1 truncate'>{qrShare.name}</p>
                        </div>
                        <div className='rounded-lg border p-4 flex flex-col items-center gap-2 bg-white/80'>
                            <QRCodeSVG value={qrShare.url} size={180} level='H' />
                            <p className='text-xs text-muted-foreground'>Scan to open receive page</p>
                        </div>
                        <div className='flex justify-end'>
                            <Button
                                variant='outline'
                                onClick={() => handleCopyShareCode(qrShare.code)}
                            >
                                <Copy className='h-4 w-4 mr-2' />
                                Copy Code
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default History;
