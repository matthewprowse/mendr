export function openInNewTab(url: string): void {
    if (typeof window === 'undefined') return;
    const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
    if (newWindow) {
        newWindow.opener = null;
    }
}
