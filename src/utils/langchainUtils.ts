/**
 * Calculate approximate token count (rough estimate)
 * @param text Input text
 * @returns Estimated token count
 */
export function estimateTokenCount(text: string): number {
  // A rough approximation: GPT models use ~4 chars per token on average
  // This is just an estimate and will not be exact
  return Math.ceil(text.length / 4);
}

/**
 * Format chat history for readability
 * @param history Array of messages
 * @returns Formatted history string
 */
export function formatChatHistory(history: { role: string; content: string }[]): string {
  return history
    .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');
}

/**
 * Clean text for safe use in prompts
 * @param text Text to clean
 * @returns Cleaned text
 */
export function sanitizeText(text: string): string {
  // Remove any potentially problematic characters or patterns
  return text
    .trim()
    .replace(/```/g, '\\`\\`\\`') // Escape backticks to prevent markdown code block interference
    .replace(/\n{3,}/g, '\n\n'); // Replace multiple newlines with just two
} 