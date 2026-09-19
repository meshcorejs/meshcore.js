import { config } from './config.js';
import { WeatherService } from './weather-plugin/index.js';

export const weather = new WeatherService({ location: config.location, timezone: config.timezone });
