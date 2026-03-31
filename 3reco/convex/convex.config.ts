import aggregate from '@convex-dev/aggregate/convex.config';
import workOSAuthKit from '@convex-dev/workos-authkit/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();

app.use(aggregate, { name: 'txByType' });
app.use(workOSAuthKit);

export default app;
