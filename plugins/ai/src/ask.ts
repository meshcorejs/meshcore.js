import { type Client, CommandBuilder, MessageBuilder, type PermissionLike } from '@meshcorejs/client';
import { type AiDeps, DEFAULTS } from './options.js';

/**
 * The `/ask <question>` command: sends the author's recent turns and the question to the model, answers on the air.
 * @param client Owning client, for the logger
 * @param deps What the plugin built at load
 * @param permission Required permission, none when omitted
 */
export function askCommand(client: Client, deps: AiDeps, permission?: PermissionLike) {
  const command = new CommandBuilder()
    .setName('ask')
    .setDescription('Ask the assistant a question')
    .addStringArg((arg) => arg.setName('question').setDescription('Your question').setRequired().setRest())
    .setCooldown(deps.cooldown)
    .setHandler(async (ctx) => {
      const question = ctx.args.question.trim();
      if (!question) return ctx.reply(deps.replies.empty);

      const key = ctx.author.verified ? ctx.author.publicKey : `channel:${ctx.author.name}`;
      let answer: string;
      try {
        const completion = await deps.openai.chat.completions.create(
          {
            model: deps.model,
            max_completion_tokens: DEFAULTS.maxCompletionTokens,
            messages: [
              { role: 'system', content: deps.systemPrompt },
              ...deps.history.get(key),
              { role: 'user', content: question },
            ],
          },
          { timeout: DEFAULTS.timeoutMs },
        );
        answer = completion.choices[0]?.message.content?.trim() ?? '';
      } catch (error) {
        client.logger.warn('ai: the model request failed', error);
        return ctx.reply(deps.replies.unavailable);
      }
      if (!answer) return ctx.reply(deps.replies.unavailable);

      deps.history.push(key, { role: 'user', content: question }, { role: 'assistant', content: answer });
      return ctx.reply(new MessageBuilder().addLine(answer).setOverflow('split', { maxParts: deps.maxParts }));
    });
  if (permission) command.setRequiredPermissions(permission);
  return command;
}
