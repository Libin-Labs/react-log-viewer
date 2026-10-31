import {
  LogViewer,
  appendLogLines,
  selectLogLines,
  getVirtualRange,
  LOG_LEVELS,
  LOG_LIMITS,
  type LogViewerProps,
  type LogLine,
  type LogLevel,
  type LogFilterOptions,
  type LogSelection,
  type VirtualRange,
} from '@lp-labs/react-log-viewer';

const level: LogLevel = 'info';
const lines: LogLine[] = [{ id: '1', message: 'one', level }];
const options: LogFilterOptions = { query: 'one' };
const selected: LogSelection = selectLogLines(lines, options);
const range: VirtualRange = getVirtualRange(1, 0, 100, 24);
const props: LogViewerProps = {
  lines,
  onLevelsChange: (levels) => {
    void levels;
  },
};
void [LogViewer, props, selected, range, appendLogLines([], lines), LOG_LEVELS, LOG_LIMITS];
