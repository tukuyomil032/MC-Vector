export async function appDataDir(): Promise<string> {
  return '/mock/app-data';
}

export async function appLocalDataDir(): Promise<string> {
  return '/mock/app-local-data';
}

export async function homeDir(): Promise<string> {
  return '/mock/home';
}

export async function join(...paths: string[]): Promise<string> {
  return paths.join('/');
}

export async function resolve(...paths: string[]): Promise<string> {
  return paths.join('/');
}
