import express, { Request, Response } from 'express';
import { asyncHandler, authenticate } from '../../shared/middleware';
import * as databaseService from '../../infrastructure/database/database.service';
import * as conversationService from '../../core/conversations/conversations.service';
import { Conversation } from '../../infrastructure/database/supabase.client';
import { convertConversationToUi, convertMessageToUi } from '../../shared/utils/ui-converters';
import { handleErrorResponse, validateRequiredFields } from '../../shared/utils/response-handlers';
import { handleStreamingResponse } from '../../core/conversations/streaming.utils';
import { BadRequestError, NotFoundError } from '../../shared/utils/errors';
import { WILDBERRIES_SYSTEM_PROMPT } from '../../core/ai/prompts';

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
    const userId = req.user.id;
    const includeArchived = req.query.includeArchived === 'true';
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    
    const conversations = await databaseService.getUserConversations(userId, {
      includeArchived,
      limit,
      offset
    });
    
    res.json({ conversations: conversations.map(convertConversationToUi) });
  } catch (error) {
    handleErrorResponse(error, res, 'get conversations');
  }
}));

// Get a specific conversation with its messages
router.get('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const [messages, conversation] = await Promise.all([
      databaseService.getMessagesByConversationId(conversationId),
      databaseService.getConversationById(conversationId)
    ]);
    
    res.json({ 
      conversation: conversation ? convertConversationToUi(conversation) : null,
      messages: messages.map(convertMessageToUi)
    });
  } catch (error) {
    handleErrorResponse(error, res, 'get conversation');
  }
}));

/**
 * Send a message to the AI and get a response in a conversation
 * This unified endpoint handles:
 * - Creating a new conversation if conversationId is not provided or doesn't exist
 * - Adding the user message to an existing conversation
 * - Getting the AI response
 * - Saving the response to the conversation
 * 
 * Supports both POST /conversation and POST /conversation/:conversationId
 */
router.post(['/', '/:conversationId'], asyncHandler(async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const conversationIdFromParams = req.params.conversationId;
    const { 
      message, 
      conversationId: conversationIdFromBody = null,
      title = 'New Conversation',
      stream = false
    } = req.body;
    const systemPrompt = WILDBERRIES_SYSTEM_PROMPT;
    
    // Validate required fields
    const validationError = validateRequiredFields(req.body, ['message']);
    if (validationError) {
      throw new BadRequestError(validationError);
    }
    
    // Determine conversation ID: params take precedence over body
    const targetConversationId = conversationIdFromParams || conversationIdFromBody;
    
    let conversation: Conversation;
    let finalSystemPrompt: string;
    
    if (targetConversationId) {
      // Try to get existing conversation
      const existingConversation = await databaseService.getConversationById(targetConversationId);
      
      if (!existingConversation) {
        throw new NotFoundError('Conversation not found');
      }
      
      conversation = existingConversation;
      // Use existing conversation's system prompt, or provided one as fallback
      finalSystemPrompt = conversation.system_prompt || systemPrompt;
    } else {
      // Create new conversation
      conversation = await conversationService.getOrCreateConversation(
        userId,
        null,
        title,
        systemPrompt
      );
      
      finalSystemPrompt = systemPrompt;
    }
    
    // Generate response using the conversation service
    const result = await conversationService.generateAndSaveResponse(
      userId,
      conversation.id,
      message,
      finalSystemPrompt,
      stream
    );
    
    // Handle streaming response
    if (stream) {
      await handleStreamingResponse(res, result, conversation.id);
      return;
    }
    
    // For non-streaming responses, get the conversation history
    const history = await conversationService.getConversationHistory(conversation.id);
    
    // Return conversation data for new conversations, or just messages for existing ones
    const response: any = {
      messages: history.map(convertMessageToUi)
    };
    
    // Include conversation details if it was newly created or explicitly requested
    if (!targetConversationId || req.query.includeConversation === 'true') {
      response.conversation = convertConversationToUi(conversation);
    }
    
    res.json(response);
  } catch (error) {
    handleErrorResponse(error, res, 'process chat message');
  }
}));

// Update a conversation's title
router.patch('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { title } = req.body;
    
    const validationError = validateRequiredFields(req.body, ['title']);
    if (validationError) {
      throw new BadRequestError(validationError);
    }
    
    await databaseService.updateConversationTitle(conversationId, title);
    res.json({ success: true });
  } catch (error) {
    handleErrorResponse(error, res, 'update conversation');
  }
}));

// Archive a conversation
router.post('/:conversationId/archive', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.archiveConversation(conversationId);
    res.json({ success: true });
  } catch (error) {
    handleErrorResponse(error, res, 'archive conversation');
  }
}));

// Unarchive a conversation
router.post('/:conversationId/unarchive', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.unarchiveConversation(conversationId);
    res.json({ success: true });
  } catch (error) {
    handleErrorResponse(error, res, 'unarchive conversation');
  }
}));

// Delete a conversation
router.delete('/:conversationId', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    await databaseService.deleteConversation(conversationId);
    res.json({ success: true });
  } catch (error) {
    handleErrorResponse(error, res, 'delete conversation');
  }
}));

export default router; 