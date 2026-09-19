import { CommandBuilder, MessageBuilder, PluginBuilder } from '@meshcorejs/client';

export interface WeatherOptions {
  location: { lat: number; lon: number };
  timezone?: string;
  fetch?: typeof fetch;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface DayForecast {
  date: string;
  min: number;
  max: number;
  rain: number;
  icon: string;
}

interface OpenMeteoDaily {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
}

export function weatherIcon(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 2) return '🌤';
  if (code === 3) return '☁️';
  if (code <= 48) return '🌫';
  if (code <= 67) return '🌧';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦';
  return '⛈';
}

export class WeatherService {
  readonly #options: WeatherOptions;

  constructor(options: WeatherOptions) {
    if (!Number.isFinite(options.location.lat) || !Number.isFinite(options.location.lon)) {
      throw new RangeError('WeatherService: location.lat and location.lon are required');
    }
    this.#options = options;
  }

  async locate(name: string): Promise<Place | null> {
    const { fetch: doFetch = fetch } = this.#options;
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', name);
    url.searchParams.set('count', '1');
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`Open-Meteo geocoding answered ${response.status}`);
    const { results } = (await response.json()) as {
      results?: { name: string; latitude: number; longitude: number }[];
    };
    const first = results?.[0];
    return first ? { name: first.name, lat: first.latitude, lon: first.longitude } : null;
  }

  async forecast(days = 3, place?: Pick<Place, 'lat' | 'lon'>): Promise<DayForecast[]> {
    const { timezone, fetch: doFetch = fetch } = this.#options;
    const location = place ?? this.#options.location;
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(location.lat));
    url.searchParams.set('longitude', String(location.lon));
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code');
    url.searchParams.set('timezone', timezone ?? 'UTC');
    url.searchParams.set('forecast_days', String(days));
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`Open-Meteo answered ${response.status}`);
    const { daily } = (await response.json()) as OpenMeteoDaily;
    return daily.time.slice(0, days).map((date, i) => ({
      date,
      min: Math.round(daily.temperature_2m_min[i] ?? 0),
      max: Math.round(daily.temperature_2m_max[i] ?? 0),
      rain: daily.precipitation_probability_max[i] ?? 0,
      icon: weatherIcon(daily.weather_code[i] ?? 0),
    }));
  }

  format(day: DayForecast): string {
    return `${day.icon} ${day.min}°/${day.max}°, rain ${day.rain}%`;
  }
}

export interface WeatherPluginOptions {
  weather: WeatherService;
}

export default new PluginBuilder<WeatherPluginOptions>()
  .setName('weather')
  .setDescription('Forecast for the club location')
  .setBricks((_client, { weather }) => [
    new CommandBuilder()
      .setName('weather')
      .setDescription('Two-day forecast, at the club or in a city')
      .addStringArg((arg) => arg.setName('city').setRest())
      .setCooldown(30)
      .setHandler(async (ctx) => {
        const place = ctx.args.city ? await weather.locate(ctx.args.city) : null;
        if (ctx.args.city && !place) return ctx.reply(`❓ Unknown city "${ctx.args.city}"`);
        const [today, tomorrow] = await weather.forecast(2, place ?? undefined);
        const lines = [];
        if (today) lines.push(`Today ${weather.format(today)}`);
        if (tomorrow) lines.push(`Tomorrow ${weather.format(tomorrow)}`);
        await ctx.reply(
          new MessageBuilder()
            .setTitle(place ? `📍 ${place.name}` : '📍 Here')
            .addLines(lines)
            .setOverflow('truncate'),
        );
      }),
  ]);
