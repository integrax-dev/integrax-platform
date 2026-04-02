import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { SchemaInferrer } from '../schema-inferrer.js';
import type { InferredJsonSchema, SchemaField, FieldEvidence } from '../types.js';
import type { SchemaAdapter } from './sql-adapter.js';

/**
 * Adapter that reads recorded traffic from a WireMock directory.
 * It extracts JSON bodies from __files to generate schema samples.
 */
export class WireMockAdapter implements SchemaAdapter {
  private inferrer = new SchemaInferrer();
  private mappingsDir: string;
  private filesDir: string;

  constructor(wiremockRootDir: string) {
    this.mappingsDir = path.join(wiremockRootDir, 'mappings');
    this.filesDir = path.join(wiremockRootDir, '__files');
  }

  adapt(): InferredJsonSchema {
    const samples: any[] = [];

    if (!fs.existsSync(this.filesDir)) {
      return { fields: [], fingerprint: '', sampleCount: 0 };
    }

    // 1. Collect all JSON files from __files
    const files = fs.readdirSync(this.filesDir);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const content = fs.readFileSync(path.join(this.filesDir, file), 'utf8');
          const json = JSON.parse(content);
          samples.push(json);
        } catch (e) {
          // Skip non-json or malformed files
          continue;
        }
      }
    }

    if (samples.length === 0) {
      return { fields: [], fingerprint: '', sampleCount: 0 };
    }

    // 2. Infer schema from collected samples
    const inferred = this.inferrer.infer(samples);

    // 3. Mark as high-quality evidence because it's real traffic
    const fieldsWithEvidence: SchemaField[] = inferred.fields.map(f => {
      const baseEvidence: FieldEvidence = f.node.evidence || {
        sampleCount: samples.length,
        nonNullCount: samples.length,
        nullCount: 0,
        uniqueCount: samples.length,
        coverageRatio: 1.0,
        placeholderCount: 0,
        placeholderRatio: 0,
        evidenceQuality: 0.9
      };

      return {
        ...f,
        node: {
          ...f.node,
          evidence: baseEvidence
        }
      };
    });

    return {
      ...inferred,
      fields: fieldsWithEvidence,
      sampleCount: samples.length
    };
  }
}
