import { tauriInvoke } from './tauri-api';

interface SecurityGatewayResponse {
  sanitized?: string;
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
