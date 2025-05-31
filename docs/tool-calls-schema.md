# Tool Calls Database Schema

This document explains how tool calls are handled in the database schema and integrated with LangChain.

## Overview

The messages table now properly supports LangChain's tool calling pattern with three distinct message types:

1. **Human Messages** - User input
2. **AI Messages** - Assistant responses (may include tool calls)
3. **Tool Messages** - Tool execution results

## Database Schema

### Messages Table Structure

```sql
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  
  -- Tool call fields for assistant messages (when AI calls tools)
  tool_calls JSONB DEFAULT NULL,
  
  -- Tool message fields (for tool responses)
  tool_call_id TEXT DEFAULT NULL,
  tool_name TEXT DEFAULT NULL,
  status TEXT DEFAULT NULL CHECK (status IS NULL OR status IN ('pending', 'success', 'error')),
  
  metadata JSONB DEFAULT '{}'::jsonb
);
```

### Field Usage by Message Type

#### User Messages (`role = 'user'`)
- `content`: User's message
- All tool-related fields are NULL

#### Assistant Messages (`role = 'assistant'`)
- `content`: AI's response text
- `tool_calls`: Array of tool calls if the AI wants to call tools
- Other tool fields are NULL

#### Tool Messages (`role = 'tool'`)
- `content`: Tool execution result or error message
- `tool_call_id`: Reference to the original tool call ID
- `tool_name`: Name of the tool that was executed
- `status`: 'success', 'error', or 'pending'
- `tool_calls` is NULL

## Message Flow Example

### 1. User asks a question
```sql
INSERT INTO messages (conversation_id, content, role) 
VALUES ('conv-123', 'Show me my Wildberries products', 'user');
```

### 2. AI responds with tool calls
```sql
INSERT INTO messages (conversation_id, content, role, tool_calls) 
VALUES (
  'conv-123', 
  'I'll fetch your Wildberries products for you.',
  'assistant',
  '[{"id": "call_123", "name": "wildberries_seller_products", "args": {}}]'
);
```

### 3. Tool execution results
```sql
INSERT INTO messages (conversation_id, content, role, tool_call_id, tool_name, status) 
VALUES (
  'conv-123',
  '{"products": [{"name": "Product 1", "price": 100}]}',
  'tool',
  'call_123',
  'wildberries_seller_products',
  'success'
);
```

### 4. Final AI response with tool results
```sql
INSERT INTO messages (conversation_id, content, role) 
VALUES (
  'conv-123',
  'Here are your Wildberries products: Product 1 - $100',
  'assistant'
);
```

## LangChain Integration

### Message History Construction

When retrieving conversation history for LangChain, messages are converted as follows:

```typescript
const history = messages.map(msg => {
  const baseMessage = {
    role: msg.role,
    content: msg.content,
  };
  
  // Add tool-specific fields for tool messages
  if (msg.role === 'tool') {
    return {
      ...baseMessage,
      tool_call_id: msg.tool_call_id,
      tool_name: msg.tool_name
    };
  }
  
  return baseMessage;
});
```

### Tool Call Execution Flow

1. **Initial AI Response**: May contain `tool_calls` array
2. **Tool Execution**: Each tool call generates a `ToolMessage`
3. **Final Response**: AI processes tool results and provides final answer

## Benefits of This Schema

1. **Proper Tool Call Tracking**: Each tool call and result is properly linked
2. **Error Handling**: Tool execution status is tracked
3. **Performance**: Dedicated indexes for tool-related queries
4. **Flexibility**: Supports multiple tool calls per message
5. **LangChain Compatibility**: Direct mapping to LangChain message types

## Migration

To migrate existing data:

1. Run the migration script: `migrations/add_tool_support.sql`
2. Existing tool data in metadata will be migrated to dedicated columns
3. New indexes will be created for optimal performance

## Query Examples

### Find all tool calls in a conversation
```sql
SELECT * FROM messages 
WHERE conversation_id = 'conv-123' 
  AND tool_calls IS NOT NULL;
```

### Find failed tool executions
```sql
SELECT * FROM messages 
WHERE role = 'tool' 
  AND status = 'error';
```

### Get tool execution results for a specific call
```sql
SELECT * FROM messages 
WHERE tool_call_id = 'call_123';
``` 