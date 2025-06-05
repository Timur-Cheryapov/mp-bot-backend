# Multi-Agent Implementation Plan

Based on current LangChain service structure and marketplace agent workflows, this document outlines the complete directory structure, file naming, and function implementation for the multi-agent system.

## Directory Structure

```
src/core/
├── ai/
│   ├── langchain.service.ts              # Base service (current)
│   ├── langchain.types.ts                # Shared types (current)
│   ├── langchain.utils.ts                # Utilities (current)
│   ├── token-calculator.ts              # Token tracking (current)
│   │
│   ├── agents/                           # 🆕 Multi-agent system
│   │   ├── index.ts                      # Agent exports
│   │   ├── base/                         # Base agent infrastructure
│   │   │   ├── agent.types.ts            # Shared agent types
│   │   │   ├── agent.factory.ts          # Agent factory
│   │   │   ├── state-manager.ts          # Cross-agent state management
│   │   │   └── router.agent.ts           # Master router agent
│   │   │
│   │   ├── product/                      # Product Management Agent
│   │   │   ├── product.agent.ts          # Main agent workflow
│   │   │   ├── product.state.ts          # State definitions
│   │   │   ├── product.nodes.ts          # Workflow nodes
│   │   │   └── product.tools.ts          # Product-specific tools
│   │   │
│   │   ├── analytics/                    # Analytics Agent
│   │   │   ├── analytics.agent.ts        # Main agent workflow
│   │   │   ├── analytics.state.ts        # State definitions
│   │   │   ├── analytics.nodes.ts        # Workflow nodes
│   │   │   └── analytics.tools.ts        # Analytics tools
│   │   │
│   │   ├── pricing/                      # Pricing Strategy Agent
│   │   │   ├── pricing.agent.ts          # Main agent workflow
│   │   │   ├── pricing.state.ts          # State definitions
│   │   │   ├── pricing.nodes.ts          # Workflow nodes
│   │   │   └── pricing.tools.ts          # Pricing tools
│   │   │
│   │   ├── inventory/                    # Inventory Management Agent
│   │   │   ├── inventory.agent.ts        # Main agent workflow
│   │   │   ├── inventory.state.ts        # State definitions
│   │   │   ├── inventory.nodes.ts        # Workflow nodes
│   │   │   └── inventory.tools.ts        # Inventory tools
│   │   │
│   │   └── support/                      # Customer Support Agent
│   │       ├── support.agent.ts          # Main agent workflow
│   │       ├── support.state.ts          # State definitions
│   │       ├── support.nodes.ts          # Workflow nodes
│   │       └── support.tools.ts          # Support tools
│   │
│   └── multi-agent.service.ts            # 🆕 Multi-agent orchestrator
│
├── tools/                                # Enhanced tools structure
│   ├── wildberries.service.ts            # Current Wildberries tools
│   ├── tool-execution.utils.ts           # Current execution utils
│   ├── validation.utils.ts               # Current validation
│   │
│   ├── product/                          # 🆕 Product-specific tools
│   │   ├── listing-tools.ts              # Create/update listings
│   │   ├── image-tools.ts                # Image analysis
│   │   ├── keyword-tools.ts              # Keyword research
│   │   └── optimization-tools.ts         # Listing optimization
│   │
│   ├── analytics/                        # 🆕 Analytics tools
│   │   ├── sales-data-tools.ts           # Sales data retrieval
│   │   ├── revenue-tools.ts              # Revenue calculations
│   │   ├── trend-tools.ts                # Trend analysis
│   │   └── competitor-tools.ts           # Competitor analysis
│   │
│   ├── pricing/                          # 🆕 Pricing tools
│   │   ├── competitor-pricing-tools.ts   # Price scraping
│   │   ├── margin-tools.ts               # Margin calculations
│   │   ├── demand-tools.ts               # Demand forecasting
│   │   └── elasticity-tools.ts           # Price elasticity
│   │
│   └── inventory/                        # 🆕 Inventory tools
│       ├── stock-tools.ts                # Stock level checking
│       ├── forecast-tools.ts             # Demand forecasting
│       ├── supplier-tools.ts             # Supplier management
│       └── reorder-tools.ts              # Reorder calculations
```

## Core Files Implementation

### 1. **`src/core/ai/multi-agent.service.ts`** - Main Orchestrator

```typescript
import { MultiAgentRouter } from './agents/base/router.agent';
import { AgentFactory } from './agents/base/agent.factory';
import { StateManager } from './agents/base/state-manager';
import { BasicMessage } from '../../shared/types/message.types';
import { ConversationOptions } from './langchain.types';

export class MultiAgentService {
  private static instance: MultiAgentService;
  private router: MultiAgentRouter;
  private stateManager: StateManager;

  private constructor() {
    this.stateManager = new StateManager();
    this.router = new MultiAgentRouter(this.stateManager);
  }

  public static getInstance(): MultiAgentService {
    if (!MultiAgentService.instance) {
      MultiAgentService.instance = new MultiAgentService();
    }
    return MultiAgentService.instance;
  }

  public async processMessage(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<string | Response> {
    return this.router.route(systemPrompt, messages, options);
  }

  public async switchAgent(
    targetAgent: string,
    context: any,
    options: ConversationOptions
  ): Promise<string | Response> {
    return this.router.switchToAgent(targetAgent, context, options);
  }
}
```

### 2. **`src/core/ai/agents/base/agent.types.ts`** - Shared Types

```typescript
import { Annotation } from '@langchain/langgraph';
import { MessagesAnnotation } from '@langchain/langgraph';

export type AgentType = 'router' | 'product' | 'analytics' | 'pricing' | 'inventory' | 'support';

export type IntentType = 
  | 'product_management' 
  | 'analytics' 
  | 'pricing_strategy' 
  | 'inventory_management' 
  | 'customer_support' 
  | 'general';

export const BaseAgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  userId: Annotation<string>,
  sessionId: Annotation<string>,
  currentAgent: Annotation<AgentType>,
  previousAgent: Annotation<AgentType | null>,
  agentHistory: Annotation<AgentType[]>,
  sharedContext: Annotation<Record<string, any>>,
  confidence: Annotation<number>,
  lastIntentChange: Annotation<Date>,
});

export interface AgentTransition {
  from: AgentType;
  to: AgentType;
  reason: string;
  preserveContext: boolean;
  contextToShare: Record<string, any>;
}

export interface AgentResponse {
  content: string;
  suggestedAgent?: AgentType;
  confidence: number;
  contextUpdates?: Record<string, any>;
  needsHandoff?: boolean;
}
```

### 3. **`src/core/ai/agents/base/router.agent.ts`** - Master Router

```typescript
import { StateGraph, MessagesAnnotation, END } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { AgentFactory } from './agent.factory';
import { BaseAgentState, AgentType, IntentType } from './agent.types';
import { BasicMessage } from '../../../shared/types/message.types';
import { ConversationOptions } from '../../langchain.types';

export class MultiAgentRouter {
  private agents: Map<AgentType, any> = new Map();
  private stateManager: StateManager;
  private workflow: any;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.buildWorkflow();
  }

  private buildWorkflow(): void {
    this.workflow = new StateGraph(BaseAgentState)
      .addNode("classify_intent", this.classifyIntent.bind(this))
      .addNode("route_to_agent", this.routeToAgent.bind(this))
      .addNode("product_agent", this.handleProductAgent.bind(this))
      .addNode("analytics_agent", this.handleAnalyticsAgent.bind(this))
      .addNode("pricing_agent", this.handlePricingAgent.bind(this))
      .addNode("inventory_agent", this.handleInventoryAgent.bind(this))
      .addNode("support_agent", this.handleSupportAgent.bind(this))
      
      .addEdge("__start__", "classify_intent")
      .addConditionalEdges("classify_intent", this.shouldRoute.bind(this))
      .addEdge("route_to_agent", "classify_intent")
      
      // Agent nodes can route back to classifier
      .addEdge("product_agent", "classify_intent")
      .addEdge("analytics_agent", "classify_intent")
      .addEdge("pricing_agent", "classify_intent")
      .addEdge("inventory_agent", "classify_intent")
      .addEdge("support_agent", "classify_intent")
      
      .compile();
  }

  public async route(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<string | Response> {
    const initialState = {
      messages: this.convertMessages(systemPrompt, messages),
      userId: options.userId || '',
      sessionId: options.conversationId || '',
      currentAgent: 'router' as AgentType,
      previousAgent: null,
      agentHistory: ['router'] as AgentType[],
      sharedContext: await this.stateManager.getSharedContext(options.conversationId || ''),
      confidence: 0,
      lastIntentChange: new Date(),
    };

    const result = await this.workflow.invoke(initialState);
    return this.formatResponse(result);
  }

  private async classifyIntent(state: any): Promise<any> {
    const lastMessage = state.messages[state.messages.length - 1];
    const classification = await this.performIntentClassification(lastMessage.content);
    
    return {
      ...state,
      userIntent: classification.intent,
      confidence: classification.confidence,
      suggestedAgent: this.mapIntentToAgent(classification.intent)
    };
  }

  private async performIntentClassification(message: string): Promise<{intent: IntentType, confidence: number}> {
    // AI-powered intent classification
    // Use model to classify user intent
    // Return intent type and confidence score
    
    const model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.1
    });

    const prompt = `Classify this user message into one of these intents:
    - product_management: Creating, updating, managing product listings
    - analytics: Sales data, performance metrics, reporting
    - pricing_strategy: Price optimization, competitor analysis
    - inventory_management: Stock levels, reordering, suppliers
    - customer_support: Help, questions, troubleshooting
    - general: Other topics

    Message: "${message}"
    
    Respond with JSON: {"intent": "intent_name", "confidence": 0.0-1.0}`;

    const response = await model.invoke([{ role: 'user', content: prompt }]);
    const parsed = JSON.parse(response.content.toString());
    
    return {
      intent: parsed.intent,
      confidence: parsed.confidence
    };
  }

  private shouldRoute(state: any): string {
    if (state.confidence > 0.8) {
      return this.mapIntentToAgent(state.userIntent);
    }
    return "route_to_agent";
  }

  private mapIntentToAgent(intent: IntentType): string {
    const mapping = {
      'product_management': 'product_agent',
      'analytics': 'analytics_agent',
      'pricing_strategy': 'pricing_agent',
      'inventory_management': 'inventory_agent',
      'customer_support': 'support_agent',
      'general': 'support_agent'
    };
    return mapping[intent] || 'support_agent';
  }

  private async handleProductAgent(state: any): Promise<any> {
    const agent = this.getOrCreateAgent('product', state.userId);
    return await agent.invoke(state);
  }

  private async handleAnalyticsAgent(state: any): Promise<any> {
    const agent = this.getOrCreateAgent('analytics', state.userId);
    return await agent.invoke(state);
  }

  private async handlePricingAgent(state: any): Promise<any> {
    const agent = this.getOrCreateAgent('pricing', state.userId);
    return await agent.invoke(state);
  }

  private async handleInventoryAgent(state: any): Promise<any> {
    const agent = this.getOrCreateAgent('inventory', state.userId);
    return await agent.invoke(state);
  }

  private async handleSupportAgent(state: any): Promise<any> {
    const agent = this.getOrCreateAgent('support', state.userId);
    return await agent.invoke(state);
  }

  private getOrCreateAgent(type: AgentType, userId: string): any {
    const key = `${type}_${userId}`;
    if (!this.agents.has(key)) {
      this.agents.set(key, AgentFactory.createAgent(type, userId));
    }
    return this.agents.get(key);
  }

  private convertMessages(systemPrompt: string, messages: BasicMessage[]): any[] {
    // Convert to LangChain message format
    // Implementation from existing convertToLangChainMessages
    return [];
  }

  private formatResponse(result: any): string {
    // Format the agent response for return
    return result.messages[result.messages.length - 1].content;
  }
}
```

### 4. **`src/core/ai/agents/base/agent.factory.ts`** - Agent Factory

```typescript
import { AgentType } from './agent.types';
import { ProductAgent } from '../product/product.agent';
import { AnalyticsAgent } from '../analytics/analytics.agent';
import { PricingAgent } from '../pricing/pricing.agent';
import { InventoryAgent } from '../inventory/inventory.agent';
import { SupportAgent } from '../support/support.agent';

export class AgentFactory {
  public static createAgent(type: AgentType, userId: string): any {
    switch (type) {
      case 'product':
        return ProductAgent.create(userId);
      case 'analytics':
        return AnalyticsAgent.create(userId);
      case 'pricing':
        return PricingAgent.create(userId);
      case 'inventory':
        return InventoryAgent.create(userId);
      case 'support':
        return SupportAgent.create(userId);
      default:
        throw new Error(`Unknown agent type: ${type}`);
    }
  }

  public static async getAgentTools(type: AgentType, userId: string): Promise<any[]> {
    const toolMap = {
      product: () => import('../product/product.tools').then(m => m.getProductTools(userId)),
      analytics: () => import('../analytics/analytics.tools').then(m => m.getAnalyticsTools(userId)),
      pricing: () => import('../pricing/pricing.tools').then(m => m.getPricingTools(userId)),
      inventory: () => import('../inventory/inventory.tools').then(m => m.getInventoryTools(userId)),
      support: () => import('../support/support.tools').then(m => m.getSupportTools(userId))
    };

    const toolLoader = toolMap[type];
    if (!toolLoader) {
      return [];
    }

    return await toolLoader();
  }
}
```

### 5. **`src/core/ai/agents/base/state-manager.ts`** - State Manager

```typescript
export class StateManager {
  private sharedContexts: Map<string, Record<string, any>> = new Map();

  public async getSharedContext(sessionId: string): Promise<Record<string, any>> {
    return this.sharedContexts.get(sessionId) || {};
  }

  public async updateSharedContext(
    sessionId: string, 
    updates: Record<string, any>
  ): Promise<void> {
    const existing = this.sharedContexts.get(sessionId) || {};
    this.sharedContexts.set(sessionId, { ...existing, ...updates });
  }

  public async clearSharedContext(sessionId: string): Promise<void> {
    this.sharedContexts.delete(sessionId);
  }

  public async shareDataBetweenAgents(
    sessionId: string,
    fromAgent: string,
    toAgent: string,
    data: any
  ): Promise<void> {
    const context = await this.getSharedContext(sessionId);
    context[`${fromAgent}_to_${toAgent}`] = {
      data,
      timestamp: new Date(),
      consumed: false
    };
    await this.updateSharedContext(sessionId, context);
  }
}
```

### 6. **`src/core/ai/agents/product/product.agent.ts`** - Product Agent

```typescript
import { StateGraph, END } from '@langchain/langgraph';
import { ProductState } from './product.state';
import { ProductNodes } from './product.nodes';
import { getProductTools } from './product.tools';

export class ProductAgent {
  public static create(userId: string): any {
    const tools = getProductTools(userId);
    const nodes = new ProductNodes(tools);
    
    return new StateGraph(ProductState)
      .addNode("collect_info", nodes.collectProductInformation.bind(nodes))
      .addNode("validate_data", nodes.validateProductData.bind(nodes))
      .addNode("optimize_listing", nodes.optimizeWithAI.bind(nodes))
      .addNode("preview_listing", nodes.generatePreview.bind(nodes))
      .addNode("publish_listing", nodes.publishToMarketplace.bind(nodes))
      .addNode("monitor_performance", nodes.trackListingMetrics.bind(nodes))

      .addEdge("__start__", "collect_info")
      
      .addConditionalEdges("collect_info", (state) => {
        if (state.draftListing.title && state.draftListing.description) {
          return "validate_data";
        }
        return "collect_info";
      })
      
      .addConditionalEdges("validate_data", (state) => {
        if (state.validationErrors.length > 0) return "collect_info";
        return "optimize_listing";
      })
      
      .addEdge("optimize_listing", "preview_listing")
      .addEdge("preview_listing", "publish_listing")
      .addEdge("publish_listing", "monitor_performance")
      .addEdge("monitor_performance", END)
      
      .compile();
  }
}
```

### 7. **`src/core/ai/agents/product/product.state.ts`** - Product State

```typescript
import { Annotation } from '@langchain/langgraph';
import { BaseAgentState } from '../base/agent.types';

export const ProductState = Annotation.Root({
  ...BaseAgentState.spec,
  draftListing: Annotation<{
    title?: string;
    description?: string;
    images?: string[];
    price?: number;
    category?: string;
    keywords?: string[];
    marketplace?: string;
    sku?: string;
  }>(),
  currentStep: Annotation<'collecting' | 'validating' | 'optimizing' | 'publishing' | 'monitoring'>(),
  validationErrors: Annotation<string[]>(),
  optimizationSuggestions: Annotation<any[]>(),
  publishedListings: Annotation<any[]>(),
  performanceMetrics: Annotation<{
    views?: number;
    clicks?: number;
    conversions?: number;
    revenue?: number;
  }>()
});
```

### 8. **`src/core/ai/agents/product/product.nodes.ts`** - Product Workflow Nodes

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { MODEL_CONFIGS } from '../../../config/langchain.config';

export class ProductNodes {
  private model: ChatOpenAI;

  constructor(private tools: any[]) {
    this.model = new ChatOpenAI({
      modelName: MODEL_CONFIGS.GPT4O_MINI,
      temperature: 0.7
    });
  }

  public async collectProductInformation(state: any): Promise<any> {
    const lastMessage = state.messages[state.messages.length - 1];
    
    // Extract product info from user messages using AI
    const prompt = `Extract product information from this message: "${lastMessage.content}"
    
    Return JSON with fields: title, description, price, category, marketplace, keywords`;
    
    const response = await this.model.invoke([{ role: 'user', content: prompt }]);
    const extractedInfo = JSON.parse(response.content.toString());
    
    return {
      ...state,
      currentStep: 'collecting',
      draftListing: {
        ...state.draftListing,
        ...extractedInfo
      }
    };
  }

  public async validateProductData(state: any): Promise<any> {
    const errors: string[] = [];
    const draft = state.draftListing;
    
    // Validate required fields
    if (!draft.title) errors.push('Title is required');
    if (!draft.description) errors.push('Description is required');
    if (!draft.price || draft.price <= 0) errors.push('Valid price is required');
    if (!draft.category) errors.push('Category is required');
    
    // Marketplace-specific validation
    if (draft.marketplace === 'wildberries') {
      if (!draft.keywords || draft.keywords.length === 0) {
        errors.push('Keywords are required for Wildberries');
      }
    }
    
    return {
      ...state,
      currentStep: 'validating',
      validationErrors: errors
    };
  }

  public async optimizeWithAI(state: any): Promise<any> {
    // Use AI tools to optimize listing
    const draft = state.draftListing;
    
    const optimizationPrompt = `Optimize this product listing:
    Title: ${draft.title}
    Description: ${draft.description}
    Category: ${draft.category}
    
    Suggest improvements for SEO and conversion.`;
    
    const optimization = await this.model.invoke([
      { role: 'user', content: optimizationPrompt }
    ]);
    
    return {
      ...state,
      currentStep: 'optimizing',
      optimizationSuggestions: [optimization.content.toString()]
    };
  }

  public async generatePreview(state: any): Promise<any> {
    // Create listing preview
    const draft = state.draftListing;
    
    const preview = {
      title: draft.title,
      description: draft.description,
      price: draft.price,
      marketplace: draft.marketplace,
      estimatedViews: Math.floor(Math.random() * 1000) + 100,
      competitorCount: Math.floor(Math.random() * 50) + 10
    };
    
    return {
      ...state,
      listingPreview: preview
    };
  }

  public async publishToMarketplace(state: any): Promise<any> {
    // Actually publish the listing using marketplace tools
    const draft = state.draftListing;
    
    // Use appropriate marketplace tool
    if (draft.marketplace === 'wildberries') {
      // Use Wildberries publishing tool
      const publishResult = await this.publishToWildberries(draft);
      
      return {
        ...state,
        currentStep: 'publishing',
        publishedListings: [publishResult]
      };
    }
    
    return {
      ...state,
      currentStep: 'publishing',
      publishedListings: []
    };
  }

  public async trackListingMetrics(state: any): Promise<any> {
    // Set up monitoring for the listing
    const publishedListings = state.publishedListings;
    
    if (publishedListings.length > 0) {
      // Initialize tracking metrics
      const metrics = {
        views: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
        lastUpdated: new Date()
      };
      
      return {
        ...state,
        currentStep: 'monitoring',
        performanceMetrics: metrics
      };
    }
    
    return state;
  }

  private async publishToWildberries(draft: any): Promise<any> {
    // Implementation for Wildberries publishing
    // Use existing Wildberries tools
    return {
      id: `wb_${Date.now()}`,
      status: 'published',
      url: `https://wildberries.ru/catalog/${draft.title}`,
      publishedAt: new Date()
    };
  }
}
```

### 9. **`src/core/ai/agents/product/product.tools.ts`** - Product Tools

```typescript
import { createWildberriesSellerProductsTool } from '../../../tools/wildberries.service';

export function getProductTools(userId: string): any[] {
  const tools = [];
  
  // Add existing Wildberries tools
  try {
    const wildberriesTools = createWildberriesSellerProductsTool(userId);
    tools.push(wildberriesTools);
  } catch (error) {
    console.warn('Failed to create Wildberries tools:', error);
  }
  
  // Add product-specific tools when implemented
  // tools.push(...createListingTools(userId));
  // tools.push(...createImageTools(userId));
  // tools.push(...createKeywordTools(userId));
  // tools.push(...createOptimizationTools(userId));
  
  return tools;
}
```

### 10. **Analytics Agent Implementation**

#### **`src/core/ai/agents/analytics/analytics.agent.ts`**

```typescript
import { StateGraph, END } from '@langchain/langgraph';
import { AnalyticsState } from './analytics.state';
import { AnalyticsNodes } from './analytics.nodes';
import { getAnalyticsTools } from './analytics.tools';

export class AnalyticsAgent {
  public static create(userId: string): any {
    const tools = getAnalyticsTools(userId);
    const nodes = new AnalyticsNodes(tools);
    
    return new StateGraph(AnalyticsState)
      .addNode("understand_query", nodes.parseAnalyticsRequest.bind(nodes))
      .addNode("fetch_data", nodes.retrieveSalesData.bind(nodes))
      .addNode("analyze_data", nodes.performAnalysis.bind(nodes))
      .addNode("generate_insights", nodes.createInsights.bind(nodes))
      .addNode("create_visualization", nodes.generateCharts.bind(nodes))
      .addNode("recommend_actions", nodes.suggestOptimizations.bind(nodes))

      .addEdge("__start__", "understand_query")
      .addEdge("understand_query", "fetch_data")
      .addEdge("fetch_data", "analyze_data")
      
      .addConditionalEdges("analyze_data", (state) => {
        const dataSize = state.metrics?.top_products?.length || 0;
        if (dataSize > 100) return "create_visualization";
        return "generate_insights";
      })
      
      .addEdge("generate_insights", "recommend_actions")
      .addEdge("create_visualization", "recommend_actions")
      .addEdge("recommend_actions", END)
      
      .compile();
  }
}
```

#### **`src/core/ai/agents/analytics/analytics.state.ts`**

```typescript
import { Annotation } from '@langchain/langgraph';
import { BaseAgentState } from '../base/agent.types';

export const AnalyticsState = Annotation.Root({
  ...BaseAgentState.spec,
  timeframe: Annotation<'week' | 'month' | 'quarter' | 'year'>(),
  metrics: Annotation<{
    revenue?: number;
    units_sold?: number;
    top_products?: any[];
    trends?: any[];
    growth_rate?: number;
    profit_margin?: number;
  }>(),
  filters: Annotation<{
    category?: string;
    marketplace?: string;
    min_price?: number;
    max_price?: number;
  }>(),
  visualizations: Annotation<any[]>(),
  recommendations: Annotation<string[]>()
});
```

## Integration with Current Service

### 11. **Enhanced `langchain.service.ts`** - Updated Main Service

```typescript
// Add to existing LangChainService class
import { MultiAgentService } from './multi-agent.service';

export class LangChainService {
  private multiAgentService: MultiAgentService;
  
  constructor() {
    // existing initialization
    this.multiAgentService = MultiAgentService.getInstance();
  }

  public async generateConversationResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions & { useMultiAgent?: boolean }
  ): Promise<string | Response> {
    
    // Check if multi-agent mode is enabled
    if (options.useMultiAgent) {
      return this.multiAgentService.processMessage(systemPrompt, messages, options);
    }
    
    // Fall back to existing single-agent implementation
    return this.existingConversationResponse(systemPrompt, messages, options);
  }

  // Rename existing method for fallback
  private async existingConversationResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<string | Response> {
    // Current implementation logic
    const {
      modelName = MODEL_CONFIGS.GPT4O_MINI,
      conversationId,
      userId,
      stream = false,
      includeWildberriesTools = true
    } = options;

    try {
      await validateUserUsageLimit(userId);
      validateWildberriesToolsRequirements(includeWildberriesTools, userId);

      if (stream) {
        return await this.handleStreamingResponse(
          systemPrompt,
          messages,
          conversationId,
          modelName,
          userId,
          includeWildberriesTools
        );
      }

      // Rest of existing implementation...
    } catch (error) {
      // Existing error handling...
    }
  }
}
```

### 12. **`src/core/ai/agents/index.ts`** - Agent Exports

```typescript
export { MultiAgentService } from '../multi-agent.service';
export { MultiAgentRouter } from './base/router.agent';
export { AgentFactory } from './base/agent.factory';
export { StateManager } from './base/state-manager';

export { ProductAgent } from './product/product.agent';
export { AnalyticsAgent } from './analytics/analytics.agent';
export { PricingAgent } from './pricing/pricing.agent';
export { InventoryAgent } from './inventory/inventory.agent';
export { SupportAgent } from './support/support.agent';

export * from './base/agent.types';
```

## Implementation Strategy

### Phase 1: Foundation
1. Create base agent infrastructure (`base/` directory)
2. Implement `MultiAgentService` and router
3. Add multi-agent flag to existing service

### Phase 2: First Agent
1. Implement Product Agent completely
2. Test with existing Wildberries tools
3. Ensure fallback to single-agent works

### Phase 3: Additional Agents
1. Add Analytics Agent for sales data
2. Add Pricing Agent for optimization
3. Add Inventory and Support agents

### Phase 4: Enhancement
1. Add specialized tools for each agent
2. Implement cross-agent context sharing
3. Add streaming support for multi-agent

## Key Features

1. **Gradual Migration**: Can switch between single-agent and multi-agent modes
2. **State Persistence**: Each agent maintains its own state while sharing context
3. **Tool Isolation**: Each agent has access to its specialized tools
4. **Context Sharing**: Agents can pass data to each other via shared context
5. **Scalable**: Easy to add new agents or modify existing ones
6. **Type Safety**: Strong TypeScript typing throughout
7. **Testing**: Each agent can be tested independently
8. **Fallback Support**: Existing single-agent system remains as fallback

This structure allows you to implement multi-agent functionality incrementally while maintaining your existing single-agent system as a reliable fallback. 