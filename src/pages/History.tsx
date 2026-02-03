import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import {
    RefreshCw,
    Send,
    Download,
    Database,
    Activity,
    FileText,
    Image,
    Video,
    File,
    Eye,
    Copy,
    Loader2,
    Share,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Share {
    code: string;
    type: string;
    fileName: string | null;
    content: string | null;
    size: number;
    mimeType: string | null;
    createdAt: string;
    expiresAt: string;
    status: "active" | "expired";
    downloadCount: number;
    cloudinaryPublicId: string | null;
}

interface UserStats {
    totalSends: number;
    totalReceives: number;
    totalDataShared: number;
    activeShares: number;
}

const History = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [shares, setShares] = useState<Share[]>([]);
    const [stats, setStats] = useState<UserStats>({
        totalSends: 0,
        totalReceives: 0,
        totalDataShared: 0,
        activeShares: 0,
    });
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState(false);

    useEffect(() => {
        if (!authLoading) {
            if (!user) {
                toast.error("Please sign in to view your history");
                navigate("/auth");
            } else {
                fetchData();
            }
        }
    }, [user, authLoading, navigate]);

    const fetchData = async () => {
        if (!user) return;

        try {
            setLoading(true);

            // Fetch history and stats in parallel
            const [historyRes, statsRes] = await Promise.all([
                apiClient.getUserHistory(user.uid),
                apiClient.getUserStats(user.uid),
            ]);

            if (historyRes.success && (historyRes as any).shares) {
                setShares((historyRes as any).shares);
            } else {
                toast.error("Failed to load history");
            }

            if (statsRes.success && (statsRes as any).stats) {
                setStats((statsRes as any).stats);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error("Failed to load data");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const getFileIcon = (fileName: string | null, mimeType: string | null) => {
        if (!fileName && !mimeType) return <FileText className="h-4 w-4 text-orange-500" />;

        const ext = fileName?.split(".").pop()?.toLowerCase();
        const mime = mimeType?.toLowerCase();

        if (ext === "pdf" || mime?.includes("pdf")) {
            return <FileText className="h-4 w-4 text-red-500" />;
        }
        if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext || "") || mime?.includes("image")) {
            return <Image className="h-4 w-4 text-blue-500" />;
        }
        if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext || "") || mime?.includes("video")) {
            return <Video className="h-4 w-4 text-purple-500" />;
        }
        return <File className="h-4 w-4 text-gray-500" />;
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
    };

    const formatTimeAgo = (dateString: string) => {
        try {
            return formatDistanceToNow(new Date(dateString), { addSuffix: true });
        } catch {
            return "Unknown";
        }
    };

    const formatTimeLeft = (dateString: string) => {
        try {
            const expiresAt = new Date(dateString);
            const now = new Date();
            if (expiresAt < now) return "Expired";
            return formatDistanceToNow(expiresAt, { addSuffix: false }) + " left";
        } catch {
            return "Unknown";
        }
    };

    const handlePreview = (share: Share) => {
        if (share.type === "text" || share.type === "url") {
            setPreviewContent(share.content || "No content");
            setPreviewOpen(true);
        }
    };

    const handleCopyLink = (code: string) => {
        const shareUrl = `${window.location.origin}/receive?code=${code}`;
        navigator.clipboard.writeText(shareUrl);
        toast.success("Link copied to clipboard!");
    };

    const handleDownload = async (share: Share) => {
        if (share.status === "expired") {
            toast.error("This share has expired");
            return;
        }

        try {
            const downloadUrl = `/send?code=${share.code}`;
            window.open(downloadUrl, "_blank");
            toast.success("Download started");
        } catch (error) {
            console.error("Download error:", error);
            toast.error("Failed to download file");
        }
    };

    if (authLoading || loading) {
        return (
            <div className="min-h-screen flex flex-col">
                <Header />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-background">
            <Header />

            <div className="flex-1 p-6 md:p-12">
                <div className="max-w-5xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Transfer History</h1>
                            <p className="text-muted-foreground mt-1">
                                View your recent shares and lifetime statistics
                            </p>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                        >
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Sends</p>
                                    <p className="text-3xl font-bold mt-1">{stats.totalSends}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Lifetime</p>
                                </div>
                                <Send className="h-8 w-8 text-orange-500" />
                            </div>
                        </Card>

                        <Card className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Receives</p>
                                    <p className="text-3xl font-bold mt-1">{stats.totalReceives}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Lifetime</p>
                                </div>
                                <Download className="h-8 w-8 text-blue-500" />
                            </div>
                        </Card>

                        <Card className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Data Shared</p>
                                    <p className="text-3xl font-bold mt-1">{formatBytes(stats.totalDataShared)}</p>
                                    <p className="text-xs text-muted-foreground mt-1">All time</p>
                                </div>
                                <Database className="h-8 w-8 text-purple-500" />
                            </div>
                        </Card>

                        <Card className="p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-muted-foreground">Active Shares</p>
                                    <p className="text-3xl font-bold mt-1">{stats.activeShares}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Right now</p>
                                </div>
                                <Activity className="h-8 w-8 text-green-500" />
                            </div>
                        </Card>
                    </div>

                    {/* History Table */}
                    <Card>
                        <div className="p-6 border-b">
                            <h2 className="text-xl font-semibold">Last 24 Hours</h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Files and text shared in the past 24 hours
                            </p>
                        </div>

                        {shares.length === 0 ? (
                            <div className="p-12 text-center">
                                <p className="text-muted-foreground">No shares in the last 24 hours</p>
                                <Button
                                    variant="outline"
                                    className="mt-4"
                                    onClick={() => navigate("/send")}
                                >
                                    Create Your First Share
                                </Button>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Code</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Shared</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Receives</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {shares.map((share) => (
                                        <TableRow key={share.code}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-2">
                                                    {getFileIcon(share.fileName, share.mimeType)}
                                                    <span className="truncate max-w-[200px]">
                                                        {share.fileName || share.type === "text" ? "Text snippet" : "URL"}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                                    {share.code}
                                                </code>
                                            </TableCell>
                                            <TableCell>{formatBytes(share.size)}</TableCell>
                                            <TableCell>{formatTimeAgo(share.createdAt)}</TableCell>
                                            <TableCell>{formatTimeLeft(share.expiresAt)}</TableCell>
                                            <TableCell>{share.downloadCount}</TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={share.status === "active" ? "default" : "secondary"}
                                                    className={
                                                        share.status === "active"
                                                            ? "bg-green-500 hover:bg-green-600"
                                                            : ""
                                                    }
                                                >
                                                    {share.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    {(share.type === "text" || share.type === "url") && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handlePreview(share)}
                                                            title="Preview"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleCopyLink(share.code)}
                                                        title="Copy Link"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    {share.type === "file" && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDownload(share)}
                                                            disabled={share.status === "expired"}
                                                            title={share.status === "expired" ? "Expired" : "Download"}
                                                        >
                                                            <Share className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}

                        <div className="p-4 border-t text-center text-sm text-muted-foreground">
                            All transfers automatically expire after 24 hours for your privacy
                        </div>
                    </Card>
                </div>
            </div>

            {/* Preview Dialog */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Text Preview</DialogTitle>
                        <DialogDescription>
                            First 200 characters of the shared content
                        </DialogDescription>
                    </DialogHeader>
                    <div className="bg-muted p-4 rounded-lg max-h-[400px] overflow-auto">
                        <pre className="whitespace-pre-wrap text-sm">
                            {previewContent?.slice(0, 200)}
                            {previewContent && previewContent.length > 200 && "..."}
                        </pre>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default History;
