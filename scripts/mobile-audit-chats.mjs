import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const URL = process.env.AUDIT_URL ?? 'http://localhost:3000/app/chats';
const OUT_DIR = process.env.AUDIT_OUT_DIR ?? path.join(process.cwd(), 'playwright-artifacts');

const preferredDevices = ['iPhone XR', 'iPhone 11', 'iPhone X', 'iPhone 12'];
const deviceName = preferredDevices.find((name) => devices[name]);
if (!deviceName) {
    throw new Error(`No preferred iPhone device found. Available: ${Object.keys(devices).slice(0, 20).join(', ')}…`);
}

await fs.mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
    ...devices[deviceName],
});
const page = await context.newPage();

const response = await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(250);

const screenshotPath = path.join(OUT_DIR, `audit-${deviceName.replaceAll(' ', '-')}.png`);
await page.screenshot({ path: screenshotPath, fullPage: true });

const audit = await page.evaluate(() => {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const docEl = document.documentElement;
    const body = document.body;

    const base = {
        location: window.location.href,
        viewport: { w: viewportW, h: viewportH, dpr: window.devicePixelRatio },
        doc: {
            docEl: { clientWidth: docEl.clientWidth, scrollWidth: docEl.scrollWidth },
            body: { clientWidth: body?.clientWidth ?? null, scrollWidth: body?.scrollWidth ?? null },
        },
    };

    const selectorFor = (el) => {
        if (!(el instanceof Element)) return null;
        if (el.id) return `#${CSS.escape(el.id)}`;
        const attrs = ['data-slot', 'data-sidebar', 'role', 'aria-label']
            .map((k) => (el.getAttribute(k) ? `[${k}="${CSS.escape(el.getAttribute(k) ?? '')}"]` : null))
            .filter(Boolean);
        if (attrs.length) return `${el.tagName.toLowerCase()}${attrs.join('')}`;
        if (el.classList.length) return `${el.tagName.toLowerCase()}.${Array.from(el.classList).slice(0, 3).join('.')}`;
        return el.tagName.toLowerCase();
    };

    const describeEl = (el) => {
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const className = el.getAttribute('class');
        return {
            tag: el.tagName.toLowerCase(),
            selector: selectorFor(el),
            className,
            rect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                right: rect.right,
            },
            overflowX: cs.overflowX,
            position: cs.position,
            width: cs.width,
            maxWidth: cs.maxWidth,
            marginLeft: cs.marginLeft,
            marginRight: cs.marginRight,
            paddingLeft: cs.paddingLeft,
            paddingRight: cs.paddingRight,
            transform: cs.transform,
        };
    };

    const all = Array.from(document.querySelectorAll('body *')).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
    );

    const overRight = all
        .map((el) => {
            const rect = el.getBoundingClientRect();
            const overflow = rect.right - viewportW;
            return { el, overflow };
        })
        .filter(({ overflow }) => overflow > 1)
        .sort((a, b) => b.overflow - a.overflow)
        .slice(0, 30)
        .map(({ el, overflow }) => ({ overflow, ...describeEl(el) }));

    const maxWidthLimited = all
        .map((el) => {
            const cs = window.getComputedStyle(el);
            if (!cs.maxWidth || cs.maxWidth === 'none') return null;
            const rect = el.getBoundingClientRect();
            if (rect.width >= viewportW - 4) return null;
            return describeEl(el);
        })
        .filter(Boolean)
        .slice(0, 30);

    const sidebarTrigger = document.querySelector('[data-slot="sidebar-trigger"]');
    const sidebarWrapper = document.querySelector('[data-slot="sidebar-wrapper"]');
    const sidebarInset = document.querySelector('[data-slot="sidebar-inset"]');
    const header = document.querySelector('header');

    return {
        ...base,
        horizontalScroll: docEl.scrollWidth - docEl.clientWidth,
        overRight,
        maxWidthLimited,
        keyElements: {
            header: header ? describeEl(header) : null,
            sidebarTrigger: sidebarTrigger instanceof Element ? describeEl(sidebarTrigger) : null,
            sidebarWrapper: sidebarWrapper instanceof Element ? describeEl(sidebarWrapper) : null,
            sidebarInset: sidebarInset instanceof Element ? describeEl(sidebarInset) : null,
        },
    };
});

const jsonPath = path.join(OUT_DIR, `audit-${deviceName.replaceAll(' ', '-')}.json`);
await fs.writeFile(jsonPath, JSON.stringify({ device: deviceName, url: URL, status: response?.status() ?? null, screenshotPath, audit }, null, 2));

console.log(JSON.stringify({ device: deviceName, url: URL, status: response?.status() ?? null, screenshotPath, jsonPath, location: audit.location, horizontalScroll: audit.horizontalScroll }, null, 2));

await context.close();
await browser.close();

