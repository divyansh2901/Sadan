import 'dotenv/config';
import { connectDatabase } from './config/database';
import { validateEnvironment } from './config/env';
import app from './app';

const PORT = process.env.PORT || 5000;

async function start() {
  validateEnvironment();
  await connectDatabase();
  app.listen(PORT, () => {
    console.log(`🚀 HostelPro running at http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
