import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import routes from './routes/index.js';
import {
  errorHandler,
  notFoundHandler,
  handleUnhandledRejection,
  handleUncaughtException
} from './libs/error-handler.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import https from 'https';
import http from 'http';
import fs from 'fs';
import { swaggerDocs } from './libs/swagger.js';
import { startMeetingReminderCron, startMeetingStatusCron } from './libs/meeting-reminder.js';
import { initializeSocket } from './libs/socket-service.js';

dotenv.config();
handleUncaughtException();

const app = express();

app.use(helmet());

// Rate limiting - Limit requests from same IP
const limiter = rateLimit({
  max: 100,  
  windowMs: 15 * 60 * 1000,  
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  max: 5,  
  windowMs: 15 * 60 * 1000,  
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true
});
app.use('/api-v1/auth/login', authLimiter);
app.use('/api-v1/auth/register', authLimiter);
app.use('/api-v1/auth/forgot-password', authLimiter);

// Body parser, reading data from body into req.body (with size limits)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [process.env.FRONTEND_URL]
  : ['http://localhost:5173', 'http://127.0.0.1:2000'];

app.use(cors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    // Allow headers used by the frontend, including browser-added Cache-Control
    allowedHeaders: ['Content-Type', 'Authorization', 'workspace-id', 'Cache-Control'],
    credentials: true
}));

// Parse cookies so auth middleware can read HTTP-only cookie
app.use(cookieParser());

// Handle preflight requests
app.options('*', cors());

// Logging middleware (use 'combined' in production)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Swagger / OpenAPI docs
swaggerDocs(app);

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('MongoDB connected successfully');
  
  // Start meeting reminder and status update cron jobs
  startMeetingReminderCron();
  startMeetingStatusCron();
})
.catch((err) => {
  console.error('MongoDB connection error:', err.message);
  process.exit(1);
});

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Attempting to reconnect...');
});

const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5001;

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      protocol: req.secure ? 'https' : 'http'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
      message: 'Welcome to PMS API',
      version: '1.0.0',
      documentation: '/api-docs',
      secure: req.secure
    });
});

app.use('/api-v1', routes);
app.use('/uploads', express.static('uploads'));
app.use(notFoundHandler);
app.use(errorHandler);
handleUnhandledRejection();

let server;

const PROTOCOL = process.env.PROTOCOL || 'http';

if (PROTOCOL === 'https') {
  try {
    // SSL certificate configuration
    const sslOptions = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH),
      ca: fs.readFileSync(process.env.SSL_CA_PATH)
    };

    // Create HTTPS server
    server = https.createServer(sslOptions, app);
    
    server.listen(HTTPS_PORT, () => {
      console.log(`✅ HTTPS Server running on port ${HTTPS_PORT}`);
      console.log(`✅ SSL Certificates loaded successfully`);
      console.log(`✅ Environment: ${process.env.NODE_ENV}`);
      
      // Initialize Socket.IO for HTTPS
      initializeSocket(server);
    });

    // Optional: HTTP to HTTPS redirect
    if (process.env.REDIRECT_HTTP_TO_HTTPS === 'true') {
      const httpApp = express();
      httpApp.use('*', (req, res) => {
        res.redirect(301, `https://${req.headers.host}${req.url}`);
      }); 
      
      http.createServer(httpApp).listen(PORT, () => {
        console.log(`✅ HTTP Server on port ${PORT} (redirecting to HTTPS)`);
      });
    }

  } catch (error) {
    console.error('❌ Failed to load SSL certificates:', error.message);
    console.log('⚠️  Falling back to HTTP server...');
    
    // Fallback to HTTP
    server = http.createServer(app);
    server.listen(PORT, () => {
      console.log(`⚠️  HTTP Server running on port ${PORT} (SSL failed)`);
      
      // Initialize Socket.IO for HTTP fallback
      initializeSocket(server);
    });
  }
} else {
  // Development mode - HTTP only
  server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`🚀 HTTP Server running on port ${PORT}`);
    console.log(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Initialize Socket.IO after server is created
if (server) {
  initializeSocket(server);
}

// // Graceful shutdown handlers
// const gracefulShutdown = () => {
//   console.log('\n🛑 Shutting down gracefully...');
//   server.close(() => {
//     console.log('✅ HTTP(S) server closed');
//     mongoose.connection.close(false, () => {
//       console.log('✅ MongoDB connection closed');
//       process.exit(0);
//     });
//   });

//   // Force close after 10 seconds
//   setTimeout(() => {
//     console.error('⚠️  Forcing shutdown after timeout');
//     process.exit(1);
//   }, 10000);
// };

// process.on('SIGTERM', gracefulShutdown);
// process.on('SIGINT', gracefulShutdown);

export default app;
