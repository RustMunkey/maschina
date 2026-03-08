import type { ReactNode } from "react";

interface RootLayoutProps {
  children: ReactNode;
  /** Apply dark mode class to the root element. Default: respects OS preference via CSS. */
  dark?: boolean;
}

/**
 * Shared root layout for all Maschina web apps.
 * Wraps TanStack Router's <Outlet /> (or any children) with the correct
 * font class variables so Tailwind's font-sans / font-serif / font-mono work.
 *
 * Usage in __root.tsx:
 *   import { RootLayout } from "@maschina/ui/components/RootLayout";
 *   export default function Root() {
 *     return <RootLayout><Outlet /></RootLayout>;
 *   }
 */
export function RootLayout({ children, dark }: RootLayoutProps) {
  return (
    <div className={dark ? "dark" : undefined} style={{ minHeight: "100dvh" }}>
      {children}
    </div>
  );
}
