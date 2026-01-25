import pino from 'pino';
import { config } from './config.js';

const transport = config.NODE_ENV === 'development'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    }
  : undefined;

export function createLogger(name: string) {
  return pino({
    name,
    level: config.LOG_LEVEL,
    transport,
    base: {
      service: 'integrax-worker',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
