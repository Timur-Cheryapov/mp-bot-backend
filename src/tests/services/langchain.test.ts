import dotenv from 'dotenv';
import { getLangChainService, MODEL_CONFIGS } from '../../services/langchain';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { invokeWithRetry } from '../../utils/langchainUtils';

// Load environment variables before tests
dotenv.config();

// Skip tests if OPENAI_API_KEY is not set
const hasApiKey = !!process.env.OPENAI_API_KEY;
const testGroup = hasApiKey ? describe : describe.skip;

testGroup('LangChain Service', () => {
  const langchainService = getLangChainService();
  
  test('should initialize the service', () => {
    expect(langchainService).toBeDefined();
  });
  
  test('should create a chat model with default parameters', () => {
    const model = langchainService.createChatModel();
    expect(model).toBeDefined();
    expect(model.temperature).toBe(0.7);
    expect(model.modelName).toBe(MODEL_CONFIGS.GPT4O_MINI);
  });
  
  test('should create a chat model with custom parameters', () => {
    const model = langchainService.createChatModel({
      temperature: 0.5,
      maxTokens: 1000,
      modelName: MODEL_CONFIGS.GPT4O_MINI,
    });
    
    expect(model).toBeDefined();
    expect(model.temperature).toBe(0.5);
    expect(model.maxTokens).toBe(1000);
    expect(model.modelName).toBe(MODEL_CONFIGS.GPT4O_MINI);
  });
  
  test('should create an embedding model', () => {
    const model = langchainService.createEmbeddingModel();
    expect(model).toBeDefined();
  });
  
  test('should create a chat prompt template', () => {
    const systemPrompt = 'You are a helpful assistant.';
    const humanPrompt = 'Hello, {name}!';
    
    const template = langchainService.createChatPromptTemplate(systemPrompt, humanPrompt);
    
    expect(template).toBeDefined();
  });
  
  // Integration tests (only run when OPENAI_API_KEY is available)
  if (hasApiKey) {
    test('should verify connection to OpenAI API', async () => {
      const isConnected = await langchainService.verifyConnection();
      expect(isConnected).toBe(true);
    }, 10000); // Increase timeout for API call
    
    test('should invoke a model with retry logic', async () => {
      const model = langchainService.createChatModel({
        temperature: 0,
        maxTokens: 50,
      });
      
      const messages = [
        new SystemMessage('You are a helpful assistant that responds in one word.'),
        new HumanMessage('What is 1+1?')
      ];
      
      const response = await invokeWithRetry(model, messages);
      expect(response).toBeDefined();
      expect(response.content).toContain('2');
    }, 10000); // Increase timeout for API call
  }
}); 