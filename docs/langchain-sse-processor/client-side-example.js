/**
 * SSE Streaming Client for LLM Responses
 * 
 * This client-side implementation handles streaming responses from an LLM API using
 * Server-Sent Events (SSE). It provides an easy-to-use API with callbacks for
 * different phases of the streaming process.
 * 
 * Features:
 * - Handles conversation IDs for stateful chats
 * - Preserves newlines and formatting in the LLM output
 * - Provides callbacks for chunks, completion, and errors
 * - Accumulates the full response text
 * - Automatically saves the final response to the server
 */

/**
 * Stream a chat request to the LLM API and handle the SSE response
 * 
 * @param {string} message - The user message to send to the LLM
 * @param {string|null} conversationId - Existing conversation ID or null for new conversation
 * @param {Object} callbacks - Callback functions for different stream events
 * @param {Function} [callbacks.onStart] - Called when the stream begins
 * @param {Function} [callbacks.onChunk] - Called for each chunk of text received (content only)
 * @param {Function} [callbacks.onConversationId] - Called when a conversation ID is received
 * @param {Function} [callbacks.onFinish] - Called when the stream completes with full text
 * @param {Function} [callbacks.onError] - Called if an error occurs
 * @returns {Promise<Object>} - Promise resolving to {content, conversationId}
 */
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

/**
 * Example usage with different UI scenarios
 */

// Example 1: Basic usage with a simple text output
function basicExample() {
  const outputElement = document.getElementById('output');
  const loadingElement = document.getElementById('loading');
  
  streamChat("Tell me about quantum computing", null, {
    onStart: () => {
      outputElement.textContent = '';
      loadingElement.style.display = 'block';
    },
    onChunk: (chunk) => {
      outputElement.textContent += chunk;
    },
    onFinish: () => {
      loadingElement.style.display = 'none';
    },
    onError: (error) => {
      outputElement.innerHTML = `<span class="error">Error: ${error.message}</span>`;
      loadingElement.style.display = 'none';
    }
  });
}

// Example 2: Markdown rendering with highlighting
function markdownExample() {
  const outputElement = document.getElementById('markdown-output');
  let accumulated = '';
  
  streamChat("Write a JavaScript function to sort an array", null, {
    onChunk: (chunk) => {
      accumulated += chunk;
      // Use a markdown library to render the content
      // This is just an example - you would need a markdown library
      outputElement.innerHTML = renderMarkdown(accumulated);
      
      // Highlight code blocks
      document.querySelectorAll('pre code').forEach((block) => {
        highlightBlock(block);
      });
    }
  });
}

// Example 3: Multiple messages in a conversation
async function conversationExample() {
  const chatElement = document.getElementById('chat');
  let currentConversationId = null;
  
  // Function to add a message to the UI
  function addMessage(content, isUser) {
    const messageDiv = document.createElement('div');
    messageDiv.className = isUser ? 'user-message' : 'ai-message';
    messageDiv.textContent = content;
    chatElement.appendChild(messageDiv);
    chatElement.scrollTop = chatElement.scrollHeight;
  }
  
  // First message
  addMessage("Tell me about the solar system", true);
  let response = await streamChat("Tell me about the solar system", null, {
    onChunk: (chunk) => {
      // Create or update the AI message element
      let aiMessage = document.querySelector('.ai-message:last-child');
      if (!aiMessage) {
        aiMessage = document.createElement('div');
        aiMessage.className = 'ai-message';
        chatElement.appendChild(aiMessage);
      }
      aiMessage.textContent += chunk;
      chatElement.scrollTop = chatElement.scrollHeight;
    },
    onConversationId: (id) => {
      currentConversationId = id;
    }
  });
  
  // Second message in the same conversation
  document.getElementById('send-button').addEventListener('click', () => {
    const inputElement = document.getElementById('message-input');
    const userMessage = inputElement.value.trim();
    
    if (userMessage) {
      addMessage(userMessage, true);
      inputElement.value = '';
      
      streamChat(userMessage, currentConversationId, {
        onChunk: (chunk) => {
          let aiMessage = document.querySelector('.ai-message:last-child');
          if (!aiMessage) {
            aiMessage = document.createElement('div');
            aiMessage.className = 'ai-message';
            chatElement.appendChild(aiMessage);
          }
          aiMessage.textContent += chunk;
          chatElement.scrollTop = chatElement.scrollHeight;
        }
      });
    }
  });
}

// Example 4: Typewriter effect
function typewriterExample() {
  const outputElement = document.getElementById('typewriter-output');
  const speed = 30; // ms per character
  let queue = [];
  let isTyping = false;
  
  // Function to type one character at a time
  function typeNextCharacter() {
    if (queue.length === 0) {
      isTyping = false;
      return;
    }
    
    isTyping = true;
    const char = queue.shift();
    outputElement.textContent += char;
    outputElement.scrollTop = outputElement.scrollHeight;
    
    setTimeout(typeNextCharacter, speed);
  }
  
  streamChat("Write a short story about a robot", null, {
    onChunk: (chunk) => {
      // Add each character to the queue
      for (const char of chunk) {
        queue.push(char);
      }
      
      // Start typing if not already in progress
      if (!isTyping) {
        typeNextCharacter();
      }
    }
  });
}

// Export for module usage
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = { streamChat };
} 