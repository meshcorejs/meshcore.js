import { buttonVariants } from 'fumadocs-ui/components/ui/button';
import Link from 'next/link';
import { Badge, Card, CodeTabs, Install, PackageCard, PluginCard, PublishCard, SectionTitle } from '@/components/home';
import { plugins } from '@/lib/plugins';
import { docsRoute, githubUrl } from '@/lib/shared';
import { readSnippet } from '@/lib/snippet';

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-4 py-12 md:gap-24 md:py-20">
      <section className="grid items-start gap-10 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col gap-6">
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            The bot framework for <span className="text-fd-primary">MeshCore</span>.
          </h1>
          <p className="text-lg text-fd-muted-foreground">Write what your bot does. The radio does the rest.</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`${docsRoute}/client/getting-started`} className={buttonVariants({ variant: 'primary' })}>
              Get started
            </Link>
            <a href={githubUrl} className={buttonVariants({ variant: 'outline' })} rel="noreferrer">
              GitHub
            </a>
          </div>
          <Install command="pnpm add @meshcorejs/client" />
          <ul className="flex flex-wrap gap-2 text-sm">
            <Badge>Companion Radio firmware</Badge>
            <Badge>TCP, serial, BLE</Badge>
            <Badge>Node.js 20+</Badge>
          </ul>
        </div>
        <div className="min-w-0">
          <CodeTabs
            files={[
              { file: 'commands/heard.ts', code: readSnippet('home/hero.ts') },
              { file: 'main.ts', code: readSnippet('home/main.ts') },
            ]}
          />
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <SectionTitle title="What your bot does" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card icon="lucide:terminal" title="Commands">
            Someone sends <code>/weather</code> in a DM, your bot answers. Wrong input gets a clear reply, not a crash.
          </Card>
          <Card icon="lucide:messages-square" title="Channels and DMs">
            Answers where it was asked. <code>/weather</code> in a DM, <code>@Bot weather</code> on a channel.
          </Card>
          <Card icon="lucide:clock" title="Jobs">
            Every hour, every night at 8: a report on the channel, an advert flooded, on its own.
          </Card>
          <Card icon="lucide:activity" title="Events">
            A new node heard, a contact added, a message delivered: your bot reacts.
          </Card>
          <Card icon="lucide:shield-check" title="Roles">
            Owners, moderators, your own: decide who can do what. Sensitive commands only work in a DM.
          </Card>
          <Card icon="lucide:puzzle" title="Plugins">
            Features that go together, installed in one line, reloaded from your phone.
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <SectionTitle title="Plugins">Add a feature to your bot in one line. Reload it from your phone.</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {plugins.map((plugin) => (
            <PluginCard key={plugin.name} plugin={plugin} />
          ))}
          <PublishCard />
        </div>
      </section>

      <section className="flex flex-col gap-8">
        <SectionTitle title="Four packages" />
        <div className="grid gap-4 sm:grid-cols-2">
          <PackageCard slug="client" name="@meshcorejs/client">
            The framework. The only package a bot installs.
          </PackageCard>
          <PackageCard slug="protocol" name="@meshcorejs/protocol">
            The Companion Radio protocol, encoded and decoded. No I/O.
          </PackageCard>
          <PackageCard slug="transports" name="@meshcorejs/transports">
            TCP, serial and BLE, plus a fake radio for tests.
          </PackageCard>
          <PackageCard slug="testing" name="@meshcorejs/testing">
            Test your bot without a radio, with simulated time.
          </PackageCard>
        </div>
      </section>
    </main>
  );
}
