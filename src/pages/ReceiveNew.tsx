import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useFileTransfer } from "@/hooks/useFileTransfer";

const ReceiveContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { getTransferByShareCode, downloadFile } = useFileTransfer();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [transfer, setTransfer] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (searchParams.get("code")) {
      handleConnect();
    }
  }, [searchParams]);

  const handleConnect = async () => {
    if (code.length < 6) {
      toast.error("Please enter a valid code (at least 6 characters)");
      return;
    }

    setIsConnecting(true);
    const transferData = await getTransferByShareCode(code);
    setIsConnecting(false);

    if (transferData) {
      setTransfer(transferData);
      toast.success("Transfer found! Files are ready to download");
    }
  };

  const handleDownloadAll = async () => {
    if (!transfer) return;

    for (const file of transfer.files) {
      await downloadFile(
        transfer.transfer.id,
        file.id,
        file.cloudinary_url,
        file.original_name
      );
    }
  };

  const handleDownloadSingle = async (file: any) => {
    if (!transfer) return;
    await downloadFile(
      transfer.transfer.id,
      file.id,
      file.cloudinary_url,
      file.original_name
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="text-center mb-6">
          <h1 className="text-2xl md:text-3xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
            Receive Files
          </h1>
        </div>

        <Card className="p-6 shadow-card bg-gradient-card backdrop-blur-sm border-border/50">
          {!transfer ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-3">
                  Enter Share Code
                </label>
                <Input
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
                  className="text-center text-2xl tracking-widest font-bold h-12"
                  disabled={isConnecting}
                />
              </div>

              <Button
                size="default"
                onClick={handleConnect}
                disabled={code.length < 6 || isConnecting}
                className="w-full bg-gradient-primary hover:opacity-90 shadow-glow h-11"
              >
                {isConnecting ? (
                  <>
                    <div className="animate-spin mr-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Find Transfer
                  </>
                )}
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                <p>Or scan the QR code from the sender's device</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-scale-in">
              <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-6 w-6" />
                <span className="text-lg font-semibold">Transfer Found!</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-semibold">Available Files:</h3>
                  <span className="text-sm text-muted-foreground">
                    {transfer.files.length} file(s)
                  </span>
                </div>
                <div className="space-y-2">
                  {transfer.files.map((file: any) => (
                    <div
                      key={file.id}
                      className="flex justify-between items-center text-sm bg-card p-3 rounded-md"
                    >
                      <span className="truncate flex-1">{file.original_name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {(file.file_size / 1024 / 1024).toFixed(2)} MB
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadSingle(file)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Button
                size="default"
                onClick={handleDownloadAll}
                className="w-full bg-gradient-primary hover:opacity-90 shadow-glow h-11"
              >
                <Download className="mr-2 h-5 w-5" />
                Download All Files
              </Button>

              <div className="text-center">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCode("");
                    setTransfer(null);
                  }}
                >
                  Use Different Code
                </Button>
              </div>
            </div>
          )}
        </Card>

        <div className="text-center mt-4">
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

const Receive = () => {
  return (
    <ReceiveContent />

  );
};

export default Receive;