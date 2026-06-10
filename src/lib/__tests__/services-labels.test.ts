/**
 * Drift guard and additional tests for services.ts.
 * (tradeToServiceLabel is covered in services.test.ts)
 */

import { describe, it, expect } from 'vitest';
import { SERVICE_LABELS, toTitleCase } from '../services';

// ── SERVICE_LABELS drift guard ─────────────────────────────────────────────────

describe('SERVICE_LABELS', () => {
    it('contains exactly 23 canonical trades', () => {
        expect(SERVICE_LABELS.length).toBe(23);
    });

    it('includes all expected canonical labels', () => {
        const expected = [
            'Electrical',
            'Plumbing',
            'Security',
            'Building & Construction',
            'Carpentry & Woodwork',
            'Flooring & Tiling',
            'Garden & Landscaping',
            'General Handyman',
            'Locksmith Services',
            'Painting',
            'Pool Maintenance',
            'Rubble & Waste Removal',
            'Welding',
            'Appliance Repair',
            'Air Conditioning',
            'Glazing, Glass & Aluminium',
            'Borehole, Water & Pumps',
            'Pest Control',
            'Waterproofing',
            'Solar & Backup Power',
            'Roofing',
            'Paving & Driveways',
            'Gas Installation & Repair',
        ] as const;

        for (const label of expected) {
            expect(SERVICE_LABELS).toContain(label);
        }
    });

    it('has no duplicate entries', () => {
        const set = new Set(SERVICE_LABELS);
        expect(set.size).toBe(SERVICE_LABELS.length);
    });
});

// ── toTitleCase ───────────────────────────────────────────────────────────────

describe('toTitleCase', () => {
    it('returns the string as-is when null/undefined', () => {
        expect(toTitleCase(null)).toBe('');
        expect(toTitleCase(undefined)).toBe('');
    });

    it('returns empty string for whitespace-only input', () => {
        expect(toTitleCase('')).toBe('');
        expect(toTitleCase('   ')).toBe('   ');
    });

    it('capitalises the first letter of each word', () => {
        expect(toTitleCase('garage door repair')).toBe('Garage Door Repair');
    });

    it('lowercases subsequent letters in each word', () => {
        expect(toTitleCase('BROKEN PIPE')).toBe('Broken Pipe');
    });

    it('handles single-word input', () => {
        expect(toTitleCase('electrical')).toBe('Electrical');
    });
});
