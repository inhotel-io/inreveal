// Eval harness config. All endpoints/knobs are env-overridable so the same
// scenarios can run against any local OpenAI-compatible server.
//
//   EVAL_LLAMA_URL    OpenAI-compatible base URL (default local llama.cpp)
//   EVAL_LLAMA_MODEL  model id the server reports at /v1/models
//   EVAL_LLAMA_KEY    api key (any string for llama.cpp)
//   EVAL_ROUTER_MODE  regex | llm | hybrid (default hybrid)
//   EVAL_RUNS         repeats per LLM scenario for pass-rate (default 3)
export default {
  llama: {
    baseUrl: process.env.EVAL_LLAMA_URL ?? 'http://127.0.0.1:8080/v1',
    model: process.env.EVAL_LLAMA_MODEL ?? 'Qwen3-Coder-Next-Q8_0-00001-of-00004.gguf',
    secret: process.env.EVAL_LLAMA_KEY ?? 'local',
  },
  routerMode: process.env.EVAL_ROUTER_MODE ?? 'hybrid',
  runs: Number(process.env.EVAL_RUNS ?? 3),
};
