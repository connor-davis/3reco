import { defineApp } from 'convex/server';
import aggregate from '@convex-dev/aggregate/convex.config.js';

const app = defineApp();
app.use(aggregate, { name: 'txByType' });
app.use(aggregate, { name: 'txByMaterial' });
export default app;
