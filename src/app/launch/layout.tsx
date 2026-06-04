/**
 * Opt the coming-soon route out of the root layout's flex-col wrapper.
 * Sticky card stacks require a block-level scroll container —
 * a flex-col parent can interfere with the sticky stacking behaviour.
 */
export default function ComingSoonLayout({ children }: { children: React.ReactNode }) {
    return <div className="block">{children}</div>;
}
