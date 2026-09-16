import { useEffect, useRef, type CSSProperties } from "react";

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
} from "./character-frames";
import {
  CHARACTER_SOURCE,
  HAND_PATCH,
  HEAD_PATCH,
  SCREEN_LIGHT,
  TORSO_PATCH,
  type CharacterPatch,
} from "./character-layers";
import { POSTURE } from "./character-states";
import styles from "./ProfessionalCharacter.module.css";

/**
 * Motion budget, in source pixels of the illustration (803 wide). The
 * artwork is a finished drawing, so nothing here may bend it: a patch travels
 * a couple of pixels and rotates a degree, never more.
 */
const MOTION = {
  breath: 1.5,
  lean: 1.3,
  leanTilt: 0.55,
  handLift: 2.2,
  handSlide: 1.15,
  wrist: 0.22,
  headTurn: 2.1,
  headLift: 1.1,
  sway: 0.24,
} as const;

const patchStyle = (patch: CharacterPatch): CSSProperties => ({
  left: `${patch.left}%`,
  top: `${patch.top}%`,
  width: `${patch.width}%`,
  height: `${patch.height}%`,
  transformOrigin: `${patch.originX}% ${patch.originY}%`,
});

/**
 * The professional at the laptop.
 *
 * A 2.5D cut-out of the reference illustration: the base plate is the whole
 * drawing, and three feather-masked patches of the same pixels (torso, head,
 * typing hand) sit on top of it and carry the motion. The hand is driven by
 * the same 12-frame typing cycle as before (`character-frames.ts`) through
 * oil-motion's frame animator; the body axes are the same three animators
 * easing between the posture targets of the state machine. Only the renderer
 * changed: the story, the states and the timing are untouched.
 */
export function ProfessionalCharacter() {
  const { reducedMotion } = useStoryClock();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const torsoRef = useRef<HTMLImageElement | null>(null);
  const headRef = useRef<HTMLImageElement | null>(null);
  const handRef = useRef<HTMLImageElement | null>(null);
  const glowRef = useRef<HTMLSpanElement | null>(null);
  const spriteRef = useRef<HTMLDivElement | null>(null);

  const poseRef = useRef(createMutablePose());
  const lastTimeRef = useRef(0);
  /** Screen pixels per source pixel, so the motion is the same size at every viewport. */
  const unitRef = useRef(0.5);
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
  // 1% resolution: fine enough to be invisible, and it keeps the smoothing,
  // shortest-path targeting and reduced-motion handling in one place.
  const lean = useFrameAnimator({ frameCount: 101, smoothTime: 0.9, reducedMotion, render: () => {} });
  const shoulder = useFrameAnimator({ frameCount: 101, smoothTime: 0.6, reducedMotion, render: () => {} });
  const gaze = useFrameAnimator({ frameCount: 101, smoothTime: 0.3, reducedMotion, render: () => {} });

  // The illustration scales with the stage; the motion must scale with it.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const measure = () => {
      unitRef.current = node.clientWidth / CHARACTER_SOURCE.width;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
    // state asks for: the reaction is continuous, not another state.
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

    const glow = glowRef.current;
    if (glow) {
      glow.style.opacity = String(0.3 + frame.botEnergy * 0.55);
    }

    // Reduced motion: the story is parked, and the drawing stays a drawing.
    if (reducedMotion) {
      copyPose(RESTING_POSE, poseRef.current);
      return;
    }

    const leanValue = leanAnimator.getCurrentFrame() / 100;
    const shoulderValue = shoulderAnimator.getCurrentFrame() / 100;
    const gazeValue = gazeAnimator.getCurrentFrame() / 100;
    const breath = Math.sin(time * posture.breathRate * 2.1) * posture.breathDepth;

    const pose = lerpPose(typingAnimator.getCurrentFrame(), poseRef.current);
    // The one-hand pause during the relaxed beat: the hand comes off the keys
    // and settles back. Only one hand is visible in the illustration, so the
    // rest is blended into that hand rather than into one nobody can see.
    const resting = handRestAt(time);
    blendHand(HAND_OFF_POSE, resting, pose.right);
    const hand = resting > 0.5 ? pose.right : pose.left;

    const unit = unitRef.current;
    const px = (source: number) => (source * unit).toFixed(2);

    // Torso: breathes, and settles forward as the load builds. The hip is the
    // pivot, so a lean reads as the whole upper body coming toward the screen.
    const torsoY = breath * MOTION.breath - leanValue * MOTION.lean - shoulderValue * 0.6;
    const torsoX = leanValue * 0.9;
    const torsoTilt = leanValue * MOTION.leanTilt;
    const torso = torsoRef.current;
    if (torso) {
      torso.style.transform = `translate(${px(torsoX)}px, ${px(torsoY)}px) rotate(${torsoTilt.toFixed(
        3,
      )}deg)`;
    }

    // Head: rides on the torso, then turns toward whatever it has noticed. A
    // negative angle lifts the chin (the character faces right).
    const head = headRef.current;
    if (head) {
      const sway = Math.sin(time * 0.62) * 0.55 + Math.sin(time * 1.43) * 0.2;
      const turn = (0.5 - gazeValue) * MOTION.headTurn + sway * MOTION.sway;
      const lift = (gazeValue - 0.3) * MOTION.headLift;
      head.style.transform = `translate(${px(torsoX + leanValue * 0.6)}px, ${px(
        torsoY * 0.8 - lift,
      )}px) rotate(${(torsoTilt + turn).toFixed(3)}deg)`;
    }

    // Hand: the typing cycle. The arm is part of the base plate, so the hand's
    // travel stays inside what a wrist can do without the forearm following.
    const handNode = handRef.current;
    if (handNode) {
      const handY = hand.y * MOTION.handLift + breath * 0.5 * MOTION.breath;
      const handX = hand.x * MOTION.handSlide + torsoX * 0.4;
      handNode.style.transform = `translate(${px(handX)}px, ${px(handY)}px) rotate(${(
        hand.wrist * MOTION.wrist
      ).toFixed(3)}deg)`;
    }
  });

  return (
    <div ref={rootRef} className={styles.root}>
      {/* Present only when a drawn frame sequence is supplied; the cut-out
          below is what animates until then. */}
      {CHARACTER_SPRITE_SHEET ? (
        <div ref={spriteRef} className={styles.sprite} aria-hidden />
      ) : null}

      <div className={styles.figure}>
        <img
          className={styles.base}
          src={CHARACTER_SOURCE.url}
          width={CHARACTER_SOURCE.width}
          height={CHARACTER_SOURCE.height}
          alt=""
          draggable={false}
          decoding="async"
          fetchPriority="high"
        />

        {/* Light from the laptop screen. Drawn between the plate and the
            patches, so it lands on the shirt and the face and follows the
            bot's energy the way the old rig's screen spill did. */}
        <span
          ref={glowRef}
          className={styles.screenLight}
          style={{ left: `${SCREEN_LIGHT.x}%`, top: `${SCREEN_LIGHT.y}%` }}
        />

        <img
          ref={torsoRef}
          className={styles.patch}
          style={patchStyle(TORSO_PATCH)}
          src={TORSO_PATCH.url}
          alt=""
          draggable={false}
          decoding="async"
        />
        <img
          ref={headRef}
          className={styles.patch}
          style={patchStyle(HEAD_PATCH)}
          src={HEAD_PATCH.url}
          alt=""
          draggable={false}
          decoding="async"
        />
        <img
          ref={handRef}
          className={styles.patch}
          style={patchStyle(HAND_PATCH)}
          src={HAND_PATCH.url}
          alt=""
          draggable={false}
          decoding="async"
        />
      </div>
    </div>
  );
}
