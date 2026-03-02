# Security Escalation Policy

Estado al: 2026-03-02

## Objetivo
Definir un proceso operativo para incidentes de seguridad, reducción de exposición y escalamiento sin ambigüedad.

## Severidades
- **SEV-1 (Crítica):** credenciales filtradas, acceso no autorizado en producción, exfiltración de datos sensibles.
- **SEV-2 (Alta):** controles de seguridad deshabilitados en producción, secretos débiles por configuración.
- **SEV-3 (Media):** riesgo potencial sin evidencia de explotación.
- **SEV-4 (Baja):** hallazgos informativos o deuda de hardening.

## SLA de respuesta
- **SEV-1:** inicio de contención en ≤ 15 min, rotación de secretos inmediata.
- **SEV-2:** mitigación en ≤ 4 h.
- **SEV-3:** mitigación en ≤ 2 días hábiles.
- **SEV-4:** plan en backlog con fecha comprometida.

## Protocolo de contención (SEV-1 / SEV-2)
1. Revocar y rotar credenciales afectadas.
2. Invalidar tokens/sesiones activas relacionadas.
3. Forzar fail-fast en producción cuando falten secretos críticos.
4. Auditar logs y alcance de exposición.
5. Publicar postmortem con causa raíz y acciones preventivas.

## Requisitos técnicos mínimos
- No commitear `.env` con valores reales.
- No usar defaults inseguros en producción (`JWT_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, Vault/Redis/Kafka cuando sean críticos).
- Todo servicio nuevo debe pasar gate de registro (`npm run validate:services`).

## Escalamiento
- Responsable técnico inicial: mantenedor del servicio afectado.
- Escalamiento inmediato a liderazgo de plataforma en SEV-1/SEV-2.
- Comunicación a stakeholders según impacto y datos comprometidos.
