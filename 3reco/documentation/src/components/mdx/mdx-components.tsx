import { cn } from '@/lib/utils'
import { Callout } from '@/components/ui/callout'

export { Callout }

/* ── MDX component overrides ──────────────────────────────── */

function AnchorHeading({
  level,
  id,
  children,
  className,
}: {
  level: 1 | 2 | 3 | 4
  id?: string
  children: React.ReactNode
  className?: string
}) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4'
  return (
    <Tag id={id} className={cn('group scroll-mt-20', className)}>
      {children}
      {id && (
        <a
          href={`#${id}`}
          className="ml-2 opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground no-underline"
          aria-label="Link to section"
        >
          #
        </a>
      )}
    </Tag>
  )
}

export const mdxComponents = {
  Callout,

  h1: ({ id, children }: { id?: string; children?: React.ReactNode }) => (
    <AnchorHeading
      level={1}
      id={id}
      className="text-3xl font-bold tracking-tight text-foreground mt-2 mb-4 border-b pb-3"
    >
      {children}
    </AnchorHeading>
  ),

  h2: ({ id, children }: { id?: string; children?: React.ReactNode }) => (
    <AnchorHeading
      level={2}
      id={id}
      className="text-2xl font-semibold tracking-tight text-foreground mt-10 mb-4"
    >
      {children}
    </AnchorHeading>
  ),

  h3: ({ id, children }: { id?: string; children?: React.ReactNode }) => (
    <AnchorHeading
      level={3}
      id={id}
      className="text-xl font-semibold text-foreground mt-8 mb-3"
    >
      {children}
    </AnchorHeading>
  ),

  h4: ({ id, children }: { id?: string; children?: React.ReactNode }) => (
    <AnchorHeading
      level={4}
      id={id}
      className="text-base font-semibold text-foreground mt-6 mb-2"
    >
      {children}
    </AnchorHeading>
  ),

  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-4 leading-7 text-foreground/90">{children}</p>
  ),

  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noreferrer' : undefined}
    >
      {children}
    </a>
  ),

  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-4 ml-6 list-disc space-y-1 [&>li]:leading-7">{children}</ul>
  ),

  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-4 ml-6 list-decimal space-y-1 [&>li]:leading-7">{children}</ol>
  ),

  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-foreground/90">{children}</li>
  ),

  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-4 border-l-4 border-primary pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),

  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isInline = !className
    if (isInline) {
      return (
        <code className="relative rounded bg-muted px-[0.4em] py-[0.2em] font-mono text-sm text-foreground">
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  },

  pre: ({ children }: { children?: React.ReactNode }) => (
    <pre className="my-6 overflow-x-auto rounded-lg border bg-card p-4 text-sm leading-relaxed [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[inherit]">
      {children}
    </pre>
  ),

  table: ({ children }: { children?: React.ReactNode }) => (
    <div className="my-6 overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),

  thead: ({ children }: { children?: React.ReactNode }) => (
    <thead className="border-b bg-muted/50">{children}</thead>
  ),

  tbody: ({ children }: { children?: React.ReactNode }) => (
    <tbody className="[&>tr:last-child]:border-0">{children}</tbody>
  ),

  tr: ({ children }: { children?: React.ReactNode }) => (
    <tr className="border-b transition-colors hover:bg-muted/30">{children}</tr>
  ),

  th: ({ children }: { children?: React.ReactNode }) => (
    <th className="px-4 py-3 text-left font-semibold text-foreground">{children}</th>
  ),

  td: ({ children }: { children?: React.ReactNode }) => (
    <td className="px-4 py-3 text-foreground/80">{children}</td>
  ),

  hr: () => <hr className="my-8 border-border" />,
}
