import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export const Header = () => {
    const navigate = useNavigate();

    return (
        <header className="w-full py-4 px-6 md:px-12 flex justify-between items-center border-b">
            <div
                className="flex items-center gap-2.5 cursor-pointer"
                onClick={() => navigate("/")}
            >
                <img src="/logo.png" alt="ShareAnywhere" className="h-6 w-6 object-contain" />
                <span className="text-lg font-semibold">ShareAnywhere</span>
            </div>

            <nav className="flex items-center gap-6">
                <button
                    onClick={() => navigate("/send")}
                    className="hidden md:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    Send
                </button>
                <button
                    onClick={() => navigate("/receive")}
                    className="hidden md:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    Receive
                </button>
                <Button
                    onClick={() => navigate("/auth")}
                    variant="outline"
                    size="sm"
                >
                    Sign In
                </Button>
            </nav>
        </header>
    );
};
