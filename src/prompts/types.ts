/**
 * Prompt Types Definitions
 * Contains type definitions for prompt templates, chains, and related structures
 */

// Base interface for all prompt variables
export interface PromptVariables {
  [key: string]: string | number | boolean | object;
}

// Types of models that can be used with prompts
export enum ModelType {
  GeneralPurpose = 'general',
  Creative = 'creative',
  Analytical = 'analytical',
  Technical = 'technical',
  Summarization = 'summarization',
}

// Types of prompts by their role in the system
export enum PromptType {
  System = 'system',
  User = 'user',
  Assistant = 'assistant',
  Function = 'function',
  Tool = 'tool',
}

// Base metadata for all prompt templates
export interface PromptMetadata {
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Base prompt template interface
export interface PromptTemplate {
  metadata: PromptMetadata;
  template: string;
  type: PromptType;
  defaultModel?: ModelType;
  variables?: string[]; // List of variable names used in the template
}

// System prompt type - used to set behavior
export interface SystemPromptTemplate extends PromptTemplate {
  type: PromptType.System;
}

// User prompt type - used for user inputs
export interface UserPromptTemplate extends PromptTemplate {
  type: PromptType.User;
}

// Conversation history representation
export interface ConversationTurn {
  role: PromptType;
  content: string;
}

export type ConversationHistory = ConversationTurn[];

// Prompt chain for combining multiple prompts
export interface PromptChain {
  metadata: PromptMetadata;
  prompts: PromptTemplate[];
  modelType?: ModelType;
}

// Options for rendering prompts
export interface PromptRenderOptions {
  preserveFormatting?: boolean;
  trimWhitespace?: boolean;
  maxLength?: number;
  addTimestamp?: boolean;
}

// Context for conversation management
export interface ConversationContext {
  history: ConversationHistory;
  variables: PromptVariables;
  metadata?: Record<string, any>;
}

// Performance metrics for prompt evaluation
export interface PromptPerformanceMetrics {
  promptId: string;
  tokenCount: number;
  responseTime: number;
  version: string;
  effectiveness?: number; // Score from 0-1
  ratingFeedback?: number; // User rating if available
}

// A/B testing variant configuration
export interface PromptVariant {
  id: string;
  template: PromptTemplate;
  weight?: number; // For weighted random selection
}

// A/B test configuration
export interface PromptABTest {
  id: string;
  name: string;
  variants: PromptVariant[];
  startDate: Date;
  endDate?: Date;
  isActive: boolean;
} 