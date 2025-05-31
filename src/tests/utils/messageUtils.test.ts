import { 
  convertToLangChainMessages, 
  SIMPLE_SYSTEM_PROMPT, 
  WILDBERRIES_SYSTEM_PROMPT,
  WILDBERRIES_EXTENDED_SYSTEM_PROMPT 
} from '../../utils/messageUtils';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';

describe('Message Utils', () => {
  describe('System Prompts', () => {
    test('should have simple system prompt defined', () => {
      expect(SIMPLE_SYSTEM_PROMPT).toBeDefined();
      expect(typeof SIMPLE_SYSTEM_PROMPT).toBe('string');
      expect(SIMPLE_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(SIMPLE_SYSTEM_PROMPT).toContain('helpful, knowledgeable, and friendly AI assistant');
    });

    test('should have Wildberries system prompt defined', () => {
      expect(WILDBERRIES_SYSTEM_PROMPT).toBeDefined();
      expect(typeof WILDBERRIES_SYSTEM_PROMPT).toBe('string');
      expect(WILDBERRIES_SYSTEM_PROMPT.length).toBeGreaterThan(0);
      expect(WILDBERRIES_SYSTEM_PROMPT).toContain('Wildberries');
    });

    test('should have extended Wildberries system prompt defined', () => {
      expect(WILDBERRIES_EXTENDED_SYSTEM_PROMPT).toBeDefined();
      expect(typeof WILDBERRIES_EXTENDED_SYSTEM_PROMPT).toBe('string');
      expect(WILDBERRIES_EXTENDED_SYSTEM_PROMPT.length).toBeGreaterThan(WILDBERRIES_SYSTEM_PROMPT.length);
      expect(WILDBERRIES_EXTENDED_SYSTEM_PROMPT).toContain('Wildberries');
    });
  });

  describe('convertToLangChainMessages', () => {
    test('should convert basic messages correctly', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ];

      const result = convertToLangChainMessages(SIMPLE_SYSTEM_PROMPT, messages);

      expect(result).toHaveLength(3); // system + 2 messages
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[0].content).toBe(SIMPLE_SYSTEM_PROMPT);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[1].content).toBe('Hello');
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[2].content).toBe('Hi there!');
    });

    test('should handle tool messages correctly', () => {
      const messages = [
        { role: 'user', content: 'Search for products' },
        { 
          role: 'assistant', 
          content: 'I\'ll search for products',
          tool_calls: [{ id: 'call_123', name: 'search_products', args: {} }]
        },
        { 
          role: 'tool', 
          content: 'Found 5 products',
          tool_call_id: 'call_123',
          tool_name: 'search_products'
        }
      ];

      const result = convertToLangChainMessages(SIMPLE_SYSTEM_PROMPT, messages);

      expect(result).toHaveLength(4); // system + 3 messages
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[3]).toBeInstanceOf(ToolMessage);
      expect(result[3].content).toBe('Found 5 products');
      expect((result[3] as ToolMessage).tool_call_id).toBe('call_123');
    });

    test('should handle empty messages array', () => {
      const result = convertToLangChainMessages(SIMPLE_SYSTEM_PROMPT, []);

      expect(result).toHaveLength(1); // only system message
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[0].content).toBe(SIMPLE_SYSTEM_PROMPT);
    });

    test('should handle mixed message types', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I\'m good, thanks!' }
      ];

      const result = convertToLangChainMessages(WILDBERRIES_SYSTEM_PROMPT, messages);

      expect(result).toHaveLength(5); // system + 4 messages
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect(result[0].content).toBe(WILDBERRIES_SYSTEM_PROMPT);
      
      // Check alternating pattern
      expect(result[1]).toBeInstanceOf(HumanMessage);
      expect(result[2]).toBeInstanceOf(AIMessage);
      expect(result[3]).toBeInstanceOf(HumanMessage);
      expect(result[4]).toBeInstanceOf(AIMessage);
    });
  });
}); 