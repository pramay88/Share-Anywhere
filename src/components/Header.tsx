import { useState } from "react";
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
import { LogOut, History, Menu, X, Send, Download, Wifi } from "lucide-react";
import { toast } from "sonner";

export const Header = () => {
    const navigate = useNavigate();
    const { user, signOut } = useAuth();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

    const navItems = [
        { label: "Send", path: "/send", icon: Send },
        { label: "P2P Share", path: "/p2p", icon: Wifi },
        { label: "Receive", path: "/receive", icon: Download },
    ];

    return (
        <header className="w-full py-3 px-4 sm:py-4 sm:px-6 md:px-12 flex justify-between items-center border-b">

            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
                <img src="/logo64.webp" alt="SA" className="h-5 w-5 sm:h-6 sm:w-6 object-contain" />
                <span className="text-base sm:text-lg font-semibold">ShareAnywhere</span>
            </div>

            {/* Center Navigation - Desktop */}
            <nav className="hidden md:flex items-center gap-6 absolute left-1/2 -translate-x-1/2">
                {navItems.map((item) => (
                    <button
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            {/* Right - Auth & Mobile Menu */}
            <nav className="flex items-center gap-2 sm:gap-4">
                {/* Mobile menu button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-9 w-9"
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                    {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>

                {/* History - Desktop */}
                {user && (
                    <button
                        onClick={() => navigate("/history")}
                        className="hidden md:block text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                        History
                    </button>
                )}

                {/* User menu / Sign in */}
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-8 w-8 sm:h-9 sm:w-9 rounded-full">
                                <Avatar className="h-8 w-8 sm:h-9 sm:w-9">
                                    <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
                                    <AvatarFallback className="text-xs sm:text-sm">{getInitials(user.displayName)}</AvatarFallback>
                                </Avatar>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-56" align="end" forceMount>
                            <div className="flex items-center justify-start gap-2 p-2">
                                <div className="flex flex-col space-y-1 leading-none">
                                    {user.displayName && (
                                        <p className="font-medium text-sm">{user.displayName}</p>
                                    )}
                                    <p className="w-[200px] truncate text-xs text-muted-foreground">
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
                ) : (
                    <Button
                        onClick={() => navigate("/auth")}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs sm:h-9 sm:text-sm"
                    >
                        Sign In
                    </Button>
                )}
            </nav>

            {/* Mobile Navigation Menu */}
            {mobileMenuOpen && (
                <div className="absolute top-full left-0 right-0 bg-background border-b md:hidden z-50 animate-in slide-in-from-top-2">
                    <nav className="flex flex-col p-4 gap-1">
                        {navItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => {
                                    navigate(item.path);
                                    setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <item.icon className="h-4 w-4" />
                                {item.label}
                            </button>
                        ))}
                        {user && (
                            <button
                                onClick={() => {
                                    navigate("/history");
                                    setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                            >
                                <History className="h-4 w-4" />
                                History
                            </button>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
};
