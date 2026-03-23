# IntegraX — Investigación: Conectores Argentinos (100+)

> **Estado:** Documento de investigación / sin código ni commits
> **Fecha:** 2026-03-02
> **Objetivo:** Mapear todos los servicios argentinos integrables por sector, con detalles de implementación técnica usando el SDK de IntegraX.

---

## Conectores existentes (base actual)

| # | Conector | Categoría |
|---|---|---|
| 1 | AFIP WSFE | Fiscal |
| 2 | MercadoPago | Pagos |
| 3 | WhatsApp Business | Notificaciones |
| 4 | Email (SMTP multi-proveedor) | Notificaciones |
| 5 | Google Sheets | Almacenamiento |
| 6 | Contabilium | ERP/Contable |

---

## Patrón de implementación (referencia rápida)

```typescript
// Cada conector nuevo extiende BaseConnector del SDK
class NuevoConector extends BaseConnector {
  getSpec(): ConnectorSpec {
    return {
      metadata: { id, name, version, category, supportedRegions: ['AR'] },
      authType: 'api_key' | 'oauth2' | 'basic' | 'custom',
      actions: [...],   // operaciones que ejecuta
      triggers: [...],  // webhooks que recibe
    };
  }
}
```

Categorías disponibles en el SDK: `payment | ecommerce | erp | fiscal | notification | storage`
Categorías nuevas a agregar: `legal | logistics | health | education | banking | hr | agro | realstate | insurance | government | utility`

---

## SECTOR 1 — FISCAL / GOBIERNO NACIONAL

### ARCA (ex-AFIP)

| # | Conector | API/Servicio | Auth | Prioridad |
|---|---|---|---|---|
| 7 | **ARCA WSMTXCA** | Factura electrónica Monotributistas | Certificado PKCS#12 | 🔴 Alta |
| 8 | **ARCA WSFEV1** | Comprobantes en línea (versión simplificada) | Certificado | 🔴 Alta |
| 9 | **ARCA WSCT** | Controladores fiscales homologados | Certificado | 🟡 Media |
| 10 | **ARCA Padrón RDAP** | Consulta de CUIT/CUIL (razón social, domicilio fiscal) | Certificado | 🔴 Alta |
| 11 | **ARCA SICORE** | Declaración de retenciones y percepciones (F.2002) | Certificado | 🟡 Media |
| 12 | **ARCA SIFERE Web** | Ingresos brutos convenio multilateral online | Certificado | 🟡 Media |
| 13 | **ARCA Sistema Registral** | Alta/modificación de contribuyentes, actividades, domicilios | Certificado | 🟡 Media |
| 14 | **ARCA Libro de Sueldos Digital (LSD)** | Presentación digital F.931 y libro sueldos | Certificado | 🔴 Alta |
| 15 | **ARCA Mis Facilidades** | Consulta y generación de planes de pago | Certificado | 🟢 Baja |
| 16 | **ARCA RUTA** | Rastreo Unificado de Transporte Automotor | Certificado | 🟢 Baja |

**Implementación:** Todos usan SOAP sobre HTTPS con certificados X.509 emitidos por AFIP. Ya existe el patrón en `connector-afip-wsfe` con `node-forge`. Se puede crear un `afip-base` connector que maneje la parte PKI y los demás extiendan de él.

---

### Organismos Nacionales

| # | Conector | API/Servicio | Auth | Prioridad |
|---|---|---|---|---|
| 17 | **RENAPER** | Validación de DNI (foto, nombre, datos biométricos) | API Key (convenio) | 🔴 Alta |
| 18 | **ANSES — UDA** | Consulta de aportes, haberes, asignaciones familiares | OAuth2 | 🔴 Alta |
| 19 | **ANSES — SUAF** | Asignaciones Universales por Hijo (AUH) y familiares | OAuth2 | 🟡 Media |
| 20 | **BCRA — Central de Deudores** | Estado crediticio de CUIT/CUIL | API REST pública | 🔴 Alta |
| 21 | **BCRA — Tipos de Cambio** | Cotizaciones oficiales (REST pública, actualización diaria) | Sin auth | 🔴 Alta |
| 22 | **BCRA — Normativas** | Texto circulares y normativas del BCRA | Sin auth | 🟢 Baja |
| 23 | **Boletín Oficial** | Publicaciones oficiales, normativas, edictos | Sin auth (scraping/RSS) | 🟡 Media |
| 24 | **InfoLeg** | Consulta de leyes y normativas nacionales | Sin auth | 🟢 Baja |
| 25 | **SAIJ** | Sistema Argentino de Información Jurídica | Sin auth | 🟢 Baja |
| 26 | **TAD** | Trámites a Distancia (plataforma nacional) | AFIP auth delegada | 🟡 Media |

---

## SECTOR 2 — RENTAS PROVINCIALES (Ingresos Brutos)

| # | Conector | Provincia | API/Portal | Auth |
|---|---|---|---|---|
| 27 | **ARBA** | Buenos Aires (prov.) | Portal ARBA — IIBB, ABL, valuación fiscal | Certificado/Token |
| 28 | **AGIP** | Buenos Aires (CABA) | Portal AGIP — IIBB CABA, empadronamiento | Clave fiscal |
| 29 | **Rentas Córdoba** | Córdoba | API REST SER | Token |
| 30 | **DGR Santa Fe** | Santa Fe | Portal web / scraping | Usuario/Pass |
| 31 | **ATEPROSAFE / Rentas Mendoza** | Mendoza | Portal Rentas | Clave fiscal |
| 32 | **ARIP Tucumán** | Tucumán | Portal digital | Token |
| 33 | **DGR Salta** | Salta | API REST | Token |

**Implementación:** ARBA tiene API REST documentada. El resto requiere scraping con Playwright/Puppeteer encapsulado en una activity de Temporal. Patrón: `connector-learning` ya puede aprender estas APIs automáticamente.

---

## SECTOR 3 — JUDICIAL / LEGAL

| # | Conector | Servicio | Descripción | Auth |
|---|---|---|---|---|
| 34 | **PJN — MEV** | Poder Judicial de la Nación | Consulta de causas judiciales por CUIT/carátula | Certificado |
| 35 | **PJN — DEOX** | Expedientes con firma digital | Presentación digital en causas | Certificado |
| 36 | **IGJ** | Inspección General de Justicia | Consulta de sociedades, estatutos, autoridades | API REST |
| 37 | **Reg. Nacional Reincidencia** | Min. de Justicia | Consulta de antecedentes penales | Convenio + API |
| 38 | **Registro Prop. Inmueble CABA** | Gobierno CABA | Estudio de dominio, inhibiciones, certificados | Matrícula letrada |
| 39 | **Registro Prop. Inmueble PBA** | ARBA/RPBA | Consulta catastral, titularidad | Token |
| 40 | **Boletín Oficial — Edictos** | Jefatura Gabinete | Publicación de edictos / S.A. | Token |
| 41 | **SIGE (PBA)** | Suprema Corte PBA | Sistema Integrado de Gestión de Expedientes | Matriculado |
| 42 | **SIME** | Ministerio Justicia | Sistema de Mediación (turnos, expedientes) | API REST |
| 43 | **CPACF** | Col. Público Abogados CABA | Consulta de matrícula, cuotas, certificados | API |

**Casos de uso reales:**
- Estudio jurídico: alerta automática cuando hay movimiento en una causa judicial
- Empresa: consulta de inhibiciones antes de firmar contratos
- Notaría: consulta de dominio + inhibiciones en un solo workflow

---

## SECTOR 4 — CONTABILIDAD / ERP

| # | Conector | Producto | Empresa | Mercado |
|---|---|---|---|---|
| 44 | **Tango Gestión** | API REST + SDK | Axoft Argentina | PyME / Mediana |
| 45 | **Bejerman** | REST API | Bejerman SA | PyME |
| 46 | **Colppy** | REST API documentada | Colppy | Nube / Contador |
| 47 | **Xubio** | REST API | Xubio | Nube / Monotributista |
| 48 | **Bind ERP** | REST API | Bind SA | PyME / Comercio |
| 49 | **Defontana** | REST API | Defontana | PyME LatAm |
| 50 | **SAP Business One** | DI-API + Service Layer | SAP | Empresa mediana |
| 51 | **Siigo Argentina** | REST API | Siigo | Contador / PyME |
| 52 | **RestoGuru / iPos** | REST API | Gestion gastronómica | Gastronomía |
| 53 | **Odoo (AR)** | XML-RPC / REST | Odoo community | Todo tamaño |

**Implementación:** La mayoría tiene API REST documentada. El caso de Tango requiere módulo de integración separado (instalable). SAP usa Service Layer HTTP/JSON desde v9.3+.

---

## SECTOR 5 — BANCARIO / FINTECH / PAGOS

| # | Conector | Servicio | Auth | Funcionalidades clave |
|---|---|---|---|---|
| 54 | **Banco Nación (BNA)** | API Corporativa | OAuth2 + certificado | Transferencias, consulta saldo, débitos |
| 55 | **Banco Galicia** | API Empresas | OAuth2 | Pagos, transferencias, extractos |
| 56 | **Banco Santander AR** | API Business | OAuth2 | Cobranzas, pagos a proveedores |
| 57 | **BBVA Argentina** | Open Banking API | OAuth2 | Transferencias, pagos |
| 58 | **Brubank** | API partner | API Key | Pagos, CVU, notificaciones |
| 59 | **Naranja X** | API pagos / BNPL | OAuth2 | Pagos en cuotas, billetera |
| 60 | **Ualá** | API fintech | OAuth2 | CVU, transferencias, tarjeta |
| 61 | **Lemon Cash** | API cripto-pagos | API Key | Pagos en cripto + USDT |
| 62 | **Pomelo** | BaaS API | API Key | Emisión de tarjetas prepago/débito |
| 63 | **Transferencias 3.0 / DEBIN** | COELSA / BCR | Certificado + token | Débito inmediato, alias CBU |
| 64 | **Interbanking** | API empresas | Certificado | Pagos masivos, sueldos |
| 65 | **Red Link** | API ATM/POS | Convenio | Pagos en red, QR |
| 66 | **Mercado Pago (split payments)** | MP Marketplace API | OAuth2 | Marketplace con split automático |
| 67 | **PayWay (ex Prisma)** | API adquirente | API Key | POS virtual, terminales físicas |
| 68 | **Todo Pago** | API pagos | API Key | Pagos online con retención impositiva |

**Implementación:** Foco en Transferencias 3.0 (DEBIN/CVU). Ya existe el conector de MercadoPago — los bancos siguen el mismo patrón OAuth2 + API REST.

---

## SECTOR 6 — LOGÍSTICA / TRANSPORTE

| # | Conector | Empresa | Funcionalidades |
|---|---|---|---|
| 69 | **Correo Argentino** | Correo Oficial | Generación de envíos, tracking, impresión etiqueta |
| 70 | **OCA** | OCA SA | Despacho, tracking, cotización |
| 71 | **Andreani** | Andreani | Envíos, tracking, rendición |
| 72 | **DHL Argentina** | DHL | Internacional + nacional |
| 73 | **FedEx Argentina** | FedEx | Internacional + corporativo |
| 74 | **Urbano Express** | Urbano | Logística urbana B2B |
| 75 | **Shipnow** | Shipnow | Agregador: OCA + Correo + Andreani en una API |
| 76 | **Beetrack** | Beetrack | Gestión de flotas, prueba de entrega, geolocalización |
| 77 | **Mercado Envíos** | Mercado Libre | Integrado con ML (generación de envíos) |
| 78 | **AFIP RUTA** | ARCA | Carta de porte electrónica (granos/cargas) |
| 79 | **SENASA — ERAS** | SENASA | Habilitaciones veterinarias para transporte |
| 80 | **Ministerio Transporte** | Estado Nacional | Habilitaciones CETA, transportistas |

**Implementación:** Correo, OCA y Andreani tienen APIs REST bien documentadas. Shipnow ya las unifica (recomienda empezar por Shipnow). El tracking se puede hacer como trigger (webhook) o polling.

---

## SECTOR 7 — SALUD / OBRAS SOCIALES

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 81 | **PAMI** | PAMI API | Autorización prestaciones, padrón afiliados (jubilados) |
| 82 | **OSDE** | API OSDE | Autorización online, consulta de plan, TP digital |
| 83 | **Swiss Medical** | API SMS | Autorizaciones, cartilla, órdenes digitales |
| 84 | **IOMA** | IOMA API | Obra social docentes PBA, autorizaciones |
| 85 | **Galeno** | API Galeno | Autorizaciones, TP, cartilla |
| 86 | **ANMAT** | ANMAT Consultas | Consulta de medicamentos habilitados, alertas sanitarias |
| 87 | **SISA** | Min. Salud | Matrícula profesional de salud (médicos, farmacéuticos) |
| 88 | **NOMIVAC** | Min. Salud | Registro vacunas COVID y carnet digital |
| 89 | **HCE (HL7 FHIR AR)** | Ministerio Salud | Historia Clínica Electrónica interoperable |
| 90 | **Medife / OMINT / Accord** | Privadas | Autorizaciones, facturación prestaciones |

**Implementación:** PAMI usa SOAP. OSDE/Swiss tienen APIs REST con convenio. SISA es REST público. HL7 FHIR es estándar internacional con perfil argentino.

---

## SECTOR 8 — EDUCACIÓN

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 91 | **SIU Guaraní** | UNAB/Universidades | Sistema académico universitario: inscripciones, actas, títulos |
| 92 | **SIU Araucano** | Universidades | RRHH universitario: liquidación de sueldos, cargos |
| 93 | **SIU Mapuche** | Universidades | Gestión docente: cargos, licencias, evaluaciones |
| 94 | **SIU Wichi** | Universidades | Presupuesto y contabilidad universitaria |
| 95 | **Portal ABC (DGCYE)** | Prov. Buenos Aires | Gestión docente PBA: cargos, licencias, legajos |
| 96 | **Miescuela / SIGEJA** | CABA | Sistema escolar CABA |
| 97 | **Moodle REST API** | Open Source | LMS: cursos, usuarios, notas, actividades |
| 98 | **Google Classroom** | Google | Aulas, tareas, notas (integración OAuth2) |
| 99 | **Registro Nacional de Títulos** | Min. Educación | Validación y registro de diplomas |
| 100 | **Becas.ar** | ANSES + Min. Ed. | Becas Progresar, Conectar Igualdad |

**Implementación:** SIU Guaraní tiene API REST desde la versión 3.x (JSON, OAuth2). Moodle tiene Web Services propios. Google Classroom usa Google API (ya tenemos patrón con Google Sheets).

---

## SECTOR 9 — RECURSOS HUMANOS / PAYROLL

| # | Conector | Producto | Descripción |
|---|---|---|---|
| 101 | **BUK Argentina** | BUK | HR + payroll cloud: liquidación sueldos, vacaciones, ART |
| 102 | **Factorial HR** | Factorial | RRHH integral: asistencia, vacaciones, nómina |
| 103 | **Workia** | Workia | RRHH nube argentina: legajos, clima laboral, onboarding |
| 104 | **Kenjo AR** | Kenjo | Gestión de equipos, evaluaciones |
| 105 | **AFIP — F.931** | ARCA | Declaración jurada mensual de aportes y contribuciones |
| 106 | **AFIP — SICOSS** | ARCA | Sistema de cálculo de obligaciones de seguridad social |
| 107 | **ART (Sancor / Galeno / Mapfre)** | Aseguradoras | Alta de trabajadores, denuncia de siniestros, cotización |
| 108 | **Ministerio Trabajo — SIPA** | Estado Nacional | Registro empleadores, telework, contratos especiales |

---

## SECTOR 10 — AGROPECUARIO

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 109 | **SENASA** | SENASA API | Trazabilidad animal (RENSPA, CUIG), habilitaciones frigoríficos, plantas |
| 110 | **AFIP — Carta de Porte** | ARCA RUCA | Carta de porte electrónica obligatoria para granos |
| 111 | **Bolsa de Cereales de BA** | BCBA | Precios, condiciones, calidad de granos |
| 112 | **Bolsa de Comercio Rosario** | BCR | Mercado de granos, futuros, liquidaciones |
| 113 | **MAGYP** | Min. Agricultura | Registro de operadores orgánicos, declaraciones juradas de stocks |
| 114 | **RUCA** | ARCA | Registro Único de la Cadena Agroalimentaria |
| 115 | **INTA — Agromet** | INTA | Datos meteorológicos y agronómicos por zona |
| 116 | **AFIP — Liquidaciones Agro** | ARCA | Liquidación primaria y secundaria de granos |

---

## SECTOR 11 — INMOBILIARIO

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 117 | **ZonaProp** | API Portal | Publicación y gestión de propiedades |
| 118 | **Argenprop** | API Portal | Publicación de avisos inmobiliarios |
| 119 | **Mercado Inmobiliario** (MercadoLibre) | ML API | Publicación en ML de propiedades |
| 120 | **ARBA Valuación Fiscal** | ARBA API | Valuación fiscal de inmuebles PBA |
| 121 | **CUCICBA** | Col. Corredores CABA | Matrícula, consulta de habilitaciones, FCI |
| 122 | **CMCPSI** | Colegio Martilleros PBA | Matrícula, aportes, certificados |
| 123 | **SinPapel** | Plataforma privada | Firma digital de contratos de alquiler (Ley Alquileres) |

---

## SECTOR 12 — ENERGÍA / UTILITIES

| # | Conector | Empresa | Funcionalidades |
|---|---|---|---|
| 124 | **EDENOR** | EDENOR | Consulta deuda, factura, consumo, pagos |
| 125 | **EDESUR** | EDESUR | Consulta deuda, cortes programados, reclamos |
| 126 | **Metrogas** | Metrogas | Factura digital, consumo, pagos |
| 127 | **AySA** | AySA | Cuenta corriente agua, factura, reclamos |
| 128 | **EPEC** | Córdoba | Factura eléctrica, consumo, gestión |
| 129 | **ENERSA / DPEC** | NEA | Electricidad litoral |
| 130 | **ENRE** | Regulador nacional | Consulta normativas, reclamos regulatorios |

**Implementación:** La mayoría tiene API REST para portales B2B. Para el retail se puede usar screen scraping o las APIs de consolidadores de pagos (PagoMisCuentas, RapiPago).

---

## SECTOR 13 — SEGUROS

| # | Conector | Empresa | Funcionalidades |
|---|---|---|---|
| 131 | **Sancor Seguros** | Sancor | Cotización, emisión póliza, siniestros, renovación |
| 132 | **La Caja** | La Caja / Zurich | Cotización autos, hogar, siniestros |
| 133 | **Galeno Seguros** | Galeno | Vida, salud, auto |
| 134 | **San Cristóbal** | San Cristóbal | Agrícola, rural, autos |
| 135 | **Federación Patronal** | Fed. Patronal | ART, vida, auto |
| 136 | **SSN** | Superintendencia Seguros | Registro de pólizas, nómina aseguradoras habilitadas |
| 137 | **FASEOUT / Inswitch** | Insurtech | APIs de seguros como servicio (white-label) |

---

## SECTOR 14 — COMUNICACIONES / TELCO

| # | Conector | Empresa | Funcionalidades |
|---|---|---|---|
| 138 | **Personal / Telecom** | Telecom Argentina | Recarga crédito, estado cuenta, factura corporativa |
| 139 | **Claro Argentina** | Claro | Recarga, gestión flota empresas, API SMS |
| 140 | **Movistar Argentina** | Movistar | Recarga, SMS masivo, API empresas |
| 141 | **ENACOM** | Regulador | Portabilidad numérica, habilitaciones |
| 142 | **Infobip AR** | Infobip | SMS, WhatsApp, push notifications (ya opera en AR) |
| 143 | **Twilio AR** | Twilio | SMS + llamadas (compatible con AR) |

---

## SECTOR 15 — ECOMMERCE / MARKETPLACES

| # | Conector | Plataforma | Descripción |
|---|---|---|---|
| 144 | **MercadoLibre** | MercadoLibre | Sellers API: publicaciones, órdenes, stock, envíos |
| 145 | **Tiendanube** | Tiendanube/Nuvemshop | Tienda propia: catálogo, pedidos, pagos, envíos |
| 146 | **VTEX** | VTEX | Enterprise ecommerce: catálogo, checkout, fulfillment |
| 147 | **WooCommerce** | WordPress | REST API: productos, órdenes, clientes |
| 148 | **Shopify** | Shopify | Admin API: productos, órdenes, pagos |
| 149 | **Rappi / RappiPago** | Rappi | Delivery, pagos, marketplace |
| 150 | **PedidosYa** | PedidosYa | Delivery gastronomía, restaurantes API |
| 151 | **Jumbo Online** | Cencosud | Marketplace proveedor |
| 152 | **Frávega Partners** | Frávega | Marketplace electrónica |

---

## SECTOR 16 — MUNICIPIOS / GOBIERNO LOCAL

| # | Conector | Jurisdicción | Servicios |
|---|---|---|---|
| 153 | **API BA (CABA)** | Buenos Aires ciudad | DNI digital, licencia conducir, turnos, ABL |
| 154 | **Municipalidad Córdoba** | Córdoba capital | Trámites online, habilitaciones comerciales, catastro |
| 155 | **Municipalidad Rosario** | Rosario | API trámites, pagos, turnos |
| 156 | **ARBA Catastro PBA** | Buenos Aires provincia | Consulta parcelaria, valuaciones |
| 157 | **IOMA Trámites** | Buenos Aires provincia | Prestaciones médicas provinciales |

---

## SECTOR 17 — CRM / MARKETING

| # | Conector | Producto | Categoría |
|---|---|---|---|
| 158 | **HubSpot** | HubSpot | CRM: contactos, deals, pipelines, emails |
| 159 | **Zoho CRM** | Zoho | CRM completo, leads, facturación |
| 160 | **Clientify** | Clientify | CRM argentino: leads, WhatsApp, emailing |
| 161 | **Leadsales** | Leadsales | WhatsApp CRM para ventas |
| 162 | **ActiveCampaign** | ActiveCampaign | Email automation + CRM |
| 163 | **Mailchimp** | Mailchimp | Email marketing |
| 164 | **Meta Ads** | Meta | Facebook/Instagram ads: campañas, audiencias, leads |
| 165 | **Google Ads** | Google | Campañas, conversiones, audiencias |

---

## SECTOR 18 — CLOUD / ALMACENAMIENTO / DOCUMENTOS

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 166 | **Google Drive** | Google | Upload/download archivos, permisos, compartir |
| 167 | **OneDrive / SharePoint** | Microsoft | Documentos corporativos, archivos |
| 168 | **Dropbox** | Dropbox | Almacenamiento y colaboración |
| 169 | **DocuSign AR** | DocuSign | Firma electrónica válida (Ley 25.506) |
| 170 | **FirmaDocumental** | local AR | Firma digital con token PKI argentino |
| 171 | **AFIP Domicilio Electrónico** | ARCA | Notificaciones fiscales oficiales |
| 172 | **Google Calendar** | Google | Agenda, eventos, disponibilidad |
| 173 | **Microsoft Teams** | Microsoft | Mensajería corporativa, reuniones, bots |
| 174 | **Slack** | Slack | Notificaciones y bots enterprise |

---

## SECTOR 19 — AUTOMATIZACIÓN / PRODUCTIVIDAD

| # | Conector | Servicio | Descripción |
|---|---|---|---|
| 175 | **Notion** | Notion | Bases de datos, páginas, proyectos |
| 176 | **Airtable** | Airtable | Bases de datos relacionales visuales |
| 177 | **Trello** | Atlassian | Tableros kanban |
| 178 | **Jira** | Atlassian | Gestión de proyectos y tickets |
| 179 | **GitHub** | GitHub | Repositorios, issues, PRs, Actions |
| 180 | **Zapier Webhooks** | Zapier | Interop con flujos Zapier existentes |

---

## SECTOR 20 — GASTRONOMÍA / RETAIL / POS

| # | Conector | Producto | Descripción |
|---|---|---|---|
| 181 | **Restó Guru** | RestoGuru | POS gastronómico: mesas, comandas, caja |
| 182 | **iPos** | iPos | POS nube argentina |
| 183 | **Quiubas** | Quiubas | Software para kioscos y delivery |
| 184 | **Garçon** | Garçon | App comandas para mozos |
| 185 | **Fudo** | Fudo | POS gastronómico cloud |
| 186 | **Prisma (PayWay)** | Prisma/Fiserv | Terminal POS física + virtual |

---

## Resumen por Prioridad de Implementación

### Fase 1 — Alto impacto inmediato (completar ARCA + Bancos + Logística)
| Conector | Motivo |
|---|---|
| ARCA WSMTXCA | 5M+ monotributistas en Argentina |
| ARCA Padrón RDAP | Bloque de construcción para todos los demás |
| ARCA LSD (Libro Sueldos Digital) | Obligatorio para todo empleador |
| BCRA Central de Deudores | KYC básico para cualquier fintech/empresa |
| BCRA Tipos de Cambio | Usado en TODOS los sistemas con precio en AR |
| RENAPER | Validación de identidad (KYC/AML) |
| Shipnow | 1 conector → OCA + Andreani + Correo |
| Tiendanube | 120.000+ tiendas activas en AR |
| MercadoLibre | El marketplace #1 de la región |

### Fase 2 — Sectores verticales (Salud, Legal, RRHH, Agro)
| Conector | Vertical |
|---|---|
| PAMI | 6M+ beneficiarios |
| OSDE / Swiss Medical | Corporativo |
| SIU Guaraní | 60+ universidades nacionales |
| SENASA | Exportación agro |
| AFIP Carta de Porte | Obligatorio granos desde 2022 |
| BUK / Factorial | RRHH moderno |
| PJN — MEV | Estudios jurídicos |

### Fase 3 — Completitud (Municipios, Utilities, Seguros)
Todos los demás conectores de los sectores 12-20.

---

## Estimación de esfuerzo por tipo

| Tipo | Esfuerzo | Ejemplos |
|---|---|---|
| SOAP + PKI (ARCA) | Alto (3-5 días) | WSMTXCA, SICORE, LSD |
| REST API documentada | Bajo (1-2 días) | Tiendanube, BUK, Shipnow |
| REST API con convenio | Medio (2-3 días) | Bancos, RENAPER, PAMI |
| Scraping / automatización | Alto (4-7 días) | Rentas provinciales sin API |
| Sin auth / pública | Muy bajo (< 1 día) | BCRA TC, InfoLeg, SAIJ |

---

## Nueva categoría SDK recomendada

```typescript
// Agregar al ConnectorMetadata del SDK:
type ConnectorCategory =
  | 'payment'
  | 'ecommerce'
  | 'erp'
  | 'fiscal'
  | 'notification'
  | 'storage'
  // Nuevas:
  | 'legal'
  | 'logistics'
  | 'health'
  | 'education'
  | 'banking'
  | 'hr'
  | 'agro'
  | 'realstate'
  | 'insurance'
  | 'government'
  | 'utility'
  | 'crm'
  | 'pos'
  | 'marketplace';
```

---

## Total de conectores mapeados

| Existentes | Propuestos | Total |
|---|---|---|
| 6 | 179 | **185** |

> De los 179 propuestos, **~60 son exclusivos del mercado argentino** (ARCA, organismos, rentas provinciales, bancos locales, logística local). Los restantes son internacionales con relevancia alta en AR.
