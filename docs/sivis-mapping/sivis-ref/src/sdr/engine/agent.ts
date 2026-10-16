import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import type { Conversation, Stage } from '../types.js';
import { getStagePrompt, getSystemPrompt } from './prompts.js';
import { STAGE_DEFINITIONS } from './stateMachine.js';
import { ALL_TOOLS, type ToolContext, type ToolDefinition } from './tools.js';

export interface AgentTurnInput {
  conversation: Conversation;
  userMessage: string;
  logger: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface AgentTurnResult {
  assistantText: string;
  updatedConversation: Conversation;
  toolCalls: Array<{ name: string; input: unknown; output: unknown; ok: boolean }>;
  stopReason: string;
  tokensIn: number;
  tokensOut: number;
}

const HARD_STATES: Stage[] = ['OBJECTION_HANDLING', 'CLOSING'];

function pickModel(stage: Stage): string {
  if (env.ANTHROPIC_MODEL_OVERRIDE) return env.ANTHROPIC_MODEL_OVERRIDE;
  return HARD_STATES.includes(stage) ? env.SDR_MODEL_HARD : env.SDR_MODEL_DEFAULT;
}

function buildSystemPrompt(conversation: Conversation): string {
  const system = getSystemPrompt();
  const stagePrompt = getStagePrompt(conversation.stage);
  const factsBlock = buildFactsBlock(conversation);
  return `${system}\n\n---\n\n## ESTADO ATUAL: ${conversation.stage}\n\n${stagePrompt}\n\n---\n\n## FATOS CONHECIDOS DO LEAD (uso interno, não repita literalmente)\n\n${factsBlock}\n\n---\n\nRegras de formato de resposta:\n- Responda o texto que o lead vai receber no WhatsApp. Nada além.\n- Nunca escreva "assistente:", "SDR:", nem meta-comentários.\n- Se você chamar ferramentas, seu texto final é o que o lead vê.`;
}

function buildFactsBlock(c: Conversation): string {
  const lines: string[] = [];
  lines.push(`telefone: ${c.phone}`);
  if (c.displayName) lines.push(`nome_whatsapp: ${c.displayName}`);
  if (c.customer.name) lines.push(`nome: ${c.customer.name}`);
  if (c.customer.email) lines.push(`email: ${c.customer.email}`);
  if (c.customer.cpf) lines.push(`cpf: [REDACTED]`);
  if (c.vehicle.plate) lines.push(`placa: ${c.vehicle.plate}`);
  if (c.vehicle.brand) lines.push(`marca: ${c.vehicle.brand}`);
  if (c.vehicle.model) lines.push(`modelo: ${c.vehicle.model}`);
  if (c.vehicle.modelYear) lines.push(`ano_modelo: ${c.vehicle.modelYear}`);
  if (c.vehicle.fipeCode) lines.push(`codigo_fipe: ${c.vehicle.fipeCode}`);
  if (c.vehicle.fipeValueCents)
    lines.push(`fipe_valor: R$ ${(c.vehicle.fipeValueCents / 100).toLocaleString('pt-BR')}`);
  lines.push(`veiculo_confirmado: ${c.vehicle.confirmed ? 'sim' : 'não'}`);
  if (c.pain) lines.push(`dor: ${c.pain}`);
  if (c.objection) lines.push(`objecao_atual: ${c.objection}`);
  if (c.quote) {
    lines.push(`cotacao_id: ${c.quote.quoteId}`);
    lines.push(`plano: ${c.quote.planName}`);
    if (c.quote.monthlyValueFormatted) lines.push(`mensal: ${c.quote.monthlyValueFormatted}`);
    if (c.quote.joinFeeFormatted) lines.push(`adesao: ${c.quote.joinFeeFormatted}`);
  }
  return lines.join('\n');
}

function toolsForStage(stage: Stage): ToolDefinition[] {
  const allowed = new Set(STAGE_DEFINITIONS[stage].allowedTools);
  return ALL_TOOLS.filter((t) => allowed.has(t.name));
}

function toAnthropicTools(defs: ToolDefinition[]): Anthropic.Tool[] {
  return defs.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: d.input_schema,
  }));
}

function conversationToMessages(c: Conversation): Anthropic.MessageParam[] {
  return c.history
    .filter((m) => m.from !== 'system')
    .map<Anthropic.MessageParam>((m) => ({
      role: m.from === 'lead' ? 'user' : 'assistant',
      content: m.text,
    }));
}

function applyMutations(c: Conversation, mutations?: Partial<Conversation>): Conversation {
  if (!mutations) return c;
  return {
    ...c,
    ...mutations,
    vehicle: { ...c.vehicle, ...(mutations.vehicle ?? {}) },
    customer: { ...c.customer, ...(mutations.customer ?? {}) },
    quote: mutations.quote ?? c.quote,
    updatedAt: new Date().toISOString(),
  };
}

export interface RunAgentTurnDeps {
  client?: Anthropic;
}

export async function runAgentTurn(
  input: AgentTurnInput,
  deps: RunAgentTurnDeps = {},
): Promise<AgentTurnResult> {
  const client = deps.client ?? new Anthropic();
  let conversation: Conversation = {
    ...input.conversation,
    history: [
      ...input.conversation.history,
      {
        id: `msg_${Date.now()}_lead`,
        ts: new Date().toISOString(),
        from: 'lead',
        text: input.userMessage,
      },
    ],
  };

  const toolCalls: AgentTurnResult['toolCalls'] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let assistantText = '';
  let stopReason = 'end_turn';

  const messages: Anthropic.MessageParam[] = conversationToMessages(conversation);

  for (let iter = 0; iter < env.SDR_MAX_AGENT_ITERATIONS; iter += 1) {
    const stage = conversation.stage;
    const model = pickModel(stage);
    const tools = toAnthropicTools(toolsForStage(stage));

    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      system: buildSystemPrompt(conversation),
      messages,
      tools: tools.length > 0 ? tools : undefined,
    });

    tokensIn += res.usage.input_tokens;
    tokensOut += res.usage.output_tokens;
    stopReason = res.stop_reason ?? 'end_turn';
    input.logger('agent_iteration', {
      iter,
      stage,
      model,
      stopReason,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
    });

    const textBlocks = res.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const toolUses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    // Always capture any text this iteration produced. Claude often replies with
    // text + tool_use in the same turn (e.g. greeting message + advance_stage);
    // if a later iteration returns empty text we still have this to send.
    const iterText = textBlocks.map((b) => b.text).join('\n').trim();
    if (iterText) assistantText = iterText;

    if (toolUses.length === 0) {
      break;
    }

    // Store the assistant tool_use turn for anthropic tool loop
    messages.push({ role: 'assistant', content: res.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const use of toolUses) {
      const def = ALL_TOOLS.find((t) => t.name === use.name);
      if (!def) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify({ error: 'UNKNOWN_TOOL', name: use.name }),
          is_error: true,
        });
        toolCalls.push({ name: use.name, input: use.input, output: 'UNKNOWN_TOOL', ok: false });
        continue;
      }
      const ctx: ToolContext = { conversation, logger: input.logger };
      try {
        const execResult = await def.execute(use.input, ctx);
        conversation = applyMutations(conversation, execResult.mutations);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(execResult.output),
          is_error: !execResult.ok,
        });
        toolCalls.push({
          name: use.name,
          input: use.input,
          output: execResult.output,
          ok: execResult.ok,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify({ error: 'TOOL_EXCEPTION', message }),
          is_error: true,
        });
        toolCalls.push({ name: use.name, input: use.input, output: message, ok: false });
        input.logger('tool_exception', { name: use.name, message });
      }
    }
    messages.push({ role: 'user', content: toolResults });

    if (stopReason !== 'tool_use') {
      break;
    }
  }

  if (assistantText) {
    conversation = {
      ...conversation,
      history: [
        ...conversation.history,
        {
          id: `msg_${Date.now()}_sdr`,
          ts: new Date().toISOString(),
          from: 'sdr',
          text: assistantText,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    assistantText,
    updatedConversation: conversation,
    toolCalls,
    stopReason,
    tokensIn,
    tokensOut,
  };
}
