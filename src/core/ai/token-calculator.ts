export interface TokenCostRates {
  input: number;
  output: number;
}

export interface TokenUsageResult {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  isEstimated: boolean;
}

// Approximate token costs per 1M tokens in USD for OpenAI models
export const TOKEN_COSTS: Record<string, TokenCostRates> = {
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'text-embedding-3-small': { input: 0.02, output: 0.02 },
  'default': { input: 2.0, output: 2.0 }
};

export function calculateTokenCost(
  inputTokens: number,
  outputTokens: number,
  modelName: string
): number {
  const costRates = TOKEN_COSTS[modelName] || TOKEN_COSTS.default;
  const inputCost = (inputTokens / 1000000) * costRates.input;
  const outputCost = (outputTokens / 1000000) * costRates.output;
  return inputCost + outputCost;
}

export function extractTokenUsage(
  responseAI: any,
  systemPrompt: string,
  messages: Array<{role: string, content: string}>,
  modelName: string
): TokenUsageResult {
  let inputTokens = 0;
  let outputTokens = 0;
  let isEstimated = false;

  // Try to get actual token usage from response metadata
  if (responseAI?.response_metadata?.tokenUsage) {
    const tokenUsage = responseAI.response_metadata.tokenUsage;
    inputTokens = tokenUsage.promptTokens;
    outputTokens = tokenUsage.completionTokens;
  } else if (responseAI?.usage_metadata) {
    const usageMetadata = responseAI.usage_metadata;
    inputTokens = usageMetadata.input_tokens;
    outputTokens = usageMetadata.output_tokens;
  } else {
    // Fall back to estimation
    const { estimateTokenCount } = require('./langchainUtils');
    const inputText = [systemPrompt, ...messages.map(m => m.content)].join('\n');
    const outputText = responseAI.content?.toString() || '';
    inputTokens = estimateTokenCount(inputText);
    outputTokens = estimateTokenCount(outputText);
    isEstimated = true;
  }

  const totalCost = calculateTokenCost(inputTokens, outputTokens, modelName);

  return {
    inputTokens,
    outputTokens,
    totalCost,
    isEstimated
  };
}

export function extractTokenUsageFromMetadata(
  usageMetadata: any,
  modelName: string
): TokenUsageResult {
  const inputTokens = usageMetadata.input_tokens || 0;
  const outputTokens = usageMetadata.output_tokens || 0;
  const totalCost = calculateTokenCost(inputTokens, outputTokens, modelName);

  return {
    inputTokens,
    outputTokens,
    totalCost,
    isEstimated: false // LangGraph provides actual usage metadata
  };
} 