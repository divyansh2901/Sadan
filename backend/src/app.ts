import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import { errorHandler } from './middleware/errorHandler';
import authRoutes from './modules/auth/routes';
import roomRoutes from './modules/rooms/routes';
import studentRoutes from './modules/students/routes';
import paymentRoutes from './modules/payments/routes';
import eventRoutes from './modules/events/routes';
import foodRoutes from './modules/food/routes';
import cleaningRoutes from './modules/cleaning/routes';
import sportsRoutes from './modules/sports/routes';
import adminRoutes from './modules/admin/routes';

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/cleaning', cleaningRoutes);
app.use('/api/sports', sportsRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

export default app;
