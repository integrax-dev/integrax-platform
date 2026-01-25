/**
 * IntegraX - Stress Test / Load Test
 *
 * Demuestra la capacidad de escalar del sistema:
 * - Procesamiento concurrente de jobs
 * - Cola de trabajos con Redis/BullMQ
 * - Métricas de rendimiento
 */

import { config } from 'dotenv';
config();

import Redis from 'ioredis';
import { Pool } from 'pg';

// ============ Configuration ============

const CONFIG = {
  // Cuántos "pagos" simular
  totalJobs: parseInt(process.env.STRESS_JOBS || '1000', 10),
  // Concurrencia (jobs procesados en paralelo)
  concurrency: parseInt(process.env.STRESS_CONCURRENCY || '50', 10),
  // Simular latencia de API externa (ms)
  simulatedLatency: parseInt(process.env.STRESS_LATENCY || '50', 10),
};

// ============ Colors ============

const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// ============ Metrics ============

interface Metrics {
  startTime: number;
  endTime: number;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  latencies: number[];
}

const metrics: Metrics = {
  startTime: 0,
  endTime: 0,
  totalJobs: CONFIG.totalJobs,
  completedJobs: 0,
  failedJobs: 0,
  latencies: [],
};

// ============ Simulated Job Processing ============

interface PaymentJob {
  id: string;
  amount: number;
  payerEmail: string;
  timestamp: number;
}

// Simula el procesamiento de un pago (como lo haría el Worker real)
async function processPaymentJob(job: PaymentJob): Promise<{ success: boolean; duration: number }> {
  const start = performance.now();

  try {
    // 1. Simular llamada a MercadoPago API
    await simulateApiCall(CONFIG.simulatedLatency);

    // 2. Simular búsqueda de cliente en Contabilium
    await simulateApiCall(CONFIG.simulatedLatency / 2);

    // 3. Simular creación de factura en AFIP
    await simulateApiCall(CONFIG.simulatedLatency);

    // 4. Simular envío de WhatsApp
    await simulateApiCall(CONFIG.simulatedLatency / 2);

    const duration = performance.now() - start;
    return { success: true, duration };
  } catch (error) {
    const duration = performance.now() - start;
    return { success: false, duration };
  }
}

function simulateApiCall(latencyMs: number): Promise<void> {
  // Añadir variación aleatoria (±20%)
  const variation = latencyMs * 0.2 * (Math.random() - 0.5);
  const actualLatency = Math.max(1, latencyMs + variation);

  return new Promise((resolve) => setTimeout(resolve, actualLatency));
}

// ============ Queue Simulation with Redis ============

async function runWithRedisQueue(redis: Redis): Promise<void> {
  const queueKey = 'integrax:stress:queue';
  const resultsKey = 'integrax:stress:results';

  // Limpiar cola anterior
  await redis.del(queueKey, resultsKey);

  console.log(`\n${c.cyan}${c.bold}=== Stress Test con Redis Queue ===${c.reset}\n`);
  console.log(`${c.dim}Configuración:${c.reset}`);
  console.log(`  Jobs totales:    ${c.bold}${CONFIG.totalJobs}${c.reset}`);
  console.log(`  Concurrencia:    ${c.bold}${CONFIG.concurrency}${c.reset}`);
  console.log(`  Latencia sim.:   ${c.bold}${CONFIG.simulatedLatency}ms${c.reset}`);
  console.log();

  // 1. Encolar todos los jobs
  console.log(`${c.blue}[1/3]${c.reset} Encolando ${CONFIG.totalJobs} jobs...`);
  const enqueueStart = performance.now();

  const pipeline = redis.pipeline();
  for (let i = 0; i < CONFIG.totalJobs; i++) {
    const job: PaymentJob = {
      id: `payment_${i}_${Date.now()}`,
      amount: Math.floor(Math.random() * 100000) + 1000,
      payerEmail: `user${i}@example.com`,
      timestamp: Date.now(),
    };
    pipeline.rpush(queueKey, JSON.stringify(job));
  }
  await pipeline.exec();

  const enqueueTime = performance.now() - enqueueStart;
  console.log(`${c.green}✓${c.reset} Encolados en ${enqueueTime.toFixed(0)}ms (${(CONFIG.totalJobs / (enqueueTime / 1000)).toFixed(0)} jobs/seg)\n`);

  // 2. Procesar jobs con workers concurrentes
  console.log(`${c.blue}[2/3]${c.reset} Procesando con ${CONFIG.concurrency} workers concurrentes...`);
  metrics.startTime = performance.now();

  // Crear workers
  const workers: Promise<void>[] = [];
  let processed = 0;
  let lastReportedPercent = 0;

  for (let w = 0; w < CONFIG.concurrency; w++) {
    workers.push(
      (async () => {
        while (true) {
          // Obtener job de la cola (BLPOP con timeout 0 bloquea, usamos LPOP)
          const jobData = await redis.lpop(queueKey);
          if (!jobData) break; // Cola vacía

          const job: PaymentJob = JSON.parse(jobData);
          const result = await processPaymentJob(job);

          if (result.success) {
            metrics.completedJobs++;
          } else {
            metrics.failedJobs++;
          }
          metrics.latencies.push(result.duration);

          processed++;

          // Reportar progreso cada 10%
          const percent = Math.floor((processed / CONFIG.totalJobs) * 100);
          if (percent >= lastReportedPercent + 10) {
            lastReportedPercent = percent;
            const elapsed = (performance.now() - metrics.startTime) / 1000;
            const rate = processed / elapsed;
            process.stdout.write(
              `\r  ${c.dim}Progreso:${c.reset} ${percent}% (${processed}/${CONFIG.totalJobs}) - ${rate.toFixed(0)} jobs/seg`
            );
          }
        }
      })()
    );
  }

  await Promise.all(workers);
  metrics.endTime = performance.now();
  console.log(); // Nueva línea después del progreso

  // 3. Mostrar resultados
  console.log(`\n${c.blue}[3/3]${c.reset} Resultados:\n`);
  printResults();
}

// ============ In-Memory Queue (sin Redis) ============

async function runInMemory(): Promise<void> {
  console.log(`\n${c.cyan}${c.bold}=== Stress Test In-Memory ===${c.reset}\n`);
  console.log(`${c.dim}Configuración:${c.reset}`);
  console.log(`  Jobs totales:    ${c.bold}${CONFIG.totalJobs}${c.reset}`);
  console.log(`  Concurrencia:    ${c.bold}${CONFIG.concurrency}${c.reset}`);
  console.log(`  Latencia sim.:   ${c.bold}${CONFIG.simulatedLatency}ms${c.reset}`);
  console.log();

  // Crear jobs
  const jobs: PaymentJob[] = [];
  for (let i = 0; i < CONFIG.totalJobs; i++) {
    jobs.push({
      id: `payment_${i}_${Date.now()}`,
      amount: Math.floor(Math.random() * 100000) + 1000,
      payerEmail: `user${i}@example.com`,
      timestamp: Date.now(),
    });
  }

  console.log(`${c.blue}[1/2]${c.reset} Procesando con ${CONFIG.concurrency} workers concurrentes...`);
  metrics.startTime = performance.now();

  let jobIndex = 0;
  let lastReportedPercent = 0;

  // Procesar en batches de concurrencia
  while (jobIndex < jobs.length) {
    const batch = jobs.slice(jobIndex, jobIndex + CONFIG.concurrency);
    const results = await Promise.all(batch.map((job) => processPaymentJob(job)));

    for (const result of results) {
      if (result.success) {
        metrics.completedJobs++;
      } else {
        metrics.failedJobs++;
      }
      metrics.latencies.push(result.duration);
    }

    jobIndex += batch.length;

    // Reportar progreso
    const percent = Math.floor((jobIndex / CONFIG.totalJobs) * 100);
    if (percent >= lastReportedPercent + 10) {
      lastReportedPercent = percent;
      const elapsed = (performance.now() - metrics.startTime) / 1000;
      const rate = jobIndex / elapsed;
      process.stdout.write(
        `\r  ${c.dim}Progreso:${c.reset} ${percent}% (${jobIndex}/${CONFIG.totalJobs}) - ${rate.toFixed(0)} jobs/seg`
      );
    }
  }

  metrics.endTime = performance.now();
  console.log();

  console.log(`\n${c.blue}[2/2]${c.reset} Resultados:\n`);
  printResults();
}

// ============ Results ============

function printResults(): void {
  const totalTime = (metrics.endTime - metrics.startTime) / 1000;
  const throughput = metrics.completedJobs / totalTime;

  // Calcular percentiles de latencia
  const sorted = [...metrics.latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  console.log(`${c.cyan}╔════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.cyan}║${c.reset}                    ${c.bold}RESULTADOS${c.reset}                              ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}╠════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.cyan}║${c.reset}                                                            ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}  ${c.bold}Throughput:${c.reset}                                              ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    Total:        ${c.green}${c.bold}${throughput.toFixed(0)} jobs/segundo${c.reset}                      ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    Tiempo total: ${totalTime.toFixed(2)}s                                  ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}                                                            ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}  ${c.bold}Jobs:${c.reset}                                                    ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    Completados:  ${c.green}${metrics.completedJobs}${c.reset}                                      ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    Fallidos:     ${metrics.failedJobs > 0 ? c.red : c.green}${metrics.failedJobs}${c.reset}                                         ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}                                                            ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}  ${c.bold}Latencia (por job):${c.reset}                                      ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    Promedio:     ${avg.toFixed(1)}ms                                   ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    P50:          ${p50.toFixed(1)}ms                                   ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    P95:          ${p95.toFixed(1)}ms                                   ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}    P99:          ${p99.toFixed(1)}ms                                   ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}║${c.reset}                                                            ${c.cyan}║${c.reset}`);
  console.log(`${c.cyan}╚════════════════════════════════════════════════════════════╝${c.reset}`);

  // Comparación con escala real
  console.log(`\n${c.bold}Proyección a escala real:${c.reset}`);
  console.log(`${c.dim}(asumiendo latencia real de APIs ~200ms)${c.reset}\n`);

  const realLatencyFactor = 200 / CONFIG.simulatedLatency;
  const projectedThroughput = throughput / realLatencyFactor;

  console.log(`  Con ${CONFIG.concurrency} workers:   ~${projectedThroughput.toFixed(0)} pagos/segundo`);
  console.log(`  Con 100 workers:      ~${((projectedThroughput / CONFIG.concurrency) * 100).toFixed(0)} pagos/segundo`);
  console.log(`  Con 500 workers:      ~${((projectedThroughput / CONFIG.concurrency) * 500).toFixed(0)} pagos/segundo`);

  console.log(`\n${c.dim}Escalabilidad:${c.reset}`);
  console.log(`  Por hora (50 workers):  ~${(projectedThroughput * 3600).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} pagos`);
  console.log(`  Por día (50 workers):   ~${(projectedThroughput * 86400).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} pagos`);
  console.log(`  Por hora (500 workers): ~${(((projectedThroughput / CONFIG.concurrency) * 500) * 3600).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} pagos`);
}

// ============ Main ============

async function main() {
  console.log(`
${c.cyan}╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗███╗   ██╗████████╗███████╗ ██████╗ ██████╗  █████╗      ║
║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔════╝ ██╔══██╗██╔══██╗     ║
║   ██║██╔██╗ ██║   ██║   █████╗  ██║  ███╗██████╔╝███████║     ║
║   ██║██║╚██╗██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██╔══██║     ║
║   ██║██║ ╚████║   ██║   ███████╗╚██████╔╝██║  ██║██║  ██║     ║
║   ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝     ║
║                                                               ║
║              Stress Test / Load Test                          ║
╚═══════════════════════════════════════════════════════════════╝${c.reset}
`);

  // Intentar conectar a Redis
  let redis: Redis | null = null;
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    console.log(`${c.green}✓${c.reset} Redis conectado - usando cola distribuida\n`);
  } catch {
    console.log(`${c.yellow}!${c.reset} Redis no disponible - usando cola in-memory\n`);
    redis = null;
  }

  try {
    if (redis) {
      await runWithRedisQueue(redis);
    } else {
      await runInMemory();
    }
  } finally {
    if (redis) {
      redis.disconnect();
    }
  }

  console.log(`\n${c.green}${c.bold}Test completado.${c.reset}\n`);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
