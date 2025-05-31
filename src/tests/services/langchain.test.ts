import dotenv from 'dotenv';
import { getLangChainService } from '../../services/langchain';
import { SIMPLE_SYSTEM_PROMPT, WILDBERRIES_SYSTEM_PROMPT } from '../../utils/messageUtils';

// Load environment variables before tests
dotenv.config();

// Skip tests if OPENAI_API_KEY is not set
const hasApiKey = !!process.env.OPENAI_API_KEY;
const testGroup = hasApiKey ? describe : describe.skip;

describe('LangChain Service', () => {
  const langchainService = getLangChainService();
  const mockConversationId = '550e8400-e29b-41d4-a716-446655440000'; // Valid UUID format
  const mockUserId = '550e8400-e29b-41d4-a716-446655440001'; // Valid UUID format
  
  describe('System Prompts', () => {
    test('should have simple system prompt defined', () => {
      expect(SIMPLE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof SIMPLE_SYSTEM_PROMPT).toBe('string');
      expect(SIMPLE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
    });

    test('should have Wildberries system prompt defined', () => {
      expect(WILDBERRIES_SYSTEM_PROMPT).toBeDefined();
      expect(typeof WILDBERRIES_SYSTEM_PROMPT).toBe('string');
      expect(WILDBERRIES_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(WILDBERRIES_SYSTEM_PROMPT).toContain('Wildberries');
    });
  });

  describe('Service Initialization', () => {
    test('should initialize the service', () => {
      expect(langchainService).toBeDefined();
    });

    test('should create a chat model with default parameters', async () => {
      const model = await langchainService.createChatModel();
      expect(model).toBeDefined();
      expect(model.temperature).toBe(0.7);
    });

    test('should create a chat model with custom parameters', async () => {
      const model = await langchainService.createChatModel({
        temperature: 0.5,
        maxTokens: 1000,
        modelName: 'gpt-4o-mini',
      });
      
      expect(model).toBeDefined();
      expect(model.temperature).toBe(0.5);
      expect(model.maxTokens).toBe(1000);
    });

    test('should create an embedding model', () => {
      const model = langchainService.createEmbeddingModel();
      expect(model).toBeDefined();
    });
  });

  // Integration tests (only run when API key is available)
  testGroup('AI Processing', () => {
    test('should generate simple chat response', async () => {
      const response = await langchainService.generateChatResponse(
        SIMPLE_SYSTEM_PROMPT,
        'What is 2+2? Answer with just the number.',
        { userId: mockUserId }
      );

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
      expect(response.trim()).toContain('4');
    }, 15000);

    test('should generate conversation response (non-streaming)', async () => {
      const messages = [
        { role: 'user', content: 'Hello, what is 1+1?' }
      ];

      const response = await langchainService.generateConversationResponse(
        SIMPLE_SYSTEM_PROMPT,
        messages,
        {
          conversationId: mockConversationId,
          userId: mockUserId,
          stream: false
        }
      );

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    }, 15000);

    test('should handle Wildberries tools integration', async () => {
      const messages = [
        { role: 'user', content: 'Hello, I need help with my Wildberries business' }
      ];

      const response = await langchainService.generateConversationResponse(
        WILDBERRIES_SYSTEM_PROMPT,
        messages,
        {
          conversationId: mockConversationId,
          userId: mockUserId,
          stream: false,
          includeWildberriesTools: true
        }
      );

      expect(response).toBeDefined();
      expect(typeof response).toBe('string');
    }, 15000);

    test('should handle streaming response', async () => {
      const messages = [
        { role: 'user', content: 'Count from 1 to 3' }
      ];

      const response = await langchainService.generateConversationResponse(
        SIMPLE_SYSTEM_PROMPT,
        messages,
        {
          conversationId: mockConversationId,
          userId: mockUserId,
          stream: true
        }
      );

      expect(response).toBeDefined();
      expect(response).toBeInstanceOf(Response);
    }, 15000);
  });
}); 