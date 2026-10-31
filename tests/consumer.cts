import logs = require('@lp-labs/react-log-viewer');

const line: logs.LogLine = { id: '1', message: 'one', level: 'info' };
const props: logs.LogViewerProps = { lines: [line] };
const range: logs.VirtualRange = logs.getVirtualRange(1, 0, 100, 24);
void [props, range, logs.LogViewer, logs.selectLogLines([line]), logs.LOG_LEVELS, logs.LOG_LIMITS];
