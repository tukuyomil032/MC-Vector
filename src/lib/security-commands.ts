import { tauriInvoke } from './tauri-api';

export type UserRole = 'admin' | 'user' | 'viewer';

interface SecurityGatewayResponse {
  sanitized?: string;
  allowed?: boolean;
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
