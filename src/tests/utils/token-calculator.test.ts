import { extractTokenUsage, calculateTokenCost, TOKEN_COSTS } from '../../core/ai/token-calculator';
import { AIMessage } from '@langchain/core/messages';

describe('Token Cost Calculator', () => {
  describe('calculateTokenCost', () => {
    test('should calculate cost for gpt-4o-mini correctly', () => {
      const result = calculateTokenCost(1000, 500, 'gpt-4o-mini');
      
      // Expected: (1000/1000000 * 0.15) + (500/1000000 * 0.6) = 0.00015 + 0.0003 = 0.00045
      expect(result).toBeCloseTo(0.00045);
    });

    test('should calculate cost for gpt-4.1 correctly', () => {
      const result = calculateTokenCost(1000, 500, 'gpt-4.1');
      
      // Expected: (1000/1000000 * 2.0) + (500/1000000 * 8.0) = 0.002 + 0.004 = 0.006
      expect(result).toBeCloseTo(0.006);
    });

    test('should handle unknown models with default rates', () => {
      const result = calculateTokenCost(1000, 500, 'unknown-model');
      
      // Expected: (1000/1000000 * 2.0) + (500/1000000 * 2.0) = 0.002 + 0.001 = 0.003
      expect(result).toBeCloseTo(0.003);
    });

    test('should handle zero tokens', () => {
      const result = calculateTokenCost(0, 0, 'gpt-4o-mini');
      
      expect(result).toBe(0);
    });

    test('should handle large token counts', () => {
      const result = calculateTokenCost(1000000, 500000, 'gpt-4o-mini');
      
      // Expected: (1000000/1000000 * 0.15) + (500000/1000000 * 0.6) = 0.15 + 0.3 = 0.45
      expect(result).toBeCloseTo(0.45);
    });
  });

  describe('TOKEN_COSTS', () => {
    test('should have defined cost rates for known models', () => {
      expect(TOKEN_COSTS['gpt-4o-mini']).toBeDefined();
      expect(TOKEN_COSTS['gpt-4o-mini'].input).toBe(0.15);
      expect(TOKEN_COSTS['gpt-4o-mini'].output).toBe(0.6);
      
      expect(TOKEN_COSTS['gpt-4.1']).toBeDefined();
      expect(TOKEN_COSTS['gpt-4.1'].input).toBe(2.0);
      expect(TOKEN_COSTS['gpt-4.1'].output).toBe(8.0);
      
      expect(TOKEN_COSTS['default']).toBeDefined();
    });
  });

  describe('extractTokenUsage', () => {
    test('should extract actual token usage from AI response', () => {
      const mockAIMessage = {
        response_metadata: {
          tokenUsage: {
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150
          }
        }
      } as any;

      const result = extractTokenUsage(
        mockAIMessage,
        'You are a helpful assistant.',
        [{ role: 'user', content: 'Hello' }],
        'gpt-4o-mini'
      );

      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.isEstimated).toBe(false);
      expect(result.totalCost).toBeCloseTo(0.000045); // (100/1000000 * 0.15) + (50/1000000 * 0.6)
    });

    test('should extract from usage_metadata format', () => {
      const mockAIMessage = {
        usage_metadata: {
          input_tokens: 200,
          output_tokens: 100
        }
      } as any;

      const result = extractTokenUsage(
        mockAIMessage,
        'System prompt',
        [{ role: 'user', content: 'Test message' }],
        'gpt-4o-mini'
      );

      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(100);
      expect(result.isEstimated).toBe(false);
      expect(result.totalCost).toBeCloseTo(0.00009); // (200/1000000 * 0.15) + (100/1000000 * 0.6)
    });

    test('should estimate token usage when not available in response', () => {
      const mockAIMessage = {
        content: 'This is a test response'
      } as any;

      const result = extractTokenUsage(
        mockAIMessage,
        'You are a helpful assistant.',
        [{ role: 'user', content: 'Hello' }],
        'gpt-4o-mini'
      );

      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.isEstimated).toBe(true);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    test('should handle empty messages', () => {
      const mockAIMessage = {
        content: 'Response'
      } as any;

      const result = extractTokenUsage(
        mockAIMessage,
        'System prompt',
        [],
        'gpt-4o-mini'
      );

      expect(result.inputTokens).toBeGreaterThan(0); // at least system prompt tokens
      expect(result.outputTokens).toBeGreaterThan(0); // response tokens
      expect(result.isEstimated).toBe(true);
      expect(result.totalCost).toBeGreaterThan(0);
    });

    test('should handle different model types', () => {
      const mockAIMessage = {
        response_metadata: {
          tokenUsage: {
            promptTokens: 200,
            completionTokens: 100,
            totalTokens: 300
          }
        }
      } as any;

      const result = extractTokenUsage(
        mockAIMessage,
        'System prompt',
        [{ role: 'user', content: 'Test' }],
        'gpt-4.1'
      );

      expect(result.inputTokens).toBe(200);
      expect(result.outputTokens).toBe(100);
      expect(result.isEstimated).toBe(false);
      expect(result.totalCost).toBeCloseTo(0.0012); // (200/1000000 * 2.0) + (100/1000000 * 8.0)
    });
  });
}); 