/**
 * Location store for passing coordinates from homepage (user gesture) to chat page.
 * Mobile browsers require a user gesture to grant geolocation; we capture it on upload.
 */

export type StoredLocation = {
    lat: number;
    lng: number;
    address?: string;
};

const KEY = 'pending_diagnosis_location';

export function setLocation(loc: StoredLocation) {
    try {
        sessionStorage.setItem(KEY, JSON.stringify(loc));
    } catch (e) {
        console.warn('Failed to store location');
    }
}

export function getLocation(): StoredLocation | null {
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const loc = JSON.parse(raw) as StoredLocation;
        if (typeof loc.lat === 'number' && typeof loc.lng === 'number') return loc;
    } catch (e) {
        return null;
    }
    return null;
}

export function clearLocation() {
    try {
        sessionStorage.removeItem(KEY);
    } catch (e) {}
}
