import express, { Request, Response } from 'express';
import { asyncHandler, authenticate } from '../middleware';
import logger from '../utils/logger';
import * as databaseService from '../services/database';
import * as conversationService from '../services/conversationService';
import { Conversation } from '../services/supabase';
import { convertConversationToUi, convertMessageToUi } from '../utils/fromDbToUiConverters';
import { Readable } from 'stream';

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

// Get all conversations for a user
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get user ID from authenticated session
    const userId = req.user.id;
    const includeArchived = req.query.includeArchived === 'false';
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const conversations = await databaseService.getUserConversations(userId, {
      includeArchived,
      limit,
      offset
    });
    
    res.json({ conversations: conversations.map(convertConversationToUi) });
  } catch (error) {
    logger.error(`Error getting conversations: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to get conversations',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Get a specific conversation with its messages
router.get('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    const conversation = await databaseService.getConversationById(conversationId);
    
    res.json({ 
      conversation: conversation ? convertConversationToUi(conversation) : null,
      messages: messages.map(convertMessageToUi)
    });
  } catch (error) {
    logger.error(`Error getting conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to get conversation',
      details: error instanceof Error ? error.message : String(error)
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
      systemPrompt = "You are a helpful assistant.",
      stream = false
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
      systemPrompt || conversation.system_prompt || "You are a helpful assistant.",
      stream
    );
    
    // If streaming, return the stream response
    if (stream) {
      
      // Set response headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(`event: conversationId\ndata: ${conversation.id}\n\n`);
      // Check if result.response is a Response object
      if (result.response instanceof Response) {
        // Create a readable stream from the response body
        const responseBody = result.response.body;
        if (responseBody) {
          const reader = responseBody.getReader();
          const readableStream = new Readable({
            read() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  this.push(null);
                } else {
                  this.push(value);
                }
              }).catch(err => {
                this.destroy(err);
              });
            }
          });
          
          // Pipe the stream through processor to response
          readableStream
            .pipe(res);
          return;
        }
      }
    }
    
    // For non-streaming responses, return the conversation data
    // Get the full conversation history after the new messages
    const history = await conversationService.getConversationHistory(
      conversation.id
    );
    
    res.json({
      conversation: convertConversationToUi(conversation),
      messages: history.map(convertMessageToUi)
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

/**
 * Save a completed streamed response to the database
 */
router.post('/:conversationId/save-stream', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }
    
    await conversationService.saveStreamedResponse(conversationId, content);
    
    res.json({ success: true, conversationId });
  } catch (error) {
    logger.error(`Error saving streamed response: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to save streamed response',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Update a conversation's title
router.patch('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/:conversationId/archive', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/:conversationId/unarchive', asyncHandler(async (req: Request, res: Response) => {
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
router.delete('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
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
router.post('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user.id;
    const { message, stream = false } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Get the conversation (already validated by middleware)
    const conversation = await databaseService.getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    // Get the system prompt from the conversation
    const systemPrompt = conversation.system_prompt || "You are a helpful assistant.";
    
    // Generate the response
    const result = await conversationService.generateAndSaveResponse(
      userId,
      conversationId,
      message,
      systemPrompt,
      stream
    );
    
    // If streaming, return the stream response
    if (stream) {
      // Check if result.response is a Response object
      if (result.response instanceof Response) {
        // Set response headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Create a readable stream from the response body
        const responseBody = result.response.body;
        if (responseBody) {
          const reader = responseBody.getReader();
          const readableStream = new Readable({
            read() {
              reader.read().then(({ done, value }) => {
                if (done) {
                  this.push(null);
                } else {
                  this.push(value);
                }
              }).catch(err => {
                this.destroy(err);
              });
            }
          });
          
          // Pipe the stream through processor to response
          readableStream
            .pipe(res);
          return;
        }
      }
    }
    
    // For non-streaming responses, return the conversation messages
    // Get updated messages
    const messages = await databaseService.getMessagesByConversationId(conversationId);
    
    res.json({ messages: messages.map(convertMessageToUi) });
  } catch (error) {
    logger.error(`Error adding message to conversation: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to add message and generate response',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

export default router; 