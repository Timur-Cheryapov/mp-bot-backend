# API Keys Security Implementation

This document outlines the security measures implemented for storing and managing user API keys for Russian e-commerce platforms in the MP Bot Backend.

## Security Features

### 1. Encryption at Rest
- API keys are encrypted using AES-256-GCM encryption before being stored in the database
- Each API key uses a unique initialization vector (IV) and authentication tag
- Encryption key is stored separately from the database as an environment variable

### 2. Database Security
- Row Level Security (RLS) is enabled to ensure users can only access their own API keys
- Foreign key constraints ensure data integrity
- Cascade deletion removes API keys when a user account is deleted
- Check constraints validate service names

### 3. API Security
- All endpoints require authentication via JWT tokens
- Rate limiting prevents abuse (20 requests per 15 minutes for API key operations)
- CSRF protection on state-changing operations (POST, DELETE)
- Input validation and sanitization
- Audit logging for all operations

### 4. Data Access Controls
- API keys are never returned in plain text in listing operations
- Individual key retrieval requires explicit service parameter
- Soft validation of API key formats before storage

## Environment Setup

### Required Environment Variables

```bash
# Encryption key for API keys (REQUIRED FOR PRODUCTION)
API_KEYS_ENCRYPTION_KEY=your-32-byte-hex-key-here

# Supabase configuration
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Generating Encryption Key

**IMPORTANT:** Generate a secure encryption key for production:

```bash
# Generate a secure 32-byte hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store this key securely and never commit it to version control.

## API Endpoints

### POST /api/api-keys
Create or update an API key for a service.

**Request Body:**
```json
{
  "service": "wildberries",
  "api_key": "your-wildberries-api-key-here"
}
```

**Response:**
```json
{
  "message": "API key saved successfully",
  "data": {
    "user_id": "uuid",
    "service": "wildberries",
    "api_key": "***ENCRYPTED***",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
}
```

### GET /api/api-keys
List all configured services for the user (without actual keys).

**Response:**
```json
{
  "message": "API keys retrieved successfully",
  "data": [
    {
      "user_id": "uuid",
      "service": "wildberries",
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z"
    }
  ],
  "count": 1
}
```

### GET /api/api-keys/:service
Retrieve the actual API key for a specific service.

**Response:**
```json
{
  "message": "API key retrieved successfully",
  "data": {
    "service": "wildberries",
    "api_key": "your-wildberries-api-key-here"
  }
}
```

### DELETE /api/api-keys/:service
Delete an API key for a specific service.

**Response:**
```json
{
  "message": "API key for wildberries deleted successfully"
}
```

### HEAD /api/api-keys/:service
Check if an API key exists for a service (returns 200 if exists, 404 if not).

## Supported Services

- `wildberries` - Wildberries marketplace API
- `ozon` - Ozon marketplace API  
- `yandexmarket` - Yandex Market API

## Security Best Practices

### For Developers

1. **Never log API keys** - Ensure API keys are never written to logs
2. **Use HTTPS only** - Never transmit API keys over unencrypted connections
3. **Validate input** - Always validate service names and API key formats
4. **Audit access** - Log all API key operations for security monitoring
5. **Rotate keys regularly** - Implement key rotation policies

### For Deployment

1. **Secure the encryption key** - Store `API_KEYS_ENCRYPTION_KEY` in a secure secrets manager
2. **Database security** - Ensure database access is properly secured and monitored
3. **Network security** - Use VPC/private networks for database connections
4. **Backup encryption** - Ensure database backups are encrypted
5. **Access monitoring** - Monitor and alert on unusual API key access patterns

### For Users

1. **Principle of least privilege** - Only provide API keys with the minimum required permissions
2. **Monitor usage** - Regularly check API key usage in respective marketplace dashboards
3. **Revoke unused keys** - Remove API keys that are no longer needed
4. **Secure storage** - Never share or store API keys in unsecured locations

## Implementation Notes

### Encryption Details
- Algorithm: AES-256-GCM
- Key size: 256 bits (32 bytes)
- IV size: 128 bits (16 bytes)
- Tag size: 128 bits (16 bytes)
- Storage format: `iv:tag:encrypted_data` (hex encoded)

### Database Schema
```sql
CREATE TABLE user_api_keys (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  service TEXT NOT NULL CHECK (service IN ('wildberries', 'ozon', 'yandexmarket')),
  api_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, service)
);
```

### Error Handling
- Invalid service names return 400 Bad Request
- Missing API keys return 404 Not Found
- Authentication failures return 401 Unauthorized
- Rate limit exceeded returns 429 Too Many Requests

## Compliance Considerations

This implementation follows security best practices for:
- **GDPR** - User data can be deleted, access is logged
- **SOC 2** - Access controls, encryption, audit logging
- **PCI DSS** - Encryption of sensitive data at rest and in transit
- **OWASP** - Protection against common web vulnerabilities

## Monitoring and Alerting

Consider implementing monitoring for:
- Unusual API key access patterns
- Failed authentication attempts
- Rate limit violations
- Encryption/decryption failures
- Database access anomalies

## Recovery Procedures

### Lost Encryption Key
If the encryption key is lost:
1. All stored API keys become permanently inaccessible
2. Users must re-enter their API keys
3. Consider implementing key escrow for critical deployments

### Database Corruption
- Regular encrypted backups are essential
- Test recovery procedures regularly
- Consider implementing read replicas for high availability 