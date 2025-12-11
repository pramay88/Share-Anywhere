import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Header } from "@/components/Header";
import { QuickShareForm } from "@/components/QuickShareForm";

const QuickShare = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen flex flex-col">
            <Header />

            <div className="flex-1 flex items-center justify-center p-4 md:p-6">
                <div className="w-full max-w-xl">
                    <div className="mb-4 md:mb-6">
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">Quick Share</h1>
                        <p className="text-sm md:text-base text-muted-foreground">
                            Share text, links, or code snippets instantly
                        </p>
                    </div>

                    <Card className="p-4 md:p-6">
                        <QuickShareForm />
                    </Card>

                    <div className="text-center mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => navigate("/receive")}
                            className="text-muted-foreground"
                        >
                            Want to receive instead?
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuickShare;
