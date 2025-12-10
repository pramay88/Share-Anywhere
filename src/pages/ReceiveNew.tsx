import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, ArrowLeft, CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import ProtectedRoute from "@/components/ProtectedRoute";

const ReceiveContent = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut } = useFirebaseAuth();
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
        file.cloudinary_public_id,
        file.original_name
      );
    }
  };

  const handleDownloadSingle = async (file: any) => {
    if (!transfer) return;
    await downloadFile(
      transfer.transfer.id,
      file.id,
      file.cloudinary_public_id,
      file.original_name
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <h1 className="text-4xl md:text-5xl font-bold mb-3 bg-gradient-primary bg-clip-text text-transparent">
              Receive Files
            </h1>
            <p className="text-muted-foreground text-lg">
              Signed in as {user?.email}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={signOut}
            className="shrink-0"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>

        <Card className="p-8 shadow-card bg-gradient-card backdrop-blur-sm border-border/50">
          {!transfer ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-3">
                  Enter Share Code
                </label>
                <Input
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="text-center text-3xl tracking-widest font-bold h-16"
                  disabled={isConnecting}
                />
              </div>

              <Button
                size="lg"
                onClick={handleConnect}
                disabled={code.length < 6 || isConnecting}
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
                    Find Transfer
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
                <span className="text-xl font-semibold">Transfer Found!</span>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
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
                size="lg"
                onClick={handleDownloadAll}
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
                    setTransfer(null);
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

const Receive = () => {
  return (
    <ReceiveContent />

  );
};

export default Receive;