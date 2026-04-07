import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { CheckCircle2, AlertCircle, Loader2, InfoIcon } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <div className="flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </div>
        ),
        error: (
          <div className="flex items-center justify-center">
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
        ),
        loading: (
          <div className="flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
          </div>
        ),
        info: (
          <div className="flex items-center justify-center">
            <InfoIcon className="h-5 w-5 text-blue-500" />
          </div>
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
