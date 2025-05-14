import { PromptChain, ModelType } from './types';
import generalSystemPrompt from './base/generalSystemPrompt';
import generalUserPrompt from './chat/generalUserPrompt';
import summarizationPrompt from './task/summarizationPrompt';
import { getPromptService } from '../services/promptService';

// Initialize services
const promptService = getPromptService();

// Register all individual prompts
const registerBasePrompts = () => {
  promptService.registerPrompt(generalSystemPrompt);
  promptService.registerPrompt(generalUserPrompt);
  promptService.registerPrompt(summarizationPrompt);
};

// General conversation chain
export const generalConversationChain: PromptChain = {
  metadata: {
    name: 'general-conversation',
    description: 'General conversation chain for everyday queries',
    version: '1.0.0',
    author: 'MP Bot Team',
    tags: ['conversation', 'general'],
    createdAt: new Date(),
  },
  prompts: [generalSystemPrompt, generalUserPrompt],
  modelType: ModelType.GeneralPurpose,
};

// Text summarization chain
export const textSummarizationChain: PromptChain = {
  metadata: {
    name: 'text-summarization',
    description: 'Chain for summarizing text content',
    version: '1.0.0',
    author: 'MP Bot Team',
    tags: ['summarization', 'task'],
    createdAt: new Date(),
  },
  prompts: [summarizationPrompt, {
    metadata: {
      name: 'summarization-user-prompt',
      description: 'User prompt for providing text to summarize',
      version: '1.0.0',
      author: 'MP Bot Team',
      tags: ['user', 'summarization'],
      createdAt: new Date(),
    },
    template: `Please summarize the following text:

{text}`,
    type: generalUserPrompt.type,
    variables: ['text'],
  }],
  modelType: ModelType.Summarization,
};

// Function to register all chains
export const registerAllChains = () => {
  // Register all individual prompts first
  registerBasePrompts();
  
  // Register all chains
  promptService.registerChain(generalConversationChain);
  promptService.registerChain(textSummarizationChain);
  
  return {
    generalConversationChain: promptService.getChain('general-conversation-1.0.0'),
    technicalAssistanceChain: promptService.getChain('technical-assistance-1.0.0'),
    textSummarizationChain: promptService.getChain('text-summarization-1.0.0'),
  };
};

export default registerAllChains; 