import { useNavigate } from "react-router-dom";
import {
  Upload,
  Download,
  Zap,
  Shield,
  Smartphone,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center text-center py-12 sm:py-16 md:py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
          <div className="space-y-3 sm:space-y-4">
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight">
              Share Files & Text
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
              Transfer files or share text snippets with just a code or QR scan.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 px-4 sm:px-0">
            <Button
              size="lg"
              onClick={() => navigate("/send")}
              className="group w-full sm:w-auto h-12 sm:h-11"
            >
              <Upload className="mr-2 h-4 w-4" />
              Send Files
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/p2p")}
              className="w-full sm:w-auto h-12 sm:h-11"
            >
              <Zap className="mr-2 h-4 w-4" />
              P2P
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/receive")}
              className="w-full sm:w-auto h-12 sm:h-11"
            >
              <Download className="mr-2 h-4 w-4" />
              Receive
            </Button>
          </div>

          {/* Stats - hidden on mobile for cleaner look */}
          <div className="hidden sm:grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12">
            <div className="text-center space-y-1">
              {/* <div className="text-3xl md:text-4xl font-bold">50MB</div> */}
              {/* <div className="text-sm text-muted-foreground">Max Size</div> */}
            </div>
            <div className="text-center space-y-1">
              {/* <div className="text-3xl md:text-4xl font-bold">24h</div> */}
              {/* <div className="text-sm text-muted-foreground">Retention</div> */}
            </div>
            <div className="text-center space-y-1">
              {/* <div className="text-3xl md:text-4xl font-bold">Free</div> */}
              {/* <div className="text-sm text-muted-foreground">Forever</div> */}
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="py-4 sm:py-6 px-4 sm:px-6 border-t text-center">
        <p className="text-xs sm:text-sm text-muted-foreground">
          © {new Date().getFullYear()} ShareAnywhere
        </p>
      </footer>
    </div>
  );
};

export default Index;
