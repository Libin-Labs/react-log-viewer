import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  getVirtualRange,
  LOG_LEVELS,
  selectLogLines,
  type LogFilterOptions,
  type LogLevel,
  type LogLine,
} from './logs.js';

export interface LogViewerProps extends LogFilterOptions {
  lines: readonly LogLine[];
  height?: number;
  rowHeight?: number;
  overscan?: number;
  follow?: boolean;
  onFollowChange?: (follow: boolean) => void;
  onQueryChange?: (query: string) => void;
  onLevelsChange?: (levels: LogLevel[]) => void;
  showControls?: boolean;
  onLineClick?: (line: LogLine) => void;
  renderLine?: (line: LogLine, filteredIndex: number) => ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
}

export function LogViewer({
  lines,
  query = '',
  levels,
  caseSensitive = false,
  maxLines = 10_000,
  height = 320,
  rowHeight = 24,
  overscan = 5,
  follow = true,
  onFollowChange,
  onQueryChange,
  onLevelsChange,
  showControls = false,
  onLineClick,
  renderLine,
  className = '',
  style,
  ariaLabel = 'Log viewer',
}: LogViewerProps): ReactNode {
  const selection = useMemo(
    () =>
      selectLogLines(lines, {
        query,
        ...(levels === undefined ? {} : { levels }),
        caseSensitive,
        maxLines,
      }),
    [lines, query, levels, caseSensitive, maxLines],
  );
  const viewport = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const range = getVirtualRange(selection.lines.length, scrollTop, height, rowHeight, overscan);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const maximum = Math.max(0, selection.lines.length * rowHeight - height);
    const next = follow ? maximum : Math.min(node.scrollTop, maximum);
    node.scrollTop = next;
    setScrollTop(next);
  }, [selection, height, rowHeight, follow]);

  const toggleLevel = (level: LogLevel): void => {
    const next = new Set(levels ?? LOG_LEVELS);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    onLevelsChange?.(LOG_LEVELS.filter((item) => next.has(item)));
  };
  return (
    <section className={`lp-log ${className}`} style={style} aria-label={ariaLabel}>
      {showControls && (
        <div className="lp-log__controls">
          <input
            type="search"
            aria-label="Search logs"
            value={query}
            maxLength={1_000}
            readOnly={!onQueryChange}
            onChange={(event) => onQueryChange?.(event.target.value)}
          />
          <fieldset>
            <legend>Severity</legend>
            {LOG_LEVELS.map((level) => (
              <label key={level}>
                <input
                  type="checkbox"
                  checked={(levels ?? LOG_LEVELS).includes(level)}
                  disabled={!onLevelsChange}
                  onChange={() => toggleLevel(level)}
                />
                {level}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={follow}
              disabled={!onFollowChange}
              onChange={(event) => onFollowChange?.(event.target.checked)}
            />
            Follow newest
          </label>
        </div>
      )}
      <div
        ref={viewport}
        className="lp-log__viewport"
        role="region"
        aria-label="Log lines"
        tabIndex={0}
        style={{ height, overflow: 'auto' }}
        onScroll={(event) => {
          const top = Math.max(0, event.currentTarget.scrollTop);
          setScrollTop(top);
          const atBottom = range.totalHeight - top - height <= rowHeight;
          if (atBottom !== follow) onFollowChange?.(atBottom);
        }}
      >
        <div
          role="list"
          aria-label="Filtered log entries"
          style={{ height: range.totalHeight, position: 'relative' }}
        >
          <div style={{ position: 'absolute', top: range.offset, left: 0, right: 0 }}>
            {selection.lines.slice(range.start, range.end).map((line, index) => (
              <div
                key={line.id}
                role="listitem"
                aria-posinset={range.start + index + 1}
                aria-setsize={selection.lines.length}
                className={`lp-log__line lp-log__line--${line.level}`}
                style={{
                  height: rowHeight,
                  lineHeight: `${rowHeight}px`,
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                }}
              >
                {onLineClick ? (
                  <button
                    type="button"
                    className="lp-log__select"
                    onClick={() => onLineClick(line)}
                  >
                    {renderLine ? (
                      renderLine(line, range.start + index)
                    ) : (
                      <LogContent line={line} />
                    )}
                  </button>
                ) : renderLine ? (
                  renderLine(line, range.start + index)
                ) : (
                  <LogContent line={line} />
                )}
              </div>
            ))}
          </div>
        </div>
        {selection.lines.length === 0 && <p>No matching logs</p>}
      </div>
      <output className="lp-log__status">
        {selection.lines.length} shown; {selection.omittedCount} older omitted;{' '}
        {selection.filteredCount} filtered
      </output>
    </section>
  );
}

function LogContent({ line }: { line: LogLine }): ReactNode {
  return (
    <>
      {line.timestamp && <time>{line.timestamp} </time>}
      <b>[{line.level}]</b> {line.message}
    </>
  );
}
