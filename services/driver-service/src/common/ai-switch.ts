/**
 * AI master switch. AI runs only when the server allows it (AI_ENABLED=true) AND the super
 * admin has not turned it off (Services SENGA → Intelligence artificielle).
 */
let adminAiEnabled = true;

export function setAdminAiEnabled(enabled: boolean): void {
  adminAiEnabled = enabled;
}

export function adminAiSwitchOn(): boolean {
  return adminAiEnabled;
}

export function aiSwitchOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_ENABLED === 'true' && adminAiEnabled;
}
