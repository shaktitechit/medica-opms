import type { ReactNode } from "react";

type PageContentProps = {
  children: ReactNode;
  className?: string;
};

export function PageContent({ children, className = "" }: PageContentProps) {
  return (
    <main
      className={`min-h-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain px-3 py-5 sm:px-5 md:px-8 md:py-8 pb-[max(1.25rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch] ${className}`.trim()}
    >
      {children}
    </main>
  );
}
