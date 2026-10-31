export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogLine {
  id: string;
  message: string;
  level: LogLevel;
  timestamp?: string;
}

export interface LogFilterOptions {
  query?: string;
  levels?: readonly LogLevel[];
  caseSensitive?: boolean;
  maxLines?: number;
}

export interface LogSelection {
  lines: LogLine[];
  omittedCount: number;
  filteredCount: number;
}

export const LOG_LEVELS: readonly LogLevel[] = Object.freeze([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

export const LOG_LIMITS = Object.freeze({
  lines: 100_000,
  messageLength: 20_000,
  windowCharacters: 5_000_000,
  queryLength: 1_000,
  height: 100_000,
  rowHeight: 256,
  overscan: 100,
});

export function validateLogInteger(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}`);
  }
}

export function selectLogLines(
  lines: readonly LogLine[],
  options: LogFilterOptions = {},
): LogSelection {
  const maxLines = options.maxLines ?? 10_000;
  validateLogInteger('maxLines', maxLines, 1, LOG_LIMITS.lines);
  const query = options.query ?? '';
  if (query.length > LOG_LIMITS.queryLength) throw new RangeError('query is too long');
  if (options.levels?.some((level) => !LOG_LEVELS.includes(level))) {
    throw new TypeError('Unknown log level');
  }
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const omittedCount = Math.max(0, lines.length - maxLines);
  const selected: LogLine[] = [];
  const ids = new Set<string>();
  let characters = 0;
  for (let index = omittedCount; index < lines.length; index++) {
    const line = lines[index]!;
    if (typeof line.id !== 'string' || !line.id || ids.has(line.id)) {
      throw new TypeError('Log ids must be nonempty and unique in the retained window');
    }
    ids.add(line.id);
    if (!LOG_LEVELS.includes(line.level)) throw new TypeError('Unknown log level');
    if (
      typeof line.message !== 'string' ||
      (line.timestamp !== undefined && typeof line.timestamp !== 'string')
    ) {
      throw new TypeError('Log messages and timestamps must be strings');
    }
    characters += line.message.length + line.id.length + (line.timestamp?.length ?? 0);
    if (
      line.message.length > LOG_LIMITS.messageLength ||
      characters > LOG_LIMITS.windowCharacters
    ) {
      throw new RangeError('Log window exceeds LOG_LIMITS');
    }
    if (options.levels && !options.levels.includes(line.level)) continue;
    const haystack = options.caseSensitive ? line.message : line.message.toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    selected.push(line);
  }
  return {
    lines: selected,
    omittedCount,
    filteredCount: lines.length - omittedCount - selected.length,
  };
}

/** Retains the newest tail without first copying all historical lines. */
export function appendLogLines(
  existing: readonly LogLine[],
  incoming: readonly LogLine[],
  maxLines = 10_000,
): LogLine[] {
  validateLogInteger('maxLines', maxLines, 1, LOG_LIMITS.lines);
  const total = existing.length + incoming.length;
  const result: LogLine[] = [];
  for (let index = Math.max(0, total - maxLines); index < total; index++) {
    result.push(index < existing.length ? existing[index]! : incoming[index - existing.length]!);
  }
  return selectLogLines(result, { maxLines }).lines;
}

export interface VirtualRange {
  start: number;
  end: number;
  offset: number;
  totalHeight: number;
}

export function getVirtualRange(
  count: number,
  scrollTop: number,
  height: number,
  rowHeight: number,
  overscan = 5,
): VirtualRange {
  validateLogInteger('count', count, 0, LOG_LIMITS.lines);
  validateLogInteger('height', height, 1, LOG_LIMITS.height);
  validateLogInteger('rowHeight', rowHeight, 8, LOG_LIMITS.rowHeight);
  validateLogInteger('overscan', overscan, 0, LOG_LIMITS.overscan);
  if (!Number.isFinite(scrollTop) || scrollTop < 0)
    throw new RangeError('scrollTop must be finite and nonnegative');
  const totalHeight = count * rowHeight;
  const top = Math.min(scrollTop, Math.max(0, totalHeight - height));
  const start = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const end = Math.min(count, Math.ceil((top + height) / rowHeight) + overscan);
  return { start, end, offset: start * rowHeight, totalHeight };
}
