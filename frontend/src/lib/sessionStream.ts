import { Events } from "@wailsio/runtime";
import { SshOutput } from "../../bindings/events";

type Sink = (data: Uint8Array) => void;

const sinks = new Map<string, Sink>();
const backlog = new Map<string, Uint8Array[]>();
let started = false;

/**
 * Subscribes once for the whole app. Output that arrives before a terminal is
 * mounted (the MOTD usually lands first) is buffered until it attaches.
 */
export function startOutputStream(): void {
  if (started) {
    return;
  }
  started = true;

  Events.On(SshOutput, (event) => {
    const { SessionID, Data } = event.data;
    const bytes = decodeBase64(Data);
    const sink = sinks.get(SessionID);
    if (sink) {
      sink(bytes);
      return;
    }
    const queue = backlog.get(SessionID) ?? [];
    queue.push(bytes);
    if (queue.length > 256) {
      queue.shift();
    }
    backlog.set(SessionID, queue);
  });
}

export function attachSink(sessionID: string, sink: Sink): void {
  sinks.set(sessionID, sink);
  const queue = backlog.get(sessionID);
  if (queue) {
    backlog.delete(sessionID);
    for (const chunk of queue) {
      sink(chunk);
    }
  }
}

export function detachSink(sessionID: string): void {
  sinks.delete(sessionID);
  backlog.delete(sessionID);
}

function decodeBase64(input: string): Uint8Array {
  const raw = atob(input);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}
