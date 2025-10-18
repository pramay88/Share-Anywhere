import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const Receive = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (searchParams.get("code")) {
      handleConnect();
    }
  }, [searchParams]);

  const handleConnect = () => {
    if (code.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setIsConnecting(true);

    // Simulate connection and file retrieval
    setTimeout(() => {
      const storedData = sessionStorage.getItem(`files_${code}`);
      
      if (storedData) {
        const fileData = JSON.parse(storedData);
        setFiles(
          fileData.names.map((name: string, idx: number) => ({
            name,
            size: fileData.sizes[idx],
          }))
        );
        setIsConnected(true);
        setIsConnecting(false);
        toast.success("Connected! Files are ready to download");
      } else {
        setIsConnecting(false);
        toast.error("Invalid code or files not available");
      }
    }, 1500);
  };

  const handleDownload = () => {
    toast.info("Download feature - In a real implementation, this would initiate P2P transfer via WebRTC/PeerJS");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-primary bg-clip-text text-transparent">
            Receive Files
          </h1>
          <p className="text-muted-foreground text-lg">
            Enter the share code to download files
          </p>
        </div>

        <Card className="p-8 shadow-card bg-gradient-card backdrop-blur-sm border-border/50">
          {!isConnected ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">
                  Enter Share Code
                </label>
                <Input
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="text-center text-3xl tracking-widest font-bold h-16"
                  disabled={isConnecting}
                />
              </div>

              <Button
                size="lg"
                onClick={handleConnect}
                disabled={code.length !== 6 || isConnecting}
                className="w-full bg-gradient-primary hover:opacity-90 shadow-glow text-lg h-14"
              >
                {isConnecting ? (
                  <>
                    <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Connect & Download
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <p>Or scan the QR code from the sender's device</p>
              </div>
            </div>
          ) : (
            <div className="space-y-6 animate-scale-in">
              <div className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-8 w-8" />
                <span className="text-xl font-semibold">Connected Successfully!</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-semibold mb-3">Available Files:</h3>
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

              <Button
                size="lg"
                onClick={handleDownload}
                className="w-full bg-gradient-primary hover:opacity-90 shadow-glow text-lg h-14"
              >
                <Download className="mr-2 h-5 w-5" />
                Download All Files
              </Button>

              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCode("");
                    setFiles([]);
                    setIsConnected(false);
                  }}
                >
                  Use Different Code
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="text-center mt-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Receive;
