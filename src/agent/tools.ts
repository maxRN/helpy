import { getDeps } from './deps';

// Tool names and parameter names here MUST match the client tools you create in the
// ElevenLabs dashboard (see README). Return strings: they are sent back to the agent.

export interface ToolCtx {
  setOffRecord(on: boolean): void;
  resolveTeachback(r: { confirmed: boolean; correction?: string }): void;
}

const toBool = (v: unknown): boolean => v === true || v === 'true' || v === 1 || v === 'yes';

export function buildClientTools(ctx: ToolCtx) {
  return {
    // Interviewer: the expert says "off the record" / "back on the record"
    set_off_record: (p: { on?: unknown }): string => {
      ctx.setOffRecord(toBool(p?.on));
      return 'ok';
    },

    // Interviewer: after "Is that how it works?"
    confirm_teachback: (p: { confirmed?: unknown; correction?: string }): string => {
      ctx.resolveTeachback({
        confirmed: toBool(p?.confirmed),
        correction: p?.correction?.trim() || undefined,
      });
      return 'ok';
    },

    // Tutor: "what now?" -> mark this tool as BLOCKING in the dashboard so the agent waits for the result
    get_next_step: (): string => {
      const step = getDeps().getNextStep();
      return JSON.stringify(step ?? { done: true });
    },

    // Tutor: make the mascot point at a field
    point_to: (p: { targetId?: string }): string => {
      if (!p?.targetId) return 'error: targetId missing';
      getDeps().mascot.pointTo(p.targetId);
      return 'ok';
    },

    // Tutor: replay the expert's screen moment (P4)
    show_expert_clip: (p: { stepId?: string }): string => {
      if (!p?.stepId) return 'error: stepId missing';
      getDeps().showExpertClip(p.stepId);
      return 'ok';
    },
  };
}
