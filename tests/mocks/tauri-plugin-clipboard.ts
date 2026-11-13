export async function writeText(_text: string): Promise<void> {
  // The UI reference captures set this flag to reach the copy-failure state. Off in every E2E scenario.
  if ((window as Window & { __clipboardFail?: boolean }).__clipboardFail === true) {
    throw new Error('E2E clipboard failure');
  }
}

export async function readText(): Promise<string> {
  return '';
}
