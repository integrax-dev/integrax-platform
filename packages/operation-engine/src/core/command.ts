/**
 * Command
 *
 * A command is the intent declaration: what to do, on what, under which rules.
 * Commands are registered by profiles or modules; the engine core is command-agnostic.
 */

import type { OperationCapability } from './capability.js';

export interface CommandDefinition {
  /** Unique name within a tenant/profile scope. e.g. 'issue_invoice', 'publish_catalog_item'. */
  commandName: string;
  /** Human-readable description. */
  description?: string;
  /** Which capability this command maps to. */
  capability: OperationCapability;
  /**
   * Target connector or system this command runs on.
   * If omitted, the executor resolves it from the OperationTarget at runtime.
   */
  defaultConnectorId?: string;
  /**
   * Whether this command always requires explicit approval before execution.
   * Can be overridden per-tenant by ApprovalPolicy.
   */
  requiresApproval?: boolean;
  /**
   * Maximum time allowed for execution before TIMEOUT error.
   * Defaults to engine-level timeout if not set.
   */
  timeoutMs?: number;
  /**
   * Profile(s) that expose this command. Null = available to all profiles.
   */
  profileIds?: string[];
}

/** Registry of available commands. Commands are registered at startup by modules/profiles. */
export class CommandRegistry {
  private readonly commands = new Map<string, CommandDefinition>();

  register(def: CommandDefinition): void {
    this.commands.set(def.commandName, def);
  }

  get(commandName: string): CommandDefinition | undefined {
    return this.commands.get(commandName);
  }

  all(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  has(commandName: string): boolean {
    return this.commands.has(commandName);
  }
}
