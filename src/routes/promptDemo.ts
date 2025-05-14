import express, { Request, Response } from 'express';
import { getLangChainService } from '../services/langchain';
import { asyncHandler } from '../middleware';
import logger from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const langchainService = getLangChainService();

// Simplified conversation endpoint
router.post('/conversation', asyncHandler(async (req: Request, res: Response) => {
  try {
    const { 
      message, 
      systemPrompt = "You are a helpful assistant.", 
      conversationId = req.body.conversationId === 'default' ? uuidv4() : req.body.conversationId,
      history = [] 
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    logger.info(`Processing conversation request for ID: ${conversationId}`);
    
    // Add the new user message to the history
    const updatedHistory = [
      ...history,
      { role: 'user', content: message }
    ];
    
    // Generate response from LangChain
    const response = await langchainService.generateConversationResponse(
      systemPrompt,
      updatedHistory
    );
    
    // Add the assistant response to the history
    updatedHistory.push({ role: 'assistant', content: response });
    
    // Return the response and updated history
    res.json({
      response,
      conversationId,
      history: updatedHistory
    });
  } catch (error) {
    logger.error(`Error in conversation endpoint: ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      error: 'Failed to process conversation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

// Simple chat endpoint for single exchanges
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