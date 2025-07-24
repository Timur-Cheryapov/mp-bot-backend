import { describe, test, expect } from '@jest/globals';
import { adjustProductDescription, validateProductDescription } from '../../shared/utils/text-processing.utils';

describe('Text Processing Utils', () => {
  describe('adjustProductDescription', () => {
    test('should return empty string for empty input', () => {
      expect(adjustProductDescription('')).toBe('');
      expect(adjustProductDescription('   ')).toBe('');
      expect(adjustProductDescription(null as any)).toBe('');
      expect(adjustProductDescription(undefined as any)).toBe('');
    });

    test('should return valid description unchanged (1000-5000 chars)', () => {
      const validDescription = 'A'.repeat(1500);
      expect(adjustProductDescription(validDescription)).toBe(validDescription);
      
      const anotherValidDescription = 'B'.repeat(3000);
      expect(adjustProductDescription(anotherValidDescription)).toBe(anotherValidDescription);
    });

    test('should expand short descriptions to at least 1000 characters', () => {
      const shortDescription = 'Short product description.';
      const result = adjustProductDescription(shortDescription);
      
      expect(result.length).toBeGreaterThanOrEqual(1000);
      expect(result).toContain(shortDescription);
    });

    test('should expand short description using product title context', () => {
      const shortDescription = 'Great product.';
      const productTitle = 'Amazing Smartphone XYZ';
      const result = adjustProductDescription(shortDescription, productTitle);
      
      expect(result.length).toBeGreaterThanOrEqual(1000);
      expect(result).toContain(shortDescription);
    });

    test('should truncate long descriptions to max 5000 characters', () => {
      const longDescription = 'Very long description. '.repeat(300); // > 5000 chars
      const result = adjustProductDescription(longDescription);
      
      expect(result.length).toBeLessThanOrEqual(5000);
      expect(result.length).toBeGreaterThan(4900); // Should be close to 5000
    });

    test('should truncate at sentence boundary when possible', () => {
      const sentence = 'This is a complete sentence. ';
      const longDescription = sentence.repeat(200); // Creates a long text with sentence boundaries
      const result = adjustProductDescription(longDescription);
      
      expect(result.length).toBeLessThanOrEqual(5000);
      // Should end with sentence punctuation if truncated at sentence boundary
      expect(['.', '!', '?']).toContain(result.trim().slice(-1));
    });

    test('should handle descriptions exactly at boundaries', () => {
      const exactlyMinDescription = 'A'.repeat(1000);
      expect(adjustProductDescription(exactlyMinDescription)).toBe(exactlyMinDescription);
      
      const exactlyMaxDescription = 'B'.repeat(5000);
      expect(adjustProductDescription(exactlyMaxDescription)).toBe(exactlyMaxDescription);
    });

    test('should handle edge case just below minimum', () => {
      const justBelowMin = 'C'.repeat(999);
      const result = adjustProductDescription(justBelowMin);
      
      expect(result.length).toBeGreaterThanOrEqual(1000);
      expect(result).toContain(justBelowMin);
    });

    test('should handle edge case just above maximum', () => {
      const justAboveMax = 'D'.repeat(5001);
      const result = adjustProductDescription(justAboveMax);
      
      expect(result.length).toBeLessThanOrEqual(5000);
    });

    test('should preserve original description when expanding', () => {
      const originalDescription = 'Original product description with some details.';
      const result = adjustProductDescription(originalDescription);
      
      expect(result).toContain(originalDescription);
    });

    test('should add Russian expansion content', () => {
      const shortDescription = 'Product description.';
      const result = adjustProductDescription(shortDescription);
      
      // Should contain Russian text from expansion templates
      expect(result).toMatch(/[а-яё]/i); // Contains Cyrillic characters
    });
  });

  describe('validateProductDescription', () => {
    test('should validate empty description as valid', () => {
      const result = validateProductDescription('');
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(0);
      expect(result.message).toBeUndefined();
    });

    test('should validate descriptions within valid range (1000-5000)', () => {
      const validDescription = 'A'.repeat(1500);
      const result = validateProductDescription(validDescription);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(1500);
      expect(result.message).toBeUndefined();
    });

    test('should invalidate descriptions that are too short', () => {
      const shortDescription = 'Too short';
      const result = validateProductDescription(shortDescription);
      
      expect(result.isValid).toBe(false);
      expect(result.length).toBe(shortDescription.length);
      expect(result.message).toContain('too short');
      expect(result.message).toContain('Must be at least 1000 characters');
    });

    test('should invalidate descriptions that are too long', () => {
      const longDescription = 'A'.repeat(5001);
      const result = validateProductDescription(longDescription);
      
      expect(result.isValid).toBe(false);
      expect(result.length).toBe(5001);
      expect(result.message).toContain('too long');
      expect(result.message).toContain('Must be at most 5000 characters');
    });

    test('should validate exactly at minimum boundary', () => {
      const exactlyMinDescription = 'B'.repeat(1000);
      const result = validateProductDescription(exactlyMinDescription);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(1000);
      expect(result.message).toBeUndefined();
    });

    test('should validate exactly at maximum boundary', () => {
      const exactlyMaxDescription = 'C'.repeat(5000);
      const result = validateProductDescription(exactlyMaxDescription);
      
      expect(result.isValid).toBe(true);
      expect(result.length).toBe(5000);
      expect(result.message).toBeUndefined();
    });

    test('should invalidate description just below minimum', () => {
      const justBelowMin = 'D'.repeat(999);
      const result = validateProductDescription(justBelowMin);
      
      expect(result.isValid).toBe(false);
      expect(result.length).toBe(999);
      expect(result.message).toContain('999 characters');
    });

    test('should invalidate description just above maximum', () => {
      const justAboveMax = 'E'.repeat(5001);
      const result = validateProductDescription(justAboveMax);
      
      expect(result.isValid).toBe(false);
      expect(result.length).toBe(5001);
      expect(result.message).toContain('5001 characters');
    });

    test('should include actual length in error messages', () => {
      const shortDesc = 'ABC';
      const shortResult = validateProductDescription(shortDesc);
      expect(shortResult.message).toContain('3 characters');
      
      const longDesc = 'X'.repeat(6000);
      const longResult = validateProductDescription(longDesc);
      expect(longResult.message).toContain('6000 characters');
    });
  });

  describe('integration tests', () => {
    test('should properly process real-world short description', () => {
      const realDescription = 'Высококачественная футболка из хлопка.';
      const adjusted = adjustProductDescription(realDescription);
      const validation = validateProductDescription(adjusted);
      
      expect(validation.isValid).toBe(true);
      expect(adjusted).toContain(realDescription);
      expect(adjusted.length).toBeGreaterThanOrEqual(1000);
    });

    test('should properly process real-world long description', () => {
      const realLongDescription = 'Это очень подробное описание товара. '.repeat(300);
      const adjusted = adjustProductDescription(realLongDescription);
      const validation = validateProductDescription(adjusted);
      
      expect(validation.isValid).toBe(true);
      expect(adjusted.length).toBeLessThanOrEqual(5000);
    });

    test('should handle whitespace properly', () => {
      const descWithWhitespace = '   Short description with whitespace.   ';
      const adjusted = adjustProductDescription(descWithWhitespace);
      
      expect(adjusted.length).toBeGreaterThanOrEqual(1000);
      expect(adjusted).toContain('Short description with whitespace.');
    });
  });
}); 