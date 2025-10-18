import { useNavigate } from "react-router-dom";
import { Upload, Download, Share2, Zap, Shield, Smartphone, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const features = [
    {
      icon: Zap,
      title: "Lightning Fast",
      description: "Transfer files securely with proper backend storage and tracking",
    },
    {
      icon: Shield,
      title: "Secure Transfer",
      description: "Files stored with encryption. Download logs track all access",
    },
    {
      icon: Smartphone,
      title: "Cross-Platform",
      description: "Works seamlessly on desktop, tablet, and mobile devices",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary-glow/5 to-transparent" />
        
        <div className="container mx-auto px-4 py-16 md:py-24 relative">
          {user && (
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          )}
          
          <div className="max-w-4xl mx-auto text-center animate-fade-in">
            <div className="inline-flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-full text-sm font-medium text-primary mb-6">
              <Share2 className="h-4 w-4" />
              File Sharing Made Simple
            </div>
            
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent leading-tight">
              Share Files
              <br />
              Instantly & Securely
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-2xl mx-auto">
              Transfer files with secure codes or QR. {!user && "Sign in to get started with tracked, encrypted transfers."}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              {user ? (
                <>
                  <Button
                    size="lg"
                    onClick={() => navigate("/send")}
                    className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg h-14 px-8 min-w-[200px]"
                  >
                    <Upload className="mr-2 h-5 w-5" />
                    Send Files
                  </Button>
                  
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/receive")}
                    className="border-2 text-lg h-14 px-8 min-w-[200px] hover:bg-muted/50"
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Receive Files
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="lg"
                    onClick={() => navigate("/auth")}
                    className="bg-gradient-primary hover:opacity-90 shadow-glow text-lg h-14 px-8 min-w-[200px]"
                  >
                    Get Started
                  </Button>
                  
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => navigate("/auth")}
                    className="border-2 text-lg h-14 px-8 min-w-[200px] hover:bg-muted/50"
                  >
                    Sign In
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
              Why Choose Our Platform?
            </h2>
            <p className="text-center text-muted-foreground mb-12 text-lg">
              Built for speed, security, and simplicity
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {features.map((feature, idx) => (
                <Card
                  key={idx}
                  className="p-6 shadow-card bg-gradient-card backdrop-blur-sm border-border/50 hover:shadow-glow transition-all duration-300 animate-scale-in"
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="bg-gradient-primary w-12 h-12 rounded-lg flex items-center justify-center mb-4 shadow-glow">
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-4">
              How It Works
            </h2>
            <p className="text-center text-muted-foreground mb-12 text-lg">
              Share files in three simple steps
            </p>

            <div className="space-y-8">
              {[
                {
                  step: "1",
                  title: "Select Your Files",
                  description: "Upload files up to 50MB each - documents, images, videos, or archives.",
                },
                {
                  step: "2",
                  title: "Get Your Code",
                  description: "Receive a unique secure code or QR code to share with your recipient.",
                },
                {
                  step: "3",
                  title: "Share & Transfer",
                  description: "Your recipient enters the code and downloads files securely with full tracking.",
                },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className="flex gap-6 items-start animate-fade-in"
                  style={{ animationDelay: `${idx * 150}ms` }}
                >
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-primary text-white flex items-center justify-center text-xl font-bold shadow-glow">
                    {item.step}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                    <p className="text-muted-foreground">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 bg-gradient-primary relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.1),transparent)]" />
        </div>
        
        <div className="container mx-auto px-4 relative">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">
              Ready to Share Your Files?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Start transferring files securely in seconds. {!user && "Create an account to begin."}
            </p>
            <Button
              size="lg"
              onClick={() => navigate(user ? "/send" : "/auth")}
              className="bg-white text-primary hover:bg-white/90 text-lg h-14 px-8 shadow-xl"
            >
              <Upload className="mr-2 h-5 w-5" />
              {user ? "Send Files Now" : "Get Started"}
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">
              Built for Computer Networking Project • Secure File Sharing with Backend Storage & Tracking
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
