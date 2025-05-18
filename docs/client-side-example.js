// Example client-side code for handling the simplified stream with preserved newlines

async function streamChat(message, conversationId = null, callbacks = {}) {
  // Default callbacks
  const defaultCallbacks = {
    onStart: () => {},
    onChunk: (chunk) => { console.log('Chunk received:', chunk); },
    onConversationId: (id) => { console.log('Conversation ID:', id); },
    onFinish: (fullContent) => { console.log('Full content:', fullContent); },
    onError: (error) => { console.error('Error:', error); }
  };
  
  // Merge provided callbacks with defaults
  callbacks = { ...defaultCallbacks, ...callbacks };
  
  let fullContent = '';
  let receivedConversationId = conversationId;
  
  try {
    // Call your API endpoint
    const response = await fetch('/api/conversation/new', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        conversationId,
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
          case 'conversationId':
            receivedConversationId = eventData;
            callbacks.onConversationId(receivedConversationId);
            break;
            
          case 'chunk':
            try {
              // The content is now JSON-encoded to preserve newlines
              const decodedContent = JSON.parse(eventData);
              console.log('Decoded content:', decodedContent);
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
            callbacks.onFinish(fullContent, receivedConversationId);
            break;
        }
      }
    }
    
    // Save the streamed response if we have a conversationId
    if (receivedConversationId) {
      await fetch(`/api/conversation/${receivedConversationId}/save-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: fullContent
        }),
      });
    }
    
    return {
      content: fullContent,
      conversationId: receivedConversationId
    };
    
  } catch (error) {
    callbacks.onError(error);
    throw error;
  }
}

// Example usage with content that has newlines
/*
streamChat("Write a short poem about coding", null, {
  onChunk: (chunk) => {
    // Use a pre element to preserve whitespace
    const outputElement = document.getElementById('output');
    if (outputElement.textContent === '') {
      outputElement.textContent = chunk;
    } else {
      outputElement.textContent += chunk;
    }
  },
  onFinish: (fullContent) => {
    console.log('Complete poem with proper formatting:');
    console.log(fullContent);
  }
});
*/ 