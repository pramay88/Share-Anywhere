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
        <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 pb-3 sm:pb-4 border-b">
                <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6 text-green-600" />
                <span className="text-base sm:text-lg font-semibold">Text Received!</span>
            </div>

            <div className="rounded-lg border bg-card p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 mb-2 sm:mb-3">
                    <h3 className="font-semibold text-xs sm:text-sm">Shared Text</h3>
                    <div className="text-[10px] sm:text-xs text-muted-foreground flex gap-2 sm:gap-3">
                        <span>{stats.characters.toLocaleString()} chars</span>
                        <span>{stats.lines.toLocaleString()} lines</span>
                        <span>{formatTextSize(textContent)}</span>
                    </div>
                </div>

                <div className="bg-background rounded-md p-3 sm:p-4 max-h-[250px] sm:max-h-[400px] overflow-auto">
                    <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words font-mono">
                        {textContent}
                    </pre>
                </div>

                {metadata?.language_hint && (
                    <div className="mt-2 text-[10px] sm:text-xs text-muted-foreground">
                        Detected: {metadata.language_hint}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
                <Button
                    onClick={copyToClipboard}
                    className="flex-1 h-10 sm:h-11"
                    variant={copied ? "outline" : "default"}
                >
                    {copied ? (
                        <>
                            <CheckCircle2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="text-xs sm:text-sm">Copied!</span>
                        </>
                    ) : (
                        <>
                            <Copy className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            <span className="text-xs sm:text-sm">Copy to Clipboard</span>
                        </>
                    )}
                </Button>
                <Button
                    onClick={downloadAsFile}
                    variant="outline"
                    className="flex-1 h-10 sm:h-11"
                >
                    <Download className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="text-xs sm:text-sm">Download as .txt</span>
                </Button>
            </div>
        </div>
    );
};
