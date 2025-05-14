import { getPromptService } from '../../services/promptService';
import {
  generalSystemPrompt,
  generalUserPrompt,
  generalConversationChain,
  registerAllChains,
  PromptVariables,
  ModelType
} from '../../prompts';
import { getLangChainService } from '../../services/langchain';

describe('Prompt Service', () => {
  const promptService = getPromptService();
  const langchainService = getLangChainService();
  
  // Register the chains for testing
  registerAllChains();
  
  describe('Basic Prompt Functions', () => {
    test('should register and retrieve a prompt', () => {
      const promptId = promptService.registerPrompt(generalSystemPrompt);
      expect(promptId).toBeDefined();
      
      const retrieved = promptService.getPrompt(promptId);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(generalSystemPrompt);
    });
    
    test('should register and retrieve a chain', () => {
      const chainId = promptService.registerChain(generalConversationChain);
      expect(chainId).toBeDefined();
      
      const retrieved = promptService.getChain(chainId);
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(generalConversationChain);
    });
  });
  
  describe('Prompt Rendering', () => {
    test('should render a prompt with variables', () => {
      const variables: PromptVariables = {
        context: 'I am researching AI technology.',
        query: 'How does LangChain work?'
      };
      
      const rendered = promptService.renderPrompt(generalUserPrompt, variables);
      
      expect(rendered).toContain('I am researching AI technology.');
      expect(rendered).toContain('How does LangChain work?');
    });
    
    test('should apply rendering options', () => {
      const variables: PromptVariables = {
        context: 'Multiple    spaces    here.',
        query: 'Remove extra whitespace?'
      };
      
      const rendered = promptService.renderPrompt(generalUserPrompt, variables, {
        trimWhitespace: true,
        maxLength: 20
      });
      
      // Should collapse multiple spaces and truncate
      expect(rendered.length).toBeLessThanOrEqual(20);
      expect(rendered).not.toContain('    ');
    });
  });
  
  describe('Chain Rendering and Conversion', () => {
    test('should render a full chain', () => {
      const variables: PromptVariables = {
        context: 'Testing context',
        query: 'Test query'
      };
      
      const chainId = promptService.registerChain(generalConversationChain);
      const renderedChain = promptService.renderChain(chainId, variables);
      
      expect(renderedChain.length).toBe(generalConversationChain.prompts.length);
      expect(renderedChain[1]).toContain('Test query');
    });
    
    test('should convert prompt chain to LangChain format', () => {
      const langChainPrompt = promptService.createLangChainPrompt(generalConversationChain);
      
      expect(langChainPrompt).toBeDefined();
      expect(typeof langChainPrompt.format).toBe('function');
    });
    
    test('should create a conversation chain with memory', () => {
      const conversationChain = promptService.createConversationChain(
        'You are a helpful assistant.'
      );
      
      expect(conversationChain).toBeDefined();
      expect(typeof conversationChain.format).toBe('function');
    });
  });
  
  // Skip execution tests if no API key
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  const executionTest = hasApiKey ? test : test.skip;
  
  describe('Chain Execution', () => {
    executionTest('should execute a prompt chain', async () => {
      // Register a simple chain for testing
      const testChain = {
        metadata: {
          name: 'test-chain',
          description: 'Test chain',
          version: '1.0.0',
        },
        prompts: [
          {
            metadata: {
              name: 'test-system',
              description: 'Test system prompt',
              version: '1.0.0',
            },
            template: 'You are a helpful assistant that provides short answers.',
            type: generalSystemPrompt.type,
            variables: [],
          },
          {
            metadata: {
              name: 'test-user',
              description: 'Test user prompt',
              version: '1.0.0',
            },
            template: 'What is {number} + {number}?',
            type: generalUserPrompt.type,
            variables: ['number'],
          }
        ],
        modelType: ModelType.GeneralPurpose,
      };
      
      const chainId = promptService.registerChain(testChain);
      
      const result = await promptService.executeChain(chainId, { number: 1 });
      
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    }, 10000); // Longer timeout for API call
  });
  
  describe('Token Estimation', () => {
    test('should estimate token count for a prompt', () => {
      const variables: PromptVariables = {
        context: 'This is a test context.',
        query: 'How many tokens does this use?'
      };
      
      const tokenCount = promptService.estimateTokenCount(generalUserPrompt, variables);
      
      expect(typeof tokenCount).toBe('number');
      expect(tokenCount).toBeGreaterThan(0);
    });
  });
}); 