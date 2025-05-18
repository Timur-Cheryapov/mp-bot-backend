event: data
data: {
  "event": "on_chat_model_end",
  "data": {
    "output": {
      "lc": 1,
      "type": "constructor",
      "id": [
        "langchain_core",
        "messages",
        "AIMessageChunk"
      ],
      "kwargs": {
        "content": "Glad you found it interesting! Want to learn more fun facts?",
        "additional_kwargs": {
          
        },
        "response_metadata": {
          "prompt": 0,
          "completion": 0,
          "usage": {
            "prompt_tokens": 71,
            "completion_tokens": 13,
            "total_tokens": 84,
            "prompt_tokens_details": {
              "cached_tokens": 0,
              "audio_tokens": 0
            },
            "completion_tokens_details": {
              "reasoning_tokens": 0,
              "audio_tokens": 0,
              "accepted_prediction_tokens": 0,
              "rejected_prediction_tokens": 0
            }
          },
          "finish_reason": "stop",
          "system_fingerprint": "fp_0392822090",
          "model_name": "gpt-4o-mini-2024-07-18"
        },
        "tool_call_chunks": [
          
        ],
        "id": "chatcmpl-BYaFf3yx3QvR5PL5ceFObuZUl2lJI",
        "usage_metadata": {
          "input_tokens": 71,
          "output_tokens": 13,
          "total_tokens": 84,
          "input_token_details": {
            "audio": 0,
            "cache_read": 0
          },
          "output_token_details": {
            "audio": 0,
            "reasoning": 0
          }
        },
        "tool_calls": [
          
        ],
        "invalid_tool_calls": [
          
        ]
      }
    }
  },
  "run_id": "b10c1933-cfa8-458a-8193-76db17345f64",
  "name": "ChatOpenAI",
  "tags": [
    
  ],
  "metadata": {
    "ls_provider": "openai",
    "ls_model_name": "gpt-4o-mini",
    "ls_model_type": "chat",
    "ls_temperature": 0.7,
    "ls_max_tokens": 2048
  }
}