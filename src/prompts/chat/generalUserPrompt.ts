import { 
  PromptType, 
  UserPromptTemplate,
  ModelType
} from '../types';

/**
 * General user prompt for queries
 * Includes context and query variables
 */
export const generalUserPrompt: UserPromptTemplate = {
  metadata: {
    name: 'general-user-prompt',
    description: 'General user prompt template for queries',
    version: '1.0.0',
    author: 'MP Bot Team',
    tags: ['user', 'general', 'query'],
    createdAt: new Date(),
  },
  template: `{context}

My question is: {query}`,
  type: PromptType.User,
  defaultModel: ModelType.GeneralPurpose,
  variables: ['context', 'query'],
};

export default generalUserPrompt; 