# @integrax/adapters

Provider-agnostic adapter interfaces and implementations for LLM, queue, and email.

**Exports:**
- `ILLMAdapter` / `ClaudeAdapter` — wraps Anthropic SDK; `ClaudeAdapterConfig` for model/maxTokens
- `IQueueAdapter` / `BullMQAdapter` — enqueue jobs to Redis-backed BullMQ
- `IEmailAdapter` / `ResendEmailAdapter` / `SmtpEmailAdapter` — send transactional email
- `createEmailAdapter()` — factory: picks Resend if `RESEND_API_KEY` is set, otherwise falls back to SMTP

**Consumers:** `services/control-plane` (email notifications, LLM for schema bridge), `services/llm-orchestrator`.
