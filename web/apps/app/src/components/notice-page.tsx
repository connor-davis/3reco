import { FileText } from 'lucide-react';
import { DataState } from '@/components/data-state';
import { usePublicNotice } from '@/lib/api/privacy';

/** A plain-words document from the current notice: the terms or the privacy notice. */
export function NoticePage({
  title,
  part,
}: {
  title: string;
  part: 'terms' | 'privacy';
}) {
  const query = usePublicNotice();
  const text = query.data?.[part] ?? '';

  return (
    <article className="max-w-prose space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <DataState
        query={query}
        isEmpty={!text}
        icon={FileText}
        emptyTitle="Nothing to show"
        emptyText="This document is not available right now."
      >
        <div className="space-y-4">
          {text.split('\n\n').map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <p className="text-sm text-muted-foreground">
            Version {query.data?.version}
          </p>
        </div>
      </DataState>
    </article>
  );
}
