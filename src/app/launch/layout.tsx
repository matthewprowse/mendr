/**
 * The /launch page renders as a full-viewport `fixed inset-0` shell (the same
 * pattern as /auth/login and /start), so it opts out of the root layout's
 * flex-col wrapper to avoid any interaction with that fixed overlay.
 */
export default function LaunchLayout({ children }: { children: React.ReactNode }) {
    return <div className="block">{children}</div>;
}
