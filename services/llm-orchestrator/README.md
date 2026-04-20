# llm-orchestrator

Puerto 3001. Orquestador IA con Claude (Anthropic). Interpreta intenciones en lenguaje natural, selecciona conectores, genera workflows.

Tools disponibles para el LLM: `list_connectors`, `get_connector_schema`, `execute_connector`, `start_workflow`, `get_workflow_status`, `transform_data`.

La carpeta `audit/` guarda logs de requests LLM — está en `.gitignore`, no se commitea.

Requiere: `ANTHROPIC_API_KEY`.
