// Required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                    UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

/**
 * Thin entry so Turbopack resolves the route handler reliably (avoids
 * `ComponentMod.handler is not a function` when the implementation lives in a large sibling module).
 */
export { POST } from '@/lib/providers/handler';
