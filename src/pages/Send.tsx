import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Copy, Share2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Progress } from "@/components/ui/progress";

const Send = () => {
  const navigate = useNavigate();
  const { uploadFiles, uploading, uploadProgress } = useFileTransfer();
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = async (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const fileArray = Array.from(selectedFiles);
      setFiles(fileArray);
      
      // Upload files and generate code
      const result = await uploadFiles(fileArray, customCode || undefined, 24);
      if (result) {
        setCode(result.shareCode);
        toast.success("Files uploaded and ready to share!");
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [customCode, uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

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
      const svg = document.getElementById('share-qr-svg') as unknown as SVGElement | null;
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
          text: `Scan to download files.\n${shareUrl}`,
        });
        toast.success("QR shared");
      } else if (navigator.share) {
        await navigator.share({
          title: 'Share link',
          text: `Download files: ${shareUrl}`,
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-primary bg-clip-text text-transparent">
            Share Files Instantly
          </h1>
          <p className="text-muted-foreground text-lg">
            No registration required
          </p>
        </div>

        <Card className="p-8 shadow-card bg-gradient-card backdrop-blur-sm border-border/50">
          {uploading ? (
            <div className="space-y-4">
              <div className="text-center">
                <div className="animate-spin mx-auto mb-4 h-12 w-12 border-4 border-primary border-t-transparent rounded-full" />
                <h3 className="text-xl font-semibold mb-2">Uploading Files...</h3>
                <p className="text-muted-foreground mb-4">Please wait while we process your files</p>
                <Progress value={uploadProgress} className="w-full" />
                <p className="text-sm text-muted-foreground mt-2">{uploadProgress}% complete</p>
              </div>
            </div>
          ) : !files.length ? (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300 ${
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <Upload className="w-16 h-16 mx-auto mb-4 text-primary" />
                <h3 className="text-xl font-semibold mb-2">
                  Drop files here or click to browse
                </h3>
                <p className="text-muted-foreground mb-6">
                  Max 50MB per file. Allowed: Images, PDFs, Documents, Archives
                </p>
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                  id="file-input"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
                />
                <label htmlFor="file-input">
                  <Button size="lg" className="bg-gradient-primary hover:opacity-90 shadow-glow" asChild>
                    <span>
                      Select Files
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </span>
                  </Button>
                </label>
              </div>

              <div className="mt-6">
                <label className="block text-sm font-medium mb-2">
                  Custom Code (Optional)
                </label>
                <Input
                  placeholder="Enter custom code (6+ characters)"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  className="text-center text-lg tracking-widest"
                  maxLength={20}
                />
              </div>
            </>
          ) : (
            <div className="space-y-6 animate-scale-in">
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Selected Files:</h3>
                <div className="space-y-2">
                  {files.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center text-sm bg-card p-3 rounded-md"
                    >
                      <span className="truncate flex-1">{file.name}</span>
                      <span className="text-muted-foreground ml-4">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-primary p-6 rounded-xl text-center text-white shadow-glow">
                <p className="text-sm mb-2 opacity-90">Your Share Code</p>
                <div className="text-5xl font-bold tracking-wider mb-4 animate-pulse-glow">
                  {code}
                </div>
                <div className="flex gap-3 justify-center flex-wrap">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyCode}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Code
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={copyLink}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </Button>
                </div>
              </div>

              <div className="bg-white p-8 rounded-xl flex flex-col items-center animate-scale-in space-y-4">
                <QRCodeSVG id="share-qr-svg" value={shareUrl} size={256} level="H" />
                <p className="text-sm text-muted-foreground text-center">
                  Scan to download files instantly
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

              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFiles([]);
                    setCode("");
                    setCustomCode("");
                  }}
                >
                  Share Different Files
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="text-center mt-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/receive")}
            className="text-muted-foreground hover:text-foreground"
          >
            Want to receive files instead?
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Send;
