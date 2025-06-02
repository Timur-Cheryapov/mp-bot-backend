import { 
  validateWildberriesToolsRequirements, 
  validateApiKey 
} from '../../shared/utils/validation.utils';

describe('Validation Utils', () => {
  describe('validateWildberriesToolsRequirements', () => {
    test('should not throw when includeWildberriesTools is false', () => {
      expect(() => validateWildberriesToolsRequirements(false)).not.toThrow();
      expect(() => validateWildberriesToolsRequirements(false, undefined)).not.toThrow();
    });

    test('should not throw when includeWildberriesTools is true and userId is provided', () => {
      expect(() => validateWildberriesToolsRequirements(true, 'user123')).not.toThrow();
    });

    test('should throw error when includeWildberriesTools is true but userId is missing', () => {
      expect(() => validateWildberriesToolsRequirements(true)).toThrow(
        'userId is required when includeWildberriesTools is true'
      );
      
      expect(() => validateWildberriesToolsRequirements(true, undefined)).toThrow(
        'userId is required when includeWildberriesTools is true'
      );
    });

    test('should throw error when includeWildberriesTools is true and userId is empty string', () => {
      expect(() => validateWildberriesToolsRequirements(true, '')).toThrow(
        'userId is required when includeWildberriesTools is true'
      );
    });
  });

  describe('validateApiKey', () => {
    test('should not throw when API key is provided', () => {
      expect(() => validateApiKey('sk-test-key')).not.toThrow();
      expect(() => validateApiKey('valid-api-key')).not.toThrow();
    });

    test('should throw error when API key is undefined', () => {
      expect(() => validateApiKey(undefined)).toThrow(
        'OpenAI API key is not defined in environment variables'
      );
    });

    test('should throw error when API key is empty string', () => {
      expect(() => validateApiKey('')).toThrow(
        'OpenAI API key is not defined in environment variables'
      );
    });

    test('should throw error when API key is null', () => {
      expect(() => validateApiKey(null as any)).toThrow(
        'OpenAI API key is not defined in environment variables'
      );
    });
  });
}); 