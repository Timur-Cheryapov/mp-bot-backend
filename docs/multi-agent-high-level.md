## Agent Router - The Traffic Director

The **Agent Router** (shown in the diagram but implemented as part of `MultiAgentStreamingManager`) is the intelligent traffic director that:

1. **Receives incoming requests**
2. **Analyzes the user's intent**
3. **Consults the Agent Registry to find the right agent**
4. **Routes the request to the appropriate agent**

## High-Level Usage Example

Here's how you'd use this system in practice:

```typescript
// 1. Initialize the system
const agentRegistry = new AgentRegistry();
const contextStore = new RedisContextStore(redis);
const dbPersistence = new DatabasePersistence(supabase);

// 2. Register your agents (plug & play!)
const productAgent = new ProductAgent();
const analyticsAgent = new AnalyticsAgent();
const pricingAgent = new PricingAgent();

agentRegistry.registerAgent(productAgent);
agentRegistry.registerAgent(analyticsAgent);
agentRegistry.registerAgent(pricingAgent);

// 3. Create the router/streaming manager
const streamingManager = new MultiAgentStreamingManager(
  agentRegistry,
  contextStore,
  dbPersistence
);

// 4. Handle incoming messages
app.post('/api/chat', async (req, res) => {
  const { message, conversationId, userId } = req.body;
  
  const context = {
    conversationId,
    userId,
    messages: await getConversationHistory(conversationId)
  };
  
  // The router automatically:
  // - Determines which agent should handle this
  // - Switches agents if needed
  // - Streams the response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  for await (const event of streamingManager.processMessage(message, context)) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
  
  res.end();
});
```

## How Agent Selection Works

```typescript
// Each agent defines what it can handle
class ProductAgent extends BaseAgent {
  intents = ['product', 'listing', 'create', 'optimize', 'publish'];
  
  canHandle(intent: string, context: ConversationContext): boolean {
    // User says: "I want to create a product listing"
    // This returns true because "create" and "product" match
    return this.intents.some(pattern => 
      intent.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}

class AnalyticsAgent extends BaseAgent {
  intents = ['analytics', 'report', 'performance', 'sales', 'metrics'];
  
  canHandle(intent: string, context: ConversationContext): boolean {
    // User says: "Show me sales analytics"
    // This returns true because "analytics" and "sales" match
    return this.intents.some(pattern => 
      intent.toLowerCase().includes(pattern.toLowerCase())
    );
  }
}
```

## Real-World Conversation Flow

```typescript
// User: "I want to create a product listing"
// Router: Analyzes intent → finds ProductAgent → routes there

// User: "What are the sales numbers for this product?"
// Router: Analyzes intent → finds AnalyticsAgent → switches to it

// User: "Update the price to $29.99"
// Router: Analyzes intent → finds PricingAgent → switches again
```

## Key Benefits

- **🎯 Smart Routing**: Automatically finds the right expert for each task
- **🔄 Seamless Switching**: Users don't notice when agents change
- **🔌 Easy Scaling**: Just register new agents and they're available
- **🧠 Context Preservation**: Shared memory across all agents
- **📊 Full Transparency**: Track which agent handled what

The beauty is that users just have a conversation, while behind the scenes you have a team of specialized AI agents working together! 
