import mongoose from 'mongoose';

// Main database connection (already exists in index.js)
export const mainDB = mongoose.connection;

// Reporting database connection
export const reportingDB = mongoose.createConnection(
  process.env.REPORTING_DB_URI || process.env.MONGODB_URI,
  {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  }
);

reportingDB.on('connected', () => {
  console.log('Reporting Database connected successfully');
});

reportingDB.on('error', (err) => {
  console.error('Reporting Database error:', err.message);
});

reportingDB.on('disconnected', () => {
  console.warn('Reporting Database disconnected');
});

export default { mainDB, reportingDB };
