import { 
  getOrCreateConversation, 
  saveMessage, 
  getConversationHistory 
} from '../../services/conversationService';

// Mock the database service
jest.mock('../../services/database', () => ({
  getConversationById: jest.fn(),
  createConversation: jest.fn(),
  createMessage: jest.fn(),
  getMessagesByConversationId: jest.fn()
}));

// Mock the langchain service
jest.mock('../../services/langchain', () => ({
  getLangChainService: jest.fn(() => ({
    generateConversationResponse: jest.fn()
  }))
}));

import * as databaseService from '../../services/database';

describe('Conversation Service', () => {
  const mockUserId = 'test-user-123';
  const mockConversationId = 'test-conv-123';
  const mockTitle = 'Test Conversation';
  const mockSystemPrompt = 'You are a helpful assistant.';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateConversation', () => {
    test('should return existing conversation when valid ID is provided', async () => {
      const mockConversation = {
        id: mockConversationId,
        user_id: mockUserId,
        title: mockTitle,
        system_prompt: mockSystemPrompt
      };

      (databaseService.getConversationById as jest.Mock).mockResolvedValue(mockConversation);

      const result = await getOrCreateConversation(
        mockUserId,
        mockConversationId,
        mockTitle,
        mockSystemPrompt
      );

      expect(result).toEqual(mockConversation);
      expect(databaseService.getConversationById).toHaveBeenCalledWith(mockConversationId);
      expect(databaseService.createConversation).not.toHaveBeenCalled();
    });

    test('should throw error when conversation ID is provided but not found', async () => {
      (databaseService.getConversationById as jest.Mock).mockResolvedValue(null);

      await expect(getOrCreateConversation(
        mockUserId,
        mockConversationId,
        mockTitle,
        mockSystemPrompt
      )).rejects.toThrow('Conversation not found');

      expect(databaseService.getConversationById).toHaveBeenCalledWith(mockConversationId);
      expect(databaseService.createConversation).not.toHaveBeenCalled();
    });

    test('should create new conversation when no ID is provided', async () => {
      const mockNewConversation = {
        id: 'new-conv-123',
        user_id: mockUserId,
        title: mockTitle,
        system_prompt: mockSystemPrompt
      };

      (databaseService.createConversation as jest.Mock).mockResolvedValue(mockNewConversation);

      const result = await getOrCreateConversation(
        mockUserId,
        null,
        mockTitle,
        mockSystemPrompt
      );

      expect(result).toEqual(mockNewConversation);
      expect(databaseService.createConversation).toHaveBeenCalledWith(
        mockUserId,
        mockTitle,
        {
          system_prompt: mockSystemPrompt,
          model_name: 'gpt-4o-mini',
          context_length: 200_000,
          message_count: 0
        }
      );
      expect(databaseService.getConversationById).not.toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      (databaseService.createConversation as jest.Mock).mockRejectedValue(dbError);

      await expect(getOrCreateConversation(
        mockUserId,
        null,
        mockTitle,
        mockSystemPrompt
      )).rejects.toThrow('Database connection failed');
    });
  });

  describe('saveMessage', () => {
    test('should save message successfully', async () => {
      const mockMessage = {
        id: 'msg-123',
        conversation_id: mockConversationId,
        content: 'Hello world',
        role: 'user'
      };

      (databaseService.createMessage as jest.Mock).mockResolvedValue(mockMessage);

      const result = await saveMessage(
        mockConversationId,
        'Hello world',
        'user',
        { timestamp: Date.now() }
      );

      expect(result).toEqual(mockMessage);
      expect(databaseService.createMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Hello world',
        'user',
        { timestamp: expect.any(Number) }
      );
    });

    test('should handle save errors gracefully', async () => {
      const saveError = new Error('Failed to save message');
      (databaseService.createMessage as jest.Mock).mockRejectedValue(saveError);

      await expect(saveMessage(
        mockConversationId,
        'Hello world',
        'user'
      )).rejects.toThrow('Failed to save message');
    });
  });

  describe('getConversationHistory', () => {
    test('should retrieve conversation history successfully', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          conversation_id: mockConversationId,
          content: 'Hello',
          role: 'user',
          created_at: new Date()
        },
        {
          id: 'msg-2',
          conversation_id: mockConversationId,
          content: 'Hi there!',
          role: 'assistant',
          created_at: new Date()
        }
      ];

      (databaseService.getMessagesByConversationId as jest.Mock).mockResolvedValue(mockMessages);

      const result = await getConversationHistory(mockConversationId);

      expect(result).toEqual(mockMessages);
      expect(databaseService.getMessagesByConversationId).toHaveBeenCalledWith(
        mockConversationId,
        50
      );
    });

    test('should handle custom limit parameter', async () => {
      const mockMessages: any[] = [];
      (databaseService.getMessagesByConversationId as jest.Mock).mockResolvedValue(mockMessages);

      await getConversationHistory(mockConversationId, 100);

      expect(databaseService.getMessagesByConversationId).toHaveBeenCalledWith(
        mockConversationId,
        100
      );
    });

    test('should handle retrieval errors gracefully', async () => {
      const retrievalError = new Error('Failed to retrieve messages');
      (databaseService.getMessagesByConversationId as jest.Mock).mockRejectedValue(retrievalError);

      await expect(getConversationHistory(mockConversationId)).rejects.toThrow(
        'Failed to retrieve messages'
      );
    });
  });
}); 