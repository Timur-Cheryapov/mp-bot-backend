/**
 * Prompts Module
 * Exports all prompt templates, chains, and utilities
 */

// Export types
export * from './types';

// Export base prompts
export { default as generalSystemPrompt } from './base/generalSystemPrompt';

// Export chat prompts
export { default as generalUserPrompt } from './chat/generalUserPrompt';

// Export task prompts
export { default as summarizationPrompt } from './task/summarizationPrompt';

// Export chains
export {
  generalConversationChain,
  textSummarizationChain,
  registerAllChains,
} from './chains';

// Re-export prompt service for convenience
export { getPromptService } from '../services/promptService';

// Default export registers all prompts and chains
export { default } from './chains'; 