# API Routes Documentation

## Overview

The API routes are organized into feature-specific modules, each handling a specific domain of functionality. All routes are prefixed with `/api` and most require authentication.

## Route Structure

```
/api
├── /auth              # Authentication endpoints
├── /conversation      # AI chat and conversation management
├── /api-keys         # Marketplace API key management
├── /plans            # User subscription and usage
├── /metrics          # Usage analytics
└── /prompt-demo      # Development and testing
```

## Authentication Routes (`/api/auth`)

### POST `/api/auth/signup`
Register a new user account.

**Request Body:**
```typescript
{
  email: string;      // Valid email address
  password: string;   // Minimum 8 characters
  name?: string;      // Optional display name
}
```

**Response:**
```typescript
{
  message: string;
  userId?: string;
  email?: string;
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securepassword123",
    "name": "John Doe"
  }'
```

### POST `/api/auth/login`
Authenticate user and receive session token.

**Request Body:**
```typescript
{
  email: string;
  password: string;
}
```

**Response:**
```typescript
{
  message: string;
  user: {
    id: string;
    email: string;
    // ... other user fields
  };
  session: {
    access_token: string;
    // ... session details
  };
}
```

**Rate Limiting:** 5 attempts per hour
**Security:** Tracks failed login attempts, implements account lockout

### POST `/api/auth/logout`
Invalidate current user session.

**Authentication:** Required
**Response:**
```typescript
{
  message: "Logout successful"
}
```

### GET `/api/auth/me`
Get current authenticated user details.

**Authentication:** Required
**Response:**
```typescript
{
  user: {
    id: string;
    email: string;
    role: string;
    created_at: string;
  }
}
```

---

## Conversation Routes (`/api/conversation`)

### GET `/api/conversation`
Retrieve user's conversation list.

**Authentication:** Required
**Query Parameters:**
- `includeArchived?: boolean` - Include archived conversations
- `limit?: number` - Number of conversations to return (default: 20)
- `offset?: number` - Pagination offset (default: 0)

**Response:**
```typescript
{
  conversations: Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
    message_count: number;
    is_archived: boolean;
  }>
}
```

### POST `/api/conversation` or `/api/conversation/:conversationId`
Send message and receive AI response.

**Authentication:** Required
**Request Body:**
```typescript
{
  message: string;           // User message content
  conversationId?: string;   // Optional existing conversation ID
  title?: string;           // Title for new conversation
  stream?: boolean;         // Enable streaming response
}
```

**Response (Non-streaming):**
```typescript
{
  conversationId: string;
  response: {
    content: string;
    role: "assistant";
    // ... other message fields
  };
}
```

**Response (Streaming):**
Server-Sent Events with:
- `data: {"type": "chunk", "content": "..."}`
- `data: {"type": "tool_execution", "tools": [...]}`
- `data: {"type": "done"}`

**Features:**
- Automatic conversation creation if ID not provided
- Wildberries marketplace tool integration
- Client disconnect handling with AbortController
- Message history context management

---

## API Keys Routes (`/api/api-keys`)

### POST `/api/api-keys`
Create or update a marketplace API key.

**Authentication:** Required
**Request Body:**
```typescript
{
  service: "wildberries" | "ozon" | "yandexmarket";
  api_key: string;  // Minimum 10 characters
}
```

**Response:**
```typescript
{
  message: "API key saved successfully";
  data: {
    user_id: string;
    service: string;
    api_key: "***ENCRYPTED***";
    created_at: string;
  }
}
```

**Security:** 
- API keys encrypted with AES-256-GCM
- Rate limited: 20 requests per 15 minutes

### GET `/api/api-keys`
List user's configured API key services.

**Authentication:** Required
**Response:**
```typescript
{
  message: "API keys retrieved successfully";
  data: Array<{
    service: string;
    created_at: string;
    // api_key field excluded for security
  }>;
  count: number;
}
```

### DELETE `/api/api-keys/:service`
Remove an API key for a specific service.

**Authentication:** Required
**Parameters:**
- `service` - Service name (wildberries, ozon, yandexmarket)

**Response:**
```typescript
{
  message: "API key deleted successfully"
}
```

### HEAD `/api/api-keys/:service`
Check if user has an API key for a service.

**Authentication:** Required
**Response:** HTTP status code only
- `200` - API key exists
- `404` - No API key found

---

## Plans Routes (`/api/plans`)

### GET `/api/plans`
Get current user's subscription plan and usage.

**Authentication:** Required
**Response:**
```typescript
{
  plan: {
    id: string;
    user_id: string;
    plan_name: "Free" | "Standard" | "Premium";
    max_credits_per_day: number;
    max_credits_per_month: number;
    active: boolean;
    reset_date: string;
  };
  message?: string;  // If default plan created
}
```

**Plan Details:**
```typescript
{
  free: {
    creditsPerDay: 0.50,
    creditsPerMonth: 5.00
  },
  standard: {
    creditsPerDay: 2.00,
    creditsPerMonth: 20.00
  },
  premium: {
    creditsPerDay: 10.00,
    creditsPerMonth: 100.00
  }
}
```

---

## Metrics Routes (`/api/metrics`)

### GET `/api/metrics`
Get usage metrics for authenticated user.

**Authentication:** Required
**Query Parameters:**
- `date?: string` - Specific date (YYYY-MM-DD format)

**Response:**
```typescript
{
  usage: {
    date: string;
    total_credits: number;
    requests_count: number;
    // ... other metrics
  }
}
```

---

## Demo Routes (`/api/prompt-demo`)

### POST `/api/prompt-demo/conversation`
Authenticated conversation endpoint for testing.

**Authentication:** Required
**Request Body:**
```typescript
{
  message: string;
  systemPrompt?: string;
  conversationId?: string;
  title?: string;
  history?: Array<{role: string, content: string}>;
}
```

### POST `/api/prompt-demo/chat`
Simple chat endpoint without authentication (development only).

**Authentication:** Not required
**Request Body:**
```typescript
{
  message: string;
  systemPrompt?: string;
}
```

**Response:**
```typescript
{
  response: string;
}
```

---

## Common Response Patterns

### Success Response
```typescript
{
  status?: "success";
  message?: string;
  data?: any;
}
```

### Error Response
```typescript
{
  status: "error";
  message: string;
  validationErrors?: Array<{
    field: string;
    message: string;
  }>;
  stack?: string;  // Development only
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request / Validation Error
- `401` - Unauthorized
- `403` - Forbidden / CSRF Error
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

---

## Middleware Applied to All Routes

1. **CSRF Protection** - All state-changing operations
2. **CORS** - Configured for frontend origins
3. **Rate Limiting** - Global and endpoint-specific limits
4. **Security Headers** - Helmet.js security headers
5. **Request Logging** - Structured logging for all requests
6. **Error Handling** - Centralized error processing

---

## Testing Endpoints

### Error Simulation
```bash
# Test operational error
GET /api/error-demo?type=operational

# Test unhandled error  
GET /api/error-demo?type=unhandled
```

### AI Joke Endpoint
```bash
# Simple LangChain test
GET /api/joke?language=TypeScript&stream=false
``` 