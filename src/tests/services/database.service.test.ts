import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  getConversationById,
  createConversation,
  createMessage,
  getMessagesByConversationId,
  getUserConversations,
  updateConversation,
  deleteConversation
} from '../../infrastructure/database/database.service';

// Mock the Supabase client
jest.mock('../../infrastructure/database/supabase.client', () => ({
  getSupabaseClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          order: jest.fn(() => ({
            limit: jest.fn()
          }))
        })),
        order: jest.fn(() => ({
          limit: jest.fn()
        }))
      })),
      insert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      })),
      delete: jest.fn(() => ({
        eq: jest.fn()
      })),
      upsert: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }))
}));

// Mock logger
jest.mock('../../shared/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe('Database Service', () => {
  let mockSupabaseClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabaseClient = require('../../infrastructure/database/supabase.client').getSupabaseClient();
  });



  describe('Conversations', () => {
    test('should get conversation by id successfully', async () => {
      const mockConversation = {
        id: 'test-conv-id',
        title: 'Test Conversation',
        user_id: 'test-user-id',
        created_at: '2024-01-01T00:00:00Z'
      };

      mockSupabaseClient.from().select().eq().single.mockResolvedValue({
        data: mockConversation,
        error: null
      });

      const result = await getConversationById('test-conv-id');
      
      expect(result).toEqual(mockConversation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    });

    test('should handle conversation not found', async () => {
      mockSupabaseClient.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const result = await getConversationById('non-existent-id');
      
      expect(result).toBeNull();
    });

    test('should create conversation successfully', async () => {
      const mockConversation = {
        id: 'new-conv-id',
        title: 'New Conversation',
        user_id: 'test-user-id'
      };

      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: mockConversation,
        error: null
      });

      const result = await createConversation('test-user-id', 'New Conversation');
      
      expect(result).toEqual(mockConversation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    });

    test('should get conversations by user id', async () => {
      const mockConversations = [
        { id: 'conv-1', title: 'Conversation 1', user_id: 'test-user-id' },
        { id: 'conv-2', title: 'Conversation 2', user_id: 'test-user-id' }
      ];

      mockSupabaseClient.from().select().eq().order().limit.mockResolvedValue({
        data: mockConversations,
        error: null
      });

      const result = await getUserConversations('test-user-id');
      
      expect(result).toEqual(mockConversations);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    });
  });

  describe('Messages', () => {
    test('should create message successfully', async () => {
      const mockMessage = {
        id: 'msg-id',
        conversation_id: 'conv-id',
        content: 'Test message',
        role: 'user'
      };

      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        data: mockMessage,
        error: null
      });

      const result = await createMessage('conv-id', 'Test message', 'user');
      
      expect(result).toEqual(mockMessage);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('messages');
    });

    test('should get conversation messages', async () => {
      const mockMessages = [
        { id: 'msg-1', content: 'Hello', role: 'user' },
        { id: 'msg-2', content: 'Hi there', role: 'assistant' }
      ];

      mockSupabaseClient.from().select().eq().order().mockResolvedValue({
        data: mockMessages,
        error: null
      });

      const result = await getMessagesByConversationId('conv-id');
      
      expect(result).toEqual(mockMessages);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('messages');
    });

    test('should delete conversation successfully', async () => {
      mockSupabaseClient.from().delete().eq.mockResolvedValue({
        error: null
      });

      await deleteConversation('conv-id');
      
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    });

    test('should update conversation successfully', async () => {
      const mockConversation = {
        id: 'conv-id',
        title: 'Updated Title',
        user_id: 'test-user-id'
      };

      mockSupabaseClient.from().update().eq().select().single.mockResolvedValue({
        data: mockConversation,
        error: null
      });

      const result = await updateConversation('conv-id', { title: 'Updated Title' });
      
      expect(result).toEqual(mockConversation);
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('conversations');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      mockSupabaseClient.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      await expect(getConversationById('test-id')).rejects.toThrow('Database operation failed');
    });

    test('should handle unexpected errors', async () => {
      mockSupabaseClient.from().select().eq().single.mockRejectedValue(new Error('Network error'));

      await expect(getConversationById('test-id')).rejects.toThrow('Database operation failed');
    });
  });
}); 