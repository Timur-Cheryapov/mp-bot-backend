import request from 'supertest';
import express from 'express';
import conversationRoutes from '../../api/conversations/conversations.routes';
import * as databaseService from '../../infrastructure/database/database.service';
import * as conversationService from '../../core/conversations/conversations.service';
import { getLangChainService } from '../../core/ai/langchain.service';
import { handleStreamingResponse } from '../../core/conversations/streaming.utils';
import { convertConversationToUi, convertMessageToUi } from '../../shared/utils/ui-converters';
import logger from '../../shared/utils/logger';
import { MessageRole, MessageStatus } from '../../shared/types/conversation.types';
import { Message } from '../../infrastructure/database/supabase.client';
import { BaseMessage } from '@langchain/core/messages';

// Mock all dependencies
jest.mock('../../infrastructure/database/database.service');
jest.mock('../../core/conversations/conversations.service');
jest.mock('../../core/ai/langchain.service');
jest.mock('../../core/conversations/streaming.utils');
jest.mock('../../shared/utils/ui-converters');
jest.mock('../../shared/utils/logger');
jest.mock('../../shared/middleware', () => ({
  asyncHandler: (fn: any) => fn,
  authenticate: (req: any, res: any, next: any) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
  }
}));

const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>;
const mockConversationService = conversationService as jest.Mocked<typeof conversationService>;
const mockGetLangChainService = getLangChainService as jest.MockedFunction<typeof getLangChainService>;
const mockHandleStreamingResponse = handleStreamingResponse as jest.MockedFunction<typeof handleStreamingResponse>;
const mockConvertConversationToUi = convertConversationToUi as jest.MockedFunction<typeof convertConversationToUi>;
const mockConvertMessageToUi = convertMessageToUi as jest.MockedFunction<typeof convertMessageToUi>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('Conversations Routes', () => {
  let app: express.Application;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com'
  };

  const mockConversation = {
    id: 'conv-123',
    user_id: 'user-123',
    title: 'Test Conversation',
    system_prompt: 'You are a helpful assistant',
    archived: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z'
  };

  const mockMessage: Message = {
    id: 'msg-123',
    conversation_id: 'conv-123',
    role: 'user' as MessageRole,
    content: 'Hello',
    created_at: '2024-01-01T00:00:00Z',
    status: 'success' as MessageStatus
  };

  const mockConversationUi = {
    id: 'conv-123',
    title: 'Test Conversation',
    archived: false,
    updatedAt: '2024-01-01T00:00:00Z'
  };

  const mockMessageUi = {
    role: 'user' as MessageRole,
    content: 'Hello',
    timestamp: '2024-01-01T00:00:00Z',
    status: 'success' as MessageStatus
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/conversations', conversationRoutes);

    // Reset all mocks
    jest.clearAllMocks();

    // Setup default mock returns
    mockConvertConversationToUi.mockReturnValue(mockConversationUi);
    mockConvertMessageToUi.mockReturnValue(mockMessageUi);
  });

  describe('GET /', () => {
    test('should get user conversations with default parameters', async () => {
      const mockConversations = [mockConversation];
      mockDatabaseService.getUserConversations.mockResolvedValue(mockConversations);

      const response = await request(app)
        .get('/conversations')
        .expect(200);

      expect(mockDatabaseService.getUserConversations).toHaveBeenCalledWith('user-123', {
        includeArchived: false,
        limit: 20,
        offset: 0
      });
      expect(mockConvertConversationToUi).toHaveBeenCalledWith(mockConversation, 0, [mockConversation]);
      expect(response.body).toEqual({
        conversations: [mockConversationUi]
      });
    });

    test('should get user conversations with custom parameters', async () => {
      const mockConversations = [mockConversation];
      mockDatabaseService.getUserConversations.mockResolvedValue(mockConversations);

      await request(app)
        .get('/conversations?includeArchived=true&limit=10&offset=5')
        .expect(200);

      expect(mockDatabaseService.getUserConversations).toHaveBeenCalledWith('user-123', {
        includeArchived: true,
        limit: 10,
        offset: 5
      });
    });

    test('should handle database errors', async () => {
      mockDatabaseService.getUserConversations.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/conversations')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /:conversationId', () => {
    test('should get conversation with messages', async () => {
      const mockMessages = [mockMessage];
      mockDatabaseService.getMessagesByConversationId.mockResolvedValue(mockMessages);
      mockDatabaseService.getConversationById.mockResolvedValue(mockConversation);

      const response = await request(app)
        .get('/conversations/conv-123')
        .expect(200);

      expect(mockDatabaseService.getMessagesByConversationId).toHaveBeenCalledWith('conv-123');
      expect(mockDatabaseService.getConversationById).toHaveBeenCalledWith('conv-123');
      expect(response.body).toEqual({
        conversation: mockConversationUi,
        messages: [mockMessageUi]
      });
    });

    test('should handle non-existent conversation', async () => {
      const mockMessages: Message[] = [];
      mockDatabaseService.getMessagesByConversationId.mockResolvedValue(mockMessages);
      mockDatabaseService.getConversationById.mockResolvedValue(null);

      const response = await request(app)
        .get('/conversations/non-existent')
        .expect(200);

      expect(response.body).toEqual({
        conversation: null,
        messages: []
      });
    });

    test('should handle database errors', async () => {
      mockDatabaseService.getMessagesByConversationId.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/conversations/conv-123')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /', () => {
    const mockLangChainService = {
      generateConversationTitle: jest.fn()
    };

    beforeEach(() => {
      mockGetLangChainService.mockReturnValue(mockLangChainService as any);
    });

    test('should create new conversation and get AI response', async () => {
      const requestBody = {
        message: 'Hello AI',
        title: 'Test Title'
      };

      mockLangChainService.generateConversationTitle.mockResolvedValue('Generated Title');
      mockConversationService.getOrCreateConversation.mockResolvedValue(mockConversation);
      mockConversationService.generateAndSaveResponse.mockResolvedValue({ 
        response: [] as BaseMessage[], 
        conversationId: 'conv-123' 
      });
      mockConversationService.getConversationHistory.mockResolvedValue([mockMessage]);

      const response = await request(app)
        .post('/conversations')
        .send(requestBody)
        .expect(200);

      expect(mockConversationService.getOrCreateConversation).toHaveBeenCalledWith(
        'user-123',
        null,
        'Generated Title',
        expect.any(String)
      );
      expect(mockConversationService.generateAndSaveResponse).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        'Hello AI',
        expect.any(String),
        false,
        expect.any(AbortSignal)
      );
      expect(response.body).toHaveProperty('messages');
      expect(response.body).toHaveProperty('conversation');
    });

    test('should use existing conversation when conversationId provided', async () => {
      const requestBody = {
        message: 'Hello AI',
        conversationId: 'conv-123'
      };

      mockDatabaseService.getConversationById.mockResolvedValue(mockConversation);
      mockConversationService.generateAndSaveResponse.mockResolvedValue({ 
        response: [] as BaseMessage[], 
        conversationId: 'conv-123' 
      });
      mockConversationService.getConversationHistory.mockResolvedValue([mockMessage]);

      const response = await request(app)
        .post('/conversations')
        .send(requestBody)
        .expect(200);

      expect(mockDatabaseService.getConversationById).toHaveBeenCalledWith('conv-123');
      expect(mockConversationService.generateAndSaveResponse).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        'Hello AI',
        'You are a helpful assistant',
        false,
        expect.any(AbortSignal)
      );
      expect(response.body).toHaveProperty('messages');
    });

    test('should handle streaming response', async () => {
      const requestBody = {
        message: 'Hello AI',
        stream: true
      };

      mockConversationService.getOrCreateConversation.mockResolvedValue(mockConversation);
      mockConversationService.generateAndSaveResponse.mockResolvedValue({ 
        response: [] as BaseMessage[], 
        conversationId: 'conv-123' 
      });
      mockHandleStreamingResponse.mockResolvedValue(undefined);

      // Mock the request to not actually hang
      const response = request(app)
        .post('/conversations')
        .send(requestBody);
        
      // End the response immediately
      setTimeout(() => {
        response.abort();
      }, 100);

      try {
        await response;
      } catch (error) {
        // Expected - request was aborted
      }

      expect(mockConversationService.getOrCreateConversation).toHaveBeenCalled();
    });

    test('should handle conversation not found error', async () => {
      const requestBody = {
        message: 'Hello AI',
        conversationId: 'non-existent'
      };

      mockDatabaseService.getConversationById.mockResolvedValue(null);

      const response = await request(app)
        .post('/conversations')
        .send(requestBody)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle missing message validation', async () => {
      const requestBody = {};

      const response = await request(app)
        .post('/conversations')
        .send(requestBody)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should fallback to default title when AI generation fails', async () => {
      const requestBody = {
        message: 'Hello AI'
      };

      mockLangChainService.generateConversationTitle.mockRejectedValue(new Error('AI error'));
      mockConversationService.getOrCreateConversation.mockResolvedValue(mockConversation);
      mockConversationService.generateAndSaveResponse.mockResolvedValue({ 
        response: [] as BaseMessage[], 
        conversationId: 'conv-123' 
      });
      mockConversationService.getConversationHistory.mockResolvedValue([mockMessage]);

      await request(app)
        .post('/conversations')
        .send(requestBody)
        .expect(200);

      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockConversationService.getOrCreateConversation).toHaveBeenCalledWith(
        'user-123',
        null,
        'New Conversation',
        expect.any(String)
      );
    });
  });

  describe('POST /:conversationId', () => {
    test('should send message to existing conversation', async () => {
      const requestBody = {
        message: 'Hello AI'
      };

      mockDatabaseService.getConversationById.mockResolvedValue(mockConversation);
      mockConversationService.generateAndSaveResponse.mockResolvedValue({ 
        response: [] as BaseMessage[], 
        conversationId: 'conv-123' 
      });
      mockConversationService.getConversationHistory.mockResolvedValue([mockMessage]);

      const response = await request(app)
        .post('/conversations/conv-123')
        .send(requestBody)
        .expect(200);

      expect(mockDatabaseService.getConversationById).toHaveBeenCalledWith('conv-123');
      expect(mockConversationService.generateAndSaveResponse).toHaveBeenCalledWith(
        'user-123',
        'conv-123',
        'Hello AI',
        'You are a helpful assistant',
        false,
        expect.any(AbortSignal)
      );
      expect(response.body).toHaveProperty('messages');
    });

    test('should handle conversation not found', async () => {
      const requestBody = {
        message: 'Hello AI'
      };

      mockDatabaseService.getConversationById.mockResolvedValue(null);

      const response = await request(app)
        .post('/conversations/non-existent')
        .send(requestBody)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PATCH /:conversationId', () => {
    test('should update conversation title', async () => {
      const requestBody = {
        title: 'Updated Title'
      };

      mockDatabaseService.updateConversationTitle.mockResolvedValue(undefined);

      const response = await request(app)
        .patch('/conversations/conv-123')
        .send(requestBody)
        .expect(200);

      expect(mockDatabaseService.updateConversationTitle).toHaveBeenCalledWith('conv-123', 'Updated Title');
      expect(response.body).toEqual({ success: true });
    });

    test('should handle missing title validation', async () => {
      const requestBody = {};

      const response = await request(app)
        .patch('/conversations/conv-123')
        .send(requestBody)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle database errors', async () => {
      const requestBody = {
        title: 'Updated Title'
      };

      mockDatabaseService.updateConversationTitle.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .patch('/conversations/conv-123')
        .send(requestBody)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:conversationId/archive', () => {
    test('should archive conversation', async () => {
      mockDatabaseService.archiveConversation.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/conversations/conv-123/archive')
        .expect(200);

      expect(mockDatabaseService.archiveConversation).toHaveBeenCalledWith('conv-123');
      expect(response.body).toEqual({ success: true });
    });

    test('should handle database errors', async () => {
      mockDatabaseService.archiveConversation.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/conversations/conv-123/archive')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /:conversationId/unarchive', () => {
    test('should unarchive conversation', async () => {
      mockDatabaseService.unarchiveConversation.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/conversations/conv-123/unarchive')
        .expect(200);

      expect(mockDatabaseService.unarchiveConversation).toHaveBeenCalledWith('conv-123');
      expect(response.body).toEqual({ success: true });
    });

    test('should handle database errors', async () => {
      mockDatabaseService.unarchiveConversation.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/conversations/conv-123/unarchive')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /:conversationId', () => {
    test('should delete conversation', async () => {
      mockDatabaseService.deleteConversation.mockResolvedValue(undefined);

      const response = await request(app)
        .delete('/conversations/conv-123')
        .expect(200);

      expect(mockDatabaseService.deleteConversation).toHaveBeenCalledWith('conv-123');
      expect(response.body).toEqual({ success: true });
    });

    test('should handle database errors', async () => {
      mockDatabaseService.deleteConversation.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .delete('/conversations/conv-123')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
}); 