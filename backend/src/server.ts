import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
  console.log(`CORS origin: ${env.FRONTEND_ORIGIN}`);
  console.log(
    `Cloudinary: ${env.cloudinaryConfigured ? 'configured' : env.isProd ? 'MISSING (uploads will fail)' : 'not set (dev placeholder fallback)'}`,
  );
});

