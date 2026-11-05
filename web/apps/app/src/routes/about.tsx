import { createFileRoute } from '@tanstack/react-router';
import { Leaf } from 'lucide-react';
import { LinkButton } from '@/components/link-button';
import { PersonAvatar } from '@/components/visuals';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatKg } from '@/lib/format';
import { community, formatCo2 } from '@/lib/impact';

export const Route = createFileRoute('/about')({
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="grid items-center gap-12 lg:grid-cols-2">
      <div className="space-y-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          There's value in what comes next.
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">
          3REco connects the people who collect recyclable materials with the
          businesses that need them. Every bale has a buyer, and every collector
          gets paid fairly.
        </p>
        <p className="max-w-prose text-muted-foreground">
          Chat, agree a price, arrange collection and invoice each other, all in
          one place.
        </p>
        <p className="flex items-center gap-2 text-sm font-medium">
          <Leaf className="size-4 text-primary" aria-hidden="true" />
          {formatKg(community.kgDiverted)} diverted ·{' '}
          {formatCo2(community.co2Kg)} saved
        </p>
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/market" size="lg">
            Browse materials
          </LinkButton>
          <LinkButton to="/auth/sign-up" size="lg" variant="outline">
            Join the community
          </LinkButton>
        </div>
        <p className="text-sm text-muted-foreground">
          This is an interactive design concept with illustrative data.
        </p>
      </div>
      <Illustration />
    </div>
  );
}

/** Built from real components, so it follows the theme in light and dark. */
function Illustration() {
  return (
    <div className="space-y-4 rounded-3xl bg-muted p-6 sm:p-10">
      <p className="w-fit rounded-2xl rounded-bl-sm bg-card px-4 py-3 text-sm shadow-sm">
        Looks good. Let's arrange collection.
      </p>
      <Card size="sm">
        <CardContent className="flex items-center gap-3">
          <PersonAvatar name="Thandi Nkosi" online />
          <span>
            <span className="block font-medium">Thandi Nkosi</span>
            <span className="block text-sm text-muted-foreground">
              Collector · Alexandra
            </span>
          </span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="w-fit">
            Clear PET
          </Badge>
          <CardTitle>A collection that counts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          64 kg collected · R 307.20 paid
        </CardContent>
      </Card>
    </div>
  );
}
