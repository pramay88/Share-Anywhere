import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component to catch and display React errors gracefully
 */
class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error for debugging
        console.error('ErrorBoundary caught an error:', error, errorInfo);

        this.setState({
            error,
            errorInfo,
        });
    }

    handleReload = () => {
        window.location.reload();
    };

    handleGoHome = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center p-4">
                    <Card className="max-w-2xl w-full p-8 shadow-lg">
                        <div className="text-center space-y-6">
                            <div className="flex justify-center">
                                <div className="bg-destructive/10 p-4 rounded-full">
                                    <AlertTriangle className="h-12 w-12 text-destructive" />
                                </div>
                            </div>

                            <div>
                                <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong</h1>
                                <p className="text-muted-foreground">
                                    We encountered an unexpected error. Don't worry, your data is safe.
                                </p>
                            </div>

                            {this.state.error && (
                                <div className="bg-muted/50 p-4 rounded-lg text-left">
                                    <p className="text-sm font-mono text-destructive break-all">
                                        {this.state.error.toString()}
                                    </p>
                                </div>
                            )}

                            <div className="flex gap-3 justify-center flex-wrap">
                                <Button
                                    onClick={this.handleReload}
                                    className="bg-gradient-primary hover:opacity-90"
                                >
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Reload Page
                                </Button>
                                <Button
                                    onClick={this.handleGoHome}
                                    variant="outline"
                                >
                                    <Home className="mr-2 h-4 w-4" />
                                    Go to Home
                                </Button>
                            </div>

                            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                                <details className="text-left">
                                    <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                                        View Error Details (Development Only)
                                    </summary>
                                    <pre className="mt-4 p-4 bg-muted rounded-lg text-xs overflow-auto max-h-64">
                                        {this.state.errorInfo.componentStack}
                                    </pre>
                                </details>
                            )}
                        </div>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
