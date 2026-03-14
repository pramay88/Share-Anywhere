import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, History, User } from "lucide-react";
import { toast } from "sonner";

export const Header = () => {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();

    const handleSignOut = async () => {
        try {
            await signOut();
            toast.success("Signed out successfully");
            navigate("/");
        } catch (error) {
            console.error("Sign out error:", error);
            toast.error("Failed to sign out");
        }
    };

    const getInitials = (name: string | null) => {
        if (!name) return "U";
        return name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
    };

    return (
        <header className="w-full py-4 px-6 md:px-12 flex justify-between items-center border-b">

            {/* Logo */}
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
                <img src="/logo.png" alt="SA" className="h-6 w-6 object-contain" />
                <span className="text-lg font-semibold">ShareAnywhere</span>
            </div>

            {/* Center Navigation */}
            <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                <button onClick={() => navigate("/send")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Send
                </button>
                <button onClick={() => navigate("/p2p")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    P2P Share
                </button>
                <button onClick={() => navigate("/receive")}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                    Receive
                </button>
            </nav>

            {/* Right - Auth */}
            <nav className="flex items-center gap-6">

                {/* History */}
                {user ? (
                    <>
                        <button
                            onClick={() => navigate("/history")}
                            className="hidden md:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            History
                        </button>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                                    <Avatar className="h-9 w-9">
                                        <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
                                        <AvatarFallback>{getInitials(user.displayName)}</AvatarFallback>
                                    </Avatar>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="w-56" align="end" forceMount>
                                <div className="flex items-center justify-start gap-2 p-2">
                                    <div className="flex flex-col space-y-1 leading-none">
                                        {user.displayName && (
                                            <p className="font-medium">{user.displayName}</p>
                                        )}
                                        <p className="w-[200px] truncate text-sm text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigate("/history")}>
                                    <History className="mr-2 h-4 w-4" />
                                    <span>History</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleSignOut}>
                                    <LogOut className="mr-2 h-4 w-4" />
                                    <span>Sign Out</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                ) : (
                    <Button
                        onClick={() => navigate("/auth")}
                        variant="outline"
                        size="sm"
                    >
                        Sign In
                    </Button>
                )}
            </nav>
        </header>
    );
};
