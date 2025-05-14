import express from 'express';
import { asyncHandler } from '../middleware';
import { getPromptService } from '../services/promptService';
import { registerAllChains, ModelType } from '../prompts';
import { BadRequestError } from '../utils/errors';

// Initialize prompt service and register chains
const promptService = getPromptService();
const chains = registerAllChains();

const router = express.Router();

// Demo endpoint for general conversation
router.post('/general', asyncHandler(async (req, res) => {
  const { query, context = '' } = req.body;
  
  if (!query) {
    throw new BadRequestError('Query is required');
  }
  
  const result = await promptService.executeChain(
    'general-conversation-1.0.0',
    { query, context },
    ModelType.GeneralPurpose
  );
  
  res.json({ 
    response: result,
    promptType: 'general-conversation',
  });
}));

// Demo endpoint for text summarization
router.post('/summarize', asyncHandler(async (req, res) => {
  const { 
    text,
    length = 'brief',
    style = 'informative',
    audience = 'general'
  } = req.body;
  
  if (!text) {
    throw new BadRequestError('Text to summarize is required');
  }
  
  const result = await promptService.executeChain(
    'text-summarization-1.0.0',
    { text, length, style, audience },
    ModelType.Summarization
  );
  
  res.json({ 
    response: result,
    promptType: 'summarization',
  });
}));

// Demo endpoint for conversation with memory
router.post('/conversation', asyncHandler(async (req, res) => {
  const { 
    message,
    history = [],
    systemPrompt = 'You are a helpful AI assistant.'
  } = req.body;
  
  if (!message) {
    throw new BadRequestError('Message is required');
  }
  
  // Convert history to our internal format if not already
  const formattedHistory = Array.isArray(history) ? history : [];
  
  const result = await promptService.executeConversation(
    systemPrompt,
    message,
    {
      history: formattedHistory,
      variables: {}
    }
  );
  
  // Add the new exchange to history
  const updatedHistory = [
    ...formattedHistory,
    { role: 'user', content: message },
    { role: 'assistant', content: result }
  ];
  
  res.json({ 
    response: result,
    history: updatedHistory,
    promptType: 'conversation',
  });
}));

export default router; 