import { useRef, useState } from "react";
import { Copy, Share2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Progress } from "@/components/ui/progress";
import { getTextStats, formatTextSize } from "@/lib/textValidation";

type NavigatorWithShare = Navigator & {
    canShare?: (data?: ShareData) => boolean;
};

export const QuickShareForm = () => {
    const { uploadText, uploading, uploadProgress } = useFileTransfer();

    const [text, setText] = useState("");
    const [code, setCode] = useState("");
    const [customCode, setCustomCode] = useState("");

    const qrRef = useRef<SVGSVGElement | null>(null);

    const textStats = text ? getTextStats(text) : null;

    const shareUrl = code
        ? `${window.location.origin}/receive?code=${encodeURIComponent(code)}`
        : "";

    const handleShare = async () => {
        if (!text.trim()) {
            toast.error("Please enter some text to share");
            return;
        }

        const result = await uploadText(
            text,
            customCode || undefined,
            24
        );

        if (result) {
            setCode(result.shareCode);
            toast.success("Text shared successfully!");
        }
    };

    const copyCode = async () => {
        if (!code) {
            toast.error("Share code not ready yet. Please wait a moment.");
            return;
        }

        try {
            await navigator.clipboard.writeText(code);
            toast.success("Code copied to clipboard!");
        } catch (error) {
            console.error("Failed to copy share code:", error);
            toast.error("Failed to copy code");
        }
    };

    const copyLink = async () => {
        if (!code) {
            toast.error("Share code not ready yet. Please wait a moment.");
            return;
        }

        const link = `${window.location.origin}/receive?code=${encodeURIComponent(code)}`;

        try {
            await navigator.clipboard.writeText(link);
            toast.success("Link copied to clipboard!");
        } catch (error) {
            console.error("Failed to copy share link:", error);
            toast.error("Failed to copy link");
        }
    };

    const shareQR = async () => {
        if (!code) {
            toast.error("Share code not ready yet.");
            return;
        }

        const svg = qrRef.current;

        if (!svg) {
            toast.error("QR not ready yet.");
            return;
        }

        let objectUrl: string | null = null;

        try {
            const svgData = new XMLSerializer().serializeToString(svg);

            const svgBlob = new Blob([svgData], {
                type: "image/svg+xml;charset=utf-8",
            });

            objectUrl = URL.createObjectURL(svgBlob);

            const img = new Image();
            const size = 512;

            const pngBlob = await new Promise<Blob>((resolve, reject) => {
                img.onload = () => {
                    const canvas = document.createElement("canvas");

                    canvas.width = size;
                    canvas.height = size;

                    const context = canvas.getContext("2d");

                    if (!context) {
                        reject(new Error("Canvas context not available"));
                        return;
                    }

                    context.fillStyle = "#ffffff";
                    context.fillRect(0, 0, size, size);
                    context.drawImage(img, 0, 0, size, size);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                resolve(blob);
                            } else {
                                reject(
                                    new Error("Failed generating QR image")
                                );
                            }
                        },
                        "image/png"
                    );
                };

                img.onerror = () => {
                    reject(new Error("Failed loading QR image"));
                };

                img.src = objectUrl as string;
            });

            const file = new File(
                [pngBlob],
                `qr-${code}.png`,
                { type: "image/png" }
            );

            const navigatorWithShare =
                navigator as NavigatorWithShare;

            if (
                navigatorWithShare.share &&
                navigatorWithShare.canShare?.({ files: [file] })
            ) {
                await navigatorWithShare.share({
                    files: [file],
                    title: "Share QR Code",
                    text: `Scan to view text.\n${shareUrl}`,
                });

                toast.success("QR shared");
                return;
            }

            if (navigatorWithShare.share) {
                await navigatorWithShare.share({
                    title: "Share link",
                    text: `View text: ${shareUrl}`,
                    url: shareUrl,
                });

                toast.success("Link shared");
                return;
            }

            await navigator.clipboard.writeText(shareUrl);
            toast.success("Link copied to clipboard!");
        } catch (error) {
            if (
                error instanceof DOMException &&
                error.name === "AbortError"
            ) {
                return;
            }

            console.error("Share error:", error);
            toast.error("Sharing failed");
        } finally {
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        }
    };

    const resetForm = () => {
        setText("");
        setCode("");
        setCustomCode("");
    };

    return (
        <div className="space-y-4">
            {uploading ? (
                <div className="space-y-4">
                    <div className="text-center">
                        <div className="animate-spin mx-auto mb-4 h-7 w-7 sm:h-8 sm:w-8 border-2 border-foreground border-t-transparent rounded-full" />

                        <h3 className="text-base sm:text-lg font-semibold mb-2">
                            Sharing Text...
                        </h3>

                        <Progress
                            value={uploadProgress}
                            className="w-full mb-2"
                        />

                        <p className="text-xs sm:text-sm text-muted-foreground">
                            {uploadProgress}% complete
                        </p>
                    </div>
                </div>
            ) : !code ? (
                <>
                    <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                            Text, Link, or Code
                        </label>

                        <Textarea
                            placeholder="Paste or type your text, link, or code here..."
                            value={text}
                            onChange={(event) =>
                                setText(event.target.value)
                            }
                            className="min-h-[150px] sm:min-h-[200px] font-mono text-xs sm:text-sm"
                            disabled={uploading}
                        />

                        {textStats && (
                            <div className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground flex flex-wrap gap-2 sm:gap-4">
                                <span>
                                    {textStats.characters.toLocaleString()} chars
                                </span>

                                <span>
                                    {textStats.words.toLocaleString()} words
                                </span>

                                <span>
                                    {textStats.lines.toLocaleString()} lines
                                </span>

                                <span>
                                    {formatTextSize(text)}
                                </span>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs sm:text-sm font-medium mb-1.5 sm:mb-2">
                            Custom Code (Optional)
                        </label>

                        <Input
                            placeholder="Enter custom code (6+ characters)"
                            value={customCode}
                            onChange={(event) =>
                                setCustomCode(
                                    event.target.value
                                        .trim()
                                        .toUpperCase()
                                )
                            }
                            className="text-center tracking-wider h-10 sm:h-11"
                            maxLength={20}
                            disabled={uploading}
                        />
                    </div>

                    <Button
                        onClick={handleShare}
                        disabled={!text.trim() || uploading}
                        className="w-full h-10 sm:h-11"
                        size="lg"
                    >
                        <FileText className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                        Share Text
                    </Button>
                </>
            ) : (
                <div className="space-y-4">
                    <div className="bg-primary text-primary-foreground p-4 sm:p-6 rounded-lg text-center">
                        <p className="text-[10px] sm:text-xs mb-2 opacity-90">
                            Share Code
                        </p>

                        <div className="text-2xl sm:text-3xl font-bold tracking-wider mb-3 sm:mb-4">
                            {code}
                        </div>

                        <div className="flex gap-2 justify-center flex-wrap">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={copyCode}
                                className="h-8 sm:h-9 text-xs sm:text-sm"
                            >
                                <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                Copy Code
                            </Button>

                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={copyLink}
                                className="h-8 sm:h-9 text-xs sm:text-sm"
                            >
                                <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                                Copy Link
                            </Button>
                        </div>
                    </div>

                    <div className="bg-card border rounded-lg p-4 sm:p-6 flex flex-col items-center space-y-2 sm:space-y-3">
                        <QRCodeSVG
                            ref={qrRef}
                            value={shareUrl}
                            size={140}
                            level="H"
                            className="sm:w-[180px] sm:h-[180px]"
                        />

                        <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                            Scan to view text
                        </p>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={shareQR}
                            className="w-full h-9 sm:h-10"
                        >
                            <Share2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                            Share QR Code
                        </Button>
                    </div>

                    <div className="text-center pt-2">
                        <Button
                            variant="ghost"
                            onClick={resetForm}
                            className="h-9 sm:h-10 text-xs sm:text-sm"
                        >
                            Share Different Text
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};