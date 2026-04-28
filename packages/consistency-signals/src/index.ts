export type {
  SignalKind,
  SignalSeverity,
  ConsistencySignal,
  CaseStatus,
  ConsistencyCase,
  TimelineEventKind,
  TimelineEvent,
} from './types.js';
export { computeDeduplicationKey, DEDUP_WINDOW_MS } from './dedup.js';
export { ConsistencySignalService } from './service.js';
