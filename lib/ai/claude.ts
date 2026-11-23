import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// MVP runs on Haiku for cost; set EVRA_MODEL=claude-opus-5-5 to compare.
export const MODEL = process.env.EVRA_MODEL ?? "claude-haiku-5-5";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export class AgentUnavailable extends Error {}

// Every call's token use, so scripts (and later a cost page) can report spend per run.
export const usageLog: { model: string; inputTokens: number; outputTokens: number; ms: number }[] = [];

export type StructuredFn = <S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  effort?: Effort;
}) => Promise<z.infer<S>>;

// Every EVRA agent call goes through here: one model, structured output validated against a zod schema,
// and server-side fallbacks so a safety decline is retried on Anthropic's recommended model instead of failing the user.
export const structured: StructuredFn = async ({ schema, system, prompt, effort = "medium" }) => {
  if (!process.env.ANTHROPIC_API_KEY) throw new AgentUnavailable("ANTHROPIC_API_KEY is not set");
  let res;
  const started = Date.now();
  try {
    res = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AgentUnavailable("The assistant is busy. Try again in a minute.");
    if (e instanceof Anthropic.APIConnectionError) throw new AgentUnavailable("Couldn't reach the assistant. Check the connection and try again.");
    throw e;
  }
  usageLog.push({ model: res.model, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, ms: Date.now() - started });
  if (res.stop_reason === "refusal") throw new AgentUnavailable("The assistant couldn't help with this one.");
  if (res.stop_reason === "max_tokens" || res.parsed_output == null) throw new AgentUnavailable("The assistant's answer was incomplete. Try again.");
  return res.parsed_output as z.infer<typeof schema>;
};
