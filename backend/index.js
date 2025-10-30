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
import path from 'path';
dotenv.config();
handleUncaughtException();

const app = express();

// Enhanced security headers configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'", process.env.FRONTEND_URL || "https://pms.upda.co.in"],
    },
  },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginEmbedderPolicy: false, // Set to true if needed for specific features
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true
  }
}));

// Additional security headers
app.use((req, res, next) => {
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

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

// Cookie parser for HTTP-only cookies
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Enhanced CORS configuration for HTTPS
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      process.env.FRONTEND_URL,
      'https://pms.upda.co.in',
      'https://pms.upda.co.in:5000'
    ]
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'https://localhost:5173',
      'https://127.0.0.1:5173'
    ];

app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'workspace-id', 'X-Requested-With'],
    credentials: true,
    optionsSuccessStatus: 200 // For legacy browser support
}));

// Handle preflight requests
app.options('*', cors());

// Logging middleware (use 'combined' in production)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  // Connection options for better reliability
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('MongoDB connected successfully');
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
const HTTPS_PORT = process.env.HTTPS_PORT || 5443;

// SSL Certificate configuration
const getSSLOptions = () => {
  try {
    if (process.env.NODE_ENV === 'production') {
      // Production SSL certificate paths
      const sslKeyPath = process.env.SSL_KEY_PATH || '/etc/ssl/private/server.key';
      const sslCertPath = process.env.SSL_CERT_PATH || '/etc/ssl/certs/server.crt';
      const sslCaPath = process.env.SSL_CA_PATH; // Optional CA bundle
      
      const options = {
        key: fs.readFileSync(sslKeyPath),
        cert: fs.readFileSync(sslCertPath)
      };
      
      if (sslCaPath && fs.existsSync(sslCaPath)) {
        options.ca = fs.readFileSync(sslCaPath);
      }
      
      return options;
    } else {
      // Development self-signed certificate
      const certDir = path.join(process.cwd(), 'certs');
      const keyPath = path.join(certDir, 'server.key');
      const certPath = path.join(certDir, 'server.crt');
      
      if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };
      }
    }
  } catch (error) {
    console.warn('SSL certificates not found, running HTTP only:', error.message);
  }
  return null;
};

// Force HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      protocol: req.secure ? 'https' : 'http'
    });
});

import { swaggerDocs } from './libs/swagger.js';

swaggerDocs(app);

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

// Server startup with SSL support
const sslOptions = getSSLOptions();
let server;

if (sslOptions) {
  // Start HTTPS server
  server = https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
    console.log(`🔒 HTTPS Server is running on port ${HTTPS_PORT}`);
    console.log(`🔗 API URL: https://localhost:${HTTPS_PORT}`);
  });
  
  // Optional: Start HTTP server for redirects
  if (process.env.ENABLE_HTTP_REDIRECT !== 'false') {
    const httpApp = express();
    httpApp.use((req, res) => {
      res.redirect(301, `https://${req.headers.host.replace(/:\d+$/, `:${HTTPS_PORT}`)}${req.url}`);
    });
    
    http.createServer(httpApp).listen(PORT, () => {
      console.log(`🔄 HTTP Redirect server running on port ${PORT} -> HTTPS ${HTTPS_PORT}`);
    });
  }
} else {
  // Fallback to HTTP server
  server = app.listen(PORT, () => {
    console.log(`⚠️  HTTP Server is running on port ${PORT}`);
    console.log(`🔗 API URL: http://localhost:${PORT}`);
    console.log(`⚠️  Warning: Running without SSL in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

process.on('SIGTERM', () => {
  console.log('Shutting down');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down');
  server.close(() => {
    console.log('Process terminated');
    mongoose.connection.close(false, () => {
      console.log('MongoDB connection closed');
      process.exit(0);
    });
  });
});
