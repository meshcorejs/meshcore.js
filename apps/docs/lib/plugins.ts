import { gitConfig } from './shared';

export interface PluginEntry {
  name: string;
  description: string;
  kind: 'official' | 'community';
  npm?: string;
  repo: string;
}

export const plugins: PluginEntry[] = [
  {
    name: 'ai',
    description: 'Ask an AI assistant from the MeshCore. /ask <question>, answered by an OpenAI-compatible model.',
    kind: 'official',
    npm: '@meshcorejs/plugin-ai',
    repo: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/main/plugins/ai`,
  },
  {
    name: 'weather',
    description: 'Two-day forecast for the club location or any city, and a morning bulletin on the channel.',
    kind: 'official',
    repo: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/main/examples/weather-bot`,
  },
];
