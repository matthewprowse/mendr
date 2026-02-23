"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Cross, Menu } from "geist-icons";
import { Button } from "@/components/ui/button";

const navLinks = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#features", label: "Features" },
  { href: "#coverage", label: "Coverage" },
  { href: "#testimonials", label: "Testimonials" },
] as const;

export function LandingHeader() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const closeMobileNav = () => setMobileNavOpen(false);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [mobileNavOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Scandio"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-lg"
            />
            <span className="font-semibold">Scandio</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-2 md:flex">
            {navLinks.map(({ href, label }) => (
              <Button key={href} variant="ghost" asChild className="font-normal text-sm text-muted-foreground hover:font-medium hover:text-foreground">
                <Link href={href}>{label}</Link>
              </Button>
            ))}
            <Button variant="ghost" asChild className="font-normal text-sm text-muted-foreground hover:font-medium hover:text-foreground">
              <Link href="/auth/sign-in">Login</Link>
            </Button>
          </nav>
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="ml-auto flex size-9 items-center justify-center md:hidden"
            aria-label="Open menu"
          >
            <Menu size={20} className="text-foreground" />
          </button>
        </div>
      </header>

      {/* Full-screen mobile nav */}
      <div
        className={`fixed inset-0 z-[60] bg-background md:hidden ${mobileNavOpen ? "visible" : "invisible pointer-events-none"}`}
        aria-hidden={!mobileNavOpen}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2" onClick={closeMobileNav}>
              <Image
                src="/logo.svg"
                alt="Scandio"
                width={36}
                height={36}
                className="h-9 w-9 shrink-0 rounded-lg"
              />
              <span className="font-semibold">Scandio</span>
            </Link>
            <button
              type="button"
              onClick={closeMobileNav}
              className="flex size-9 items-center justify-center"
              aria-label="Close menu"
            >
              <Cross size={20} className="text-foreground" />
            </button>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-4 py-8 sm:px-6">
            {navLinks.map(({ href, label }) => (
              <Button key={href} variant="ghost" asChild className="justify-start font-normal text-sm text-muted-foreground hover:font-medium hover:text-foreground">
                <Link
                  href={href}
                  onClick={closeMobileNav}
                  className="h-auto rounded-lg px-4 py-3 text-sm"
                >
                  {label}
                </Link>
              </Button>
            ))}
            <Button variant="ghost" asChild className="justify-start font-normal text-sm text-muted-foreground hover:font-medium hover:text-foreground">
              <Link
                href="/auth/sign-in"
                onClick={closeMobileNav}
                className="h-auto rounded-lg px-4 py-3 text-sm"
              >
                Login
              </Link>
            </Button>
          </nav>
          <div className="border-t border-border p-4 sm:p-6">
            <Button asChild size="lg" className="w-full">
              <Link href="/chat/start" onClick={closeMobileNav}>
                Start Diagnosis (Free)
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
