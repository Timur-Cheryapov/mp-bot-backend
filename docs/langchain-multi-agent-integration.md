# LangChain Multi-Agent Integration Guide

## Overview: Extending Your LangChain Service with Multi-Agent Architecture

This guide shows how to refactor your existing `langchain.service.ts` to support the **plug-and-play multi-agent streaming architecture** while preserving your current functionality.

## Current Architecture Analysis

Your existing service already has excellent foundations:
- ✅ LangGraph implementation with agents
- ✅ Streaming capabilities  
- ✅ Tool integration (Wildberries tools)
- ✅ Token usage tracking
- ✅ Database persistence via Supabase
- ✅ Conversation state management

## Migration Strategy: Incremental Refactoring

### 1. Agent Interface & Registry Setup

First, let's extend your current structure with the agent interface:

```typescript
// src/core/ai/agents/types.ts
import { CompiledStateGraph } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { BasicMessage } from '../../../shared/types/message.types';

export interface IAgent {
  id: string;
  name: string;
  description: string;
  intents: string[];
  tools: any[]; // Use your existing tool type
  workflow: CompiledStateGraph;
  
  initialize(userId: string, config: AgentConfig): Promise<void>;
  canHandle(intent: string, context: ConversationContext): boolean;
  execute(state: AgentState, config: ExecutionConfig): AsyncIterable<AgentEvent>;
}

export interface ConversationContext {
  conversationId: string;
  userId: string;
  messages: BasicMessage[];
  metadata?: any;
}

export interface AgentConfig {
  modelName?: string;
  includeWildberriesTools?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ExecutionConfig {
  stream?: boolean;
  threadId?: string;
}

export type AgentEvent = 
  | { type: 'agent_start'; agentId: string; agentName: string }
  | { type: 'agent_switch'; fromAgent: string; toAgent: string; reason: string }
  | { type: 'content_chunk'; content: string; agentId: string }
  | { type: 'tool_execution'; toolName: string; agentId: string }
  | { type: 'tool_result'; result: any; toolName: string; agentId: string }
  | { type: 'agent_complete'; agentId: string; finalState: any }
  | { type: 'error'; error: string; agentId: string }
  | { type: 'conversation_end' };

export interface AgentState {
  messages: BaseMessage[];
  conversationId: string;
  userId: string;
  modelName: string;
  includeWildberriesTools: boolean;
  agentSpecificData?: any;
}
```

### 2. Agent Registry Implementation

```typescript
// src/core/ai/agents/agent-registry.ts
import { IAgent, ConversationContext } from './types';
import logger from '../../../shared/utils/logger';

export class AgentRegistry {
  private agents: Map<string, IAgent> = new Map();
  
  registerAgent(agent: IAgent): void {
    this.agents.set(agent.id, agent);
    logger.info(`Registered agent: ${agent.id} - ${agent.name}`);
  }
  
  getAgent(agentId: string): IAgent | undefined {
    return this.agents.get(agentId);
  }
  
  findAgentForIntent(intent: string, context: ConversationContext): IAgent | null {
    // First try exact intent matching
    for (const agent of this.agents.values()) {
      if (agent.canHandle(intent, context)) {
        return agent;
      }
    }
    
    // Fallback to general agent if available
    return this.agents.get('general_agent') || null;
  }
  
  listAgents(): IAgent[] {
    return Array.from(this.agents.values());
  }
  
  getAgentsByCategory(category: string): IAgent[] {
    return Array.from(this.agents.values()).filter(agent => 
      agent.id.includes(category)
    );
  }
}
```

### 3. Base Agent Class (Extending Your Current Pattern)

```typescript
// src/core/ai/agents/base-agent.ts
import { StateGraph, MessagesAnnotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { Annotation } from '@langchain/langgraph';
import { MODEL_CONFIGS } from '../../../config/langchain.config';
import { IAgent, AgentConfig, ConversationContext, AgentState, ExecutionConfig, AgentEvent } from './types';
import { createToolsMap } from '../../tools/tool-execution.utils';
import logger from '../../../shared/utils/logger';

// Reuse your existing AgentState annotation structure
const BaseAgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  conversationId: Annotation<string>,
  userId: Annotation<string>,
  modelName: Annotation<string>,
  includeWildberriesTools: Annotation<boolean>,
  agentSpecificData: Annotation<any>(),
});

export abstract class BaseAgent implements IAgent {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract intents: string[];
  
  public tools: any[] = [];
  public workflow!: CompiledStateGraph;
  
  protected model!: ChatOpenAI;
  
  async initialize(userId: string, config: AgentConfig): Promise<void> {
    // Create model with your existing pattern
    this.model = this.createChatModel(config);
    
    // Load tools if needed
    if (config.includeWildberriesTools && userId) {
      this.tools = this.createTools(userId);
    }
    
    // Build workflow
    this.workflow = this.createWorkflow();
    
    logger.info(`Initialized agent: ${this.id} for user: ${userId}`);
  }
  
  canHandle(intent: string, context: ConversationContext): boolean {
    const lowerIntent = intent.toLowerCase();
    return this.intents.some(pattern => 
      lowerIntent.includes(pattern.toLowerCase())
    );
  }
  
  abstract async *execute(
    state: AgentState, 
    config: ExecutionConfig
  ): AsyncIterable<AgentEvent>;
  
  // Reuse your existing model creation logic
  protected createChatModel(config: AgentConfig): ChatOpenAI {
    const {
      temperature = 0.7,
      maxTokens = 2048,
      modelName = MODEL_CONFIGS.GPT4O_MINI,
    } = config;
    
    return new ChatOpenAI({
      temperature,
      maxTokens,
      modelName,
      openAIApiKey: process.env.OPENAI_API_KEY,
      timeout: 30000,
      streamUsage: true,
    });
  }
  
  // Reuse your existing tools creation logic
  protected createTools(userId: string): any[] {
    try {
      const toolsByName = createToolsMap(userId);
      const wildberriesSellerTool = toolsByName['wildberries_seller_products'];
      return wildberriesSellerTool ? [wildberriesSellerTool] : [];
    } catch (error) {
      logger.warn(`Failed to create tools for agent ${this.id}:`, error);
      return [];
    }
  }
  
  protected abstract createWorkflow(): CompiledStateGraph;
}
```

### 4. Concrete Agent Implementations

```typescript
// src/core/ai/agents/wildberries-agent.ts
import { BaseAgent } from './base-agent';
import { AgentState, ExecutionConfig, AgentEvent } from './types';
import { StateGraph, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';

export class WildberriesAgent extends BaseAgent {
  id = 'wildberries_agent';
  name = 'Wildberries Specialist';
  description = 'Handles Wildberries marketplace operations and product management';
  intents = [
    'wildberries', 'продукт', 'товар', 'продажи', 'аналитика', 
    'ключевые слова', 'цена', 'конкуренты', 'sales', 'product',
    'listing', 'keywords', 'analytics', 'competitors'
  ];
  
  async *execute(
    state: AgentState, 
    config: ExecutionConfig
  ): AsyncIterable<AgentEvent> {
    yield { type: 'agent_start', agentId: this.id, agentName: this.name };
    
    try {
      const workflowConfig = {
        configurable: { 
          thread_id: config.threadId || state.conversationId 
        },
        streamMode: config.stream ? "messages" as const : undefined
      };
      
      if (config.stream) {
        // Stream execution similar to your existing streaming logic
        const stream = await this.workflow.stream(state, workflowConfig);
        
        for await (const chunk of stream) {
          for (const [nodeName, nodeState] of Object.entries(chunk)) {
            if (nodeName === '0' && nodeState) {
              // Handle streaming chunks similar to your existing pattern
              yield* this.processStreamingChunk(nodeState);
            }
          }
        }
      } else {
        // Non-streaming execution
        const result = await this.workflow.invoke(state, workflowConfig);
        const finalMessage = result.messages[result.messages.length - 1] as AIMessage;
        
        yield {
          type: 'content_chunk',
          content: finalMessage.content.toString(),
          agentId: this.id
        };
      }
      
      yield { type: 'agent_complete', agentId: this.id, finalState: state };
      
    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: this.id 
      };
    }
  }
  
  private async *processStreamingChunk(nodeState: any): AsyncIterable<AgentEvent> {
    // Reuse your existing streaming chunk processing logic
    if (nodeState.constructor.name === 'AIMessageChunk') {
      if (nodeState.tool_calls?.length) {
        yield {
          type: 'tool_execution',
          toolName: nodeState.tool_calls[0].name,
          agentId: this.id
        };
      }
      
      if (nodeState.content?.toString().trim()) {
        yield {
          type: 'content_chunk',
          content: nodeState.content.toString(),
          agentId: this.id
        };
      }
    }
  }
  
  protected createWorkflow() {
    // Reuse your existing workflow creation logic
    const boundModel = this.tools.length > 0 ? this.model.bindTools(this.tools) : this.model;
    const toolNode = this.tools.length > 0 ? new ToolNode(this.tools) : null;
    
    const callModel = async (state: any) => {
      const response = await boundModel.invoke(state.messages);
      return { messages: [response] };
    };
    
    const shouldContinue = (state: any) => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1] as AIMessage;
      
      if (!this.tools.length || !lastMessage.tool_calls?.length) {
        return END;
      }
      
      return "tools";
    };
    
    // Build workflow similar to your existing pattern
    const workflow = new StateGraph(state => state) // Use your BaseAgentState
      .addNode("agent", callModel)
      .addEdge("__start__", "agent");
    
    if (toolNode && this.tools.length > 0) {
      workflow
        .addNode("tools", toolNode)
        .addConditionalEdges("agent", shouldContinue, {
          tools: "tools",
          [END]: END
        })
        .addEdge("tools", "agent");
    } else {
      workflow.addEdge("agent", END);
    }
    
    return workflow.compile();
  }
}
```

```typescript
// src/core/ai/agents/general-agent.ts
import { BaseAgent } from './base-agent';
import { AgentState, ExecutionConfig, AgentEvent } from './types';

export class GeneralAgent extends BaseAgent {
  id = 'general_agent';
  name = 'General Assistant';
  description = 'Handles general conversations and tasks';
  intents = ['general', 'help', 'question', 'chat']; // Broad intents
  
  async *execute(
    state: AgentState, 
    config: ExecutionConfig
  ): AsyncIterable<AgentEvent> {
    yield { type: 'agent_start', agentId: this.id, agentName: this.name };
    
    try {
      // Simple execution for general queries
      const response = await this.model.invoke(state.messages);
      
      yield {
        type: 'content_chunk',
        content: response.content.toString(),
        agentId: this.id
      };
      
      yield { type: 'agent_complete', agentId: this.id, finalState: state };
      
    } catch (error) {
      yield { 
        type: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId: this.id 
      };
    }
  }
  
  protected createWorkflow() {
    // Simple workflow for general agent
    const callModel = async (state: any) => {
      const response = await this.model.invoke(state.messages);
      return { messages: [response] };
    };
    
    return new StateGraph(state => state)
      .addNode("agent", callModel)
      .addEdge("__start__", "agent")
      .addEdge("agent", "__end__")
      .compile();
  }
}
```

### 5. Enhanced LangChain Service with Multi-Agent Support

```typescript
// src/core/ai/enhanced-langchain.service.ts
import { AgentRegistry } from './agents/agent-registry';
import { WildberriesAgent } from './agents/wildberries-agent';
import { GeneralAgent } from './agents/general-agent';
import { IAgent, ConversationContext, AgentEvent } from './agents/types';
import { BasicMessage } from '../../shared/types/message.types';
import { ConversationOptions } from '../../shared/types/langchain.types';
import { convertToLangChainMessages } from '../conversations/message.utils';
import logger from '../../shared/utils/logger';

export class EnhancedLangChainService {
  private static instance: EnhancedLangChainService;
  private registry: AgentRegistry;
  private currentAgent: IAgent | null = null;
  private initialized: boolean = false;
  
  private constructor() {
    this.registry = new AgentRegistry();
    this.initialize();
  }
  
  public static getInstance(): EnhancedLangChainService {
    if (!EnhancedLangChainService.instance) {
      EnhancedLangChainService.instance = new EnhancedLangChainService();
    }
    return EnhancedLangChainService.instance;
  }
  
  private async initialize(): Promise<void> {
    try {
      // Register default agents
      const wildberriesAgent = new WildberriesAgent();
      const generalAgent = new GeneralAgent();
      
      this.registry.registerAgent(wildberriesAgent);
      this.registry.registerAgent(generalAgent);
      
      this.initialized = true;
      logger.info('Enhanced LangChain service initialized with multi-agent support');
    } catch (error) {
      logger.error('Failed to initialize enhanced service:', error);
      this.initialized = false;
    }
  }
  
  public async generateConversationResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<string | Response> {
    const {
      modelName,
      conversationId,
      userId,
      stream = false,
      includeWildberriesTools = true
    } = options;
    
    if (!this.initialized) {
      throw new Error('Service not initialized');
    }
    
    const context: ConversationContext = {
      conversationId,
      userId: userId || '',
      messages
    };
    
    // Determine intent from the last user message
    const lastMessage = messages[messages.length - 1];
    const intent = lastMessage?.content || '';
    
    // Find appropriate agent
    const targetAgent = this.registry.findAgentForIntent(intent, context);
    if (!targetAgent) {
      throw new Error('No suitable agent found for this request');
    }
    
    // Initialize agent if needed
    if (targetAgent !== this.currentAgent) {
      await targetAgent.initialize(userId || '', {
        modelName,
        includeWildberriesTools
      });
      this.currentAgent = targetAgent;
    }
    
    if (stream) {
      return this.handleStreamingResponse(systemPrompt, messages, targetAgent, options);
    }
    
    // Non-streaming response
    return this.handleNonStreamingResponse(systemPrompt, messages, targetAgent, options);
  }
  
  private async handleStreamingResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    agent: IAgent,
    options: ConversationOptions
  ): Promise<Response> {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const langchainMessages = convertToLangChainMessages(systemPrompt, messages);
          
          const agentState = {
            messages: langchainMessages,
            conversationId: options.conversationId,
            userId: options.userId || '',
            modelName: options.modelName || '',
            includeWildberriesTools: options.includeWildberriesTools || false
          };
          
          // Stream agent execution
          for await (const event of agent.execute(agentState, { 
            stream: true, 
            threadId: options.conversationId 
          })) {
            const chunk = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(chunk));
          }
          
          controller.close();
        } catch (error) {
          logger.error('Error in enhanced streaming:', error);
          const errorEvent: AgentEvent = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
            agentId: agent.id
          };
          const chunk = `data: ${JSON.stringify(errorEvent)}\n\n`;
          controller.enqueue(new TextEncoder().encode(chunk));
          controller.close();
        }
      }
    });
    
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  }
  
  private async handleNonStreamingResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    agent: IAgent,
    options: ConversationOptions
  ): Promise<string> {
    const langchainMessages = convertToLangChainMessages(systemPrompt, messages);
    
    const agentState = {
      messages: langchainMessages,
      conversationId: options.conversationId,
      userId: options.userId || '',
      modelName: options.modelName || '',
      includeWildberriesTools: options.includeWildberriesTools || false
    };
    
    let response = '';
    
    for await (const event of agent.execute(agentState, { 
      stream: false, 
      threadId: options.conversationId 
    })) {
      if (event.type === 'content_chunk') {
        response += event.content;
      }
    }
    
    return response;
  }
  
  // Registry management methods
  public registerAgent(agent: IAgent): void {
    this.registry.registerAgent(agent);
  }
  
  public getAvailableAgents(): IAgent[] {
    return this.registry.listAgents();
  }
  
  public getAgent(agentId: string): IAgent | undefined {
    return this.registry.getAgent(agentId);
  }
}

// Export singleton instance
export const getEnhancedLangChainService = (): EnhancedLangChainService => {
  return EnhancedLangChainService.getInstance();
};
```

### 6. Migration Strategy

#### Phase 1: Parallel Implementation
1. Keep your existing `langchain.service.ts` unchanged
2. Implement the new enhanced service alongside it
3. Add feature flag to switch between implementations

```typescript
// src/core/ai/service-factory.ts
import { getLangChainService } from './langchain.service';
import { getEnhancedLangChainService } from './enhanced-langchain.service';

const USE_MULTI_AGENT = process.env.USE_MULTI_AGENT === 'true';

export const getAIService = () => {
  return USE_MULTI_AGENT ? getEnhancedLangChainService() : getLangChainService();
};
```

#### Phase 2: Gradual Rollout
1. Test with specific user segments
2. Compare performance and accuracy
3. Gradually increase multi-agent usage

#### Phase 3: Full Migration
1. Deprecate old service
2. Move all functionality to enhanced service
3. Clean up legacy code

### 7. Benefits of This Approach

#### Immediate Benefits
- ✅ **Zero Breaking Changes**: Existing functionality preserved
- ✅ **Gradual Migration**: Can test and validate incrementally  
- ✅ **Specialized Agents**: Better domain expertise for different tasks
- ✅ **Extensibility**: Easy to add new agents (e.g., SEO agent, marketing agent)

#### Future Possibilities
- 🚀 **Agent Marketplace**: Load agents dynamically
- 🚀 **Custom Agents**: User-specific agent configurations
- 🚀 **Agent Collaboration**: Agents working together on complex tasks
- 🚀 **A/B Testing**: Different agent strategies for optimization

### 8. Usage Examples

```typescript
// Using the enhanced service
const enhancedService = getEnhancedLangChainService();

// Wildberries query - automatically routes to WildberriesAgent
const response1 = await enhancedService.generateConversationResponse(
  "You are a helpful assistant",
  [{ role: 'user', content: 'Анализируй мои продажи на Wildberries' }],
  { conversationId: 'conv-1', userId: 'user-1', stream: true }
);

// General query - automatically routes to GeneralAgent  
const response2 = await enhancedService.generateConversationResponse(
  "You are a helpful assistant",
  [{ role: 'user', content: 'What is the weather like?' }],
  { conversationId: 'conv-2', userId: 'user-1', stream: false }
);

// Adding a custom agent
class SEOAgent extends BaseAgent {
  id = 'seo_agent';
  name = 'SEO Specialist';
  description = 'Handles SEO optimization and keyword research';
  intents = ['seo', 'keywords', 'optimization', 'ranking'];
  
  // Implementation...
}

enhancedService.registerAgent(new SEOAgent());
```

This approach gives you a powerful, extensible multi-agent system while preserving all your existing functionality and allowing for gradual migration! 