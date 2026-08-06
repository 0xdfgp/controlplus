import { describe, expect, it } from 'vitest';

import { canRetry, isInFlight, isVoiceTurn, transition } from './turn-machine.ts';
import type { TurnEvent, TurnState } from './turn-machine.ts';

const STATES: readonly TurnState[] = [
  'idle',
  'recording',
  'transcribing',
  'reviewing',
  'uploading',
  'thinking',
  'responding',
  'stopped',
  'failed',
];

const EVENTS: readonly TurnEvent[] = [
  'ask',
  'speak',
  'transcribe',
  'transcribed',
  'discard',
  'upload',
  'sent',
  'responding',
  'completed',
  'stop',
  'fail',
];

/** Every edge the machine is allowed to have. Anything absent is impossible. */
const LEGAL: readonly [TurnState, TurnEvent, TurnState][] = [
  ['idle', 'ask', 'thinking'],
  ['idle', 'upload', 'uploading'],
  ['idle', 'speak', 'recording'],
  ['recording', 'transcribe', 'transcribing'],
  ['recording', 'discard', 'idle'],
  ['transcribing', 'transcribed', 'reviewing'],
  ['transcribing', 'discard', 'idle'],
  ['reviewing', 'ask', 'thinking'],
  ['reviewing', 'discard', 'idle'],
  ['uploading', 'sent', 'thinking'],
  ['uploading', 'fail', 'failed'],
  ['thinking', 'responding', 'responding'],
  ['thinking', 'completed', 'idle'],
  ['thinking', 'fail', 'failed'],
  ['responding', 'completed', 'idle'],
  ['responding', 'stop', 'stopped'],
  ['responding', 'fail', 'failed'],
  ['stopped', 'ask', 'thinking'],
  ['stopped', 'upload', 'uploading'],
  ['stopped', 'speak', 'recording'],
  ['failed', 'ask', 'thinking'],
  ['failed', 'upload', 'uploading'],
  ['failed', 'speak', 'recording'],
];

describe('the turn state machine, legal transitions', () => {
  it.each(LEGAL)('%s + %s -> %s', (from, event, to) => {
    expect(transition(from, event)).toBe(to);
  });

  it('returns to idle when a turn completes, so the input comes back', () => {
    // ADR-022's implicit return. The answer stays on screen; there is no
    // "ask another question" control, because the input already is one.
    expect(transition('responding', 'completed')).toBe('idle');
  });

  it('reaches thinking again from every terminal state', () => {
    for (const terminal of ['idle', 'stopped', 'failed'] as const) {
      expect(transition(terminal, 'ask')).toBe('thinking');
    }
  });
});

describe('the turn state machine, impossible transitions', () => {
  const legalKeys = new Set(LEGAL.map(([from, event]) => `${from}+${event}`));

  const impossible = STATES.flatMap((state) =>
    EVENTS.filter((event) => !legalKeys.has(`${state}+${event}`)).map(
      (event): [TurnState, TurnEvent] => [state, event],
    ),
  );

  it.each(impossible)('rejects %s + %s', (from, event) => {
    expect(transition(from, event)).toBeNull();
  });

  it('covers every pair, so a new event cannot slip through untested', () => {
    expect(impossible.length + LEGAL.length).toBe(STATES.length * EVENTS.length);
  });

  it('will not send a second question over a live answer', () => {
    expect(transition('responding', 'ask')).toBeNull();
    expect(transition('thinking', 'ask')).toBeNull();
  });

  it('will not turn a stopped turn into a failed one', () => {
    // Stopping closes the connection, so a transport error follows almost every
    // stop. E7 says the partial answer is not styled as a fault, and this is
    // what keeps that true.
    expect(transition('stopped', 'fail')).toBeNull();
  });

  it('offers no stop outside the responding state', () => {
    // E2 draws thinking with no Stop control, and E7 with none either. The
    // machine agrees rather than relying on the screen to hide the button.
    expect(transition('thinking', 'stop')).toBeNull();
    expect(transition('idle', 'stop')).toBeNull();
    expect(transition('stopped', 'stop')).toBeNull();
    expect(transition('failed', 'stop')).toBeNull();
    // E5 draws none either, and there is nothing at the provider to stop: the
    // request has not arrived yet.
    expect(transition('uploading', 'stop')).toBeNull();
  });
});

describe('sending a photo (E5)', () => {
  it('goes through uploading, then waits like any other turn', () => {
    expect(transition('idle', 'upload')).toBe('uploading');
    expect(transition('uploading', 'sent')).toBe('thinking');
  });

  it('takes a bare question straight to thinking', () => {
    // A progress bar that finishes instantly is noise, so one line of text does
    // not get one.
    expect(transition('idle', 'ask')).toBe('thinking');
  });

  it('will not send a second question over a photo still going out', () => {
    expect(transition('uploading', 'ask')).toBeNull();
    expect(transition('uploading', 'upload')).toBeNull();
  });

  it('lets a photo follow a finished, stopped or failed turn', () => {
    expect(transition('stopped', 'upload')).toBe('uploading');
    expect(transition('failed', 'upload')).toBe('uploading');
  });

  it('ends no turn from uploading, so something must move it on first', () => {
    // The trap this slice fell into on a real device. A photo turn that never
    // left uploading refused every event that ends a turn, so the answer came
    // back, was thrown away by the machine, and the screen stayed on "Sending
    // your photo" forever.
    //
    // The machine is right to refuse these — a turn cannot finish while its
    // question is still going out. What was wrong was leaving `sent` to upload
    // progress, which is optional on the platform and never arrived. It is
    // driven by the server's first event now, which is the thing that actually
    // proves the photo landed.
    expect(transition('uploading', 'completed')).toBeNull();
    expect(transition('uploading', 'responding')).toBeNull();
    expect(transition('uploading', 'stop')).toBeNull();
    // The two ways out, and neither depends on a byte counter.
    expect(transition('uploading', 'sent')).toBe('thinking');
    expect(transition('uploading', 'fail')).toBe('failed');
  });

  it('cannot report an upload finished when none was under way', () => {
    expect(transition('idle', 'sent')).toBeNull();
    expect(transition('thinking', 'sent')).toBeNull();
    expect(transition('responding', 'sent')).toBeNull();
  });
});

describe('asking by speaking (E4, E6)', () => {
  it('starts recording on an explicit event and nothing else', () => {
    // 03 forbids press and hold, and the machine agrees rather than leaving it
    // to the button: there is one event that starts recording, and it is the
    // one a deliberate tap sends.
    expect(transition('idle', 'speak')).toBe('recording');
    expect(transition('recording', 'speak')).toBeNull();
  });

  it('goes recording, transcribing, reviewing, and only then thinking', () => {
    expect(transition('recording', 'transcribe')).toBe('transcribing');
    expect(transition('transcribing', 'transcribed')).toBe('reviewing');
    expect(transition('reviewing', 'ask')).toBe('thinking');
  });

  it('sends nothing before the transcript has been seen (AC2)', () => {
    // The whole point of E6. A voice turn cannot reach the server from
    // recording or transcribing, so a misheard word is always on screen and
    // correctable before anything is answered.
    expect(transition('recording', 'ask')).toBeNull();
    expect(transition('transcribing', 'ask')).toBeNull();
  });

  it('leaves a voice turn that produced nothing back at idle (AC4, AC5)', () => {
    // A refused microphone and a recording that heard nothing both end here.
    // Not in `failed`: nothing failed, and the person can still type.
    expect(transition('recording', 'discard')).toBe('idle');
    expect(transition('transcribing', 'discard')).toBe('idle');
    expect(transition('reviewing', 'discard')).toBe('idle');
  });

  it('never turns a voice problem into a failed answer', () => {
    for (const state of ['recording', 'transcribing', 'reviewing'] as const) {
      expect(transition(state, 'fail')).toBeNull();
    }
  });

  it('offers no Stop while speaking, because there is nothing to stop', () => {
    // Stop aborts a request at the provider (ADR-016). Nothing has been sent
    // yet; the control that ends a recording is a different one.
    for (const state of ['recording', 'transcribing', 'reviewing'] as const) {
      expect(transition(state, 'stop')).toBeNull();
    }
  });

  it('lets a spoken question follow a finished, stopped or failed turn', () => {
    for (const terminal of ['idle', 'stopped', 'failed'] as const) {
      expect(transition(terminal, 'speak')).toBe('recording');
    }
  });

  it('cannot report a transcript when nothing was being transcribed', () => {
    expect(transition('idle', 'transcribed')).toBeNull();
    expect(transition('recording', 'transcribed')).toBeNull();
    expect(transition('thinking', 'transcribe')).toBeNull();
  });

  it('attaches no photo to a spoken question', () => {
    // E1 offers both, but a turn is one or the other: the transcript review
    // has no photo on it, and nothing in this slice sends both.
    expect(transition('reviewing', 'upload')).toBeNull();
    expect(transition('recording', 'upload')).toBeNull();
  });
});

describe('retrying a failed answer (E8)', () => {
  it('offers Try again on a failed turn and nowhere else', () => {
    // Every failure the client can render arrives in this one state: a provider
    // failure and a database failure through the stream's error event, a timeout
    // and a lost connection through its transport error. So one state is the
    // whole of "retry is available on every failure", including a second failure
    // after a retry — which lands back here.
    expect(STATES.filter(canRetry)).toEqual(['failed']);
  });

  it('goes from failed to thinking, which is what the person sees', () => {
    expect(transition('failed', 'ask')).toBe('thinking');
  });

  it('goes back through uploading when the question carried a photo', () => {
    // The photo is sent again in the body, so it is genuinely leaving the phone
    // again. Going straight to thinking would put "Thinking about your question"
    // on screen while several megabytes were still on their way out.
    expect(transition('failed', 'upload')).toBe('uploading');
  });

  it('is refused while a turn is under way', () => {
    // The button is not drawn outside `failed`, and a tap cannot be aimed at
    // what is not there. This is the second lock: `useTurn` reads the machine
    // again before re-sending, because the state a tap was aimed at and the state
    // it arrives in are not always the same one.
    for (const state of STATES.filter(isInFlight)) {
      expect(canRetry(state)).toBe(false);
    }
  });

  it('offers no retry on a turn that finished or was stopped', () => {
    // Nothing failed in either, and the input is already there to ask again
    // with. A retry control on a good answer would be an invitation to re-ask a
    // question that was answered.
    expect(canRetry('idle')).toBe(false);
    expect(canRetry('stopped')).toBe(false);
  });
});

describe('isInFlight', () => {
  it('is true exactly while a turn is under way', () => {
    // Uploading counts: the input must not accept a second question while a
    // photo is still leaving the phone. The three voice states count too —
    // the screen is showing one thing at a time, and while the person is
    // speaking there is no composer to type a second question into.
    expect(STATES.filter(isInFlight)).toEqual([
      'recording',
      'transcribing',
      'reviewing',
      'uploading',
      'thinking',
      'responding',
    ]);
  });
});

describe('isVoiceTurn', () => {
  it('is true exactly for the three client-only voice states', () => {
    expect(STATES.filter(isVoiceTurn)).toEqual([
      'recording',
      'transcribing',
      'reviewing',
    ]);
  });
});
