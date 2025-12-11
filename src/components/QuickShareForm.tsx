import { useState } from "react";
import { Copy, Share2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Progress } from "@/components/ui/progress";
import { getTextStats, formatTextSize } from "@/lib/textValidation";

export const QuickShareForm = () => {
    const { uploadText, uploading, uploadProgress } = useFileTransfer();
    const [text, setText] = useState("");
    const [code, setCode] = useState("");
    const [customCode, setCustomCode] = useState("");

    const textStats = text ? getTextStats(text) : null;

    const handleShare = async () => {
        if (!text.trim()) {
            toast.error("Please enter some text to share");
            return;
        }

        const result = await uploadText(text, customCode || undefined, 24);
        if (result) {
            setCode(result.shareCode);
            toast.success("Text shared successfully!");
        }
    };

    const copyCode = () => {
        navigator.clipboard.writeText(code);
        toast.success("Code copied to clipboard!");
    };

    const copyLink = () => {
        if (!code) {
            toast.error("Share code not ready yet. Please wait a moment.");
            return;
        }
        const link = `${window.location.origin}/receive?code=${encodeURIComponent(code)}`;
        navigator.clipboard.writeText(link);
        toast.success("Link copied to clipboard!");
    };

    const shareUrl = code ? `${window.location.origin}/receive?code=${encodeURIComponent(code)}` : "";

    const shareQR = async () => {
        try {
            if (!code) {
                toast.error("Share code not ready yet.");
                return;
            }
            const svg = document.getElementById('text-share-qr-svg') as unknown as SVGElement | null;
            if (!svg) {
                toast.error("QR not ready yet.");
                return;
            }

            const svgData = new XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            // Convert SVG to PNG for broader share support
            const img = new Image();
            const size = 512;
            const pngBlob: Blob = await new Promise((resolve, reject) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error("Canvas context not available"));
                        return;
                    }
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, size, size);
                    ctx.drawImage(img, 0, 0, size, size);
                    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed generating image"))), 'image/png');
                };
                img.onerror = reject;
                img.src = url;
            });

            URL.revokeObjectURL(url);

            const file = new File([pngBlob], `qr-${code}.png`, { type: 'image/png' });

            if (navigator.share && (navigator as any).canShare?.({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Share QR Code',
                    text: `Scan to view text.\n${shareUrl}`,
                });
                toast.success("QR shared");
            } else if (navigator.share) {
                await navigator.share({
                    title: 'Share link',
                    text: `View text: ${shareUrl}`,
                    url: shareUrl,
                });
                toast.success("Link shared");
            } else {
                await navigator.clipboard.writeText(shareUrl);
                toast.success("Link copied to clipboard!");
            }
        } catch (error) {
            console.error('Share error:', error);
            toast.error('Sharing failed');
        }
    };

    return (
        <div className="space-y-4">
            {uploading ? (
                <div className="space-y-4">
                    <div className="text-center">
                        <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" />
                        <h3 className="text-lg font-semibold mb-2">Sharing Text...</h3>
                        <Progress value={uploadProgress} className="w-full mb-2" />
                        <p className="text-sm text-muted-foreground">{uploadProgress}% complete</p>
                    </div>
                </div>
            ) : !code ? (
                <>
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Text, Link, or Code
                        </label>
                        <Textarea
                            placeholder="Paste or type your text, link, or code here..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            className="min-h-[200px] font-mono text-sm"
                            disabled={uploading}
                        />
                        {textStats && (
                            <div className="mt-2 text-xs text-muted-foreground flex gap-4">
                                <span>{textStats.characters.toLocaleString()} characters</span>
                                <span>{textStats.words.toLocaleString()} words</span>
                                <span>{textStats.lines.toLocaleString()} lines</span>
                                <span>{formatTextSize(text)}</span>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Custom Code (Optional)
                        </label>
                        <Input
                            placeholder="Enter custom code (6+ characters)"
                            value={customCode}
                            onChange={(e) => setCustomCode(e.target.value.trim().toUpperCase())}
                            className="text-center tracking-wider"
                            maxLength={20}
                        />
                    </div>

                    <Button
                        onClick={handleShare}
                        disabled={!text.trim() || uploading}
                        className="w-full"
                        size="lg"
                    >
                        <FileText className="mr-2 h-5 w-5" />
                        Share Text
                    </Button>
                </>
            ) : (
                <div className="space-y-4">
                    <div className="bg-primary text-primary-foreground p-6 rounded-lg text-center">
                        <p className="text-xs mb-2 opacity-90">Share Code</p>
                        <div className="text-3xl font-bold tracking-wider mb-4">
                            {code}
                        </div>
                        <div className="flex gap-2 justify-center flex-wrap">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={copyCode}
                            >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Code
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={copyLink}
                            >
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Link
                            </Button>
                        </div>
                    </div>

                    <div className="bg-card border rounded-lg p-6 flex flex-col items-center space-y-3">
                        <QRCodeSVG id="text-share-qr-svg" value={shareUrl} size={180} level="H" />
                        <p className="text-xs text-muted-foreground text-center">
                            Scan to view text
                        </p>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={shareQR}
                            className="w-full"
                        >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share QR Code
                        </Button>
                    </div>

                    <div className="text-center pt-2">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setText("");
                                setCode("");
                                setCustomCode("");
                            }}
                        >
                            Share Different Text
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
