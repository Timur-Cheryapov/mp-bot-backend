import express, { Request, Response } from 'express';
import { getLangChainService } from '../services/langchain';
import { asyncHandler, authenticate } from '../middleware';
import logger from '../utils/logger';
import * as conversationService from '../services/conversationService';
import { formatMessagesToBasic } from '../utils/langchainUtils';

const router = express.Router();
const langchainService = getLangChainService();

// Simplified conversation endpoint with authentication
router.post('/conversation', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { 
      message, 
      systemPrompt = "You are a helpful assistant.", 
      conversationId = null,
      title = req.body.title || 'New Conversation',
      history = [] 
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get user ID from the authenticated session
    const userId = req.user.id;
    
    try {
      // Get or create conversation based on provided ID
      const conversation = await conversationService.getOrCreateConversation(
        userId,
        conversationId,
        title,
        systemPrompt
      );

      logger.info(`Processing conversation request for ID: ${conversation.id}`);
      
      // If we have no history in the request but have a conversation ID, fetch history from DB
      let messageHistory = history.length > 0 
        ? history 
        : await conversationService.getConversationHistory(conversation.id, userId);
      messageHistory = messageHistory.map(formatMessagesToBasic);
      
      // Add the new user message to the history
      const updatedHistory = [
        ...messageHistory,
        { role: 'user', content: message }
      ];
      
      // Save user message to database
      await conversationService.saveMessage(conversation.id, message, 'user', userId);
      
      // Generate response from LangChain
      const response = await langchainService.generateConversationResponse(
        systemPrompt,
        updatedHistory
      );
      
      // Save assistant response to database
      await conversationService.saveMessage(conversation.id, response, 'assistant', userId);
      
      // Add the assistant response to the history
      updatedHistory.push({ role: 'assistant', content: response });
      
      // Return the response and updated history
      res.json({
        response,
        conversationId: conversation.id,
        history: updatedHistory
      });
    } catch (error) {
      // Handle access and permission errors
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes('Access denied')) {
        return res.status(403).json({ 
          error: 'Access denied',
          details: errorMsg
        });
      }
      
      if (errorMsg.includes('row-level security policy')) {
        return res.status(403).json({ 
          error: 'Permission denied',
          details: 'You do not have permission to access or create this resource'
        });
      }
      
      if (errorMsg.includes('Conversation not found')) {
        return res.status(404).json({ 
          error: 'Not found',
          details: errorMsg
        });
      }
      
      // Re-throw any other errors
      throw error;
    }
  } catch (error) {
    logger.error(`Error in conversation endpoint: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to process conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Simple chat endpoint for single exchanges (no authentication required)
router.post('/chat', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { 
      message, 
      systemPrompt = "You are a helpful assistant."
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Generate response from LangChain
    const response = await langchainService.generateChatResponse(
      systemPrompt,
      message
    );
    
    // Return the response
    res.json({ response });
  } catch (error) {
    logger.error(`Error in chat endpoint: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

export default router; 