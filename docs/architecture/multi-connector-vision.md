# Multi-Connector Architecture Vision para IntegraX Platform

IntegraX está diseñado para ser una plataforma *plug-and-play* de integraciones con empresas Fortune 500 y pymes. Para escalar más allá de SAP y acoger orígenes como Salesforce, Dynamics 365, Oracle ERP, TiendaNube o MercadoLibre, la arquitectura del motor de "Schema Bridge" y conectores debe abstraerse de cualquier tecnología en particular.

## 1. Abstracción Absoluta ("Schema-First")
El Core de la plataforma (Orquestadores, Motor de Similitud, Base de datos) **no debe conocer nunca** protocolos nativos (como BAPIs, IDOCs, OData, SOAP o GraphQL). Toda la información ingresa a IntegraX a través del `Connector SDK`.
- El conector convierte la data de la API propietaria a un JSON.
- `SchemaInferrer` construye un `InferredJsonSchema` agnóstico a partir de los datos pasados.
- De esta manera, el *Similarity Engine* resuelve "JSON contra JSON", lo que garantiza compatibilidad universal.

## 2. Matchmaker Agnóstico (Similarity Engine)
Para evitar el "Dictionary Hell" (mantener un diccionario hardcodeado para cada ERP del mundo):
1. **Modelos Locales de Entropía:** El match de valores es agnóstico del idioma. Mide la **Cardinalidad Matemática** y la **Entropía** de la muestra. Un Foreign Key (ej. `"EBD-1099238-A"`) genera una huella dactilar matemática única; si esto se repite exacto en el destino, hay un 99% de match, sin importar cómo se llama el campo.
2. **Type-Bucketing Genérico:** Categoriza los datos por su tipo básico (String, DateTime, UUID, Int) acelerando la matriz de O(n²) a O(k).
3. **Escalación Cuidada al LLM:** Cuando la entropía es demasiado baja para decidir matemáticamente (Ej: `"estado": 1` vs `"status": 1`), el engine invoca un LLM con contexto inyectado para definir la decisión fina, en lugar de bloquear el flujo.

## 3. Orquestación Segura (Temporal)
La inserción de un nuevo origen/destino de datos en grandes empresas requiere resiliencia frente a fallos y auditoría de cambios. 
- Al usar **Temporal Workflows**, el mapeo de cualquier nuevo par de conectores se registra como una corrida resiliente que cuenta con heartbeats, caché de Redis por fingerprints de schema y reintentos (ej: si el servicio local del ERP se cae a la mitad de obtener el sample).
- Todo `DiffResult` (el resultado del mapeo inteligente) se guarda inmutablemente en **Postgres** a través de la Activity `persistDiffResult`, permitiendo un Audit Trail ("¿Quién aprobó el mapeo de IDOC a TiendaNube el 15/Marzo?").

## 4. Estructuras Profundas (Aplanamiento y Transformación)
Los ERP genéricos mandan estructuras multi-nivel. La aplicación utiliza `MappingGenerator` para construir en RAM una función `transform()` en TypeScript que aplane (flatten) o desaplane rutas complejas como `[Payload].Author.Ids[*] -> [Dest].author_id` sin intervención manual, lista para compilar y ejecutar en un V8 Isolate en caliente.

---
Con este patrón, cuando un nuevo cliente enterprise conecte un sistema *legacy in-house* completamente desconocido, la plataforma inyectará muestras al Workflow de Temporal. El Motor analizará las señales matemáticas, resolverá el mapeo automáticamente y lo dejará listo para su uso, marcando el camino hacia el verdadero `Zero-Configuration Data Integration`.
