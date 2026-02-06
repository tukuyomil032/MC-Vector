// プロキシ設定は純粋な文字列生成ロジック → Rust 不要

export interface ProxyNetworkConfig {
  proxyType: string;
  proxyPort: number;
  servers: Array<{
    name: string;
    address: string;
    port: number;
    restricted?: boolean;
    motd?: string;
  }>;
}

export function generateProxyConfig(config: ProxyNetworkConfig): string {
  if (config.proxyType === 'velocity') {
    return generateVelocityConfig(config);
  } else if (config.proxyType === 'waterfall' || config.proxyType === 'bungeecord') {
    return generateBungeeConfig(config);
  }
  return '';
}

function generateVelocityConfig(config: ProxyNetworkConfig): string {
  const lines: string[] = [
    '# Velocity Configuration',
    `bind = "0.0.0.0:${config.proxyPort}"`,
    'motd = "&3A Velocity Server"',
    'show-max-players = 500',
    'online-mode = true',
    'force-key-authentication = true',
    'player-info-forwarding-mode = "modern"',
    '',
    '[servers]',
  ];

  for (const server of config.servers) {
    lines.push(`  ${server.name} = "${server.address}:${server.port}"`);
  }

  lines.push('');
  lines.push('[forced-hosts]');
  lines.push('');
  lines.push('[advanced]');
  lines.push('  compression-threshold = 256');
  lines.push('  compression-level = -1');

  if (config.servers.length > 0) {
    lines.push('');
    lines.push(`try = [${config.servers.map((s) => `"${s.name}"`).join(', ')}]`);
  }

  return lines.join('\n');
}

function generateBungeeConfig(config: ProxyNetworkConfig): string {
  const lines: string[] = [
    '# BungeeCord / Waterfall Configuration',
    'listeners:',
    `- host: 0.0.0.0:${config.proxyPort}`,
    '  motd: "&1A BungeeCord Server"',
    '  max_players: 500',
    '  tab_size: 60',
    '  force_default_server: false',
    '  priorities:',
  ];

  for (const server of config.servers) {
    lines.push(`  - ${server.name}`);
  }

  lines.push('');
  lines.push('servers:');

  for (const server of config.servers) {
    lines.push(`  ${server.name}:`);
    lines.push(`    address: ${server.address}:${server.port}`);
    lines.push(`    motd: "${server.motd || server.name}"`);
    lines.push(`    restricted: ${server.restricted ? 'true' : 'false'}`);
  }

  lines.push('');
  lines.push('ip_forward: true');
  lines.push('online_mode: true');

  return lines.join('\n');
}
