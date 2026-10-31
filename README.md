# @lp-labs/react-log-viewer

Package version: `1.0.0`.

Controlled log streaming, literal filtering, severity controls, fixed-height
virtualization, and scroll-follow behavior. React `^18.2 || ^19` is the sole
peer; there are no runtime dependencies. ESM and CommonJS have matching types.

## Install

```sh
npm install @lp-labs/react-log-viewer react
```

```tsx
import { useEffect, useState } from "react";
import {
  LogViewer, appendLogLines, LOG_LEVELS,
  type LogLine, type LogLevel
} from "@lp-labs/react-log-viewer";
import "@lp-labs/react-log-viewer/styles.css";

type Props = {
  subscribe: (receive: (line: LogLine) => void) => () => void;
};

export function StreamingLogs({ subscribe }: Props) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<LogLevel[]>([...LOG_LEVELS]);
  const [follow, setFollow] = useState(true);

  useEffect(() => subscribe((line) => {
    setLines((previous) => appendLogLines(previous, [line], 5000));
  }), [subscribe]);

  return (
    <LogViewer
      lines={lines}
      maxLines={5000}
      height={360}
      rowHeight={24}
      query={query}
      onQueryChange={setQuery}
      levels={levels}
      onLevelsChange={setLevels}
      follow={follow}
      onFollowChange={setFollow}
      showControls
    />
  );
}
```

The application owns the stream, cancellation, ids, storage and errors. The
component does not open sockets or append to your array. Replace arrays and
line objects when data changes. Batch high-rate arrivals before updating
React; one render per transport event can be expensive.

## Public exports and shapes

- `LogViewer`, type `LogViewerProps`.
- `selectLogLines(lines: readonly LogLine[], options?: LogFilterOptions):
  LogSelection`.
- `appendLogLines(existing: readonly LogLine[], incoming: readonly LogLine[],
  maxLines = 10000): LogLine[]`.
- `getVirtualRange(count: number, scrollTop: number, height: number,
  rowHeight: number, overscan = 5): VirtualRange`.
- Frozen `LOG_LEVELS`: `["trace", "debug", "info", "warn", "error", "fatal"]`.
- Frozen `LOG_LIMITS`: `lines: 100000`, `messageLength: 20000`,
  `windowCharacters: 5000000`, `queryLength: 1000`, `height: 100000`,
  `rowHeight: 256`, `overscan: 100`.
- Types `LogLine`, `LogLevel`, `LogFilterOptions`, `LogSelection`, `VirtualRange`.

```ts
type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
interface LogLine {
  id: string;          // Nonempty; unique within retained window
  message: string;     // Plain text, not HTML or ANSI markup
  level: LogLevel;
  timestamp?: string;  // Optional display string, not parsed
}
```

`LogSelection` is `{ lines: LogLine[], omittedCount: number,
filteredCount: number }`. First retain the last `maxLines` input entries,
then filter by severity and message query. This deliberately does not scan
older omitted entries to find matches. `omittedCount` counts old entries
outside that tail; `filteredCount` counts retained entries excluded by
filters. These are counts relative to the supplied array, not lifetime stream
totals. If `appendLogLines` already evicted entries from application state,
track lifetime drops separately.

`VirtualRange` is `{ start, end, offset, totalHeight }`, with exclusive `end`,
pixel `offset = start * rowHeight`, and `totalHeight = count * rowHeight`.
Out-of-range positive scroll positions clamp to the final valid window.
Helpers do not mutate inputs. Selected/appended arrays contain original line
references, not deep copies. `appendLogLines` retains a bounded tail without
concatenating all history and validates the retained result. It does not
deduplicate ids or invent ids.

```tsx
import { selectLogLines, getVirtualRange } from "@lp-labs/react-log-viewer";

const selection = selectLogLines([
  { id: "request-1", message: "Request failed", level: "error" }
], { levels: ["warn", "error"], query: "FAILED" });
const window = getVirtualRange(selection.lines.length, 0, 320, 24);
```

## Props and defaults

Only `lines` is required. `LogFilterOptions` contains `query`, `levels`,
`caseSensitive`, and `maxLines` with the same defaults below.

| Prop | Type | Default / behavior |
| --- | --- | --- |
| `lines` | `readonly LogLine[]` | Required, chronological oldest-to-newest input |
| `maxLines` | `number` | `10000`; integer 1-100000 tail cap before filtering |
| `query` | `string` | `""`; literal message substring, max 1000 UTF-16 units |
| `caseSensitive` | `boolean` | `false`; uses JavaScript lowercase comparison |
| `levels` | `readonly LogLevel[]` | Omitted means all; `[]` means none |
| `height` | `number` | `320`; integer pixels 1-100000 |
| `rowHeight` | `number` | `24`; integer pixels 8-256 |
| `overscan` | `number` | `5`; extra rows per side, integer 0-100 |
| `follow` | `boolean` | `true`; keep newest filtered entry visible |
| `onFollowChange` | `(follow: boolean) => void` | Checkbox and scroll proposal |
| `onQueryChange` | `(query: string) => void` | Search-input proposal |
| `onLevelsChange` | `(levels: LogLevel[]) => void` | Full selected set, in `LOG_LEVELS` order |
| `showControls` | `boolean` | `false`; show search, severity and follow controls |
| `onLineClick` | `(line: LogLine) => void` | Add native selectable-line buttons |
| `renderLine` | `(line: LogLine, filteredIndex: number) => ReactNode` | Timestamp, severity, plain message |
| `className`, `style` | `string`, `CSSProperties` | `""`, no inline root style |
| `ariaLabel` | `string` | `"Log viewer"` |

Query matches messages only, not ids, timestamps, or severity labels. There
is no regex, ANSI interpretation, HTML parsing, fuzzy matching, or remote
search. Unicode case conversion is not locale-aware.

## Follow semantics

With `follow=true`, mounting, changing lines/filters, and changing viewport
dimensions moves to the newest filtered entry. A scroll more than one
`rowHeight` away from the bottom proposes `false`; scrolling back within one
row proposes `true`. Wire `onFollowChange` to controlled state to pause/resume.
Without that callback, following is read-only and the next data update still
follows even after manually scrolling up.

While paused, updates retain/clamp the numeric scroll offset. They do not
anchor a particular log id: eviction from the retained tail can shift the
visible content. Changing filters while paused also retains/clamps the
offset, not a specific line. No smooth scrolling or automatic focus changes.

## Customization and accessibility

```tsx
<LogViewer
  lines={[{ id: "1", level: "warn", message: "Retry scheduled" }]}
  className="operations-log"
  rowHeight={28}
  renderLine={(line) => <span title={line.message}>{line.level}: {line.message}</span>}
  onLineClick={(line) => console.log("Selected", line.id)}
/>
```

CSS variables on `.lp-log`: `--lp-log-background`, `--lp-log-color`,
`--lp-log-error`. Classes `lp-log__line--trace` through
`lp-log__line--fatal` allow per-severity styling. Preserve the fixed row
height: custom content must fit one row. Wrapping/multiline rows and
variable-height virtualization are not supported. Overflow is clipped;
style truncation or provide a detail panel using `onLineClick`.

The viewport is a labeled, keyboard-scrollable region. Visible entries form
a list with `aria-posinset` and `aria-setsize`. Severity text is present, so
meaning does not rely on color. Controls have native labels; line selection,
when enabled, uses native buttons. This is intentionally not an `aria-live`
firehose: frequent incoming messages are not continuously announced. A screen
reader sees only the currently mounted virtual window, not all history.
Keyboard focus on an evicted/unmounted line may be lost. Supply a separate
nonvirtualized export/detail workflow when required.

## Bounds, errors, and performance

`RangeError`: invalid numeric dimensions/caps, oversized query, message over
20000 code units, or retained id/message/timestamp text totaling over 5000000
code units. `TypeError`: invalid severity, empty/duplicate retained ids,
non-string message or timestamp. Validation occurs before filters, but only
inside the retained tail. These are typed-data APIs, not a validator for
arbitrary hostile objects, getters, sparse arrays, or unknown JSON shapes.
Errors propagate to callers/React error boundaries.

DOM rows are bounded by approximately
`ceil(height / rowHeight) + 2 * overscan + 1`, also bounded by matched count.
Filtering and id validation still scan the entire retained tail on each
changed data/filter reference: O(retained text + retained entries), with
O(retained entries) additional memory. Streaming append copies/validates
the retained tail, not O(1) work. This is not a ring buffer, worker, incremental
search index, or claim of million-line real-time processing. Large allowed
viewports or custom renderers can still be slow.

The component uses layout effects for browser scrolling; server rendering
does not follow a stream and React 18 may warn about layout effects on the
server. Use a client boundary where appropriate. No automatic height
measurement, ResizeObserver, document listeners, or background processes.
jsdom tests validate calculations/interactions, not real browser frame rates.

## Provenance

Independently authored for this project rather than copied
from a log-viewer library. This is a provenance description, not a legal
guarantee or performance warranty.

## License

[MIT](./LICENSE).

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
