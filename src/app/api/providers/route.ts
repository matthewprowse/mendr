/**
 * Thin entry so Turbopack resolves the route handler reliably (avoids
 * `ComponentMod.handler is not a function` when the implementation lives in a large sibling module).
 */
export { POST } from './providers-route';
