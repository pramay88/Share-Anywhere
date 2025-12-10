import { useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  Share2,
  Zap,
  Shield,
  Smartphone,
  ArrowRight,
  Sparkles,
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
        "Transfer files in seconds with our optimized cloud infrastructure.",
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description:
        "End-to-end encryption ensures your files stay private and secure.",
    },
    {
      icon: Smartphone,
      title: "Cross-Platform",
      description: "Works seamlessly across desktop, tablet, and mobile devices.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-primary/5">
      {/* ===== Header / Navbar ===== */}
      <header className="w-full py-4 px-4 md:px-8 lg:px-12 flex justify-between items-center bg-background/80 backdrop-blur-xl border-b border-border/50 sticky top-0 z-50">
        <div
          className="flex items-center gap-3 cursor-pointer group"
          onClick={() => navigate("/")}
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-2xl blur-lg opacity-75 group-hover:opacity-100 transition-opacity" />
            <div className="relative bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 p-2.5 rounded-2xl shadow-lg">
              <img src="/logo.png" alt="ShareAnywhere" className="h-7 w-7 object-contain" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              ShareAnywhere
            </h1>
            <p className="text-xs text-muted-foreground -mt-1">Instant File Sharing</p>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <button
            onClick={() => navigate("/send")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Send
          </button>
          <button
            onClick={() => navigate("/receive")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Receive
          </button>
          <Button
            onClick={() => navigate("/auth")}
            variant="outline"
            size="sm"
            className="border-primary/20 hover:bg-primary/5"
          >
            Sign In
          </Button>
        </nav>
      </header>

      {/* ===== Hero Section ===== */}
      <section className="relative flex-1 flex flex-col justify-center items-center text-center py-16 md:py-24 px-4 overflow-hidden">
        {/* Animated background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative max-w-5xl mx-auto z-10 space-y-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-primary/20 px-4 py-2 rounded-full text-sm font-medium backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Fast, Secure, Simple
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold leading-tight">
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
              Share Files
            </span>
            <br />
            <span className="text-foreground">Instantly</span>
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Transfer files up to <span className="font-semibold text-foreground">50MB</span> with just a code or QR scan.
            <br className="hidden md:block" />
            No signup, no hassle, just fast sharing.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button
              size="lg"
              onClick={() => navigate("/send")}
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:opacity-90 text-white text-lg h-14 px-8 shadow-2xl shadow-purple-500/25 group"
            >
              <Upload className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" />
              Send Files
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/receive")}
              className="border-2 border-primary/20 hover:bg-primary/5 text-lg h-14 px-8 backdrop-blur-sm"
            >
              <Download className="mr-2 h-5 w-5" />
              Receive Files
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                50MB
              </div>
              <div className="text-sm text-muted-foreground mt-1">Max File Size</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                24h
              </div>
              <div className="text-sm text-muted-foreground mt-1">File Retention</div>
            </div>
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-600 to-blue-600 bg-clip-text text-transparent">
                Free
              </div>
              <div className="text-sm text-muted-foreground mt-1">Forever</div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="py-8 px-4 border-t border-border/50 bg-background/80 backdrop-blur-sm text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} ShareAnywhere — Secure File Sharing Platform
        </p>
      </footer>
    </div>
  );
};

export default Index;
