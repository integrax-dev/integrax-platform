#!/usr/bin/env tsx
/**
 * API Learning CLI
 *
 * Usage:
 *   pnpm learn-api tiendanube https://tiendanube.github.io/api-documentation/openapi.json
 *   pnpm learn-api stripe https://stripe.com/docs/api --crawl
 *   pnpm learn-api mercadolibre https://developers.mercadolibre.com.ar/es_ar/api-docs
 */

import { config } from 'dotenv';
config();

import { createLearningEngine } from '../services/connector-learning/src/index';

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

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
${c.cyan}${c.bold}IntegraX API Learning Engine${c.reset}

${c.dim}Usage:${c.reset}
  pnpm learn-api <api-name> <documentation-url> [options]

${c.dim}Options:${c.reset}
  --crawl         Crawl multiple documentation pages
  --max-pages N   Maximum pages to crawl (default: 10)
  --no-tests      Don't generate tests

${c.dim}Examples:${c.reset}
  ${c.green}pnpm learn-api tiendanube https://tiendanube.github.io/api-documentation/openapi.json${c.reset}
  ${c.green}pnpm learn-api stripe https://stripe.com/docs/api --crawl${c.reset}
  ${c.green}pnpm learn-api mercadolibre https://developers.mercadolibre.com/docs/getting-started${c.reset}

${c.dim}Environment:${c.reset}
  ANTHROPIC_API_KEY   Required for LLM processing
`);
    process.exit(1);
  }

  const apiName = args[0];
  const docUrl = args[1];
  const crawl = args.includes('--crawl');
  const noTests = args.includes('--no-tests');
  const maxPagesIdx = args.indexOf('--max-pages');
  const maxPages = maxPagesIdx > -1 ? parseInt(args[maxPagesIdx + 1], 10) : 10;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${c.red}Error: ANTHROPIC_API_KEY environment variable is required${c.reset}`);
    process.exit(1);
  }

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
║              Connector Learning Engine                        ║
╚═══════════════════════════════════════════════════════════════╝${c.reset}
`);

  console.log(`${c.bold}Learning API:${c.reset} ${apiName}`);
  console.log(`${c.bold}Source:${c.reset} ${docUrl}`);
  console.log(`${c.bold}Crawl:${c.reset} ${crawl ? 'Yes' : 'No'}`);
  console.log(`${c.bold}Tests:${c.reset} ${noTests ? 'No' : 'Yes'}`);
  console.log();

  const engine = createLearningEngine({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
    outputDir: process.cwd(),
    includeTests: !noTests,
    model: 'claude-sonnet-4-20250514',
  });

  // Subscribe to events
  engine.onEvent((event) => {
    switch (event.type) {
      case 'started':
        console.log(`${c.blue}[START]${c.reset} Learning ${event.apiName}...`);
        break;
      case 'fetching':
        console.log(`${c.dim}[FETCH]${c.reset} ${event.source}`);
        break;
      case 'parsing':
        console.log(`${c.green}[PARSE]${c.reset} Found ${event.endpointCount} endpoints`);
        break;
      case 'question':
        console.log(`${c.yellow}[CREDENTIAL]${c.reset} ${event.question.question}`);
        break;
      case 'generating':
        console.log(`${c.cyan}[GENERATE]${c.reset} ${event.phase}`);
        break;
      case 'testing':
        console.log(`${c.blue}[TEST]${c.reset} Running ${event.testCount} tests...`);
        break;
      case 'completed':
        console.log(`${c.green}[COMPLETE]${c.reset} Connector generated!`);
        break;
      case 'error':
        console.log(`${c.red}[ERROR]${c.reset} ${event.error.message}`);
        break;
    }
  });

  try {
    let session;

    // Check if it's an OpenAPI URL
    if (docUrl.includes('openapi') || docUrl.includes('swagger') || docUrl.endsWith('.json') || docUrl.endsWith('.yaml')) {
      session = await engine.learnFromOpenAPI(apiName, docUrl);
    } else {
      session = await engine.learn(apiName, docUrl, { crawl, maxPages });
    }

    console.log(`
${c.cyan}════════════════════════════════════════════════════════════${c.reset}
${c.bold}                    LEARNING COMPLETE${c.reset}
${c.cyan}════════════════════════════════════════════════════════════${c.reset}
`);

    if (session.parsedAPI) {
      console.log(`${c.bold}API:${c.reset} ${session.parsedAPI.name}`);
      console.log(`${c.bold}Base URL:${c.reset} ${session.parsedAPI.baseUrl}`);
      console.log(`${c.bold}Endpoints:${c.reset} ${session.parsedAPI.endpoints.length}`);
      console.log(`${c.bold}Categories:${c.reset} ${session.parsedAPI.categories.map((c) => c.name).join(', ')}`);
      console.log();
    }

    if (session.requiredCredentials?.length || session.parsedAPI?.requiredCredentials?.length) {
      const creds = session.requiredCredentials || session.parsedAPI?.requiredCredentials || [];
      console.log(`${c.yellow}${c.bold}Required Credentials:${c.reset}`);
      for (const cred of creds) {
        console.log(`  - ${cred.name} (${cred.type}): ${cred.description}`);
      }
      console.log();
    }

    if (session.generatedConnector) {
      console.log(`${c.green}${c.bold}Generated Files:${c.reset}`);
      for (const file of session.generatedConnector.files) {
        console.log(`  ${c.dim}→${c.reset} connectors/implementations/${session.generatedConnector.id}/${file.path}`);
      }
      console.log();

      console.log(`${c.bold}Actions:${c.reset}`);
      for (const action of session.generatedConnector.actions.slice(0, 10)) {
        console.log(`  ${c.green}${action.method}${c.reset} ${action.path} → ${action.name}()`);
      }
      if (session.generatedConnector.actions.length > 10) {
        console.log(`  ${c.dim}... and ${session.generatedConnector.actions.length - 10} more${c.reset}`);
      }
    }

    console.log(`
${c.cyan}════════════════════════════════════════════════════════════${c.reset}

${c.bold}Next steps:${c.reset}
  1. ${c.dim}cd connectors/implementations/${session.generatedConnector?.id}${c.reset}
  2. ${c.dim}pnpm install${c.reset}
  3. ${c.dim}pnpm test${c.reset}
  4. Use the connector in your workflows!

`);
  } catch (error) {
    console.error(`${c.red}${c.bold}Error:${c.reset}`, error);
    process.exit(1);
  }
}

main();
