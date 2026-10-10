import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { api } from './routes.js';
import { prepare } from './prepare.js';
import { initStore } from './store.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/api', api);
app.use('/api/prepare', prepare);

// Serve the built frontend when present (single-process deploy).
const dist = path.resolve(process.cwd(), '../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api]', err.message);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 8787);
initStore()
  .then(() => app.listen(port, () => console.log(`API ready on http://localhost:${port}`)))
  .catch((e) => { console.error('Could not connect to MongoDB (set MONGO_URL):', e.message); process.exit(1); });
