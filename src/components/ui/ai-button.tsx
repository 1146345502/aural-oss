"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AiButtonProps extends ButtonProps {
  loading?: boolean;
  /** Extra classes on the outer wrapper (e.g. "w-full", "w-fit", "mt-2") */
  wrapperClassName?: string;
  "data-tour"?: string;
}

/**
 * Button with a rainbow gradient border that spins while loading.
 *
 * Three visual states:
 *  - **disabled**: plain disabled button, no border
 *  - **idle + enabled**: static rainbow border, dark button
 *  - **loading**: spinning rainbow border, dark disabled button with spinner
 */
const AiButton = React.forwardRef<HTMLButtonElement, AiButtonProps>(
  ({ loading, disabled, children, className, wrapperClassName, size, "data-tour": dataTour, ...props }, ref) => {
    const inactive = disabled || loading;
    const showBorder = !disabled;

    return (
      <div
        data-tour={dataTour}
        className={cn(
          "relative overflow-hidden rounded-lg p-[1.5px]",
          showBorder && (loading ? "ai-border-spin" : ""),
          wrapperClassName,
        )}
        style={
          showBorder
            ? { backgroundImage: "linear-gradient(90deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6)" }
            : undefined
        }
      >
        <Button
          ref={ref}
          size={size}
          className={cn(
            "relative",
            showBorder && "rounded-[5px] bg-foreground text-background hover:bg-foreground/90",
            loading && "disabled:opacity-100",
            className,
          )}
          disabled={inactive}
          {...props}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {children}
        </Button>
      </div>
    );
  },
);
AiButton.displayName = "AiButton";

export { AiButton };
