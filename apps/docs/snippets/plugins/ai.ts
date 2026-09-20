// #region minimal
import ai from '@meshcorejs/plugin-ai';

export default ai.configure({ apiKey: process.env.OPENAI_API_KEY ?? '' });

// #endregion minimal

// #region provider
import { frenchReplies } from '@meshcorejs/plugin-ai';

export const openrouter = ai.configure({
  apiKey: process.env.OPENROUTER_KEY ?? '',
  baseURL: 'https://openrouter.ai/api/v1',
  model: 'mistralai/mistral-small',
  cooldown: 60,
  replies: frenchReplies,
});
// #endregion provider
