/**
 * The Ambot365 product story, expressed once as data and pure functions.
 *
 * Everything the hero animates — where a conversation card is at 6.4s, how far
 * the revenue line has risen, which pose the professional holds — is derived
 * from a single story time. No component owns a timer, so the sequence cannot
 * drift, and re-timing a beat means editing a number here rather than hunting
 * through five components.
 *
 * The story: the professional works -> customer conversations pile in from four
 * channels -> WebChatBot captures and resolves them -> Ambot365 CRM records the
 * result and revenue rises -> the professional keeps working, calmer.
 *
 * Stage coordinates are percentages of the hero box (0-100 on both axes), so
 * the whole composition is resolution independent and never needs measuring.
 */

import {
  bezierAngle,
  bezierX,
  clamp01,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  easeOutQuint,
  lerp,
  progress,
  pulse,
} from "../../../shared/motion";

/** One full pass of the story. Sits inside the 12-14s brief. */
export const LOOP_DURATION = 13.5;

/* ── Stage anchors ───────────────────────────────────────────────────────── */

export const BOT_ANCHOR = { x: 30, y: 38 } as const;
/** The Inbox window — where a resolved conversation lands. */
export const CRM_ANCHOR = { x: 73, y: 50 } as const;
export const DESK_ANCHOR = { x: 16, y: 82 } as const;

/* ── Channels ────────────────────────────────────────────────────────────── */

export type ChannelId = "whatsapp" | "instagram" | "messenger" | "webchat";

export interface Channel {
  readonly id: ChannelId;
  readonly label: string;
  /** Channel chip colour — the only non-Ambot colour allowed on the stage. */
  readonly tint: string;
}

export const CHANNELS: Record<ChannelId, Channel> = {
  whatsapp: { id: "whatsapp", label: "WhatsApp", tint: "#25D366" },
  instagram: { id: "instagram", label: "Instagram", tint: "#E1306C" },
  messenger: { id: "messenger", label: "Messenger", tint: "#0084FF" },
  webchat: { id: "webchat", label: "Web Chat", tint: "#16C784" },
};

/* ── Conversations ───────────────────────────────────────────────────────── */

export interface ConversationDef {
  readonly id: string;
  readonly channel: ChannelId;
  readonly name: string;
  readonly initials: string;
  readonly preview: string;
  readonly badge: number;
  /** Off-stage origin. Every card is physically elsewhere before it arrives. */
  readonly from: { x: number; y: number };
  /** Bend of the entry curve. */
  readonly via: { x: number; y: number };
  /** Where it settles and stays readable. */
  readonly settle: { x: number; y: number };
  /** Bend of the hand-off curve toward WebChatBot. */
  readonly handoffVia: { x: number; y: number };
  readonly enterAt: number;
  readonly travelAt: number;
  /** Idle drift offset so settled cards never breathe in lockstep. */
  readonly driftPhase: number;
  /** 1 shows on the smallest screens, 4 only on the largest. */
  readonly weight: 1 | 2 | 3 | 4;
}

const ENTER_DURATION = 1.25;
const TRAVEL_DURATION = 1.05;

export const CONVERSATIONS: readonly ConversationDef[] = [
  {
    id: "c1",
    channel: "whatsapp",
    name: "John Doe",
    initials: "JD",
    preview: "Hi, I need help with my order",
    badge: 2,
    from: { x: -30, y: 6 },
    via: { x: -6, y: 1 },
    settle: { x: 13, y: 10 },
    handoffVia: { x: 15, y: 26 },
    enterAt: 2,
    travelAt: 6.2,
    driftPhase: 0,
    weight: 1,
  },
  {
    id: "c2",
    channel: "instagram",
    name: "Sarah Williams",
    initials: "SW",
    preview: "Can you share the pricing?",
    badge: 1,
    from: { x: 44, y: -34 },
    via: { x: 58, y: -10 },
    settle: { x: 34, y: 10 },
    handoffVia: { x: 38, y: 26 },
    enterAt: 3.9,
    travelAt: 6.95,
    driftPhase: 1.9,
    weight: 2,
  },
  {
    id: "c3",
    channel: "messenger",
    name: "David Miller",
    initials: "DM",
    preview: "I need support with my account",
    badge: 3,
    from: { x: -32, y: 62 },
    via: { x: -12, y: 42 },
    settle: { x: 13, y: 26 },
    handoffVia: { x: 17, y: 34 },
    enterAt: 4.65,
    travelAt: 7.7,
    driftPhase: 3.4,
    weight: 3,
  },
  {
    id: "c4",
    channel: "webchat",
    name: "Priya Nair",
    initials: "PN",
    preview: "Can I get an update?",
    badge: 1,
    from: { x: 30, y: 124 },
    via: { x: 42, y: 72 },
    settle: { x: 34, y: 26 },
    handoffVia: { x: 37, y: 34 },
    enterAt: 5.45,
    travelAt: 8.45,
    driftPhase: 5.1,
    weight: 4,
  },
];

/** When each conversation reaches WebChatBot. Drives every downstream beat. */
export const ARRIVALS: readonly number[] = CONVERSATIONS.map(
  (conversation) => conversation.travelAt + TRAVEL_DURATION,
);

/* ── Beat boundaries ─────────────────────────────────────────────────────── */

const HANDOFF_START = CONVERSATIONS[0].travelAt;
const LAST_ARRIVAL = ARRIVALS[ARRIVALS.length - 1];
const RESOLVED_UNTIL = LAST_ARRIVAL + 1.8;

/**
 * The CRM's figures roll back to their opening values under a refresh sweep, so
 * the loop can restart without the numbers visibly snapping backwards.
 */
const RESET_FROM = 12.55;
const RESET_TO = 13.42;

/* ── Character ───────────────────────────────────────────────────────────── */

export type CharacterState =
  | "IDLE"
  | "TYPING"
  | "NOTIFICATION_RECEIVED"
  | "BUSY_TYPING"
  | "AI_PROCESSING"
  | "RELAXED_TYPING";

interface Cue<T> {
  readonly at: number;
  readonly value: T;
}

/** Read as a strip: the state in force is the last cue at or before `time`. */
const CHARACTER_CUES: readonly Cue<CharacterState>[] = [
  { at: 0, value: "TYPING" },
  { at: 2.45, value: "NOTIFICATION_RECEIVED" },
  { at: 3.15, value: "TYPING" },
  { at: 4.15, value: "NOTIFICATION_RECEIVED" },
  { at: 4.7, value: "BUSY_TYPING" },
  { at: 7.4, value: "AI_PROCESSING" },
  { at: 9.9, value: "RELAXED_TYPING" },
  { at: 12, value: "TYPING" },
];

export type BotState = "IDLE" | "RECEIVING" | "PROCESSING" | "RESOLVED";

const BOT_CUES: readonly Cue<BotState>[] = [
  { at: 0, value: "IDLE" },
  { at: HANDOFF_START, value: "RECEIVING" },
  { at: ARRIVALS[0], value: "PROCESSING" },
  { at: RESOLVED_UNTIL - 1.4, value: "RESOLVED" },
  { at: RESOLVED_UNTIL, value: "IDLE" },
];

function cueAt<T>(cues: readonly Cue<T>[], time: number): Cue<T> {
  let current = cues[0];
  for (const cue of cues) {
    if (cue.at <= time) current = cue;
    else break;
  }
  return current;
}

export const characterStateAt = (time: number) => cueAt(CHARACTER_CUES, time).value;
export const botStateAt = (time: number) => cueAt(BOT_CUES, time).value;

/** Seconds the character has held its current state — drives settle-in easing. */
export const characterStateAge = (time: number) => time - cueAt(CHARACTER_CUES, time).at;

/**
 * The one beat that needs a window rather than a state: during relaxed typing
 * the right hand lifts off the keys for a moment before returning.
 */
export const handRestAt = (time: number) => pulse(time, 10.5, 11.35);

/* ── Frame sampling ──────────────────────────────────────────────────────── */

export type ConversationPhase = "hidden" | "entering" | "settled" | "travelling";

export interface ConversationSample {
  phase: ConversationPhase;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  /** 0 while resting, ramps to 1 as the card is drawn into WebChatBot. */
  travel: number;
  /** Brief highlight the instant the card lands on stage. */
  land: number;
}

export interface StoryFrame {
  time: number;
  /** Parallel to CONVERSATIONS — mutated in place, never re-allocated. */
  readonly conversations: ConversationSample[];
  /** 0-1 ambient energy of WebChatBot. */
  botEnergy: number;
  /** Spikes to 1 each time a conversation is absorbed. */
  botImpact: number;
  /** Direction (stage units) of the conversation currently reaching the bot. */
  botLookX: number;
  botLookY: number;
  /** 0-1 across all four resolutions. Drives KPIs, graph and CRM rows. */
  crmProgress: number;
  /** Whole conversations logged so far this loop. */
  resolvedCount: number;
  /** 0-1 sweep that rolls the CRM back for the next loop. */
  reset: number;
  /** 0-1 wisp on the intake rail hinting the next conversation. */
  intake: number;
}

export function createStoryFrame(): StoryFrame {
  return {
    time: 0,
    conversations: CONVERSATIONS.map(() => ({
      phase: "hidden" as ConversationPhase,
      x: 0,
      y: 0,
      scale: 1,
      rotate: 0,
      opacity: 0,
      travel: 0,
      land: 0,
    })),
    botEnergy: 0,
    botImpact: 0,
    botLookX: 0,
    botLookY: 1,
    crmProgress: 0,
    resolvedCount: 0,
    reset: 0,
    intake: 0,
  };
}

function sampleConversation(def: ConversationDef, time: number, out: ConversationSample) {
  const settledAt = def.enterAt + ENTER_DURATION;
  const absorbedAt = def.travelAt + TRAVEL_DURATION;

  if (time < def.enterAt || time > absorbedAt) {
    out.phase = "hidden";
    out.opacity = 0;
    out.travel = time > absorbedAt ? 1 : 0;
    out.land = 0;
    // Parked on the settle point: a hidden card must never re-appear from stale
    // coordinates when the loop comes round again.
    out.x = def.settle.x;
    out.y = def.settle.y;
    out.scale = 0.9;
    out.rotate = 0;
    return;
  }

  // Idle drift: enough to read as alive, small enough to keep the text crisp.
  const drift = Math.sin(time * 1.15 + def.driftPhase);
  const driftY = drift * 0.9;
  const driftX = Math.cos(time * 0.82 + def.driftPhase) * 0.5;
  const landing = pulse(time, settledAt - 0.34, settledAt + 0.5);

  if (time < settledAt) {
    const t = easeOutQuint(progress(time, def.enterAt, settledAt));
    out.phase = "entering";
    out.x = bezierX(def.from.x, def.via.x, def.settle.x, t);
    out.y = bezierX(def.from.y, def.via.y, def.settle.y, t);
    out.scale = lerp(0.82, 1, easeOutCubic(t));
    // Banks into the curve on the way in, then levels out as it settles.
    out.rotate =
      bezierAngle(
        def.from.x,
        def.from.y,
        def.via.x,
        def.via.y,
        def.settle.x,
        def.settle.y,
        Math.min(t, 0.999),
      ) *
      0.05 *
      (1 - t);
    out.opacity = clamp01(progress(time, def.enterAt, def.enterAt + 0.26));
    out.travel = 0;
    out.land = landing;
    return;
  }

  if (time < def.travelAt) {
    out.phase = "settled";
    out.x = def.settle.x + driftX;
    out.y = def.settle.y + driftY;
    out.scale = 1;
    out.rotate = drift * 0.5;
    out.opacity = 1;
    out.travel = 0;
    out.land = landing;
    return;
  }

  const t = progress(time, def.travelAt, absorbedAt);
  const eased = easeInOutCubic(t);
  out.phase = "travelling";
  out.x = bezierX(def.settle.x + driftX, def.handoffVia.x, BOT_ANCHOR.x, eased);
  out.y = bezierX(def.settle.y + driftY, def.handoffVia.y, BOT_ANCHOR.y, eased);
  // Shrinks into the bot rather than fading on the spot: the card is consumed.
  out.scale = lerp(1, 0.32, easeInCubic(t));
  out.rotate = lerp(drift * 0.5, 0, t);
  out.opacity = 1 - easeInCubic(clamp01(progress(t, 0.6, 1)));
  out.travel = t;
  out.land = 0;
}

/** Fills `out` with the complete stage state at `time`. Allocation free. */
export function sampleStory(time: number, out: StoryFrame): StoryFrame {
  out.time = time;

  let travellingEnergy = 0;
  let impact = 0;
  let lookX = 0;
  let lookY = 1;
  let resolved = 0;
  let crm = 0;

  for (let i = 0; i < CONVERSATIONS.length; i += 1) {
    const def = CONVERSATIONS[i];
    const sample = out.conversations[i];
    sampleConversation(def, time, sample);

    if (sample.phase === "travelling") {
      travellingEnergy = Math.max(travellingEnergy, sample.travel);
      // The bot looks toward whichever conversation is closest to landing.
      lookX = sample.x - BOT_ANCHOR.x;
      lookY = sample.y - BOT_ANCHOR.y;
    }

    const arrival = ARRIVALS[i];
    impact = Math.max(impact, pulse(time, arrival - 0.12, arrival + 0.62));
    if (time >= arrival) resolved += 1;
    // Each resolution moves the CRM by its own quarter, so the dashboard reacts
    // per conversation instead of snapping once at the end.
    crm += easeOutCubic(progress(time, arrival, arrival + 0.9)) / CONVERSATIONS.length;
  }

  const reset = easeInOutCubic(progress(time, RESET_FROM, RESET_TO));

  out.botEnergy = clamp01(
    Math.max(
      travellingEnergy,
      progress(time, HANDOFF_START - 0.5, HANDOFF_START + 0.4) *
        (1 - progress(time, RESOLVED_UNTIL - 0.6, RESOLVED_UNTIL)),
    ),
  );
  out.botImpact = impact;
  out.botLookX = lookX;
  out.botLookY = lookY;
  out.crmProgress = crm * (1 - reset);
  out.resolvedCount = reset > 0.55 ? 0 : resolved;
  out.reset = reset;
  // Hands the loop over: the next conversation is already on its way in as the
  // current pass ends.
  out.intake = pulse(time, LOOP_DURATION - 0.95, LOOP_DURATION);

  return out;
}

/** The handful of values that are allowed to trigger a React render. */
export interface StoryPhase {
  readonly character: CharacterState;
  readonly bot: BotState;
  readonly resolvedCount: number;
}

export function samplePhase(time: number, frame: StoryFrame): StoryPhase {
  return {
    character: characterStateAt(time),
    bot: botStateAt(time),
    resolvedCount: frame.resolvedCount,
  };
}

/** Where the story parks when motion is reduced: work done, nothing moving. */
export const REDUCED_MOTION_TIME = 10.6;
