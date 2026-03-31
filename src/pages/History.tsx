import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

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

    const [directionFilter, setDirectionFilter] = useState<'all' | 'send' | 'receive'>('all');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'failed' | 'success' | 'cancelled'>('all');
    const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
    const [minSpeedKBps, setMinSpeedKBps] = useState('');
    const [minDataMB, setMinDataMB] = useState('');

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

    const statusDotClass = useCallback((status: HistoryRecord['status']) => {
        if (status === 'failed') return 'border-red-500';
        if (status === 'cancelled' || status === 'pending') return 'border-amber-500';
        return 'border-emerald-500';
    }, []);

    // Combined loading - single API call instead of 3
    const loadInitialData = useCallback(async () => {
        if (!user) return;

        // Try cache first
        const cached = getCache(user.uid);
        if (cached) {
            setHistory(cached.history || []);
            setStats(cached.stats || INITIAL_STATS);
            setLoadingInitial(false);
            return;
        }

        setLoadingInitial(true);
        setErrorMessage(null);

        try {
            // Single history call gets everything (active + history)
            const response = await apiClient.getUserHistory(user.uid, {
                limit: 1000, // Fetch more at once for better caching
            });

            if (!response.success) {
                throw new Error((response as any)?.error?.message || 'Failed to load history');
            }

            const records = ((response as any).records || []) as HistoryRecord[];

            // Compute stats from loaded records instead of separate call
            const computedStats: UserStats = {
                totalSends: records.filter(r => r.direction === 'send' && r.status !== 'active' && r.status !== 'pending').length,
                totalReceives: records.filter(r => r.direction === 'receive' && r.status !== 'active' && r.status !== 'pending').length,
                totalDataShared: records.reduce((sum, r) => sum + (r.totalBytes || r.fileSize || 0), 0),
                activeShares: records.filter(r => r.status === 'active' || r.status === 'pending').length,
                totalFailures: records.filter(r => r.status === 'failed').length,
                totalRetries: 0,
                averageSpeedBytesPerSec: records.length > 0
                    ? Math.round(records.reduce((sum, r) => sum + (r.speedBytesPerSec || 0), 0) / records.length)
                    : 0,
            };

            setHistory(records);
            setStats(computedStats);

            // Cache for 5 minutes
            setCache(user.uid, { history: records, stats: computedStats });
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
            case 'time':
                setTimeFilter(value as 'all' | '24h' | '7d' | '30d');
                break;
            case 'minSpeed':
                filterTimeoutRef.current = setTimeout(() => setMinSpeedKBps(value), 300);
                break;
            case 'minData':
                filterTimeoutRef.current = setTimeout(() => setMinDataMB(value), 300);
                break;
        }
    }, []);

    const filteredHistory = useMemo(() => {
        const now = Date.now();
        const minSpeed = Number(minSpeedKBps || 0) * 1024;
        const minBytes = Number(minDataMB || 0) * 1024 * 1024;

        return history.filter((item) => {
            if (directionFilter !== 'all' && item.direction !== directionFilter) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;

            if (timeFilter !== 'all') {
                const ts = new Date(item.timestamp).getTime();
                if (timeFilter === '24h' && ts < now - 24 * 60 * 60 * 1000) return false;
                if (timeFilter === '7d' && ts < now - 7 * 24 * 60 * 60 * 1000) return false;
                if (timeFilter === '30d' && ts < now - 30 * 24 * 60 * 60 * 1000) return false;
            }

            if (minSpeed > 0 && (item.speedBytesPerSec || 0) < minSpeed) return false;
            if (minBytes > 0 && (item.totalBytes || item.fileSize || 0) < minBytes) return false;

            return true;
        });
    }, [directionFilter, history, minDataMB, minSpeedKBps, statusFilter, timeFilter]);

    const historyHasData = filteredHistory.length > 0;

    const recentFailures = useMemo(
        () => history.filter((item) => item.status === 'failed' || item.status === 'cancelled').length,
        [history]
    );

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
                            <div className='grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3'>
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
                                value={timeFilter}
                                onChange={(e) => handleFilterChange('time', e.target.value)}
                            >
                                <option value='all'>All time</option>
                                <option value='24h'>Last 24 hours</option>
                                <option value='7d'>Last 7 days</option>
                                <option value='30d'>Last 30 days</option>
                            </select>

                            <input
                                type='number'
                                min='0'
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm'
                                placeholder='Min speed (KB/s)'
                                value={minSpeedKBps}
                                onChange={(e) => handleFilterChange('minSpeed', e.target.value)}
                            />

                            <input
                                type='number'
                                min='0'
                                className='h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm'
                                placeholder='Min data (MB)'
                                value={minDataMB}
                                onChange={(e) => handleFilterChange('minData', e.target.value)}
                            />

                            <Button
                                variant='ghost'
                                className='h-10 justify-start rounded-xl text-slate-600 hover:text-slate-800'
                                onClick={() => {
                                    setDirectionFilter('all');
                                    setStatusFilter('all');
                                    setTimeFilter('all');
                                    setMinSpeedKBps('');
                                    setMinDataMB('');
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
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredHistory.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell className='pl-6 font-semibold text-slate-800'>
                                                    <span className='inline-flex items-center gap-3'>
                                                        <span className={`inline-block h-2.5 w-2.5 rounded-full border-2 ${statusDotClass(item.status)}`} />
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
        </div>
    );
};

export default History;
