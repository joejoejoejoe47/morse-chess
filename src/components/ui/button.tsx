import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color,color,border-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default: "bg-forest text-ivory hover:bg-forest-2",
        solid: "bg-ivory text-ink hover:bg-ivory hover:opacity-90",
        secondary: "bg-panel-2 text-ivory border border-line hover:border-line-strong hover:bg-panel-2",
        ghost: "text-mist hover:text-mist hover:bg-panel-2",
        danger: "bg-danger text-ivory hover:opacity-90",
        outline: "border border-line-strong bg-transparent text-ivory hover:bg-panel-2 hover:text-ivory",
      },
      size: {
        default: "h-11 px-4",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5 text-base",
        xl: "h-14 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
