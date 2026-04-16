import { tauriInvoke } from './tauri-api';

export type UserRole = 'admin' | 'user' | 'viewer';

interface SecurityGatewayResponse {
  sanitized?: string;
  allowed?: boolean;
  program?: string;
  args?: string[];
  resolvedPath?: string;
  logged?: boolean;
  entry?: {
    user?: string;
    action?: string;
    timestamp?: number;
  };
}

export async function securityGateway<T = unknown>(
  action: string,
  payload: Record<string, unknown>,
): Promise<T> {
  return tauriInvoke<T>('security_gateway', { action, payload });
}

export async function sanitizeLog(input: string): Promise<string> {
  const response = await securityGateway<SecurityGatewayResponse>('sanitize_log', { input });
  if (typeof response.sanitized !== 'string') {
    throw new Error('security_gateway sanitize_log returned invalid payload');
  }
  return response.sanitized;
}

export async function authorizeAction(role: UserRole, action: string): Promise<boolean> {
  const response = await securityGateway<SecurityGatewayResponse>('authorize_action', {
    role,
    action,
  });
  if (response.allowed !== true) {
    throw new Error('security_gateway authorize_action returned invalid payload');
  }
  return true;
}

export async function checkRateLimit(userId: string): Promise<boolean> {
  const response = await securityGateway<SecurityGatewayResponse>('rate_limit_check', { userId });
  if (response.allowed !== true) {
    throw new Error('security_gateway rate_limit_check returned invalid payload');
  }
  return true;
}

export interface ValidatedCommand {
  program: string;
  args: string[];
}

export async function validateSafeCommand(
  program: string,
  args: string[] = [],
): Promise<ValidatedCommand> {
  const response = await securityGateway<SecurityGatewayResponse>('validate_safe_command', {
    program,
    args,
  });
  if (
    response.allowed !== true ||
    typeof response.program !== 'string' ||
    !Array.isArray(response.args)
  ) {
    throw new Error('security_gateway validate_safe_command returned invalid payload');
  }
  return {
    program: response.program,
    args: response.args,
  };
}

export async function resolveSafePath(base: string, input: string): Promise<string> {
  const response = await securityGateway<SecurityGatewayResponse>('resolve_safe_path', {
    base,
    input,
  });
  if (typeof response.resolvedPath !== 'string') {
    throw new Error('security_gateway resolve_safe_path returned invalid payload');
  }
  return response.resolvedPath;
}

export interface AuditEntry {
  user: string;
  action: string;
  timestamp: number;
}

export async function logAuditAction(user: string, action: string): Promise<AuditEntry> {
  const response = await securityGateway<SecurityGatewayResponse>('audit_log', { user, action });
  const entry = response.entry;
  if (
    response.logged !== true ||
    !entry ||
    typeof entry.user !== 'string' ||
    typeof entry.action !== 'string' ||
    typeof entry.timestamp !== 'number'
  ) {
    throw new Error('security_gateway audit_log returned invalid payload');
  }
  return {
    user: entry.user,
    action: entry.action,
    timestamp: entry.timestamp,
  };
}

export interface SecurityCommandRequest {
  userId: string;
  role: UserRole;
  commandAction: string;
  commandPayload?: Record<string, unknown>;
}

export async function handleSecurityCommand(request: SecurityCommandRequest): Promise<unknown> {
  const payload = {
    userId: request.userId,
    role: request.role,
    commandAction: request.commandAction,
    commandPayload: request.commandPayload ?? {},
  };
  return securityGateway<unknown>('handle_command', payload);
}
