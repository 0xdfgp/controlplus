import { TextPart } from '../../domain/content/text-part.ts';
import type { ContentPart } from '../../domain/content/content-part.ts';
import { Message } from '../../domain/entities/message.ts';
import type { TerminalState } from '../../domain/entities/message.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import { MessageId } from '../../domain/value-objects/message-id.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { Provenance } from '../../domain/value-objects/provenance.ts';
import { Usage } from '../../domain/value-objects/usage.ts';
import type { MessageRow, NewMessageRow } from './schema.ts';

interface StoredTextPart {
  readonly kind: 'text';
  readonly text: string;
}

interface StoredProvenance {
  readonly origin: string;
  readonly modelId: string;
  readonly provider: string;
}

interface StoredUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly thoughtTokens: number;
}

/**
 * Row to domain and back, written by hand (ADR-010).
 *
 * Rehydration goes through the same factories as a fresh Message, so a row that
 * has drifted out of shape fails loudly here rather than becoming an assistant
 * message with no provenance further up.
 */
export function toMessageRow(message: Message): NewMessageRow {
  return {
    id: message.id.value,
    conversationId: message.conversationId.value,
    author: message.author,
    parts: message.parts.map(
      (part): StoredTextPart => ({ kind: 'text', text: part.text }),
    ),
    createdAt: message.createdAt,
    provenance:
      message.provenance === null
        ? null
        : ({
            origin: message.provenance.origin,
            modelId: message.provenance.modelId.value,
            provider: message.provenance.provider,
          } satisfies StoredProvenance),
    usage:
      message.usage === null
        ? null
        : ({
            inputTokens: message.usage.inputTokens.value,
            outputTokens: message.usage.outputTokens.value,
            thoughtTokens: message.usage.thoughtTokens.value,
          } satisfies StoredUsage),
    state: message.state,
  };
}

export function toMessage(row: MessageRow): Message {
  const id = MessageId.fromString(row.id);
  const conversationId = ConversationId.fromString(row.conversationId);
  const parts = toContentParts(row.parts);

  if (row.author === 'user') {
    return Message.fromUser({ id, conversationId, parts, createdAt: row.createdAt });
  }

  if (row.author !== 'assistant') {
    throw new TypeError(`Unknown message author "${row.author}" in row ${row.id}.`);
  }

  return Message.fromAssistant({
    id,
    conversationId,
    parts,
    createdAt: row.createdAt,
    provenance: toProvenance(row.provenance, row.id),
    usage: toUsage(row.usage, row.id),
    state: row.state as TerminalState,
  });
}

function toContentParts(value: unknown): ContentPart[] {
  if (!Array.isArray(value)) {
    throw new TypeError('Stored content parts are not an array.');
  }
  return value.map((raw) => {
    const part = raw as Partial<StoredTextPart>;
    if (part.kind !== 'text' || typeof part.text !== 'string') {
      throw new TypeError(`Unsupported stored content part: ${JSON.stringify(raw)}.`);
    }
    return TextPart.of(part.text);
  });
}

function toProvenance(value: unknown, rowId: string): Provenance {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`Assistant message ${rowId} has no stored provenance.`);
  }
  const stored = value as Partial<StoredProvenance>;
  if (typeof stored.modelId !== 'string' || typeof stored.provider !== 'string') {
    throw new TypeError(`Assistant message ${rowId} has malformed provenance.`);
  }
  return Provenance.aiGenerated(ModelId.fromString(stored.modelId), stored.provider);
}

function toUsage(value: unknown, rowId: string): Usage {
  if (value === null || typeof value !== 'object') {
    throw new TypeError(`Assistant message ${rowId} has no stored usage.`);
  }
  const stored = value as Partial<StoredUsage>;
  if (
    typeof stored.inputTokens !== 'number' ||
    typeof stored.outputTokens !== 'number'
  ) {
    throw new TypeError(`Assistant message ${rowId} has malformed usage.`);
  }
  // A row written before ADR-020 has no thoughtTokens. Migration 0002 backfills
  // zero, and this default covers a row that slipped in between deploying the
  // code and running the migration.
  return Usage.fromCounts(
    stored.inputTokens,
    stored.outputTokens,
    typeof stored.thoughtTokens === 'number' ? stored.thoughtTokens : 0,
  );
}
