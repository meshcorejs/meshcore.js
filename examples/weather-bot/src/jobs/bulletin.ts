import { JobBuilder, MessageBuilder } from '@meshcorejs/client';
import { config } from '../config.js';
import { weather } from '../weather.js';

export default new JobBuilder()
  .setName('bulletin')
  .setCron('0 7 * * *', { timezone: config.timezone })
  .setOverlap('skip')
  .setTimeout(60)
  .setHandler(async (client) => {
    const channel = client.channels.get(config.channel);
    if (!channel) return client.logger.warn(`bulletin: channel ${config.channel} is not on the radio`);
    const [today, tomorrow] = await weather.forecast(2);
    const lines = [];
    if (today) lines.push(`Today ${weather.format(today)}`);
    if (tomorrow) lines.push(`Tomorrow ${weather.format(tomorrow)}`);
    await channel.send(new MessageBuilder().setTitle('🌄 Good morning').addLines(lines).setOverflow('truncate'));
  });
