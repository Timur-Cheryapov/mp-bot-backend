/**
 * Feature flags for managing service implementations and migrations
 */

// Environment variable to control LangGraph usage
const USE_LANGGRAPH = process.env.USE_LANGGRAPH === 'true';

export const FEATURE_FLAGS = {
  // LangGraph migration flags
  USE_LANGGRAPH_CHAT: USE_LANGGRAPH, // Simple chat endpoints
  USE_LANGGRAPH_CONVERSATION: USE_LANGGRAPH, // Conversation endpoints (non-streaming)
  USE_LANGGRAPH_STREAMING: true, // Streaming endpoints
  
  // Detailed feature flags for gradual rollout
  USE_LANGGRAPH_NON_STREAMING_ONLY: USE_LANGGRAPH, // Only non-streaming endpoints
  USE_LANGGRAPH_TOOLS: USE_LANGGRAPH, // Tool calling functionality
  
  // Debug and logging
  LOG_FEATURE_FLAG_USAGE: process.env.NODE_ENV === 'development',
  COMPARE_IMPLEMENTATIONS: process.env.COMPARE_IMPLEMENTATIONS === 'true', // For A/B testing
} as const;

/**
 * Helper function to check if LangGraph should be used for a specific feature
 */
export function shouldUseLangGraph(feature: keyof typeof FEATURE_FLAGS): boolean {
  const useFeature = FEATURE_FLAGS[feature];
  
  if (FEATURE_FLAGS.LOG_FEATURE_FLAG_USAGE) {
    console.log(`Feature flag check: ${feature} = ${useFeature}`);
  }
  
  return useFeature;
}

/**
 * Get current feature flag status for debugging
 */
export function getFeatureFlagStatus() {
  return {
    ...FEATURE_FLAGS,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };
} 