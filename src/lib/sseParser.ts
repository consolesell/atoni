export interface SSEParsedEvent {
  eventType: string;
  rawData: string;
  json?: any;
  isDone?: boolean;
}

/**
 * Shared stateful SSE stream parser that buffers partial chunks across network reads,
 * supports multi-event chunks, normalizes CRLF, and flushes TextDecoder EOF cleanly.
 */
export class SSEStreamParser {
  private buffer = '';
  private decoder = new TextDecoder('utf-8', { fatal: false });

  public feed(chunk: Uint8Array | string): SSEParsedEvent[] {
    const text =
      typeof chunk === 'string'
        ? chunk
        : this.decoder.decode(chunk, { stream: true });
    if (!text) return [];
    this.buffer += text.replace(/\r\n/g, '\n');
    return this.extractCompleteFrames();
  }

  public finish(): SSEParsedEvent[] {
    const remainingDecoded = this.decoder.decode();
    if (remainingDecoded) {
      this.buffer += remainingDecoded.replace(/\r\n/g, '\n');
    }
    const events = this.extractCompleteFrames();
    // Flush any trailing incomplete frame terminated by EOF rather than blank line
    const tail = this.buffer.trim();
    this.buffer = '';
    if (tail) {
      const parsed = this.parseFrame(tail);
      if (parsed) events.push(parsed);
    }
    return events;
  }

  public reset(): void {
    this.buffer = '';
    this.decoder = new TextDecoder('utf-8', { fatal: false });
  }

  private extractCompleteFrames(): SSEParsedEvent[] {
    const events: SSEParsedEvent[] = [];
    while (true) {
      const boundaryIdx = this.buffer.indexOf('\n\n');
      if (boundaryIdx === -1) break;
      const frame = this.buffer.slice(0, boundaryIdx);
      this.buffer = this.buffer.slice(boundaryIdx + 2);
      const parsed = this.parseFrame(frame);
      if (parsed) {
        events.push(parsed);
      }
    }
    return events;
  }

  private parseFrame(frame: string): SSEParsedEvent | null {
    const lines = frame.split('\n');
    let eventType = 'message';
    const dataLines: string[] = [];

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line || line.startsWith(':')) continue;
      if (line.startsWith('event:')) {
        eventType = line.slice(6).trim() || 'message';
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      } else if (line.startsWith('{') && dataLines.length === 0) {
        // Handle bare JSON line if upstream omitted 'data:' prefix
        dataLines.push(line);
      }
    }

    if (dataLines.length === 0) return null;
    const rawData = dataLines.join('\n').trim();
    if (!rawData) return null;
    if (rawData === '[DONE]') {
      return { eventType, rawData, isDone: true };
    }

    try {
      const json = JSON.parse(rawData);
      return { eventType, rawData, json };
    } catch {
      return { eventType, rawData };
    }
  }
}

export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (evt: SSEParsedEvent) => void | Promise<void>
): Promise<void> {
  const parser = new SSEStreamParser();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      const events = parser.feed(value);
      for (const evt of events) {
        await onEvent(evt);
      }
    }
  }
  const tailEvents = parser.finish();
  for (const evt of tailEvents) {
    await onEvent(evt);
  }
}
