import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Copy, Share2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Progress } from "@/components/ui/progress";
import { Header } from "@/components/Header";
import { QuickShareForm } from "@/components/QuickShareForm";

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
  }, [handleFileSelect]);

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
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Send Files & Text</h1>
            <p className="text-muted-foreground">Share files or text with a simple code</p>
          </div>

          <Card className="p-6">
            <Tabs defaultValue="files" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="text">Text</TabsTrigger>
              </TabsList>

              <TabsContent value="files" className="mt-0">
                {uploading ? (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="animate-spin mx-auto mb-4 h-8 w-8 border-2 border-foreground border-t-transparent rounded-full" />
                      <h3 className="text-lg font-semibold mb-2">Uploading Files...</h3>
                      <Progress value={uploadProgress} className="w-full mb-2" />
                      <p className="text-sm text-muted-foreground">{uploadProgress}% complete</p>
                    </div>
                  </div>
                ) : !files.length ? (
                  <>
                    <div
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`border-2 border-dashed rounded-lg p-10 text-center transition-all ${isDragging
                        ? "border-primary bg-accent"
                        : "border-border hover:border-muted-foreground hover:bg-accent/50"
                        }`}
                    >
                      <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                      <h3 className="font-semibold mb-1">
                        Drop files here or click to browse
                      </h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Max 50MB per file
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
                        <Button asChild>
                          <span>Select Files</span>
                        </Button>
                      </label>
                    </div>

                    <div className="mt-4">
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
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-lg border bg-card p-4">
                      <h3 className="font-semibold mb-3 text-sm">Selected Files</h3>
                      <div className="space-y-2">
                        {files.map((file, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center text-sm bg-background p-3 rounded-md"
                          >
                            <span className="truncate flex-1">{file.name}</span>
                            <span className="text-muted-foreground ml-4">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

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
                      <QRCodeSVG id="share-qr-svg" value={shareUrl} size={180} level="H" />
                      <p className="text-xs text-muted-foreground text-center">
                        Scan to download files
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
              </TabsContent>

              <TabsContent value="text" className="mt-0">
                <QuickShareForm />
              </TabsContent>
            </Tabs>
          </Card>

          <div className="text-center mt-6">
            <Button
              variant="ghost"
              onClick={() => navigate("/receive")}
              className="text-muted-foreground"
            >
              Want to receive files instead?
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Send;
