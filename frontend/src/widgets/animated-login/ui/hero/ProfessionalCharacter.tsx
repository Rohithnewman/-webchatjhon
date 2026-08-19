import { useEffect, useRef } from "react";

import { clamp01, createCssSpriteRenderer, useFrameAnimator } from "../../../../shared/motion";
import { characterStateAt, handRestAt, LOOP_DURATION } from "../../model/story";
import { useStoryClock, useStoryFrame } from "../../model/story-clock";
import {
  blendHand,
  CHARACTER_SPRITE_SHEET,
  copyPose,
  createMutablePose,
  HAND_OFF_POSE,
  lerpPose,
  RESTING_POSE,
  TYPING_FRAME_COUNT,
  type MutableHandPose,
} from "./character-frames";
import { POSTURE } from "./character-states";
import styles from "./ProfessionalCharacter.module.css";

/* Rig joints, in viewBox units. Named so the transforms below read as anatomy. */
const HIP = "100px 214px";
const NECK = "110px 108px";
const NEAR_SHOULDER = "118px 140px";
const NEAR_ELBOW = "150px 178px";
const NEAR_WRIST = "184px 191px";
const FAR_SHOULDER = "112px 130px";
const FAR_ELBOW = "150px 160px";
const FAR_WRIST = "206px 173px";

const origin = (value: string) => ({ transformBox: "view-box" as const, transformOrigin: value });

/** Knuckle spacing down the hand, so each finger pivots on its own joint. */
const FINGER_SPREAD = [0, 3.4, 6.6];

function Hand({
  x,
  y,
  tone,
  fingerRefs,
}: {
  x: number;
  y: number;
  tone: "near" | "far";
  fingerRefs: { current: (SVGGElement | null)[] };
}) {
  const skin = tone === "near" ? "var(--skin)" : "var(--skin-shade)";
  return (
    <g>
      {/* Contact shadow. It travels with the hand, which is what makes the
          hand read as resting ON the keyboard rather than floating over it. */}
      <ellipse cx={x + 12} cy={y + 7} rx={15} ry={3.4} fill="rgba(23,35,31,0.16)" />
      <rect x={x} y={y - 7} width={17} height={12} rx={5.5} fill={skin} />
      {FINGER_SPREAD.map((offset, index) => {
        const kx = x + 15;
        const ky = y - 4.5 + offset;
        return (
          <g
            key={index}
            ref={(node) => {
              fingerRefs.current[index] = node;
            }}
            style={origin(`${kx}px ${ky}px`)}
          >
            <path
              d={`M ${kx} ${ky} q 6 0.6 9.6 4`}
              stroke={skin}
              strokeWidth={4.3}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d={`M ${kx + 7} ${ky + 2.4} q 1.8 0.8 2.6 1.6`}
              stroke="var(--skin-shade)"
              strokeWidth={4.3}
              strokeLinecap="round"
              fill="none"
              opacity={tone === "near" ? 0.55 : 0.75}
            />
          </g>
        );
      })}
      {/* Thumb rides along the space bar and barely moves — as it should. */}
      <path
        d={`M ${x + 3} ${y + 4} q 7 2.4 12 1.6`}
        stroke={skin}
        strokeWidth={4.2}
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/**
 * The professional at the laptop.
 *
 * The hands are driven by a real 12-frame typing cycle (`character-frames.ts`)
 * running through oil-motion's frame animator; the body axes are three more
 * animators that ease between the posture targets of the state machine. Nothing
 * here moves a whole image up and down — every joint is its own rotation, and
 * the arms follow the hands.
 */
export function ProfessionalCharacter() {
  const { reducedMotion } = useStoryClock();

  const torsoRef = useRef<SVGGElement | null>(null);
  const headRef = useRef<SVGGElement | null>(null);
  const nearShoulderRef = useRef<SVGGElement | null>(null);
  const nearElbowRef = useRef<SVGGElement | null>(null);
  const nearWristRef = useRef<SVGGElement | null>(null);
  const farShoulderRef = useRef<SVGGElement | null>(null);
  const farElbowRef = useRef<SVGGElement | null>(null);
  const farWristRef = useRef<SVGGElement | null>(null);
  const nearFingers = useRef<(SVGGElement | null)[]>([]);
  const farFingers = useRef<(SVGGElement | null)[]>([]);
  const glowRef = useRef<SVGGElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);

  const poseRef = useRef(createMutablePose());
  const lastTimeRef = useRef(0);
  const spriteRenderRef = useRef<((frame: number) => void) | null>(null);

  // Hands: a circular cycle, advanced every tick at the current typing speed.
  const typing = useFrameAnimator({
    frameCount: TYPING_FRAME_COUNT,
    circular: true,
    smoothTime: 0.07,
    maxSpeed: 140,
    reducedMotion,
    render: (frame) => spriteRenderRef.current?.(frame),
  });

  // Body axes. 101 frames means the reported position reads as a 0-1 value with
  // 1% resolution — fine enough to be invisible, and it keeps the smoothing,
  // shortest-path targeting and reduced-motion handling in one place.
  const lean = useFrameAnimator({ frameCount: 101, smoothTime: 0.9, reducedMotion, render: () => {} });
  const shoulder = useFrameAnimator({ frameCount: 101, smoothTime: 0.6, reducedMotion, render: () => {} });
  const gaze = useFrameAnimator({ frameCount: 101, smoothTime: 0.3, reducedMotion, render: () => {} });

  // If a drawn frame sequence is supplied, the very same animator drives it.
  useEffect(() => {
    const sheet = CHARACTER_SPRITE_SHEET;
    const node = spriteRef.current;
    if (!sheet || !node) return;
    node.style.backgroundImage = `url(${sheet.url})`;
    spriteRenderRef.current = createCssSpriteRenderer(node, sheet.columns, sheet.rows);
    return () => {
      spriteRenderRef.current = null;
    };
  }, []);

  useStoryFrame((frame) => {
    const typingAnimator = typing.current;
    const leanAnimator = lean.current;
    const shoulderAnimator = shoulder.current;
    const gazeAnimator = gaze.current;
    if (!typingAnimator || !leanAnimator || !shoulderAnimator || !gazeAnimator) return;

    const { time } = frame;
    let delta = time - lastTimeRef.current;
    if (delta < 0) delta += LOOP_DURATION;
    lastTimeRef.current = time;
    delta = Math.min(delta, 1 / 20);

    const state = characterStateAt(time);
    const posture = POSTURE[state];

    // A card landing on stage pulls the eyes up, on top of whatever the current
    // state asks for — the reaction is continuous, not another state.
    let noticing = 0;
    for (const conversation of frame.conversations) {
      if (conversation.land > noticing) noticing = conversation.land;
    }

    typingAnimator.setTarget(
      typingAnimator.getCurrentFrame() + posture.typingSpeed * delta,
    );
    leanAnimator.setTarget(posture.lean * 100);
    shoulderAnimator.setTarget(posture.shoulder * 100);
    gazeAnimator.setTarget(clamp01(posture.gaze + noticing * 0.32) * 100);

    const leanValue = leanAnimator.getCurrentFrame() / 100;
    const shoulderValue = shoulderAnimator.getCurrentFrame() / 100;
    const gazeValue = gazeAnimator.getCurrentFrame() / 100;

    const breath =
      Math.sin(time * posture.breathRate * 2.1) * posture.breathDepth * (reducedMotion ? 0 : 1);

    const pose = reducedMotion
      ? copyPose(RESTING_POSE, poseRef.current)
      : lerpPose(typingAnimator.getCurrentFrame(), poseRef.current);

    // The one-hand pause during the relaxed beat: the far hand comes off the
    // keys and settles back, while the near hand keeps working.
    if (!reducedMotion) blendHand(HAND_OFF_POSE, handRestAt(time), pose.right);

    const torso = torsoRef.current;
    if (torso) {
      torso.style.transform = `translate(0px, ${breath * 0.8 - leanValue * 1.6}px) rotate(${
        leanValue * 2.6
      }deg)`;
    }

    const head = headRef.current;
    if (head) {
      const sway = Math.sin(time * 0.62) * 0.55 + Math.sin(time * 1.43) * 0.2;
      head.style.transform = `translate(${leanValue * 1.4}px, ${breath * 0.45}px) rotate(${
        (0.5 - gazeValue) * 12 + sway
      }deg)`;
    }

    writeArm(
      nearShoulderRef.current,
      nearElbowRef.current,
      nearWristRef.current,
      nearFingers.current,
      pose.left,
      leanValue,
      shoulderValue,
      breath,
      1,
    );
    writeArm(
      farShoulderRef.current,
      farElbowRef.current,
      farWristRef.current,
      farFingers.current,
      pose.right,
      leanValue,
      shoulderValue,
      breath,
      0.92,
    );

    const glow = glowRef.current;
    if (glow) {
      glow.style.opacity = String(0.3 + frame.botEnergy * 0.55);
    }
  });

  return (
    <div className={styles.root}>
      {/* Present only when a drawn frame sequence is supplied; the vector rig
          below is what animates until then. */}
      {CHARACTER_SPRITE_SHEET ? (
        <div ref={spriteRef} className={styles.sprite} aria-hidden />
      ) : null}

      {/* viewBox is cropped tight to the figure: the hands are the point of
          this illustration, so they get the pixels rather than empty margin. */}
      <svg
        className={styles.rig}
        viewBox="52 38 248 184"
        role="img"
        aria-label="A support professional typing at a laptop while conversations arrive"
      >
        <defs>
          <linearGradient id="ambot-screen-light" x1="1" y1="0.2" x2="0" y2="0.6">
            <stop offset="0%" stopColor="#1DFFB2" stopOpacity="0.34" />
            <stop offset="45%" stopColor="#16C784" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#16C784" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ambot-desk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E3EFE9" />
          </linearGradient>
          <linearGradient id="ambot-shirt" x1="0.1" y1="0" x2="1" y2="0.6">
            <stop offset="0%" stopColor="#37544a" />
            <stop offset="100%" stopColor="#2a423a" />
          </linearGradient>
        </defs>

        {/* Chair */}
        <path d="M52 220v-62a18 18 0 0 1 18-18h28v80Z" fill="var(--chair)" />
        <path d="M64 140v-13a13 13 0 0 1 13-13h21v26Z" fill="#c2d2cb" />

        {/* Body — one group, so breathing and lean move the whole torso. */}
        <g ref={torsoRef} style={origin(HIP)}>
          <path d="M105 95l17 3-2 19-16-3Z" fill="var(--skin-shade)" />
          <path
            d="M82 220c-6-34-2-70 16-90 12-14 36-12 44 6 8 20 6 54 6 84Z"
            fill="url(#ambot-shirt)"
          />
          {/* Collar: the one bright shape on the torso, so the head reads as
              separate from the shoulders. */}
          <path d="M97 117l15 8 15-9 6.5 10.5-21.5 12.5-19-11.5Z" fill="var(--shirt-light)" />
          <path d="M112 125v14" stroke="#dbe7e1" strokeWidth="1.6" strokeLinecap="round" />

          <g ref={headRef} style={origin(NECK)}>
            <path
              d="M114 47c17 0 29 12 30 27 .3 4.6 3 6.2 2.2 9.4-.7 3-4 3.4-4.8 5.3-.9 2.3.5 4.2-1.2 5.7-1.4 1.3-3.6 1-4.6 1.1-.4 4.2-1.2 7.8-4.8 9.8-3.6 2-8.6 1.7-12.8.8-12.6-2.7-21-12.4-22-25.6-1-19 3-33.5 18-33.5Z"
              fill="var(--skin)"
            />
            <ellipse cx="103" cy="83" rx="4.4" ry="5.8" fill="var(--skin-shade)" />
            <path
              d="M101.8 80.4c2.1.7 2.7 3.5 1 5.1"
              stroke="#c9906f"
              strokeWidth="1.1"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M96 81c-3-21 4-35 20-35 15 0 26 11 28 25-3.5-4-6-10-12-12.6-9-3.8-20-1.6-26 3.4-5 4.2-8.6 10.6-10 19.2Z"
              fill="var(--hair)"
            />
            <path d="M96 81c.5 7 2.5 12.6 6 16.6L98.5 84Z" fill="var(--hair)" />
            <path d="M125 66l14 1.6" stroke="var(--hair)" strokeWidth="2.4" strokeLinecap="round" />
            <ellipse cx="133" cy="76" rx="1.9" ry="2.3" fill="var(--ink)" />
            {/* Glasses. A small, specific detail — this is a person at work, not
                a mascot. */}
            <path
              d="M126 71h17.6l-.7 4.4a5.4 5.4 0 0 1-5.3 4.6h-4.2a5.4 5.4 0 0 1-5.2-4l-2.2-5Z"
              fill="rgba(228,247,239,0.34)"
              stroke="#33443d"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path d="M126.2 71.2 107.5 74" stroke="#33443d" strokeWidth="1.3" strokeLinecap="round" />
            <path
              d="M137.6 93.6c2 .4 3.4.2 4.6-.7"
              stroke="var(--ink)"
              strokeWidth="1.5"
              strokeLinecap="round"
              fill="none"
              opacity="0.55"
            />
          </g>
        </g>

        {/* Desk and laptop sit between the body and the arms, so the hands read
            as being on top of the keyboard. */}
        <path d="M126 204 300 192v28H126Z" fill="url(#ambot-desk)" />
        <path d="M126 204 300 192v3L126 207Z" fill="var(--desk-edge)" />
        <ellipse cx="214" cy="201" rx="58" ry="6" fill="rgba(23,35,31,0.09)" />

        <path
          d="M156 182 254 170l8 15-98 12Z"
          fill="var(--laptop-deck)"
          stroke="var(--laptop-line)"
          strokeWidth="1.1"
        />
        <path d="M157 181 253 169" stroke="#fff" strokeWidth="1.6" opacity="0.75" />
        <path d="M170 183l74-9" stroke="var(--laptop-line)" strokeWidth="1.4" opacity="0.95" />
        <path d="M173 188l74-9" stroke="var(--laptop-line)" strokeWidth="1.4" opacity="0.8" />
        <path d="M177 193l32-4" stroke="var(--laptop-line)" strokeWidth="1.4" opacity="0.6" />

        {/* Screen light, cast before the lid is drawn so the lid stays crisp and
            the spill lands on the keyboard and the face. */}
        <g ref={glowRef} opacity="0.35">
          <path d="M252 172 284 106 198 95 188 154Z" fill="url(#ambot-screen-light)" />
        </g>

        <path d="M251 172l9 15 33-68-9-13Z" fill="var(--laptop-lid)" />
        <path d="M253.5 171l6.5 11.5 29.5-60.5-6.5-9.5Z" fill="#101d18" />
        <path
          d="M255.5 170 281.5 116"
          stroke="#16C784"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M262 160 276.5 130"
          stroke="#1DFFB2"
          strokeWidth="1.1"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Far arm first: it sits behind the near arm and reads as the far side
            of the keyboard. */}
        <g ref={farShoulderRef} style={origin(FAR_SHOULDER)}>
          <path d="M112 130 150 160" stroke="#2a423a" strokeWidth="14.5" strokeLinecap="round" />
          <g ref={farElbowRef} style={origin(FAR_ELBOW)}>
            <path
              d="M150 160 206 173"
              stroke="var(--skin-shade)"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <path d="M148 153 157 169" stroke="#d3e2db" strokeWidth="8" strokeLinecap="round" />
            <g ref={farWristRef} style={origin(FAR_WRIST)}>
              <Hand x={204} y={171} tone="far" fingerRefs={farFingers} />
            </g>
          </g>
        </g>

        <g ref={nearShoulderRef} style={origin(NEAR_SHOULDER)}>
          <path
            d="M118 140 150 178"
            stroke="var(--shirt-dark)"
            strokeWidth="17"
            strokeLinecap="round"
          />
          <g ref={nearElbowRef} style={origin(NEAR_ELBOW)}>
            <path d="M150 178 184 191" stroke="var(--skin)" strokeWidth="12.5" strokeLinecap="round" />
            <path d="M148 171 158 188" stroke="var(--shirt-light)" strokeWidth="8.5" strokeLinecap="round" />
            <g ref={nearWristRef} style={origin(NEAR_WRIST)}>
              <Hand x={182} y={189} tone="near" fingerRefs={nearFingers} />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Cheap inverse kinematics: the hand pose is the input, and the elbow and
 * shoulder follow it. Rotating the joints (rather than sliding a hand sprite)
 * is what makes the forearm and elbow move with the fingers.
 */
function writeArm(
  shoulderNode: SVGGElement | null,
  elbowNode: SVGGElement | null,
  wristNode: SVGGElement | null,
  fingerNodes: (SVGGElement | null)[],
  pose: MutableHandPose,
  lean: number,
  shoulderTension: number,
  breath: number,
  reach: number,
) {
  if (shoulderNode) {
    shoulderNode.style.transform = `translate(0px, ${
      breath * 0.5 - shoulderTension * 1.9
    }px) rotate(${(-pose.y * 0.85 + lean * 3.2 - shoulderTension * 1.6) * reach}deg)`;
  }
  if (elbowNode) {
    elbowNode.style.transform = `rotate(${pose.y * 2.3 * reach}deg)`;
  }
  if (wristNode) {
    wristNode.style.transform = `translate(${pose.x}px, ${pose.y * 0.7}px) rotate(${pose.wrist}deg)`;
  }
  for (let i = 0; i < fingerNodes.length; i += 1) {
    const node = fingerNodes[i];
    if (node) node.style.transform = `rotate(${pose.fingers[i] * 15}deg)`;
  }
}
