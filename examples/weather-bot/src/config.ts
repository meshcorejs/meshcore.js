export const config = {
  channel: process.env.WEATHER_BOT_CHANNEL || '#weather',
  location: { lat: Number(process.env.WEATHER_LAT ?? 43.6045), lon: Number(process.env.WEATHER_LON ?? 1.4442) },
  timezone: process.env.WEATHER_TIMEZONE || 'Europe/Paris',
  ownerKeys: (process.env.OWNER_KEYS ?? '').split(',').filter(Boolean),
};
