# Core Services Documentation

## Overview

Core services contain the business logic layer of the application. Each service is responsible for a specific domain and provides methods for controllers and other services to use.

## Service Architecture

```
src/core/
├── ai/                    # AI and LangChain services
│   ├── langchain.service.ts
│   ├── langchain.types.ts
│   ├── langchain.utils.ts
│   ├── prompts.ts
│   └── token-calculator.ts
├── auth/                  # Authentication services
│   └── auth.service.ts
├── conversations/         # Conversation management
│   ├── conversations.service.ts
│   ├── message.utils.ts
│   └── streaming.utils.ts
├── plans/                 # Subscription and usage
│   ├── user-plans.service.ts
│   ├── daily-usage.service.ts
│   └── validation.utils.ts
├── apiKeys/               # API key management
│   └── apikeys.service.ts
└── tools/                 # Marketplace tools
    ├── tool-execution.utils.ts
    ├── validation.utils.ts
    ├── wildberries.service.ts
    └── product/
        └── listing-tools.ts
```

---

## AI Service (`src/core/ai/langchain.service.ts`)

The AI service integrates LangChain with LangGraph for intelligent conversations and tool execution.

### LangChainService (Singleton)

#### Core Methods

```typescript
class LangChainService {
  // Get singleton instance
  static getInstance(): LangChainService

  // Simple chat without conversation history
  generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    options: ChatOptions = {}
  ): Promise<string>

  // Full conversation with history and tools
  generateConversationResponse(
    systemPrompt: string,
    messages: BasicMessage[],
    options: ConversationOptions
  ): Promise<BaseMessage[] | Response>

  // Get usage metrics
  getMetrics(userId: string, date?: string): Promise<TokenMetrics>
}
```

#### Features

**LangGraph Agent Architecture:**
- **Agent Node**: Core reasoning with tool binding
- **Tool Node**: Wildberries marketplace tool execution
- **Conditional Logic**: Determines when to use tools vs. respond
- **State Management**: Maintains conversation context

**Streaming Support:**
```typescript
// Enable streaming in options
const options = {
  stream: true,
  abortSignal: abortController.signal
};

// Returns Server-Sent Events stream
const stream = await langchainService.generateConversationResponse(
  systemPrompt,
  messages,
  options
);
```

**Tool Integration:**
- Automatic tool creation based on user API keys
- Tool validation and error handling
- Tool execution tracking and logging
- Support for Wildberries marketplace operations

**Token Tracking:**
- Automatic usage tracking for all AI calls
- Integration with usage limits and billing
- Daily and monthly usage aggregation

#### Usage Example

```typescript
import { getLangChainService } from '../core/ai/langchain.service';

const langchainService = getLangChainService();

// Simple chat
const response = await langchainService.generateChatResponse(
  "You are a helpful assistant",
  "Hello, how are you?",
  { userId: "user-123" }
);

// Conversation with tools
const conversation = await langchainService.generateConversationResponse(
  "You are a Wildberries marketplace assistant",
  messageHistory,
  {
    userId: "user-123",
    conversationId: "conv-456",
    includeWildberriesTools: true,
    stream: true
  }
);
```

### AI Utilities

**Token Calculator (`token-calculator.ts`):**
```typescript
// Extract token usage from AI responses
extractTokenUsage(result: any): TokenUsageResult
extractTokenUsageFromMetadata(metadata: any): TokenUsageResult
```

**Prompts (`prompts.ts`):**
```typescript
// Specialized system prompts
WILDBERRIES_SYSTEM_PROMPT: string
WILDBERRIES_EXTENDED_SYSTEM_PROMPT: string
```

**Message Utils (`langchain.utils.ts`):**
```typescript
// Convert between message formats
convertToLangChainMessages(
  systemPrompt: string, 
  messages: BasicMessage[]
): BaseMessage[]

formatMessagesToBasic(messages: BaseMessage[]): BasicMessage[]
```

---

## Authentication Service (`src/core/auth/auth.service.ts`)

Wraps Supabase authentication with custom business logic.

### AuthService (Singleton)

```typescript
interface SignupData {
  email: string;
  password: string;
  metadata?: {
    name?: string;
    [key: string]: any;
  };
}

interface LoginData {
  email: string;
  password: string;
}

class AuthService {
  // User registration
  signup(data: SignupData): Promise<AuthResponse>
  
  // User login
  login(data: LoginData): Promise<AuthResponse>
  
  // User logout
  logout(): Promise<{ error: AuthError | null }>
  
  // Password reset
  resetPassword(email: string): Promise<{ error: AuthError | null }>
  
  // Update password
  updatePassword(newPassword: string): Promise<{ error: AuthError | null }>
  
  // Get current session
  getSession(): Promise<{ data: Session | null; error: AuthError | null }>
  
  // Refresh session
  refreshSession(): Promise<AuthResponse>
}
```

#### Features

- **Supabase Integration**: Direct integration with Supabase Auth
- **Error Handling**: Comprehensive error handling and logging
- **Session Management**: Automatic token refresh and validation
- **Security Logging**: Failed login tracking and monitoring

#### Usage Example

```typescript
import { authService } from '../core/auth/auth.service';

// Register new user
const { data, error } = await authService.signup({
  email: 'user@example.com',
  password: 'securepassword',
  metadata: { name: 'John Doe' }
});

// Login user
const loginResult = await authService.login({
  email: 'user@example.com',
  password: 'securepassword'
});
```

---

## Conversation Service (`src/core/conversations/conversations.service.ts`)

Manages chat conversations and integrates with AI service.

### Core Functions

```typescript
// Get or create conversation
getOrCreateConversation(
  userId: string,
  conversationId: string | null,
  title: string,
  systemPrompt: string
): Promise<Conversation>

// Generate AI response and save messages
generateAndSaveResponse(
  userId: string,
  conversationId: string,
  userMessage: string,
  systemPrompt: string,
  stream: boolean,
  abortSignal?: AbortSignal
): Promise<{ response: BaseMessage[] | Response; conversationId: string }>
```

### Message Utilities

**Message Utils (`message.utils.ts`):**
```typescript
// Convert message formats
convertToLangChainMessages(
  systemPrompt: string,
  messages: BasicMessage[]
): BaseMessage[]

// Save messages to database
saveMessage(
  conversationId: string,
  message: BaseMessage,
  status?: string
): Promise<Message>

// Determine tool message status
determineToolMessageStatus(content: string): string
```

**Streaming Utils (`streaming.utils.ts`):**
```typescript
// Handle streaming responses
handleStreamingResponse(
  systemPrompt: string,
  messages: BasicMessage[],
  conversationId: string,
  options: ConversationOptions
): Promise<Response>
```

#### Features

- **Conversation Lifecycle**: Create, update, archive conversations
- **Message History**: Maintain conversation context and history
- **Streaming Integration**: Real-time response streaming
- **Tool Integration**: Seamless tool execution within conversations
- **Error Recovery**: Robust error handling for AI failures

---

## Plans Service (`src/core/plans/`)

Manages user subscriptions, usage tracking, and billing.

### User Plans Service (`user-plans.service.ts`)

```typescript
// Get user's current plan
getUserPlan(userId: string): Promise<UserPlan | null>

// Create or update user plan
upsertUserPlan(
  userId: string, 
  planData: Partial<UserPlan>
): Promise<UserPlan>

// Check usage limits
checkUserDailyUsage(userId: string): Promise<{
  hasReachedLimit: boolean;
  dailyUsageCredits: number;
  dailyLimitCredits: number;
  remainingDailyCredits: number;
  monthlyUsageCredits: number;
  monthlyLimitCredits: number;
  remainingMonthlyCredits: number;
  nextResetDate: string;
}>
```

### Daily Usage Service (`daily-usage.service.ts`)

```typescript
// Track token usage
upsertDailyUsage(
  userId: string,
  date: string,
  tokensUsed: number,
  cost: number,
  modelName: string
): Promise<DailyUsage>

// Get usage for date range
getAllDailyUsage(
  userId: string,
  fromDate?: string,
  toDate?: string
): Promise<DailyUsage[]>
```

### Validation Utils (`validation.utils.ts`)

```typescript
// Validate user can make requests
validateUserUsageLimit(userId?: string): Promise<void>
```

#### Plan Configuration

```typescript
const planDetailsMap = {
  free: {
    name: "Free",
    creditsPerDay: 0.50,
    creditsPerMonth: 5.00
  },
  standard: {
    name: "Standard", 
    creditsPerDay: 2.00,
    creditsPerMonth: 20.00
  },
  premium: {
    name: "Premium",
    creditsPerDay: 10.00,
    creditsPerMonth: 100.00
  }
};
```

---

## API Keys Service (`src/core/apiKeys/apikeys.service.ts`)

Securely manages marketplace API keys with encryption.

### ApiKeysService

```typescript
interface CreateApiKeyData {
  service: string;
  api_key: string;
}

class ApiKeysService {
  // Create or update API key
  upsertApiKey(
    userId: string, 
    data: CreateApiKeyData
  ): Promise<UserApiKey>
  
  // Get decrypted API key
  getApiKey(userId: string, service: string): Promise<string | null>
  
  // List user's API key services
  getUserApiKeys(userId: string): Promise<UserApiKey[]>
  
  // Delete API key
  deleteApiKey(userId: string, service: string): Promise<void>
  
  // Check if API key exists
  hasApiKey(userId: string, service: string): Promise<boolean>
}
```

#### Security Features

- **AES-256-GCM Encryption**: All API keys encrypted before storage
- **Service Validation**: Only allowed marketplace services accepted
- **Secure Retrieval**: Keys decrypted only when needed
- **Audit Logging**: All operations logged for security

#### Supported Services

- `wildberries` - Wildberries marketplace
- `ozon` - Ozon marketplace
- `yandexmarket` - Yandex Market

#### Usage Example

```typescript
import { apiKeysService } from '../core/apiKeys/apikeys.service';

// Store encrypted API key
await apiKeysService.upsertApiKey('user-123', {
  service: 'wildberries',
  api_key: 'wb_api_key_here'
});

// Retrieve decrypted key for use
const apiKey = await apiKeysService.getApiKey('user-123', 'wildberries');
```

---

## Tools Service (`src/core/tools/`)

Manages marketplace tool execution and validation.

### Tool Execution Utils (`tool-execution.utils.ts`)

```typescript
// Create tools map for user
createToolsMap(userId?: string): Record<string, any>

// Execute tools with error handling
executeTools(
  toolCalls: ToolCall[], 
  userId?: string
): Promise<ToolMessage[]>

// Get tool execution events for streaming
getToolExecutionEvents(toolCalls: ToolCall[]): any[]

// Parse tool execution results
parseToolExecutionResult(result: any): string
```

### Wildberries Tools

**Available Tools:**
- `getWildberriesSellerProductCardsTool` - Get product listings
- `createWildberriesProductCardTool` - Create new products
- `updateWildberriesProductCardTool` - Update existing products  
- `getWildberriesSubjectIdTool` - Get category IDs
- `setWildberriesProductsPriceTool` - Update product pricing
- `getWildberriesSellerProductsWithPriceTool` - Get products with pricing

### Tool Validation (`validation.utils.ts`)

```typescript
// Validate Wildberries tools requirements
validateWildberriesToolsRequirements(
  includeWildberriesTools: boolean,
  userId?: string
): void
```

#### Features

- **Dynamic Tool Creation**: Tools created based on user API keys
- **Error Handling**: Comprehensive tool execution error handling
- **Result Parsing**: Consistent tool result formatting
- **Validation**: API key and permission validation before execution

---

## Service Integration Patterns

### Dependency Injection
Services use singleton patterns and dependency injection:

```typescript
// AI Service usage in conversation service
import { getLangChainService } from '../ai/langchain.service';
const langchainService = getLangChainService();

// Database service usage
import * as databaseService from '../../infrastructure/database/database.service';
```

### Error Handling
All services implement consistent error handling:

```typescript
try {
  const result = await service.performOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', {
    error: error instanceof Error ? error.message : String(error),
    userId,
    operation: 'operationName'
  });
  throw error;
}
```

### Logging
Services use structured logging:

```typescript
import logger from '../../shared/utils/logger';

logger.info('Operation completed', {
  userId,
  operation: 'operationName',
  result: 'success'
});
```

### Usage Validation
AI-related services validate usage limits:

```typescript
import { validateUserUsageLimit } from '../plans/validation.utils';

await validateUserUsageLimit(userId);
// Proceed with operation
``` 