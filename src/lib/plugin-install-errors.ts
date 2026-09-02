export type PluginInstallFailureCode =
  | 'unverified-artifact-blocked'
  | 'checksum-mismatch'
  | 'checksum-invalid'
  | 'source-rejected'
  | 'destination-rejected'
  | 'size-limit-exceeded'
  | 'network'
  | 'unknown';

export type PluginInstallFailureCategory =
  | 'security'
  | 'integrity'
  | 'source'
  | 'destination'
  | 'size'
  | 'network'
  | 'unknown';

export type PluginInstallFailureResult = 'blocked' | 'rejected' | 'retryable' | 'unknown';

export interface PluginInstallFailure {
  code: PluginInstallFailureCode;
  category: PluginInstallFailureCategory;
  result: PluginInstallFailureResult;
}

const FAILURE_DETAILS: Record<PluginInstallFailureCode, Omit<PluginInstallFailure, 'code'>> = {
  'unverified-artifact-blocked': {
    category: 'security',
    result: 'blocked',
  },
  'checksum-mismatch': {
    category: 'integrity',
    result: 'rejected',
  },
  'checksum-invalid': {
    category: 'integrity',
    result: 'rejected',
  },
  'source-rejected': {
    category: 'source',
    result: 'rejected',
  },
  'destination-rejected': {
    category: 'destination',
    result: 'rejected',
  },
  'size-limit-exceeded': {
    category: 'size',
    result: 'rejected',
  },
  network: {
    category: 'network',
    result: 'retryable',
  },
  unknown: {
    category: 'unknown',
    result: 'unknown',
  },
};

const OBJECT_MESSAGE_KEYS = ['message', 'error', 'reason', 'cause', 'detail'];
const MAX_DECODE_DEPTH = 4;

function failure(code: PluginInstallFailureCode): PluginInstallFailure {
  return { code, ...FAILURE_DETAILS[code] };
}

function readProperty(value: object, key: string): unknown {
  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function decodeErrorText(value: unknown, depth = 0): string | undefined {
  if (depth > MAX_DECODE_DEPTH) {
    return undefined;
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(FAILURE_DETAILS, text)) {
      return text as PluginInstallFailureCode;
    }

    try {
      const decoded = JSON.parse(text) as unknown;
      if (!(typeof decoded === 'string' && decoded === text)) {
        const decodedCode = readKnownCode(decoded, depth + 1);
        if (decodedCode) {
          return decodedCode;
        }
        const decodedText = decodeErrorText(decoded, depth + 1);
        if (decodedText) {
          return decodedText;
        }
      }
    } catch {
      // Rust/Tauri errors are commonly plain strings, so malformed JSON is valid input here.
    }

    return text;
  }

  if (value instanceof Error) {
    return decodeErrorText(value.message, depth + 1);
  }

  if (value === null || typeof value !== 'object') {
    return undefined;
  }

  for (const key of OBJECT_MESSAGE_KEYS) {
    const text = decodeErrorText(readProperty(value, key), depth + 1);
    if (text) {
      return text;
    }
  }

  return undefined;
}

function readKnownCode(value: unknown, depth = 0): PluginInstallFailureCode | undefined {
  if (depth > MAX_DECODE_DEPTH) {
    return undefined;
  }

  if (typeof value === 'string' && Object.prototype.hasOwnProperty.call(FAILURE_DETAILS, value)) {
    return value as PluginInstallFailureCode;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      const parsedCode = readKnownCode(parsed, depth + 1);
      if (parsedCode) return parsedCode;
    } catch {
      const embeddedCode = value.match(/"code"\s*:\s*"([^"]+)"/i)?.[1];
      if (embeddedCode && Object.prototype.hasOwnProperty.call(FAILURE_DETAILS, embeddedCode)) {
        return embeddedCode as PluginInstallFailureCode;
      }
    }
  }

  if (value !== null && typeof value === 'object') {
    const code = readProperty(value, 'code');
    if (typeof code === 'string' && Object.prototype.hasOwnProperty.call(FAILURE_DETAILS, code)) {
      return code as PluginInstallFailureCode;
    }
    for (const key of ['error', 'cause', 'detail']) {
      const nestedCode = readKnownCode(readProperty(value, key), depth + 1);
      if (nestedCode) {
        return nestedCode;
      }
    }
  }

  return undefined;
}

function classifyErrorText(text: string): PluginInstallFailureCode {
  if (/checksum is required|unverified artifact|allowUnverifiedPluginDownloads/i.test(text)) {
    return 'unverified-artifact-blocked';
  }

  if (/checksum mismatch/i.test(text)) {
    return 'checksum-mismatch';
  }

  if (/invalid .*checksum|unsupported checksum algorithm/i.test(text)) {
    return 'checksum-invalid';
  }

  if (
    /unsupported plugin download provider|invalid download url|download url .*\b(?:control characters|https|userinfo|port|fragment|host|ip address|approved)\b/i.test(
      text,
    )
  ) {
    return 'source-rejected';
  }

  if (
    /plugin path|plugin destination|managed path|managed root|path is outside the managed root|temporary download path|download destination|server jar destination|invalid server id|managed plugin directory|atomically move downloaded file|replace existing destination|temporary file/i.test(
      text,
    )
  ) {
    return 'destination-rejected';
  }

  if (/download exceeds .*byte limit|download size overflow/i.test(text)) {
    return 'size-limit-exceeded';
  }

  if (
    /http request failed|^http error:|download stalled|download stream error|^download failed$|failed to create http client|network|timed out|timeout|connection/i.test(
      text,
    )
  ) {
    return 'network';
  }

  return 'unknown';
}

/**
 * Converts an unknown Rust/Tauri or JavaScript failure into safe UI classification data.
 * The thrown value is used only for matching and is never included in the returned object.
 */
export function classifyPluginInstallFailure(thrown: unknown): PluginInstallFailure {
  const knownCode = readKnownCode(thrown);
  if (knownCode) {
    return failure(knownCode);
  }

  if (typeof thrown === 'string') {
    try {
      const parsed = JSON.parse(thrown) as unknown;
      const encodedCode = readKnownCode(parsed);
      if (encodedCode) {
        return failure(encodedCode);
      }
    } catch {
      // Plain Rust/Tauri strings are handled by the text classifier below.
    }
  }

  const text = decodeErrorText(thrown);
  const decodedKnownCode = text ? readKnownCode(text) : undefined;
  if (decodedKnownCode) {
    return failure(decodedKnownCode);
  }

  return failure(text ? classifyErrorText(text) : 'unknown');
}

export const decodePluginInstallFailure = classifyPluginInstallFailure;
