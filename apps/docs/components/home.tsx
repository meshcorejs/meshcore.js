import { Icon } from '@iconify/react';
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from 'fumadocs-ui/components/codeblock';
import { ServerCodeBlock } from 'fumadocs-ui/components/codeblock.rsc';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PluginEntry } from '@/lib/plugins';
import { docsRoute } from '@/lib/shared';
import { CopyButton } from './copy-button';

export function Code({ code }: { code: string }) {
  return <ServerCodeBlock code={code} lang="ts" />;
}

export function CodeTabs({ files }: { files: { file: string; code: string }[] }) {
  return (
    <CodeBlockTabs defaultValue={files[0]?.file}>
      <CodeBlockTabsList>
        {files.map((entry) => (
          <CodeBlockTabsTrigger key={entry.file} value={entry.file}>
            {entry.file}
          </CodeBlockTabsTrigger>
        ))}
      </CodeBlockTabsList>
      {files.map((entry) => (
        <CodeBlockTab key={entry.file} value={entry.file}>
          <Code code={entry.code} />
        </CodeBlockTab>
      ))}
    </CodeBlockTabs>
  );
}

export function Install({ command }: { command: string }) {
  return (
    <div className="flex w-fit max-w-full items-center gap-3 rounded-md border border-fd-border bg-fd-secondary py-1.5 ps-3 pe-1.5 font-mono text-sm">
      <span className="truncate">{command}</span>
      <CopyButton text={command} />
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <li className="rounded-full border border-fd-border bg-fd-background px-3 py-1 text-fd-muted-foreground">
      {children}
    </li>
  );
}

export function Card({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-fd-border bg-fd-card p-5">
      <Icon icon={icon} className="size-6 text-fd-primary" aria-hidden="true" />
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-fd-muted-foreground">{children}</p>
    </div>
  );
}

export function SectionTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h2>
      {children && <p className="text-fd-muted-foreground">{children}</p>}
    </div>
  );
}

export function PluginCard({ plugin }: { plugin: PluginEntry }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-fd-border bg-fd-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{plugin.name}</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            plugin.kind === 'official' ? 'bg-fd-primary/10 text-fd-primary' : 'bg-fd-secondary text-fd-muted-foreground'
          }`}
        >
          {plugin.kind === 'official' ? 'Official' : 'Community'}
        </span>
      </div>
      <p className="flex-1 text-sm text-fd-muted-foreground">{plugin.description}</p>
      <div className="flex gap-4 text-sm">
        {plugin.npm && (
          <a href={`https://www.npmjs.com/package/${plugin.npm}`} className="underline" rel="noreferrer">
            npm
          </a>
        )}
        <a href={plugin.repo} className="underline" rel="noreferrer">
          Source
        </a>
      </div>
    </div>
  );
}

export function PublishCard() {
  return (
    <Link
      href={`${docsRoute}/client/plugins`}
      className="flex flex-col justify-center gap-2 rounded-lg border border-fd-border border-dashed p-5 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
    >
      <Icon icon="lucide:plus" className="size-6" aria-hidden="true" />
      <span className="font-semibold">Publish yours</span>
      <span className="text-sm">Write a plugin, publish it to npm, and it shows up here.</span>
    </Link>
  );
}

export function PackageCard({ slug, name, children }: { slug: string; name: string; children: ReactNode }) {
  return (
    <Link
      href={`${docsRoute}/${slug}`}
      className="flex flex-col gap-1 rounded-lg border border-fd-border p-4 transition-colors hover:bg-fd-accent"
    >
      <h3 className="font-semibold">{name}</h3>
      <p className="text-sm text-fd-muted-foreground">{children}</p>
    </Link>
  );
}
