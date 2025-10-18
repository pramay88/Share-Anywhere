import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Copy, QrCode, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

const Send = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [code, setCode] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const generateCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (selectedFiles) {
      const fileArray = Array.from(selectedFiles);
      setFiles(fileArray);
      const newCode = customCode || generateCode();
      setCode(newCode);
      
      // Store files in sessionStorage for peer connection
      sessionStorage.setItem(`files_${newCode}`, JSON.stringify({
        names: fileArray.map(f => f.name),
        sizes: fileArray.map(f => f.size),
      }));
      
      toast.success("Files ready to share!");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }, [customCode]);

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
    const link = `${window.location.origin}/receive?code=${code}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard!");
  };

  const shareUrl = `${window.location.origin}/receive?code=${code}`;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-primary bg-clip-text text-transparent">
            Share Files Instantly
          </h1>
          <p className="text-muted-foreground text-lg">
            Upload your files and share with a code or QR
          </p>
        </div>

        <Card className="p-8 shadow-card bg-gradient-card backdrop-blur-sm border-border/50">
          {!files.length ? (
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
                  Select any files you want to share
                </p>
                <input
                  type="file"
                  multiple
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                  id="file-input"
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
                  placeholder="Enter 6-digit code or leave blank"
                  maxLength={6}
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-lg tracking-widest"
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
                <div className="flex gap-3 justify-center">
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
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowQR(!showQR)}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                  >
                    <QrCode className="h-4 w-4 mr-2" />
                    QR Code
                  </Button>
                </div>
              </div>

              {showQR && (
                <div className="bg-white p-6 rounded-xl flex justify-center animate-scale-in">
                  <QRCodeSVG value={shareUrl} size={200} level="H" />
                </div>
              )}

              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFiles([]);
                    setCode("");
                    setShowQR(false);
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
