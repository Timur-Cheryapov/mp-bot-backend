# Infrastructure Documentation

## Overview

The infrastructure layer handles data persistence and external service integrations. It provides a clean abstraction over database operations and manages connections to external services like Supabase.

## Infrastructure Architecture

```
src/infrastructure/
├── database/
│   ├── database.service.ts    # Database operations wrapper
│   └── supabase.client.ts     # Supabase connection management
```

---

## Database Service (`src/infrastructure/database/database.service.ts`)

The database service provides high-level operations for common database tasks, wrapping Supabase client calls with error handling and logging.

### Core Operations

#### User Operations

```typescript
// Get user by ID
getUserById(userId: string): Promise<User | null>
```

**Features:**
- Attempts to use Supabase admin API first
- Falls back to session-based user verification
- Returns standardized User object
- Handles authentication edge cases

#### Conversation Operations

```typescript
// Get conversation by ID
getConversationById(conversationId: string): Promise<Conversation | null>

// Get user's conversations with pagination
getUserConversations(
  userId: string, 
  options?: { 
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<Conversation[]>

// Create new conversation
createConversation(
  userId: string, 
  title: string,
  options?: {
    model_name?: string;
    system_prompt?: string;
    temperature?: number;
    max_tokens?: number;
    context_length?: number;
    message_count?: number;
    metadata?: Record<string, any>;
  }
): Promise<Conversation>

// Update conversation
updateConversation(
  conversationId: string, 
  updates: Partial<Conversation>
): Promise<void>

// Archive conversation
archiveConversation(conversationId: string): Promise<void>

// Delete conversation
deleteConversation(conversationId: string): Promise<void>
```

#### Message Operations

```typescript
// Get messages for conversation
getMessagesByConversationId(
  conversationId: string,
  limit = 50,
  before?: string
): Promise<Message[]>

// Create new message
createMessage(
  conversationId: string,
  content: string,
  role: 'user' | 'assistant' | 'tool',
  metadata?: Record<string, any>,
  status: 'pending' | 'success' | 'error' | 'aborted' = 'success',
  toolCalls?: ToolCall[],
  toolCallId?: string,
  toolName?: string
): Promise<Message>

// Update message
updateMessage(
  messageId: string,
  updates: Partial<Pick<Message, 'content' | 'metadata'>>
): Promise<void>

// Delete message
deleteMessage(messageId: string): Promise<void>
```

### Error Handling

All database operations use a centralized error handler:

```typescript
const handleDatabaseError = (operation: string, error: PostgrestError | Error): never => {
  const errorMessage = error instanceof Error 
    ? error.message 
    : (error as PostgrestError).message || 'Unknown database error';

  logger.error(`Database ${operation} failed: ${errorMessage}`, {
    details: error instanceof Error ? error.stack : (error as PostgrestError).details,
    hint: (error as PostgrestError).hint,
    code: (error as PostgrestError).code
  });

  throw new Error(`Database operation failed: ${errorMessage}`);
};
```

**Features:**
- Consistent error logging across all operations
- Detailed error information for debugging
- Converts database errors to application errors
- Preserves original error context

### Usage Examples

```typescript
import * as databaseService from '../infrastructure/database/database.service';

// Create a conversation
const conversation = await databaseService.createConversation(
  'user-123',
  'New Chat',
  {
    model_name: 'gpt-4o-mini',
    system_prompt: 'You are a helpful assistant',
    context_length: 200000
  }
);

// Get conversation history
const messages = await databaseService.getMessagesByConversationId(
  conversation.id,
  50 // limit
);

// Save user message
const userMessage = await databaseService.createMessage(
  conversation.id,
  'Hello, how are you?',
  'user'
);

// Save AI response with tool calls
const aiMessage = await databaseService.createMessage(
  conversation.id,
  'I can help you with that.',
  'assistant',
  { model: 'gpt-4o-mini' },
  'success',
  [{ id: 'tool_123', name: 'search', args: {} }]
);
```

---

## Supabase Client (`src/infrastructure/database/supabase.client.ts`)

The Supabase client manages the connection to Supabase and provides type-safe database schemas.

### Database Types

```typescript
export type User = {
  id: string;
  created_at: string;
  email: string;
  role: string;
  last_seen_at?: string;
};

export type Conversation = {
  id: string;
  created_at: string;
  user_id: string;
  title: string;
  updated_at?: string;
  model_name?: string;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  context_length?: number;
  is_archived?: boolean;
  message_count?: number;
  metadata?: Record<string, any>;
};

export type Message = {
  id: string;
  created_at: string;
  conversation_id: string;
  content: string;
  role: 'user' | 'assistant' | 'tool';
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  tool_name?: string;
  status?: 'pending' | 'success' | 'error' | 'aborted';
  metadata?: Record<string, any>;
};

export type DailyUsage = {
  id: string;
  user_id: string;
  date: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_cost: number;
  model_name: string;
  requests_count: number;
  created_at: string;
  updated_at: string;
};

export type UserPlan = {
  id: string;
  user_id: string;
  plan_name: string;
  max_credits_per_day: number;
  max_credits_per_month: number;
  active: boolean;
  reset_date: string;
  created_at: string;
  updated_at: string;
};

export interface UserApiKey {
  user_id: string;
  service: string;
  api_key: string;
  created_at?: string;
  updated_at?: string;
}
```

### SupabaseService (Singleton)

```typescript
class SupabaseService {
  private static instance: SupabaseService;
  private client: SupabaseClient | null = null;
  private connectionAttempts = 0;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  
  // Get singleton instance
  public static getInstance(): SupabaseService
  
  // Get the Supabase client
  public getClient(): SupabaseClient
  
  // Check if client is initialized
  public isInitialized(): boolean
  
  // Reset connection and retry
  public resetConnection(): void
}
```

### Client Configuration

```typescript
// Initialize with configuration
this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'x-application-name': 'mp-bot-backend',
    },
  },
});
```

**Features:**
- **Session Persistence**: Maintains authentication state
- **Auto Refresh**: Automatically refreshes expired tokens
- **Custom Headers**: Identifies requests from the application
- **Retry Logic**: Automatically retries failed connections
- **Error Handling**: Comprehensive connection error handling

### Environment Configuration

```typescript
// Required environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
```

**Validation:**
- Validates required environment variables on initialization
- Fails fast if configuration is incomplete
- Provides clear error messages for missing configuration

### Connection Management

**Initialization:**
```typescript
private initializeClient(): void {
  try {
    // Validate environment variables
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing required environment variables');
    }
    
    // Create client with configuration
    this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, config);
    
    logger.info('Supabase client initialized successfully');
  } catch (error) {
    this.handleConnectionError(error);
  }
}
```

**Retry Logic:**
```typescript
private handleConnectionError(error: Error): void {
  this.connectionAttempts += 1;
  
  if (this.connectionAttempts < this.MAX_RETRY_ATTEMPTS) {
    logger.warn(`Supabase initialization failed, retrying (${this.connectionAttempts}/${this.MAX_RETRY_ATTEMPTS})...`);
    setTimeout(() => this.initializeClient(), 1000 * this.connectionAttempts);
  } else {
    logger.error('Supabase initialization failed after max retries');
    this.client = null;
  }
}
```

### Usage Examples

```typescript
import { getSupabaseClient } from '../infrastructure/database/supabase.client';

// Get client instance
const supabase = getSupabaseClient();

// Perform database operations
const { data, error } = await supabase
  .from('conversations')
  .select('*')
  .eq('user_id', userId)
  .order('updated_at', { ascending: false });

// Authentication operations
const { data: session, error: authError } = await supabase.auth.getSession();

// Real-time subscriptions
const channel = supabase
  .channel('conversation-changes')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages'
  }, payload => {
    console.log('New message:', payload);
  })
  .subscribe();
```

---

## Database Schema

### Core Tables

**Users Table:**
- Managed by Supabase Auth
- Extended with custom metadata
- Role-based access control

**Conversations Table:**
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  model_name TEXT,
  system_prompt TEXT,
  temperature FLOAT,
  max_tokens INTEGER,
  context_length INTEGER,
  is_archived BOOLEAN DEFAULT FALSE,
  message_count INTEGER DEFAULT 0,
  metadata JSONB
);
```

**Messages Table:**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT CHECK (role IN ('user', 'assistant', 'tool')),
  tool_calls JSONB,
  tool_call_id TEXT,
  tool_name TEXT,
  status TEXT CHECK (status IN ('pending', 'success', 'error', 'aborted')),
  metadata JSONB
);
```

**Daily Usage Table:**
```sql
CREATE TABLE daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  total_tokens INTEGER DEFAULT 0,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  model_name TEXT NOT NULL,
  requests_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date, model_name)
);
```

**User Plans Table:**
```sql
CREATE TABLE user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_name TEXT NOT NULL,
  max_credits_per_day DECIMAL(10,2) NOT NULL,
  max_credits_per_month DECIMAL(10,2) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  reset_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**User API Keys Table:**
```sql
CREATE TABLE user_api_keys (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  api_key TEXT NOT NULL, -- Encrypted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, service)
);
```

### Indexes and Performance

**Optimized Queries:**
```sql
-- Conversation lookup by user
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- Message lookup by conversation
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Usage tracking
CREATE INDEX idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX idx_daily_usage_date ON daily_usage(date);
```

---

## Row Level Security (RLS)

Supabase RLS policies ensure data isolation between users:

```sql
-- Conversations: Users can only access their own
CREATE POLICY "Users can view own conversations" ON conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations" ON conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Messages: Access through conversation ownership
CREATE POLICY "Users can view messages in own conversations" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = auth.uid()
    )
  );

-- Usage: Users can only view their own usage
CREATE POLICY "Users can view own usage" ON daily_usage
  FOR SELECT USING (auth.uid() = user_id);
```

---

## Migration Management

Database migrations are stored in `/migrations` directory:

```
migrations/
├── initial_schema.sql          # Base schema
├── add_tool_support.sql       # Tool call support
├── add_message_count.sql       # Conversation message counting
├── add_user_plans.sql          # Subscription plans
├── add_aborted_status.sql      # Message abort status
├── create_user_api_keys_table.sql  # API key storage
├── sync_users.sql              # User synchronization
└── update_foreign_key.sql      # Foreign key updates
```

**Migration Strategy:**
- Each migration is a standalone SQL file
- Applied manually via Supabase dashboard or CLI
- Changes are tracked in version control
- Rollback procedures documented for each migration

---

## Performance Considerations

### Connection Pooling
- Supabase handles connection pooling automatically
- No additional pooling configuration required
- Connections are managed at the service level

### Query Optimization
- Use selective field queries: `select('id, title')`
- Implement pagination for large result sets
- Use proper indexes for common query patterns
- Avoid N+1 queries with proper joins

### Caching Strategy
- Application-level caching for frequently accessed data
- Consider Redis for session and temporary data
- Use Supabase real-time for live updates instead of polling

### Monitoring
- Database performance monitoring via Supabase dashboard
- Query analysis and optimization recommendations
- Connection and error rate monitoring
- Usage tracking for capacity planning 