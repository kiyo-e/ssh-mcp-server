import { randomUUID } from "crypto";
import ssh2 from "ssh2";
// ssh2 is CommonJS, so we pluck Client off the default export.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { Client } = ssh2 as any;

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export type SshSession = {
  id: string;
  client: InstanceType<typeof Client>;
  // ssh2 does not export proper stream types, so we fall back to any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shell: any;
  buffer: string;
  busy: boolean;
  lastActive: number;
};

const sessions = new Map<string, SshSession>();

// Periodically reap idle sessions so we do not leak to the remote host.
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActive > IDLE_TIMEOUT_MS) {
      try {
        session.shell.end();
      } catch (error) {
        console.error(`Failed to end shell for idle session ${id}:`, error);
      }
      session.client.end();
      sessions.delete(id);
    }
  }
}, IDLE_TIMEOUT_MS / 2).unref?.();

export type OpenSessionParams = {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
};

export async function openSshSession(
  params: OpenSessionParams
): Promise<string> {
  const { host, port = 22, username, password, privateKey } = params;

  return new Promise((resolve, reject) => {
    const client = new Client();
    const sessionId = randomUUID();

    client
      .on("ready", () => {
        client.shell((err: Error | undefined, stream: unknown) => {
          if (err) {
            client.end();
            reject(err);
            return;
          }

          const session: SshSession = {
            id: sessionId,
            client,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            shell: stream as any,
            buffer: "",
            busy: false,
            lastActive: Date.now()
          };

          session.shell.on("data", (data: Buffer) => {
            session.buffer += data.toString("utf-8");
          });

          session.shell.on("close", () => {
            sessions.delete(sessionId);
            client.end();
          });

          session.shell.write(
            "export HISTFILE=/dev/null HISTSIZE=0 HISTCONTROL=ignorespace,ignoredups\n"
          );

          sessions.set(sessionId, session);
          resolve(sessionId);
        });
      })
      .on("error", (err: Error) => {
        reject(err);
      })
      .connect({
        host,
        port,
        username,
        password,
        privateKey
      });
  });
}

export type ExecResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export async function execInSession(
  sessionId: string,
  command: string,
  timeoutMs = 60_000
): Promise<ExecResult> {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  if (session.busy) {
    throw new Error("Session is busy");
  }

  session.busy = true;
  session.lastActive = Date.now();

  const marker = `__END__${Date.now()}_${sessionId.slice(0, 8)}`;
  const wrappedCmd = `${command}\nprintf '\\n${marker}:%s\\n' "$?"\n`;

  session.buffer = "";

  const shell = session.shell;

  return new Promise<ExecResult>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const cleanup = () => {
      session.busy = false;
      session.lastActive = Date.now();
      shell.off("data", onData);
      shell.off("error", onError);
      shell.off("close", onClose);
      clearInterval(timer);
    };

    const finalize = (result: ExecResult) => {
      cleanup();
      resolve(result);
    };

    const fail = (error: Error) => {
      cleanup();
      reject(error);
    };

    const parseBuffer = () => {
      const markerIndex = session.buffer.indexOf(`${marker}:`);
      if (markerIndex === -1) {
        return false;
      }

      const stdout = session.buffer.slice(0, markerIndex);
      const remainder = session.buffer.slice(markerIndex);
      const newlineIndex = remainder.indexOf("\n");
      const statusLine = newlineIndex === -1 ? remainder : remainder.slice(0, newlineIndex);
      const exitCodeStr = statusLine.split(":")[1] ?? "";
      const exitCode = Number.parseInt(exitCodeStr.trim(), 10);

      finalize({ stdout, stderr: "", exitCode: Number.isNaN(exitCode) ? -1 : exitCode });
      return true;
    };

    const onData = () => {
      parseBuffer();
    };

    const onError = (error: Error) => {
      fail(error);
    };

    const onClose = () => {
      fail(new Error("Shell closed before command completed"));
    };

    shell.on("data", onData);
    shell.on("error", onError);
    shell.on("close", onClose);

    shell.write(wrappedCmd);

    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        fail(new Error("Command timeout"));
      } else {
        parseBuffer();
      }
    }, 50);
  });
}

export function closeSshSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }

  try {
    session.shell.end("exit\n");
  } catch (error) {
    console.error(`Failed to close shell for session ${sessionId}:`, error);
  }
  session.client.end();
  sessions.delete(sessionId);
  return true;
}
