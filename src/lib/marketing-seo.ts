import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { BRAND_NAME } from "@/lib/brand-system";

export const OG_IMAGE_DEFAULT = "/og-mendr.jpg";
export const OG_IMAGE_PRO = "/og-mendr-pro.jpg";

export const OG_IMAGE_DIM = { width: 1200, height: 630 } as const;

export function marketingOgImage(opts?: {
    path?: typeof OG_IMAGE_DEFAULT | typeof OG_IMAGE_PRO;
    alt?: string;
}) {
    const url = opts?.path ?? OG_IMAGE_DEFAULT;
    const alt =
        opts?.alt ??
        `${BRAND_NAME} — home maintenance diagnosis and local provider matching in the Western Cape`;
    return {
        url,
        ...OG_IMAGE_DIM,
        alt,
    };
}

/**
 * Canonical metadata for indexable marketing pages (OG/Twitter/canonical).
 * Use distinct titles per route; descriptions ~150–160 characters for SERP snippets.
 */
export function buildMarketingPageMetadata(opts: {
    path: string;
    title: string;
    description: string;
    ogImage?: ReturnType<typeof marketingOgImage>;
}): Metadata {
    const base = getSiteUrl();
    const path = opts.path === "/" ? "" : opts.path.replace(/\/$/, "");
    const canonical = path === "" ? `${base}/` : `${base}${path}`;
    const image = opts.ogImage ?? marketingOgImage();
    const imageUrl = typeof image.url === "string" ? image.url : String(image.url);

    return {
        title: opts.title,
        description: opts.description,
        alternates: {
            canonical,
        },
        openGraph: {
            title: opts.title,
            description: opts.description,
            type: "website",
            url: canonical,
            locale: "en_ZA",
            siteName: BRAND_NAME,
            images: [image],
        },
        twitter: {
            card: "summary_large_image",
            title: opts.title,
            description: opts.description,
            images: [imageUrl],
        },
    };
}
