import dotenv from 'dotenv';
import { getLangChainService } from '../../services/langchain';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { estimateTokenCount, sanitizeText } from '../../utils/langchainUtils';

// Load environment variables
dotenv.config();

// Skip tests if OPENAI_API_KEY is not set
const hasApiKey = !!process.env.OPENAI_API_KEY;
const testGroup = hasApiKey ? describe : describe.skip;

testGroup('OpenAI Integration', () => {
  const langchainService = getLangChainService();
  
  test('should generate text using ChatOpenAI', async () => {
    const model = langchainService.createChatModel({
      temperature: 0, // Use 0 for more deterministic results in tests
      maxTokens: 50,
    });
    
    const response = await model.invoke([
      new SystemMessage('You are a helpful assistant that responds with short answers.'),
      new HumanMessage('What is the capital of France?')
    ]);
    
    expect(response).toBeDefined();
    const content = response.content.toString();
    expect(typeof content).toBe('string');
    expect(content.toLowerCase()).toContain('paris');
  }, 10000); // Longer timeout for API call
  
  test('should generate embeddings using OpenAI', async () => {
    const embeddings = langchainService.createEmbeddingModel();
    
    const texts = [
      'Hello world',
      'How are you doing?'
    ];
    
    const embeddingResults = await embeddings.embedDocuments(texts);
    
    expect(embeddingResults).toBeDefined();
    expect(embeddingResults.length).toBe(2);
    expect(embeddingResults[0].length).toBeGreaterThan(0);
    expect(typeof embeddingResults[0][0]).toBe('number');
  }, 10000); // Longer timeout for API call
  
  test('should use prompt templates effectively', async () => {
    const template = langchainService.createChatPromptTemplate(
      'You are a helpful assistant that specializes in {topic}.',
      'What is the capital of {country}?'
    );
    
    const model = langchainService.createChatModel({
      temperature: 0,
      maxTokens: 50,
    });
    
    const chain = template.pipe(model);
    const response = await chain.invoke({
      topic: 'geography',
      country: 'Japan'
    });
    
    expect(response).toBeDefined();
    const content = response.content.toString();
    expect(typeof content).toBe('string');
    expect(content.toLowerCase()).toContain('tokyo');
  }, 10000); // Longer timeout for API call
  
  test('should handle text processing utilities', () => {
    const text = 'This is an example text ```with markdown``` and newlines\n\n\n\nextra.';
    const sanitized = sanitizeText(text);
    
    expect(sanitized).toBeDefined();
    expect(sanitized).not.toContain('\n\n\n');
    
    const tokenCount = estimateTokenCount('This is a test sentence for token counting.');
    expect(tokenCount).toBeGreaterThan(0);
  });
}); 