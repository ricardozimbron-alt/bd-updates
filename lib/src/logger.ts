type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, msg: string, extra?: Record<string, unknown>) {
  const line = {
    t: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(extra ?? {}),
  };
  // structured single-line JSON; fly/vercel both handle this fine
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(JSON.stringify(line) + '\n');
}

export function makeLogger(scope: string) {
  return {
    debug: (msg: string, extra?: Record<string, unknown>) => emit('debug', scope, msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => emit('info', scope, msg, extra),
    warn: (msg: string, extra?: Record<string, unknown>) => emit('warn', scope, msg, extra),
    error: (msg: string, extra?: Record<string, unknown>) => emit('error', scope, msg, extra),
  };
}
export type Logger = ReturnType<typeof makeLogger>;
