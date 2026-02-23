"use client";

import Image from "next/image";
import Link from "next/link";

export function LandingHeader() {
  return (
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
      </div>
    </header>
  );
}
