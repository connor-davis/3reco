import aggregate from '@convex-dev/aggregate/convex.config';
import betterAuth from '@convex-dev/better-auth/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();

app.use(aggregate, { name: 'txByType' });
app.use(betterAuth);

export default app;
