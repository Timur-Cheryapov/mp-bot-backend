# MP Bot Backend Documentation

## Overview

MP Bot Backend is a TypeScript/Express.js application that provides AI-powered marketplace business assistance, specifically designed for Wildberries sellers. The application integrates LangChain for AI capabilities, Supabase for data persistence, and provides comprehensive APIs for user management, conversations, and marketplace tools.

This is a backend for the project [MP Bot](https://timur-cheryapov.github.io/mp-bot/index.html). Frontend version can be seen via this [link](https://github.com/Timur-Cheryapov/mp-bot-frontend).

<img width="1977" height="1243" alt="conversation-flow" src="https://github.com/user-attachments/assets/739a4382-2185-4aad-babb-2b9d77dcf426" />

## Architecture

```
mp-bot-backend/
├── src/
│   ├── api/              # API route handlers
│   ├── core/             # Business logic services
│   ├── infrastructure/   # Database and external services
│   ├── shared/           # Common utilities and middleware
│   └── server.ts         # Application entry point
├── docs/                 # Documentation
├── migrations/           # Database schema migrations
└── tasks/               # Task management
```

## Core Components

### [API Routes](./docs/API_ROUTES.md)
RESTful API endpoints organized by feature:
- **Authentication** - User signup, login, session management
- **Conversations** - AI chat sessions and message history
- **API Keys** - Secure marketplace API key management
- **Plans** - User subscription and usage tracking
- **Metrics** - Usage analytics and monitoring
- **Demo** - Development and testing endpoints

### [Core Services](./docs/CORE_SERVICES.md)
Business logic layer containing:
- **AI Service** - LangChain integration with LangGraph agent workflows
- **Auth Service** - Supabase authentication wrapper
- **Conversation Service** - Chat session management
- **Plans Service** - Subscription and usage limit management
- **API Keys Service** - Encrypted key storage and validation
- **Tools Service** - Wildberries marketplace API integrations

### [Infrastructure](./docs/INFRASTRUCTURE.md)
Data persistence and external service integrations:
- **Database Service** - Supabase operations wrapper
- **Supabase Client** - Connection management and configuration

### [Middleware](./docs/MIDDLEWARE.md)
Request processing pipeline:
- **Security** - Helmet, CORS, CSRF protection
- **Authentication** - JWT validation, session management
- **Rate Limiting** - Request throttling per endpoint
- **Error Handling** - Centralized error processing
- **Validation** - Request data validation



## Key Features

### AI-Powered Conversations
- **LangGraph Integration**: Agent workflows for marketplace automation tasks
- **Streaming Support**: Real-time response streaming with SSE
- **Tool Integration**: Wildberries API tools for product management
- **Context Management**: Conversation history and context preservation

### Security & Authentication
- **Supabase Auth**: JWT-based authentication with session management
- **CSRF Protection**: Cross-site request forgery prevention
- **Rate Limiting**: Multiple tiers of request throttling
- **API Key Encryption**: AES-256-GCM encryption for stored API keys

### Usage Management
- **Credit System**: Token-based usage tracking
- **Plan Management**: Free, Standard, and Premium subscription tiers
- **Usage Analytics**: Daily and monthly usage monitoring
- **Limit Enforcement**: Automatic usage limit validation

### Marketplace Integration
- **Wildberries Tools**: Product listing, pricing, and inventory management
- **API Validation**: Secure API key management for marketplace access
- **Tool Execution**: Async tool execution with error handling

## Quick Start

### Prerequisites
- Node.js 18+
- Supabase account and project
- Environment variables configured

### Installation
```bash
npm install
cp .env.example .env  # Configure environment variables
npm run dev
```

### Environment Configuration
```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# AI Services
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Security
API_KEYS_ENCRYPTION_KEY=your_32_char_encryption_key
PAYMENT_SIGNATURE=payment_signature_key

# Environment
PORT=port_to_run_on
AUTH_REDIRECT_URL=url_for_redirect_when_signed_up
```

## API Documentation

### Base URL
- Development: `http://localhost:3001/api`
- Production: Configure in environment

### Authentication
All protected endpoints require authentication via Supabase JWT token:
```
Authorization: Bearer <jwt_token>
```

### Rate Limits
- Global: 100 requests per 15 minutes
- Auth endpoints: 5 requests per hour
- API Keys: 20 requests per 15 minutes

## Development

### Running Tests
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
```

### Code Quality
```bash
npm run lint            # ESLint
npm run type-check      # TypeScript
npm run format          # Prettier
```

### Database Migrations
```bash
# Migrations are in /migrations directory
# Apply via Supabase dashboard or CLI
```

## Deployment

The application is designed for deployment on:
- **Vercel** (recommended)
- **Railway**
- **Heroku**
- **Docker containers**

### Environment Variables
Ensure all required environment variables are configured in your deployment platform.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

MIT License

Copyright (c) 2025 Timur Cheryapov

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Support

For questions and support:
- Review the component documentation in `/docs`
- Check the API examples
- Review error handling patterns 
