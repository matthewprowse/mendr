import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy | Scandio",
  description: "Scandio Privacy Policy. How we collect, use, and protect your personal information. POPIA compliant.",
};

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Scandio"
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-lg"
            />
            <span className="font-semibold">Scandio</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <article className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last Updated: February 2026</p>

          <p className="mt-6 leading-relaxed text-muted-foreground">
            Scandio (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) respects your privacy. This Privacy Policy explains how we collect, use, and share your personal information when you use our Service. We are committed to complying with the Protection of Personal Information Act (POPIA) of South Africa.
          </p>

          <div className="mt-10 space-y-8 text-foreground">
            <section>
              <h2 className="text-xl font-semibold">1. Information We Collect</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                To provide the core functionality of our Service, we collect the following data:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Images and Chat Data:</strong> Photos you upload of your home maintenance issues, and the text messages you send to our AI diagnostic tool.
                </li>
                <li>
                  <strong className="text-foreground">Location Data:</strong> With your explicit device permission, we collect your precise geographic coordinates (latitude and longitude) to recommend the closest available Professionals. If permission is denied, we may collect approximate location data via your IP address.
                </li>
                <li>
                  <strong className="text-foreground">Usage Data:</strong> Device type, browser type, IP address, and interaction logs with the platform.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We use your data strictly to operate and improve the Service:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>To analyze your images and provide a home repair diagnosis.</li>
                <li>To locate and display relevant, local service providers based on your coordinates.</li>
                <li>To maintain a localized history of your session (using a unique conversation ID) so you can return to your diagnostic report.</li>
                <li>To improve our application infrastructure and monitor for errors.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold">3. How We Share Your Information</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We do not sell your personal data. Because our Service relies on complex integrations, we share specific data points with the following trusted third-party service providers:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>
                  <strong className="text-foreground">AI Processing Partners:</strong> Your images and chat text are securely transmitted to our AI provider (Google Gemini API) to generate the diagnosis.
                </li>
                <li>
                  <strong className="text-foreground">Mapping Services:</strong> Your location data (latitude/longitude) and the specific trade required are transmitted to Google Places API to fetch local professionals.
                </li>
                <li>
                  <strong className="text-foreground">Database Hosting:</strong> Your chat history, session ID, and uploaded images are stored securely on our cloud database infrastructure (Supabase).
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold">4. Data Retention</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We retain your diagnostic chat history and uploaded images to allow you to review your reports and share them with Professionals. Because we currently do not require user accounts for homeowners, this data is tied to anonymized conversation IDs. You may request the deletion of a specific conversation thread by contacting us with the relevant URL/ID.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold">5. Security</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                We implement industry-standard security measures (including data compression and secure HTTPS routing) to protect your information. However, no internet transmission is 100% secure, and we cannot guarantee absolute security. Please do not upload images containing sensitive personal or financial information.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold">6. Your Rights (POPIA)</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Under South African law, you have the right to:
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">
                <li>Request access to the personal information we hold about you.</li>
                <li>Request correction or deletion of your personal information.</li>
                <li>Object to the processing of your personal information.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold">7. Contact Us</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                If you have any questions about this Privacy Policy or wish to exercise your data rights, please contact us at:{" "}
                <a
                  href="mailto:info@scandio.co.za"
                  className="text-primary underline underline-offset-4 hover:no-underline"
                >
                  info@scandio.co.za
                </a>
                .
              </p>
            </section>
          </div>

          <div className="mt-12 border-t border-border pt-8">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Back to Home
            </Link>
          </div>
        </article>
      </main>
    </div>
  );
}
