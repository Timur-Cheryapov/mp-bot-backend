/**
 * SSE Stream Processor for LLM API Responses
 * Basic version with just content streaming
 * 
 * This module provides a minimal stream processor for LLM API responses that:
 * 1. Extracts content from complex LLM stream chunks
 * 2. Preserves formatting through JSON encoding
 * 
 * For Express/Node.js applications
 */

const { Transform } = require('stream');
const { Buffer } = require('buffer');
const logger = require('../path/to/your/logger'); // Replace with your logger

/**
 * Create a basic stream processor for LLM API responses
 * Simplest version with just content extraction
 * 
 * @returns {Transform} - A Transform stream that processes LLM API SSE responses
 */
function createBasicStreamProcessor() {
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
          
          // Detect the end of the stream
          if (event.includes('event: data') && event.includes('"event":"on_chat_model_end"')) {
            // Send end event and skip the original event
            this.push(Buffer.from(`event: end\ndata: {}\n\n`));
            continue;
          }
          
          // Special handling for end event
          if (event.includes('event: end')) {
            this.push(Buffer.from(`${event}\n\n`));
            continue;
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
// Basic Express route example
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Get LLM API stream response
    const llmResponse = await getLLMStreamResponse(message);
    
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
    
    // Create basic stream processor
    const streamProcessor = createBasicStreamProcessor();
    
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

// Basic client-side code example
/*
fetch('/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'Hello' })
})
.then(response => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';
  
  function processStream() {
    return reader.read().then(({ done, value }) => {
      if (done) return;
      
      const chunk = decoder.decode(value, { stream: true });
      const events = chunk.split('\n\n').filter(e => e.trim());
      
      for (const event of events) {
        if (event.includes('event: chunk')) {
          const data = event.split('\n')[1].substring(6); // Remove 'data: '
          const content = JSON.parse(data);
          fullContent += content;
          console.log('Content chunk:', content);
        }
        else if (event.includes('event: end')) {
          console.log('Stream complete. Full content:', fullContent);
          return;
        }
      }
      
      return processStream();
    });
  }
  
  return processStream();
});
*/

// Export the stream processor function
module.exports = createBasicStreamProcessor; 