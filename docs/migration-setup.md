# LangGraph Migration Setup

This document describes how to migrate from the legacy LangChain implementation to LangGraph-based implementation.

## Feature Flags Configuration

Add these environment variables to your `.env` file to control the migration:

```bash
# LangGraph Migration Feature Flags
# Set to 'true' to enable LangGraph implementation
USE_LANGGRAPH=false

# Optional: Enable comparison mode to test both implementations  
COMPARE_IMPLEMENTATIONS=false
```

## Migration Strategy

### Phase 1: Non-Streaming Endpoints ✅ COMPLETED
- ✅ Created `langchain-langgraph.ts` with LangGraph implementation
- ✅ Renamed original to `langchain-legacy.ts` 
- ✅ Created unified service with feature flags in `langchain.ts`
- ✅ Set up feature flag system in `config/features.ts`
- ✅ Fixed LangGraph state definition syntax
- ✅ Successful build with TypeScript compilation

**Status**: Ready for testing non-streaming endpoints with feature flags

### Phase 2: Streaming Implementation (Next)
- [ ] Implement LangGraph streaming using `streamMode: "messages"`
- [ ] Test streaming with tool calls
- [ ] Migrate streaming endpoints

### Phase 3: Full Migration (Future)
- [ ] Test all endpoints thoroughly
- [ ] Remove legacy implementation
- [ ] Clean up feature flags

## Testing the Migration

1. **Test with Legacy (Default)**:
   ```bash
   USE_LANGGRAPH=false npm run dev
   ```

2. **Test with LangGraph**:
   ```bash
   USE_LANGGRAPH=true npm run dev
   ```

3. **Enable Debug Logging** (in development):
   ```bash
   NODE_ENV=development USE_LANGGRAPH=true npm run dev
   ```

## Quick Feature Flag Test

To verify the feature flag system is working correctly:

```typescript
import { getLangChainService } from './src/services/langchain';

// Check current implementation being used
const service = getLangChainService();
console.log(service.getServiceStatus());

// Test simple chat with LangGraph
const response = await service.generateChatResponse(
  "You are a helpful assistant.",
  "Hello, how are you?",
  { userId: "test-user" }
);
console.log("Response:", response);
```

## Current Implementation Status

### ✅ Implemented in LangGraph
- Non-streaming conversation responses
- Tool calling with Wildberries tools
- Token usage tracking with built-in usage metadata
- Message persistence to database
- Error handling with automatic fallback to legacy
- ReAct agent pattern with StateGraph
- Proper TypeScript annotations and state management

### ❌ Not Yet Implemented
- Streaming responses (falls back to legacy automatically)
- Direct model creation API (falls back to legacy)
- Advanced configuration options

## Service Selection Logic

The unified service automatically chooses between implementations based on:

1. **Feature flags**: `USE_LANGGRAPH_*` environment variables
2. **Capability**: Falls back to legacy for unimplemented features (e.g., streaming)
3. **Error handling**: Falls back to legacy if LangGraph fails

### Example Flow:
1. User calls `generateChatResponse` or `generateConversationResponse`
2. System checks `USE_LANGGRAPH_CHAT` and `USE_LANGGRAPH_CONVERSATION` flags
3. If streaming is requested, also checks `USE_LANGGRAPH_STREAMING` flag
4. LangGraph implementation attempts processing
5. If LangGraph fails or feature not implemented, automatically falls back to legacy
6. Response is returned seamlessly to client

## Debugging

Use the service status endpoint to check which implementation is being used:

```typescript
const service = getLangChainService();
console.log(service.getServiceStatus());
```

Example output with LangGraph disabled:
```json
{
  "useLangGraphChat": false,
  "useLangGraphConversation": false, 
  "useLangGraphStreaming": false,
  "useLangGraphTools": false,
  "timestamp": "2025-01-03T10:30:00.000Z"
}
```

Example output with LangGraph enabled:
```json
{
  "useLangGraphChat": true,
  "useLangGraphConversation": true, 
  "useLangGraphStreaming": false,
  "useLangGraphTools": true,
  "timestamp": "2025-01-03T10:30:00.000Z"
}
```

## Next Steps

1. **Test the current implementation** with your existing API endpoints
2. **Verify fallback behavior** by intentionally causing errors
3. **Monitor logs** to see which implementation is being used
4. **Begin Phase 2** by implementing streaming support in LangGraph when ready

The migration foundation is now complete and ready for production testing! 