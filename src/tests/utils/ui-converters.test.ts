import { describe, test, expect } from '@jest/globals';
import { convertConversationToUi, convertMessageToUi } from '../../shared/utils/ui-converters';
import { Conversation, Message } from '../../infrastructure/database/supabase.client';

describe('UI Converters', () => {
  describe('convertConversationToUi', () => {
    test('should convert basic conversation with all fields', () => {
      const conversation: Conversation = {
        id: 'conv-123',
        title: 'Test Conversation',
        user_id: 'user-456',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T12:00:00Z',
        is_archived: true,
        model_name: 'gpt-4',
        system_prompt: 'Test prompt',
        temperature: 0.7,
        max_tokens: 1000,
        context_length: 4096,
        message_count: 5,
        metadata: { test: 'data' }
      };

      const result = convertConversationToUi(conversation);

      expect(result).toEqual({
        id: 'conv-123',
        title: 'Test Conversation',
        archived: true,
        updatedAt: '2024-01-02T12:00:00Z'
      });
    });

    test('should handle conversation without optional fields', () => {
      const conversation: Conversation = {
        id: 'conv-789',
        title: 'Simple Conversation',
        user_id: 'user-999',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = convertConversationToUi(conversation);

      expect(result).toEqual({
        id: 'conv-789',
        title: 'Simple Conversation',
        archived: false,
        updatedAt: '2024-01-01T00:00:00Z' // Should fall back to created_at
      });
    });

    test('should handle conversation with is_archived as false', () => {
      const conversation: Conversation = {
        id: 'conv-456',
        title: 'Active Conversation',
        user_id: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T06:00:00Z',
        is_archived: false
      };

      const result = convertConversationToUi(conversation);

      expect(result).toEqual({
        id: 'conv-456',
        title: 'Active Conversation',
        archived: false,
        updatedAt: '2024-01-01T06:00:00Z'
      });
    });

    test('should handle conversation with null/undefined is_archived', () => {
      const conversation: Conversation = {
        id: 'conv-null',
        title: 'Null Archive Conversation',
        user_id: 'user-456',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        is_archived: undefined
      };

      const result = convertConversationToUi(conversation);

      expect(result.archived).toBe(false);
    });

    test('should prioritize updated_at over created_at when both exist', () => {
      const conversation: Conversation = {
        id: 'conv-updated',
        title: 'Updated Conversation',
        user_id: 'user-789',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-05T10:30:00Z'
      };

      const result = convertConversationToUi(conversation);

      expect(result.updatedAt).toBe('2024-01-05T10:30:00Z');
    });

    test('should handle conversation with empty string title', () => {
      const conversation: Conversation = {
        id: 'conv-empty',
        title: '',
        user_id: 'user-empty',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = convertConversationToUi(conversation);

      expect(result.title).toBe('');
    });
  });

  describe('convertMessageToUi', () => {
    test('should convert complete message with all fields', () => {
      const message: Message = {
        id: 'msg-123',
        conversation_id: 'conv-456',
        content: 'Hello, how are you?',
        role: 'user',
        status: 'success',
        created_at: '2024-01-01T10:00:00Z',
        tool_calls: [],
        tool_call_id: 'tool-123',
        tool_name: 'search',
        metadata: { test: 'data' }
      };

      const result = convertMessageToUi(message);

      expect(result).toEqual({
        role: 'user',
        content: 'Hello, how are you?',
        status: 'success',
        timestamp: '2024-01-01T10:00:00Z'
      });
    });

    test('should handle message without optional status field', () => {
      const message: Message = {
        id: 'msg-789',
        conversation_id: 'conv-123',
        content: 'AI response here',
        role: 'assistant',
        created_at: '2024-01-01T10:05:00Z'
      };

      const result = convertMessageToUi(message);

      expect(result).toEqual({
        role: 'assistant',
        content: 'AI response here',
        status: 'success', // Should default to 'success'
        timestamp: '2024-01-01T10:05:00Z'
      });
    });

    test('should handle tool message with different statuses', () => {
      const statuses: Array<'pending' | 'success' | 'error' | 'aborted'> = ['pending', 'success', 'error', 'aborted'];

      statuses.forEach(status => {
        const message: Message = {
          id: `msg-${status}`,
          conversation_id: 'conv-tool',
          content: `Tool result for ${status}`,
          role: 'tool',
          status: status,
          created_at: '2024-01-01T11:00:00Z',
          tool_call_id: 'tool-call-123',
          tool_name: 'search'
        };

        const result = convertMessageToUi(message);

        expect(result.status).toBe(status);
        expect(result.role).toBe('tool');
        expect(result.content).toBe(`Tool result for ${status}`);
      });
    });

    test('should handle user message with different roles', () => {
      const roles: Array<'user' | 'assistant' | 'tool'> = ['user', 'assistant', 'tool'];

      roles.forEach(role => {
        const message: Message = {
          id: `msg-${role}`,
          conversation_id: 'conv-roles',
          content: `Content from ${role}`,
          role: role,
          created_at: '2024-01-01T12:00:00Z'
        };

        const result = convertMessageToUi(message);

        expect(result.role).toBe(role);
        expect(result.content).toBe(`Content from ${role}`);
        expect(result.status).toBe('success'); // Default status
      });
    });

    test('should handle message with empty content', () => {
      const message: Message = {
        id: 'msg-empty',
        conversation_id: 'conv-empty',
        content: '',
        role: 'user',
        created_at: '2024-01-01T13:00:00Z'
      };

      const result = convertMessageToUi(message);

      expect(result.content).toBe('');
      expect(result.role).toBe('user');
      expect(result.status).toBe('success');
    });

    test('should handle message with complex content (JSON, multiline, etc.)', () => {
      const complexContent = `{
        "type": "complex",
        "data": {
          "multiline": "yes",
          "special": "chars: !@#$%^&*()"
        }
      }`;

      const message: Message = {
        id: 'msg-complex',
        conversation_id: 'conv-complex',
        content: complexContent,
        role: 'assistant',
        status: 'success',
        created_at: '2024-01-01T14:00:00Z'
      };

      const result = convertMessageToUi(message);

      expect(result.content).toBe(complexContent);
      expect(result.role).toBe('assistant');
      expect(result.status).toBe('success');
    });

    test('should handle message with null status defaulting to success', () => {
      const message: Message = {
        id: 'msg-null-status',
        conversation_id: 'conv-null',
        content: 'Message with null status',
        role: 'user',
        status: null as any,
        created_at: '2024-01-01T15:00:00Z'
      };

      const result = convertMessageToUi(message);

      expect(result.status).toBe('success');
    });

    test('should handle message with undefined status defaulting to success', () => {
      const message: Message = {
        id: 'msg-undefined-status',
        conversation_id: 'conv-undefined',
        content: 'Message with undefined status',
        role: 'assistant',
        status: undefined,
        created_at: '2024-01-01T16:00:00Z'
      };

      const result = convertMessageToUi(message);

      expect(result.status).toBe('success');
    });
  });

  describe('edge cases and type safety', () => {
    test('should maintain type safety for conversation conversion', () => {
      const conversation: Conversation = {
        id: 'type-test',
        title: 'Type Safety Test',
        user_id: 'user-type',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = convertConversationToUi(conversation);

      // TypeScript should enforce these types
      expect(typeof result.id).toBe('string');
      expect(typeof result.title).toBe('string');
      expect(typeof result.archived).toBe('boolean');
      expect(typeof result.updatedAt).toBe('string');
    });

    test('should maintain type safety for message conversion', () => {
      const message: Message = {
        id: 'type-test-msg',
        conversation_id: 'conv-type',
        content: 'Type test content',
        role: 'user',
        created_at: '2024-01-01T00:00:00Z'
      };

      const result = convertMessageToUi(message);

      // TypeScript should enforce these types
      expect(typeof result.content).toBe('string');
      expect(['user', 'assistant', 'tool']).toContain(result.role);
      expect(['pending', 'success', 'error', 'aborted']).toContain(result.status);
      expect(typeof result.timestamp).toBe('string');
    });
  });
}); 