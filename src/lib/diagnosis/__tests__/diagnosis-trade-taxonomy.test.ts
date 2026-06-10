import { describe, it, expect } from 'vitest';
import {
    inferTradeFromSignals,
    getSubcategoryById,
    CLASSIFICATION_SUBCATEGORY_ENUM,
    formatTaxonomyForClassificationPrompt,
    TAXONOMY_NONE_ID,
} from '../diagnosis-trade-taxonomy';

// ---------------------------------------------------------------------------
// inferTradeFromSignals
// ---------------------------------------------------------------------------

describe('inferTradeFromSignals', () => {
    it('returns null for empty string', () => {
        expect(inferTradeFromSignals('')).toBeNull();
    });

    it('returns null for whitespace-only string', () => {
        expect(inferTradeFromSignals('   ')).toBeNull();
    });

    it('matches "geyser leaking" to geyser_fault_plumbing', () => {
        const result = inferTradeFromSignals('The geyser leaking all over the floor');
        expect(result).not.toBeNull();
        expect(result?.subcategoryId).toBe('geyser_fault_plumbing');
        expect(result?.trade).toBe('Plumbing');
    });

    it('matches "db board" to db_board_tripping', () => {
        const result = inferTradeFromSignals('My db board keeps tripping');
        expect(result).not.toBeNull();
        expect(result?.subcategoryId).toBe('db_board_tripping');
        expect(result?.trade).toBe('Electrical');
    });

    it('matches "gate motor" to gate_motor_fault', () => {
        const result = inferTradeFromSignals('Gate motor stopped working this morning');
        expect(result).not.toBeNull();
        expect(result?.subcategoryId).toBe('gate_motor_fault');
        expect(result?.trade).toBe('Security');
    });

    it('matches "locked out" to lockout_emergency', () => {
        const result = inferTradeFromSignals('I am locked out of my house');
        expect(result).not.toBeNull();
        expect(result?.subcategoryId).toBe('lockout_emergency');
        expect(result?.trade).toBe('Locksmith Services');
    });

    it('matches "pool algae" to pool_chemical_balance', () => {
        const result = inferTradeFromSignals('pool algae causing green water');
        expect(result).not.toBeNull();
        expect(result?.subcategoryId).toBe('pool_chemical_balance');
    });

    it('returns an object with matchedKeyword', () => {
        const result = inferTradeFromSignals('cracked tile in the bathroom');
        expect(result).not.toBeNull();
        expect(typeof result?.matchedKeyword).toBe('string');
        expect(result!.matchedKeyword.length).toBeGreaterThan(0);
    });

    it('is case-insensitive', () => {
        const lower = inferTradeFromSignals('burst pipe in garden');
        const upper = inferTradeFromSignals('BURST PIPE IN GARDEN');
        expect(lower?.subcategoryId).toBe(upper?.subcategoryId);
    });
});

// ---------------------------------------------------------------------------
// getSubcategoryById
// ---------------------------------------------------------------------------

describe('getSubcategoryById', () => {
    it('returns undefined for null', () => {
        expect(getSubcategoryById(null)).toBeUndefined();
    });

    it('returns undefined for undefined', () => {
        expect(getSubcategoryById(undefined)).toBeUndefined();
    });

    it('returns undefined for TAXONOMY_NONE_ID', () => {
        expect(getSubcategoryById(TAXONOMY_NONE_ID)).toBeUndefined();
    });

    it('returns undefined for unknown id', () => {
        expect(getSubcategoryById('not_a_real_id')).toBeUndefined();
    });

    it('returns the correct entry for a known id', () => {
        const result = getSubcategoryById('db_board_tripping');
        expect(result).not.toBeUndefined();
        expect(result?.label).toBe('DB Board / Tripping');
        expect(result?.trade).toBe('Electrical');
    });

    it('returns the correct entry for gate_motor_fault', () => {
        const result = getSubcategoryById('gate_motor_fault');
        expect(result?.trade).toBe('Security');
    });
});

// ---------------------------------------------------------------------------
// CLASSIFICATION_SUBCATEGORY_ENUM
// ---------------------------------------------------------------------------

describe('CLASSIFICATION_SUBCATEGORY_ENUM', () => {
    it('starts with TAXONOMY_NONE_ID', () => {
        expect(CLASSIFICATION_SUBCATEGORY_ENUM[0]).toBe(TAXONOMY_NONE_ID);
    });

    it('contains more than 30 entries (comprehensive taxonomy)', () => {
        expect(CLASSIFICATION_SUBCATEGORY_ENUM.length).toBeGreaterThan(30);
    });

    it('has no duplicate entries', () => {
        const set = new Set(CLASSIFICATION_SUBCATEGORY_ENUM);
        expect(set.size).toBe(CLASSIFICATION_SUBCATEGORY_ENUM.length);
    });

    it('includes known subcategory ids', () => {
        expect(CLASSIFICATION_SUBCATEGORY_ENUM).toContain('db_board_tripping');
        expect(CLASSIFICATION_SUBCATEGORY_ENUM).toContain('geyser_fault_plumbing');
        expect(CLASSIFICATION_SUBCATEGORY_ENUM).toContain('gate_motor_fault');
        expect(CLASSIFICATION_SUBCATEGORY_ENUM).toContain('lockout_emergency');
    });
});

// ---------------------------------------------------------------------------
// formatTaxonomyForClassificationPrompt
// ---------------------------------------------------------------------------

describe('formatTaxonomyForClassificationPrompt', () => {
    it('returns a non-empty string', () => {
        const result = formatTaxonomyForClassificationPrompt();
        expect(typeof result).toBe('string');
        expect(result.trim().length).toBeGreaterThan(200);
    });

    it('contains scope descriptions', () => {
        const result = formatTaxonomyForClassificationPrompt();
        expect(result).toContain('Scope:');
    });

    it('contains the ROUTING SUBCATEGORIES header', () => {
        const result = formatTaxonomyForClassificationPrompt();
        expect(result).toContain('ROUTING SUBCATEGORIES');
    });

    it('contains trade headings', () => {
        const result = formatTaxonomyForClassificationPrompt();
        expect(result).toContain('Electrical');
        expect(result).toContain('Plumbing');
        expect(result).toContain('Security');
    });

    it('contains TAXONOMY_NONE_ID in the closing instruction', () => {
        const result = formatTaxonomyForClassificationPrompt();
        expect(result).toContain(TAXONOMY_NONE_ID);
    });

    it('produces consistent output (deterministic)', () => {
        const a = formatTaxonomyForClassificationPrompt();
        const b = formatTaxonomyForClassificationPrompt();
        expect(a).toBe(b);
    });
});
