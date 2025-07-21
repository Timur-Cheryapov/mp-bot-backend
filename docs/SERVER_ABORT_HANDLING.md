# Server-Side Abort Handling Guide

## The Problem
When a client aborts a request, the server continues processing/generating, wasting resources and potentially causing issues.

## Solution: Detect Client Disconnection

### 1. **Express.js / Node.js Implementation**

```javascript
// In your streaming endpoint
app.post('/api/conversation', async (req, res) => {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  // Track if client disconnected
  let isClientConnected = true;
  
  // Listen for client disconnect
  req.on('close', () => {
    console.log('Client disconnected');
    isClientConnected = false;
    // Clean up any ongoing AI generation here
  });

  req.on('error', () => {
    console.log('Client connection error');
    isClientConnected = false;
  });

  // In your AI generation loop
  const generateResponse = async () => {
    for await (const chunk of aiStream) {
      // Check if client is still connected before processing
      if (!isClientConnected) {
        console.log('Stopping generation - client disconnected');
        break;
      }

      // Send chunk to client
      res.write(`event: chunk\ndata: ${JSON.stringify(chunk)}\n\n`);
    }
  };

  await generateResponse();
  
  if (isClientConnected) {
    res.write(`event: end\ndata: \n\n`);
  }
  res.end();
});
```

### 2. **AbortController on Server (if using fetch/modern APIs)**

```javascript
// Create abort controller for AI generation
const abortController = new AbortController();

// Listen for client disconnect
req.on('close', () => {
  abortController.abort();
});

// Pass abort signal to AI service
const aiResponse = await openai.createChatCompletion({
  // ... your parameters
  signal: abortController.signal
});
```

### 3. **LangChain Integration**

```javascript
import { AbortController } from 'abort-controller';

// In your streaming handler
const abortController = new AbortController();

req.on('close', () => {
  abortController.abort();
});

// Pass to LangChain
const stream = await llm.stream(input, {
  signal: abortController.signal,
  callbacks: [
    {
      handleLLMNewToken(token) {
        if (abortController.signal.aborted) {
          return; // Stop processing
        }
        // Send token to client
        res.write(`event: chunk\ndata: ${JSON.stringify(token)}\n\n`);
      }
    }
  ]
});
```

### 4. **Database/Resource Cleanup**

```javascript
req.on('close', async () => {
  console.log('Client disconnected, cleaning up...');
  
  // Cancel any pending database operations
  if (pendingDbOperation) {
    await pendingDbOperation.cancel();
  }
  
  // Clean up temporary files
  if (tempFiles.length > 0) {
    tempFiles.forEach(file => fs.unlinkSync(file));
  }
  
  // Stop AI generation
  if (aiController) {
    aiController.abort();
  }
});
```

## Key Points:

1. **Always listen for `req.on('close')`** - This fires when client disconnects
2. **Use AbortController** for modern APIs that support cancellation
3. **Check connection status** in generation loops before processing chunks
4. **Clean up resources** immediately when disconnect is detected
5. **Log disconnections** for debugging and monitoring

## Testing the Implementation:

```bash
# Start your server
# Make a request and abort it quickly
curl -N http://localhost:3001/api/conversation \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"Tell me a long story"}' &
  
# Kill the curl process to simulate abort
kill %1
```

Check your server logs - you should see "Client disconnected" and generation should stop. 