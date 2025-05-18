/**
 * SSE Streaming Client for LLM Responses
 * Basic version without conversation ID handling
 * 
 * This client-side implementation handles streaming responses from an LLM API using
 * Server-Sent Events (SSE). It provides a simpler API for applications that don't
 * need conversation management.
 * 
 * Features:
 * - Preserves newlines and formatting in the LLM output
 * - Provides callbacks for chunks, completion, and errors
 * - Accumulates the full response text
 */

/**
 * Stream a chat request to the LLM API and handle the SSE response
 * Basic version without conversation handling
 * 
 * @param {string} message - The user message to send to the LLM
 * @param {Object} callbacks - Callback functions for different stream events
 * @param {Function} [callbacks.onStart] - Called when the stream begins
 * @param {Function} [callbacks.onChunk] - Called for each chunk of text received
 * @param {Function} [callbacks.onFinish] - Called when the stream completes with full text
 * @param {Function} [callbacks.onError] - Called if an error occurs
 * @returns {Promise<string>} - Promise resolving to the complete response text
 */
async function streamChat(message, callbacks = {}) {
  // Default callbacks
  const defaultCallbacks = {
    onStart: () => {},
    onChunk: (chunk) => { console.log('Chunk received:', chunk); },
    onFinish: (fullContent) => { console.log('Full content:', fullContent); },
    onError: (error) => { console.error('Error:', error); }
  };
  
  // Merge provided callbacks with defaults
  callbacks = { ...defaultCallbacks, ...callbacks };
  
  let fullContent = '';
  
  try {
    // Call your API endpoint
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        stream: true
      }),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Error streaming response');
    }
    
    // Notify that we've started receiving the stream
    callbacks.onStart();
    
    // Set up stream reader
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    // Process the stream chunks
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        break;
      }
      
      // Decode the chunk
      const chunk = decoder.decode(value, { stream: true });
      
      // Split into SSE events
      const events = chunk.split('\n\n').filter(e => e.trim());
      
      for (const event of events) {
        // Parse event type and data
        const eventLines = event.split('\n');
        let eventType = '';
        let eventData = '';
        
        for (const line of eventLines) {
          if (line.startsWith('event: ')) {
            eventType = line.substring(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.substring(6);
          }
        }
        
        // Handle different event types
        switch (eventType) {
          case 'chunk':
            try {
              // The content is JSON-encoded to preserve newlines
              const decodedContent = JSON.parse(eventData);
              fullContent += decodedContent;
              callbacks.onChunk(decodedContent);
            } catch (e) {
              console.error('Error parsing chunk:', e);
              // Fallback to raw data if parsing fails
              fullContent += eventData;
              callbacks.onChunk(eventData);
            }
            break;
            
          case 'end':
            // Stream has ended
            callbacks.onFinish(fullContent);
            break;
        }
      }
    }
    
    return fullContent;
    
  } catch (error) {
    callbacks.onError(error);
    throw error;
  }
}

/**
 * Example usage
 */

// Example: Using the streamChat function with a pre element
function basicExample() {
  const outputElement = document.getElementById('output');
  const loadingElement = document.getElementById('loading');
  
  loadingElement.style.display = 'block';
  outputElement.textContent = '';
  
  streamChat("Tell me about quantum computing", {
    onChunk: (chunk) => {
      outputElement.textContent += chunk;
    },
    onFinish: (fullContent) => {
      loadingElement.style.display = 'none';
    },
    onError: (error) => {
      outputElement.innerHTML = `<span class="error">Error: ${error.message}</span>`;
      loadingElement.style.display = 'none';
    }
  });
}

// Example: Using with React
/*
function ChatComponent() {
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const handleSubmit = async (message) => {
    setIsLoading(true);
    setResponse('');
    setError(null);
    
    try {
      await streamChat(message, {
        onChunk: (chunk) => {
          setResponse(prev => prev + chunk);
        },
        onFinish: () => {
          setIsLoading(false);
        },
        onError: (error) => {
          setError(error.message);
          setIsLoading(false);
        }
      });
    } catch (error) {
      // Error already handled in callbacks
    }
  };
  
  return (
    <div className="chat-container">
      <MessageInput onSubmit={handleSubmit} disabled={isLoading} />
      
      {error && <div className="error">{error}</div>}
      
      <div className="response">
        {isLoading && <Spinner />}
        <pre>{response}</pre>
      </div>
    </div>
  );
}
*/

// Export for module usage
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { streamChat };
} 