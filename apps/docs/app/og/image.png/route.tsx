import { generateOGImage } from 'fumadocs-ui/og';
import { appName } from '@/lib/shared';

export const dynamic = 'force-static';

export function GET() {
  return generateOGImage({
    title: 'The bot framework for MeshCore',
    description: 'Write what your bot does. The radio does the rest.',
    site: appName,
  });
}
