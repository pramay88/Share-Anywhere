import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { useFileTransfer } from "@/hooks/useFileTransfer";
import { Header } from "@/components/Header";
import { QuickReceive } from "@/components/QuickReceive";

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
        file.original_name,
        file.cloudinary_public_id,
        file.mime_type
      );
    }
  };

  const handleDownloadSingle = async (file: any) => {
    if (!transfer) return;
    await downloadFile(
      transfer.transfer.id,
      file.id,
      file.cloudinary_url,
      file.original_name,
      file.cloudinary_public_id,
      file.mime_type
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          <div className="mb-4 sm:mb-6">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight mb-1 sm:mb-2">Receive Files & Text</h1>
            <p className="text-xs sm:text-sm md:text-base text-muted-foreground">Enter the share code to download files or view text</p>
          </div>

          <Card className="p-4 sm:p-6">
            {!transfer ? (
              <div className="space-y-4 sm:space-y-6">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground text-center mb-3 sm:mb-4">
                    Enter the share code from the sender
                  </p>
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={code}
                      autoFocus
                      inputMode="text"
                      onChange={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                      onComplete={() => {
                        if (!isConnecting) {
                          handleConnect();
                        }
                      }}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                        <InputOTPSlot index={1} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                        <InputOTPSlot index={2} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                        <InputOTPSlot index={3} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                        <InputOTPSlot index={4} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                        <InputOTPSlot index={5} className="h-10 w-8 sm:h-12 sm:w-10 text-base sm:text-lg font-mono" />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>

                <Button
                  size="default"
                  onClick={handleConnect}
                  disabled={code.length < 6 || isConnecting}
                  className="w-full h-11 sm:h-12"
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Find Transfer
                    </>
                  )}
                </Button>

                <div className="text-center text-xs sm:text-sm text-muted-foreground pt-3 sm:pt-4 border-t">
                  <p>Or scan the QR code from the sender's device</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 pb-3 sm:pb-4 border-b">
                  <CheckCircle2 className="h-5 w-5 sm:h-6 sm:w-6" />
                  <span className="text-base sm:text-lg font-semibold">Transfer Found!</span>
                </div>

                {/* Check if this is a text transfer or file transfer */}
                {transfer.transfer.content_type === 'text' ? (
                  <QuickReceive
                    textContent={transfer.transfer.text_content || ''}
                    metadata={transfer.transfer.text_metadata}
                    shareCode={code}
                  />
                ) : (
                  <>
                    <div className="rounded-lg border bg-card p-3 sm:p-4">
                      <div className="flex justify-between items-center mb-2 sm:mb-3">
                        <h3 className="font-semibold text-xs sm:text-sm">Available Files</h3>
                        <span className="text-xs sm:text-sm text-muted-foreground">
                          {transfer.files.length} file(s)
                        </span>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {transfer.files.map((file: any) => (
                          <div
                            key={file.id}
                            className="flex justify-between items-center text-xs sm:text-sm bg-background p-2.5 sm:p-3 rounded-md gap-2"
                          >
                            <span className="truncate flex-1 min-w-0">{file.original_name}</span>
                            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                              <span className="text-muted-foreground text-xs whitespace-nowrap">
                                {(file.file_size / 1024 / 1024).toFixed(2)} MB
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDownloadSingle(file)}
                                className="h-8 w-8 p-0"
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
                      className="w-full h-11 sm:h-12"
                    >
                      <Download className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Download All Files
                    </Button>
                  </>
                )}

                <div className="text-center pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCode("");
                      setTransfer(null);
                    }}
                    className="h-10 text-sm"
                  >
                    Use Different Code
                  </Button>
                </div>
              </div>
            )}
          </Card>
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
