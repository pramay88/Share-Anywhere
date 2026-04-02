import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
    ArrowDown,
    ArrowUp,
    Globe,
    Loader2,
    Play,
    RefreshCw,
    Wifi,
    X,
    Copy,
    QrCode,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const INITIAL_STATS: UserStats = {
    totalSends: 0,
    totalReceives: 0,
    totalDataShared: 0,
    activeShares: 0,
    totalFailures: 0,
    totalRetries: 0,
    averageSpeedBytesPerSec: 0,
};

const CACHE_KEY_PREFIX = 'history_cache_';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// ─── Cache helpers ────────────────────────────────────────────────────────────

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

const setCache = (userId: string, data: unknown) => {
    try {
        localStorage.setItem(
            CACHE_KEY_PREFIX + userId,
            JSON.stringify({ data, timestamp: Date.now() })
        );
    } catch {
        // Cache failure is non-fatal
    }
};

// ─── Component ────────────────────────────────────────────────────────────────

const History = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const [stats, setStats] = useState<UserStats>(INITIAL_STATS);
    const [history, setHistory] = useState<HistoryRecord[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);
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

    // ─── Formatters ───────────────────────────────────────────────────────────

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

    const formatDownloads = useCallback((item: HistoryRecord) => {
        // P2P is always 1-to-1
        if (item.transferType === 'p2p') return '1';
        return String(item.downloadsCount ?? '-');
    }, []);

    // ─── Icon + color logic ───────────────────────────────────────────────────
    //
    // P2P  → Wifi icon
    //   success → green
    //   failed  → red
    //   other   → slate (pending/cancelled)
    //
    // Internet → Globe icon
    //   active           → yellow  (share is live, still receivable)
    //   success/cancelled → green  (transfer completed or manually closed)
    //   failed            → red
    //   other (pending)   → slate

    const getTransferTypeIcon = useCallback((item: HistoryRecord) => {
        if (item.transferType === 'p2p') {
            let className = 'text-slate-400';
            if (item.status === 'success') className = 'text-emerald-500';
            else if (item.status === 'failed') className = 'text-red-500';
            return { icon: Wifi, className };
        }

        // Internet / cloud
        let className = 'text-slate-400';
        if (item.status === 'active') {
            className = 'text-yellow-500';
        } else if (item.status === 'success' || item.status === 'cancelled') {
            className = 'text-emerald-500';
        } else if (item.status === 'failed') {
            className = 'text-red-500';
        }
        return { icon: Globe, className };
    }, []);

    // ─── Data loading ─────────────────────────────────────────────────────────

    const loadInitialData = useCallback(async () => {
        if (!user) return;

        // Paint from cache immediately, then revalidate in background
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
                apiClient.getUserHistory(user.uid, { limit: 1000 }),
                apiClient.getActiveShares(user.uid),
            ]);

            if (!historyResponse.success) {
                throw new Error(
                    (historyResponse as any)?.error?.message || 'Failed to load history'
                );
            }
            if (!activeResponse.success) {
                throw new Error(
                    (activeResponse as any)?.error?.message || 'Failed to load active shares'
                );
            }

            const records = ((historyResponse as any).records || []) as HistoryRecord[];

            const activeRows = (
                ((activeResponse as any).activeShares || []) as any[]
            ).map((row): HistoryRecord => {
                const startedAtMs = row.startedAt ? new Date(row.startedAt).getTime() : null;
                const timestampMs = row.timestamp ? new Date(row.timestamp).getTime() : null;
                const inferredStartMs =
                    Number.isFinite(startedAtMs as number)
                        ? (startedAtMs as number)
                        : Number.isFinite(timestampMs as number)
                        ? (timestampMs as number)
                        : null;

                const totalBytes = Number(row.totalBytes || row.fileSize || row.file?.size || 0);
                const durationMs =
                    Number(row.durationMs || 0) > 0
                        ? Number(row.durationMs)
                        : inferredStartMs
                        ? Math.max(0, Date.now() - inferredStartMs)
                        : 0;
                const speedBytesPerSec =
                    durationMs > 0 && totalBytes > 0
                        ? Math.round(totalBytes / (durationMs / 1000))
                        : 0;

                return {
                    id: row.id,
                    transferId: row.transferId || row.id,
                    shareCode: row.shareCode || null,
                    transferType: row.transferType === 'p2p' ? 'p2p' : 'internet',
                    direction: row.direction === 'receive' ? 'receive' : 'send',
                    status: 'active',
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
            });

            // Active entries take precedence — drop any terminal duplicate
            const activeKeys = new Set(
                activeRows
                    .map((r) => r.shareCode || r.transferId || r.id)
                    .filter(Boolean)
            );

            const terminalRecords = records
                .filter((r) => r.status !== 'active' && r.status !== 'pending')
                .filter((r) => {
                    const key = r.shareCode || r.transferId || r.id;
                    return !key || !activeKeys.has(key);
                });

            // Merge and sort newest-first
            const mergedRecords = [...activeRows, ...terminalRecords].sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            // Compute stats from all records (terminal + active)
            const allRecords = [...activeRows, ...terminalRecords];
            const totalBytes = allRecords.reduce(
                (sum, r) => sum + (r.totalBytes || r.fileSize || 0),
                0
            );
            const totalDurationSec =
                allRecords.reduce((sum, r) => sum + (r.durationMs || 0), 0) / 1000;

            const computedStats: UserStats = {
                totalSends: allRecords.filter((r) => r.direction === 'send').length,
                totalReceives: allRecords.filter((r) => r.direction === 'receive').length,
                totalDataShared: totalBytes,
                activeShares: activeRows.length,
                totalFailures: allRecords.filter((r) => r.status === 'failed').length,
                totalRetries: 0,
                averageSpeedBytesPerSec:
                    totalDurationSec > 0 ? Math.round(totalBytes / totalDurationSec) : 0,
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
        if (user) localStorage.removeItem(CACHE_KEY_PREFIX + user.uid);
        await loadInitialData();
    };

    // ─── Filters ──────────────────────────────────────────────────────────────

    const handleFilterChange = useCallback((key: string, value: string) => {
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

    // Already sorted newest-first from loadInitialData; filter preserves that order
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

    // ─── Actions ──────────────────────────────────────────────────────────────

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
        setQrShare({ open: true, code: item.shareCode, name: item.fileName || 'Shared item', url });
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────

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
                    {/* Header row */}
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <div>
                            <h1 className='text-3xl font-bold tracking-tight text-slate-900'>
                                Transfer History
                            </h1>
                            <p className='text-slate-500 mt-1'>Monitor your file sharing activity</p>
                        </div>
                        <Button
                            variant='outline'
                            size='sm'
                            className='w-full sm:w-auto rounded-xl bg-white'
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </Button>
                    </div>

                    {/* Error banner */}
                    {errorMessage && (
                        <Card className='p-4 border-destructive/40 bg-destructive/5'>
                            <div className='flex items-start gap-3'>
                                <AlertCircle className='h-5 w-5 text-destructive mt-0.5' />
                                <div>
                                    <p className='font-medium text-destructive'>
                                        Could not load complete history data
                                    </p>
                                    <p className='text-sm text-muted-foreground mt-1'>{errorMessage}</p>
                                    <Button
                                        variant='outline'
                                        size='sm'
                                        className='mt-2'
                                        onClick={handleRefresh}
                                    >
                                        Retry
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Stats bar - compact inline */}
                    <div className='flex items-center gap-6 px-5 py-3 bg-white rounded-xl border border-slate-200/70 shadow-sm'>
                        <div className='flex items-center gap-2'>
                            <Play className='h-3 w-3 text-violet-500 fill-violet-500' />
                            <span className='text-xs font-medium text-slate-500 uppercase tracking-wide'>Transfers</span>
                            <span className='text-sm font-bold text-slate-900'>{stats.totalSends + stats.totalReceives}</span>
                        </div>
                        <div className='h-4 w-px bg-slate-200' />
                        <div className='flex items-center gap-2'>
                            <Play className='h-3 w-3 text-sky-500 fill-sky-500' />
                            <span className='text-xs font-medium text-slate-500 uppercase tracking-wide'>Data</span>
                            <span className='text-sm font-bold text-slate-900'>{formatBytes(stats.totalDataShared)}</span>
                        </div>
                        <div className='h-4 w-px bg-slate-200' />
                        <div className='flex items-center gap-2'>
                            <Play className='h-3 w-3 text-emerald-500 fill-emerald-500' />
                            <span className='text-xs font-medium text-slate-500 uppercase tracking-wide'>Avg</span>
                            <span className='text-sm font-bold text-slate-900'>{formatBytes(stats.averageSpeedBytesPerSec)}/s</span>
                        </div>
                    </div>

                    {/* Table card */}
                    <Card className='rounded-2xl border-slate-200/70 shadow-sm overflow-hidden'>
                        {/* Filters */}
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
                                    <option value='active'>Active</option>
                                    <option value='success'>Success</option>
                                    <option value='failed'>Failed</option>
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

                        {filteredHistory.length === 0 ? (
                            <div className='p-10 text-center bg-white'>
                                <p className='text-muted-foreground'>No transfers match your filters yet.</p>
                            </div>
                        ) : (
                            <>
                                <div className='overflow-x-auto bg-white'>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className='pl-6'>Name</TableHead>
                                                <TableHead>Time</TableHead>
                                                <TableHead>Speed</TableHead>
                                                <TableHead>Size</TableHead>
                                                <TableHead>DL</TableHead>
                                                <TableHead className='text-center'>Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredHistory.map((item) => {
                                                const { icon: TransferIcon, className: iconClass } =
                                                    getTransferTypeIcon(item);

                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell className='pl-6 font-semibold text-slate-800'>
                                                            <span className='inline-flex items-center gap-3'>
                                                                <TransferIcon
                                                                    className={`h-4 w-4 shrink-0 ${iconClass}`}
                                                                />
                                                                <span className='truncate max-w-[240px] sm:max-w-[320px]'>
                                                                    {item.fileName || 'Unknown'}
                                                                </span>
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className='text-slate-500'>
                                                            {formatTimeAgo(item.timestamp)}
                                                        </TableCell>
                                                        <TableCell>
                                                            <span className='inline-flex items-center gap-1.5'>
                                                                <span className='text-sky-600 font-semibold'>
                                                                    {formatBytes(item.speedBytesPerSec)}/s
                                                                </span>
                                                                {item.direction === 'send' ? (
                                                                    <ArrowUp className='h-3.5 w-3.5 text-orange-500' />
                                                                ) : (
                                                                    <ArrowDown className='h-3.5 w-3.5 text-sky-500' />
                                                                )}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className='text-slate-500'>
                                                            {formatBytes(item.totalBytes || item.fileSize)}
                                                        </TableCell>
                                                        <TableCell className='text-slate-500'>
                                                            {formatDownloads(item)}
                                                        </TableCell>
                                                        <TableCell className='text-center'>
                                                            {item.transferType === 'p2p' ? (
                                                                <span className='text-slate-400'>—</span>
                                                            ) : item.status === 'active' ? (
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
                                                            ) : (
                                                                <span className='text-slate-400'>—</span>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>

                                <div className='p-4 border-t bg-white flex items-center justify-center'>
                                    <p className='text-sm text-muted-foreground'>
                                        Showing {filteredHistory.length} of {history.length} transfers
                                    </p>
                                </div>
                            </>
                        )}
                    </Card>
                </div>
            </div>

            {/* QR modal */}
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
                            <Button variant='outline' onClick={() => handleCopyShareCode(qrShare.code)}>
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