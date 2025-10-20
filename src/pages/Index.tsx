import { useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  Share2,
  Zap,
  Shield,
  Smartphone,
  SendHorizonal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Index = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description:
        "Transfer files securely with proper backend storage and tracking.",
    },
    {
      icon: Shield,
      title: "Secure Transfer",
      description:
        "All files are encrypted, ensuring privacy and data protection.",
    },
    {
      icon: Smartphone,
      title: "Cross-Platform",
      description: "Works perfectly across desktop, tablet, and mobile devices.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* ===== Header / Navbar ===== */}
      <header className="w-full py-4 px-6 md:px-10 flex justify-between items-center bg-white/70 backdrop-blur-lg border-b border-border sticky top-0 z-50">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <div className="bg-gradient-to-tr from-primary to-primary/60 p-2 rounded-xl shadow-md">
            <SendHorizonal className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Sendify
          </h1>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-muted-foreground font-medium">
          <button
            onClick={() => navigate("/send")}
            className="hover:text-primary transition-colors"
          >
            Send
          </button>
          <button
            onClick={() => navigate("/receive")}
            className="hover:text-primary transition-colors"
          >
            Receive
          </button>
        </nav>
      </header>

      {/* ===== Hero Section ===== */}
      <section className="relative flex flex-col justify-center items-center text-center py-20 md:py-28 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary-glow/5 to-transparent" />
        <div className="relative max-w-4xl mx-auto z-10">
          <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary mb-6">
            <Share2 className="h-4 w-4" />
            File Sharing Made Simple
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent leading-tight">
            Share Files Instantly
            <br /> & Securely
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-10 max-w-2xl mx-auto">
            Transfer files easily via QR or secure access code.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              onClick={() => navigate("/send")}
              className="bg-gradient-to-r from-primary to-primary/70 hover:opacity-90 text-lg h-14 px-8 min-w-[200px] shadow-lg"
            >
              <Upload className="mr-2 h-5 w-5" /> Send Files
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/receive")}
              className="border-2 text-lg h-14 px-8 min-w-[200px] hover:bg-muted/50"
            >
              <Download className="mr-2 h-5 w-5" /> Receive Files
            </Button>
          </div>
        </div>
      </section>

      {/* ===== Features Section ===== */}
      <section className="py-16 md:py-24 bg-muted/20">
        <div className="container mx-auto px-4">
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Built for speed, security, and simplicity
          </p>

          {/* <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {features.map((feature, idx) => (
              <Card
                key={idx}
                className="p-6 text-center shadow-sm bg-white/70 border-border/40 backdrop-blur-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
              >
                <div className="bg-gradient-to-r from-primary to-primary/70 w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4 text-white shadow-md">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div> */}
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
            How It Works
          </h2>
          <p className="text-center text-muted-foreground mb-12 text-lg">
            Share files in three simple steps
          </p>

          <div className="max-w-3xl mx-auto space-y-10">
            {[
              {
                step: "1",
                title: "Select Your Files",
                description:
                  "Upload files up to 50MB — documents, images, or videos.",
              },
              {
                step: "2",
                title: "Get Your Code",
                description:
                  "Receive a unique secure code or QR to share with your recipient.",
              },
              {
                step: "3",
                title: "Share & Transfer",
                description:
                  "Recipient enters the code and downloads files securely.",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="flex gap-6 items-start animate-fade-in"
                style={{ animationDelay: `${idx * 150}ms` }}
              >
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-primary to-primary/70 text-white flex items-center justify-center text-xl font-bold shadow-lg">
                  {item.step}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">{item.title}</h3>
                  <p className="text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Call to Action ===== */}
      <section className="py-16 md:py-24 bg-gradient-to-r from-primary to-primary/70 text-white text-center relative">
        <div className="container mx-auto px-6 relative">
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Ready to Share Your Files?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Start transferring securely in seconds — no signup needed.
          </p>
          <Button
            size="lg"
            onClick={() => navigate("/send")}
            className="bg-white text-primary hover:bg-white/90 text-lg h-14 px-8 shadow-xl"
          >
            <Upload className="mr-2 h-5 w-5" />
            Send Files Now
          </Button>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="py-8 border-t border-border bg-muted/30 text-center text-muted-foreground text-sm">
        © {new Date().getFullYear()} Sendify — Secure File Sharing Platform
      </footer>
    </div>
  );
};

export default Index;
