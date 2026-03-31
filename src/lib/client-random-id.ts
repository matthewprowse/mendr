/**
 * Prefer UUID from the Web Crypto API only in a secure context (HTTPS, localhost, etc.).
 * Plain HTTP on a LAN IP (e.g. http://192.168.x.x) is not a secure context — `randomUUID`
 * is missing or must not be relied on — so we always fall back there.
 */
export function createClientId(): string {
    const fallbackUuidV4 = () => {
        const bytes = new Uint8Array(16);
        try {
            if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
                globalThis.crypto.getRandomValues(bytes);
            } else {
                for (let i = 0; i < bytes.length; i += 1) {
                    bytes[i] = Math.floor(Math.random() * 256);
                }
            }
        } catch {
            for (let i = 0; i < bytes.length; i += 1) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }

        // UUID v4: set version and variant bits.
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;

        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    };

    try {
        const g = globalThis as typeof globalThis & { isSecureContext?: boolean };
        if (
            g.isSecureContext === true &&
            typeof g.crypto !== 'undefined' &&
            typeof g.crypto.randomUUID === 'function'
        ) {
            return g.crypto.randomUUID();
        }
    } catch {
        // Ignore and use fallback.
    }
    return fallbackUuidV4();
}
