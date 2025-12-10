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
      <section className="flex-1 flex flex-col justify-center items-center text-center py-20 px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              Share Files Instantly
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Transfer files up to 50MB with just a code or QR scan.
              No signup required.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              size="lg"
              onClick={() => navigate("/send")}
              className="group"
            >
              <Upload className="mr-2 h-4 w-4" />
              Send Files
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => navigate("/receive")}
            >
              <Download className="mr-2 h-4 w-4" />
              Receive Files
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 max-w-2xl mx-auto pt-12">
            <div className="text-center space-y-1">
              <div className="text-3xl md:text-4xl font-bold">50MB</div>
              <div className="text-sm text-muted-foreground">Max Size</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-3xl md:text-4xl font-bold">24h</div>
              <div className="text-sm text-muted-foreground">Retention</div>
            </div>
            <div className="text-center space-y-1">
              <div className="text-3xl md:text-4xl font-bold">Free</div>
              <div className="text-sm text-muted-foreground">Forever</div>
            </div>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 pt-12 max-w-4xl mx-auto">
            <Card className="p-6 space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Lightning Fast</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Transfer files in seconds with our optimized infrastructure
              </p>
            </Card>
            <Card className="p-6 space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Secure & Private</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                End-to-end encryption keeps your files safe and private
              </p>
            </Card>
            <Card className="p-6 space-y-3 hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-lg">Cross-Platform</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Works seamlessly across all your devices
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-6 px-6 border-t text-center">
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} ShareAnywhere
        </p>
      </footer>
    </div>
  );
};

export default Index;
