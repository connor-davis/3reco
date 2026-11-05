import aggregate from '@convex-dev/aggregate/convex.config';
import betterAuth from '@convex-dev/better-auth/convex.config';
import migrations from '@convex-dev/migrations/convex.config.js';
import { defineApp } from 'convex/server';

const app = defineApp();

app.use(aggregate, { name: 'txByType' });
app.use(betterAuth);
app.use(migrations);

export default app;
