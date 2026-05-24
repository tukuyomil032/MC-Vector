export async function platform(): Promise<string> {
  return 'linux';
}

export async function arch(): Promise<string> {
  return 'x86_64';
}

export async function version(): Promise<string> {
  return '6.0.0';
}

export async function type(): Promise<string> {
  return 'Linux';
}

export async function locale(): Promise<string | null> {
  return 'en-US';
}

export async function hostname(): Promise<string | null> {
  return 'playwright-host';
}
