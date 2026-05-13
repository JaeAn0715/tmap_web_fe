import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "danger" | "secondary";
  size?: "sm" | "md";
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={clsx(
        "rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm",
        size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        variant === "primary" &&
          "bg-brand text-white hover:bg-brand-dark shadow-card border border-transparent",
        variant === "secondary" &&
          "bg-white text-tmap-ink/90 border border-gray-200/80 hover:bg-gray-50",
        variant === "ghost" &&
          "text-tmap-muted !shadow-none hover:bg-gray-100/80",
        variant === "danger" && "bg-red-500 text-white hover:bg-red-600",
        className
      )}
    />
  );
}
