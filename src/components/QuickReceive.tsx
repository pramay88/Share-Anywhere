import { useState } from "react";
import { Copy, Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getTextStats, formatTextSize } from "@/lib/textValidation";

interface QuickReceiveProps {
    textContent: string;
    metadata?: {
        character_count: number;
        language_hint?: string;
    };
    shareCode: string;
}

export const QuickReceive = ({ textContent, metadata, shareCode }: QuickReceiveProps) => {
    const [copied, setCopied] = useState(false);
    const stats = getTextStats(textContent);

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(textContent);
            setCopied(true);
            toast.success("Text copied to clipboard!");
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error("Failed to copy text");
        }
    };

    const downloadAsFile = () => {
        try {
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shared-text-${shareCode}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("Text downloaded as file");
        } catch (error) {
            toast.error("Failed to download text");
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 pb-4 border-b">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
                <span className="text-lg font-semibold">Text Received!</span>
            </div>

            <div className="rounded-lg border bg-card p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm">Shared Text</h3>
                    <div className="text-xs text-muted-foreground flex gap-3">
                        <span>{stats.characters.toLocaleString()} chars</span>
                        <span>{stats.lines.toLocaleString()} lines</span>
                        <span>{formatTextSize(textContent)}</span>
                    </div>
                </div>

                <div className="bg-background rounded-md p-4 max-h-[400px] overflow-auto">
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                        {textContent}
                    </pre>
                </div>

                {metadata?.language_hint && (
                    <div className="mt-2 text-xs text-muted-foreground">
                        Detected: {metadata.language_hint}
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <Button
                    onClick={copyToClipboard}
                    className="flex-1"
                    variant={copied ? "outline" : "default"}
                >
                    {copied ? (
                        <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Copied!
                        </>
                    ) : (
                        <>
                            <Copy className="mr-2 h-4 w-4" />
                            Copy to Clipboard
                        </>
                    )}
                </Button>
                <Button
                    onClick={downloadAsFile}
                    variant="outline"
                    className="flex-1"
                >
                    <Download className="mr-2 h-4 w-4" />
                    Download as .txt
                </Button>
            </div>
        </div>
    );
};
