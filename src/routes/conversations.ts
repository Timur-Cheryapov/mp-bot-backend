import express, { Request, Response } from 'express';
import { asyncHandler, authenticate } from '../middleware';
import logger from '../utils/logger';
import * as databaseService from '../services/database';
import * as conversationService from '../services/conversationService';
import { Conversation } from '../services/supabase';

// Extend the Express Request type to include the conversation property
declare global {
  namespace Express {
    interface Request {
      conversation?: Conversation;
    }
  }
}

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * Middleware to validate conversation ownership
 */
const validateConversationOwnership = asyncHandler(async (req: Request, res: Response, next: Function) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  
  if (!conversationId) {
    return res.status(400).json({ error: 'Conversation ID is required' });
  }
  
  try {
    const conversation = await databaseService.getConversationById(conversationId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    if (conversation.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied to this conversation' });
    }
    
    // Attach the conversation to the request for later use
    req.conversation = conversation;
    next();
  } catch (error) {
    logger.error(`Error validating conversation ownership: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to validate conversation access',
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get all conversations for a user
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get user ID from authenticated session
    const userId = req.user.id;
    const includeArchived = req.query.includeArchived === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const conversations = await databaseService.getUserConversations(userId, {
      includeArchived,
      limit,
      offset
    });
    
    res.json({ conversations });
  } catch (error) {
    logger.error(`Error getting conversations: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to get conversations',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Get a specific conversation with its messages
router.get('/:conversationId', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    
    res.json({ 
      conversation: req.conversation,
      messages
    });
  } catch (error) {
    logger.error(`Error getting conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to get conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Create a new conversation
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { 
      title = 'New Conversation',
      systemPrompt = "You are a helpful assistant.",
      modelName,
      temperature,
      maxTokens,
      contextLength,
      metadata
    } = req.body;
    
    // Skip the explicit user check since our authentication middleware already verified the user
    // The user in auth.users exists if the token is valid and we can just trust this
    const conversation = await databaseService.createConversation(
      userId,
      title,
      {
        system_prompt: systemPrompt,
        model_name: modelName,
        temperature,
        max_tokens: maxTokens,
        context_length: contextLength,
        metadata
      }
    );
    
    res.status(201).json({ conversation });
  } catch (error) {
    logger.error(`Error creating conversation: ${error instanceof Error ? error.message : String(error)}`);
    
    // Check for foreign key constraint violation
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('foreign key constraint') || errorMessage.includes('conversations_user_id_fkey')) {
      return res.status(400).json({ 
        error: 'Database constraint error',
        details: 'There is an issue with the database schema. The conversations table should reference auth.users.id instead of a custom users table.'
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create conversation',
      details: errorMessage
    });
  }
}));

/**
 * Send a message to the AI and get a response in a conversation
 * This endpoint handles:
 * - Creating a new conversation if needed
 * - Adding the user message to the conversation
 * - Getting the AI response
 * - Saving the response to the conversation
 */
router.post('/new', asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { 
      message, 
      conversationId = null, 
      title = 'New Conversation',
      systemPrompt = "You are a helpful assistant."
    } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get or create the conversation
    const conversation = await conversationService.getOrCreateConversation(
      userId,
      conversationId,
      title,
      systemPrompt
    );
    
    // Generate response using the conversation service
    const result = await conversationService.generateAndSaveResponse(
      userId,
      conversation.id,
      message,
      systemPrompt || conversation.system_prompt || "You are a helpful assistant."
    );
    
    // Get the full conversation history after the new messages
    const history = await conversationService.getConversationHistory(
      conversation.id,
      userId
    );
    
    res.json({
      conversation,
      response: result.response,
      history
    });
  } catch (error) {
    logger.error(`Error in chat endpoint: ${error instanceof Error ? error.message : String(error)}`);
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Determine the appropriate error status code
    if (errorMessage.includes('Access denied') || errorMessage.includes('permission')) {
      return res.status(403).json({ 
        error: 'Access denied',
        details: errorMessage
      });
    } else if (errorMessage.includes('not found')) {
      return res.status(404).json({ 
        error: 'Not found',
        details: errorMessage
      });
    }
    
    res.status(500).json({
      error: 'Failed to process chat message',
      details: errorMessage
    });
  }
}));

// Update a conversation's title
router.patch('/:conversationId', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    await databaseService.updateConversationTitle(conversationId, title);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error updating conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to update conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Archive a conversation
router.post('/:conversationId/archive', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.archiveConversation(conversationId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error archiving conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to archive conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Unarchive a conversation
router.post('/:conversationId/unarchive', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.unarchiveConversation(conversationId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error unarchiving conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to unarchive conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Delete a conversation
router.delete('/:conversationId', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.deleteConversation(conversationId);
    
    res.json({ success: true });
  } catch (error) {
    logger.error(`Error deleting conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to delete conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

/**
 * Add a message to an existing conversation and get an AI response
 */
router.post('/:conversationId', validateConversationOwnership, asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get the conversation (already validated by middleware)
    const conversation = req.conversation!;
    
    // Get the system prompt from the conversation
    const systemPrompt = conversation.system_prompt || "You are a helpful assistant.";
    
    // Generate the response
    const result = await conversationService.generateAndSaveResponse(
      userId,
      conversationId,
      message,
      systemPrompt
    );
    
    // Get updated messages
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    
    res.json({
      response: result.response,
      messages
    });
  } catch (error) {
    logger.error(`Error adding message to conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to add message and generate response',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

export default router; 