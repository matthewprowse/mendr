import { describe, it, expect } from 'vitest';
import { constantTimeEqual } from '@/lib/crypto/constant-time';

describe('constantTimeEqual', () => {
    it('returns true for equal strings', () => {
        expect(constantTimeEqual('Bearer abc123', 'Bearer abc123')).toBe(true);
    });

    it('returns false for differing strings of equal length', () => {
        expect(constantTimeEqual('Bearer abc123', 'Bearer abc124')).toBe(false);
    });

    it('returns false for differing lengths', () => {
        expect(constantTimeEqual('short', 'longer-token')).toBe(false);
    });

    it('handles empty strings', () => {
        expect(constantTimeEqual('', '')).toBe(true);
        expect(constantTimeEqual('', 'x')).toBe(false);
    });
});
