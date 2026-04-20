# ports/

Interfaces de puertos externos. Desacoplan el control-plane de providers específicos.

- `llm-port.ts` — interfaz `LLMPort` con `complete()` e `isAvailable()`
- `anthropic-llm-adapter.ts` — implementación con Anthropic Claude (lazy import, lee `ANTHROPIC_API_KEY`)

Para cambiar de provider LLM: implementar `LLMPort` en un nuevo archivo y cambiar `container/llm.ts`. Nada más.
