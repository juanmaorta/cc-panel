export interface JobSpec {
  label: string;
  args: string[];
  logFile: string;
  keepAlive?: boolean;
  intervalSec?: number;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function renderPlist(job: JobSpec): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>`,
    `  <string>${esc(job.label)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...job.args.map((a) => `    <string>${esc(a)}</string>`),
    `  </array>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
  ];
  if (job.keepAlive) lines.push('  <key>KeepAlive</key>', '  <true/>');
  if (job.intervalSec !== undefined) lines.push('  <key>StartInterval</key>', `  <integer>${job.intervalSec}</integer>`);
  lines.push(
    '  <key>StandardOutPath</key>',
    `  <string>${esc(job.logFile)}</string>`,
    '  <key>StandardErrorPath</key>',
    `  <string>${esc(job.logFile)}</string>`,
    '</dict>',
    '</plist>',
    '',
  );
  return lines.join('\n');
}
