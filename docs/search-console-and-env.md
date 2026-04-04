# Search Console, sitemap, and public URL

## `NEXT_PUBLIC_APP_URL`

Set this in Vercel project settings (Production and Preview as needed) to your **canonical marketing origin**, without a trailing slash:

- Example: `https://scandio.co.za`

The app uses it for:

- `metadataBase` and resolving relative Open Graph image paths
- Canonical URLs and `openGraph.url` on marketing routes
- [`src/app/sitemap.ts`](../src/app/sitemap.ts) and [`src/app/robots.ts`](../src/app/robots.ts)

If unset at build/runtime, the code falls back to `VERCEL_URL` (e.g. `https://your-deployment.vercel.app`) and then to `https://scandio.co.za`.

## `NEXT_PUBLIC_APP_ORIGIN`

Use when the **product UI** is on a different host than the marketing site (e.g. marketing at `scandio.co.za`, app at `app.scandio.co.za`). No trailing slash:

- Example: `https://app.scandio.co.za`

[`getAppOrigin()`](../src/lib/site-url.ts) defaults to `https://app.scandio.co.za` when unset. It is used for links into onboarding and other app flows (e.g. admin invitation emails). If everything runs on one domain, set **`NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_APP_ORIGIN` to the same origin**, or set only `NEXT_PUBLIC_APP_URL` and set `NEXT_PUBLIC_APP_ORIGIN` to match.

## Vercel system environment variables

On Vercel, `VERCEL_URL` is set per deployment (no protocol). [`getSiteUrl()`](../src/lib/site-url.ts) prefixes `https://` when using this fallback.

For production canonicals and sitemap URLs, prefer setting **`NEXT_PUBLIC_APP_URL`** to the real marketing domain so previews and production both emit the intended origin when you want consistency.

## Google Search Console

1. Add a **URL prefix** or **Domain** property for `scandio.co.za` (or your live marketing host).
2. Verify ownership (HTML file, meta tag, DNS, or Google Analytics).
3. Submit the sitemap: `https://scandio.co.za/sitemap.xml` (use your marketing origin).

After deploy, confirm `https://<your-marketing-domain>/robots.txt` lists the same sitemap URL and that `https://<your-marketing-domain>/sitemap.xml` returns the expected URLs.
