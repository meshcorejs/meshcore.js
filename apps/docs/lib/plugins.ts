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
    name: 'weather',
    description: 'Two-day forecast for the club location or any city, and a morning bulletin on the channel.',
    kind: 'official',
    repo: `https://github.com/${gitConfig.user}/${gitConfig.repo}/tree/main/examples/weather-bot`,
  },
];
