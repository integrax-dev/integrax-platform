export type ModuleHandlerFn = (tenantId: string, action: string, payload: unknown) => Promise<unknown>;

export interface ModuleHandlerDef {
  moduleId: string;
  handle: ModuleHandlerFn;
}
