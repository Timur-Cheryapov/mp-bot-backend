/**
 * SSE Stream Processor for LLM API Responses
 * Full version with token usage tracking and conversation ID handling
 * 
 * This module provides a stream processor for LLM API responses that:
 * 1. Extracts content from complex LLM stream chunks
 * 2. Captures token usage data for analytics/billing
 * 3. Preserves formatting through JSON encoding
 * 4. Handles the conversation ID for stateful chats
 * 
 * For Express/Node.js applications
 */

const { Transform } = require('stream');
const { Buffer } = require('buffer');
const logger = require('../path/to/your/logger'); // Replace with your logger

/**
 * Create a stream processor for LLM API responses
 * Full version with token usage tracking
 * 
 * @param {string} conversationId - The conversation ID to associate with this stream
 * @param {Function} storeTokenUsage - Function to store token usage data
 * @returns {Transform} - A Transform stream that processes LLM API SSE responses
 */
function createStreamProcessor(conversationId, storeTokenUsage) {
  let buffer = '';
  
  return new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      try {
        // Convert the chunk to string and append to buffer
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Process any complete events in the buffer
        let processedBuffer = '';
        const events = buffer.split('\n\n');
        
        // Keep the last item if it doesn't end with \n\n (incomplete)
        if (!buffer.endsWith('\n\n') && events.length > 0) {
          processedBuffer = events.pop() || '';
        }
        
        for (const event of events) {
          if (!event.trim()) continue;
          
          // Look for on_chat_model_end event to extract token usage
          if (event.includes('event: data') && event.includes('"event":"on_chat_model_end"')) {
            try {
              // Parse the JSON data in the event
              const dataMatch = event.match(/data: (.*)/);
              if (dataMatch && dataMatch[1]) {
                const eventData = JSON.parse(dataMatch[1]);
                
                // Extract token usage from the event data
                let tokenUsage = null;
                if (eventData.data?.output?.kwargs?.response_metadata?.usage) {
                  tokenUsage = eventData.data.output.kwargs.response_metadata.usage;
                } else if (eventData.data?.output?.kwargs?.usage_metadata) {
                  tokenUsage = {
                    prompt_tokens: eventData.data.output.kwargs.usage_metadata.input_tokens,
                    completion_tokens: eventData.data.output.kwargs.usage_metadata.output_tokens,
                    total_tokens: eventData.data.output.kwargs.usage_metadata.total_tokens || 
                      (eventData.data.output.kwargs.usage_metadata.input_tokens + 
                       eventData.data.output.kwargs.usage_metadata.output_tokens)
                  };
                }
                
                if (tokenUsage) {
                  logger.info(`Token usage for conversation ${conversationId}: ${JSON.stringify(tokenUsage)}`);
                  
                  // Store token usage if the function is provided
                  if (typeof storeTokenUsage === 'function') {
                    // Don't await, run asynchronously
                    storeTokenUsage(conversationId, tokenUsage)
                      .catch(err => logger.error(`Error storing token usage: ${err}`));
                  }
                  
                  // Send an end event after processing the final chunk
                  this.push(Buffer.from(`event: end\ndata: {}\n\n`));
                }
              }
            } catch (err) {
              logger.error(`Error parsing stream event: ${err}`);
            }
            
            // Don't pass through the token usage event to the client
            continue;
          }
          
          // For content chunks, extract and simplify
          if (event.includes('event: data') && event.includes('"event":"on_chat_model_stream"')) {
            try {
              // Parse the JSON data in the event
              const dataMatch = event.match(/data: (.*)/);
              if (dataMatch && dataMatch[1]) {
                const eventData = JSON.parse(dataMatch[1]);
                
                // Extract content from the chunk
                let content = '';
                if (eventData.data?.chunk?.kwargs?.content) {
                  content = eventData.data.chunk.kwargs.content;
                  
                  // JSON encode the content to preserve newlines and other special characters
                  const encodedContent = JSON.stringify(content);
                  
                  // Send the encoded content as an SSE event
                  this.push(Buffer.from(`event: chunk\ndata: ${encodedContent}\n\n`));
                }
              }
            } catch (err) {
              logger.error(`Error parsing content chunk: ${err}`);
            }
            
            // Don't pass through the original event
            continue;
          }
          
          // Special handling for end event
          if (event.includes('event: end')) {
            this.push(Buffer.from(`${event}\n\n`));
            continue;
          }
          
          // Pass through any other events unchanged (like conversationId)
          if (!event.includes('"event":"on_chat_model_stream"') && 
              !event.includes('"event":"on_chat_model_end"')) {
            this.push(Buffer.from(`${event}\n\n`));
          }
        }
        
        // Update buffer with any incomplete data
        buffer = processedBuffer;
        callback();
      } catch (error) {
        logger.error(`Error in stream processor: ${error.message}`);
        callback(error);
      }
    },
    
    flush(callback) {
      try {
        // Push any remaining data
        if (buffer) {
          this.push(Buffer.from(buffer));
        }
        // Always end with an end event if not already sent
        if (!buffer.includes('event: end')) {
          this.push(Buffer.from(`event: end\ndata: {}\n\n`));
        }
        callback();
      } catch (error) {
        logger.error(`Error in stream processor flush: ${error.message}`);
        callback(error);
      }
    }
  });
}

/**
 * Example usage in an Express route
 */

/* 
// Express route example
router.post('/chat', async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Send conversation ID event first if it exists
    if (conversationId) {
      res.write(`event: conversationId\ndata: ${conversationId}\n\n`);
    }
    
    // Get LLM API stream response
    const llmResponse = await getLLMStreamResponse(message, conversationId);
    
    // Create a readable stream from the LLM response
    const responseBody = llmResponse.body;
    const reader = responseBody.getReader();
    const readableStream = new Readable({
      read() {
        reader.read().then(({ done, value }) => {
          if (done) {
            this.push(null);
          } else {
            this.push(value);
          }
        }).catch(err => {
          this.destroy(err);
        });
      }
    });
    
    // Create stream processor with token tracking
    const streamProcessor = createStreamProcessor(
      conversationId, 
      storeTokenUsage // Your function to store token usage data
    );
    
    // Pipe the stream through processor to response
    readableStream
      .pipe(streamProcessor)
      .pipe(res);
      
  } catch (error) {
    // Handle errors
    res.status(500).json({ error: error.message });
  }
});
*/

// Export the stream processor function
module.exports = createStreamProcessor; 