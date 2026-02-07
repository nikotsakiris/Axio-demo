import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Axio",
  description: "Evidence-Grounded Mediator Assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <nav className="sticky top-0 z-50 border-b border-card-border bg-background/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Axio
            </Link>
            <div className="flex items-center gap-6 text-sm text-muted">
              <Link href="/intake" className="hover:text-foreground">
                Intake
              </Link>
              <Link href="/session" className="hover:text-foreground">
                Sessions
              </Link>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
