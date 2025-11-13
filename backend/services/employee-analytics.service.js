import EmployeePerformanceSnapshot from '../models/employee-performance-snapshot.js';
import mongoose from 'mongoose';

/**
 * Get employee performance snapshots
 * @param {string} userId - Employee user ID
 * @param {Object} options - Query options
 * @param {string} options.period - Aggregation period (daily/weekly/monthly)
 * @param {string} options.startDate - Start date filter (YYYY-MM-DD)
 * @param {string} options.endDate - End date filter (YYYY-MM-DD)
 * @returns {Promise<Object>} Performance snapshots with user info
 */
export const getEmployeePerformance = async (userId, { period = 'daily', startDate, endDate } = {}) => {
  // Convert userId string to ObjectId
  const q = { 
    userId: new mongoose.Types.ObjectId(userId),
    period 
  };
  
  // Add date range filters if provided
  if (startDate || endDate) {
    q.snapshotDate = {};
    if (startDate) q.snapshotDate.$gte = new Date(startDate);
    if (endDate) q.snapshotDate.$lte = new Date(endDate);
  }
  
  const snapshots = await EmployeePerformanceSnapshot.find(q)
    .sort({ snapshotDate: -1 })
    .select('snapshotDate metrics projects rankings trends userId')
    .lean();
  
  return snapshots;
};

/**
 * Get all employees performance metrics
 * @param {Object} options - Query options
 * @param {string} options.workspaceId - Filter by workspace ID
 * @param {number} options.page - Page number
 * @param {number} options.limit - Results per page
 * @param {string} options.sortBy - Sort field
 * @param {string} options.order - Sort order (asc/desc)
 * @returns {Promise<Object>} Employees list with pagination
 */
export const getAllEmployees = async ({ workspaceId, page = 1, limit = 50, sortBy = 'metrics.productivityScore', order = 'desc' } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const match = { period: 'daily' };
  
  // Filter by workspaceId if provided (using root-level workspaceId field)
  if (workspaceId) {
    match.workspaceId = new mongoose.Types.ObjectId(workspaceId);
  }

  const pipeline = [
    { $match: match },
    { $sort: { snapshotDate: -1 } },
    { $group: {
      _id: '$userId',
      doc: { $first: '$$ROOT' }
    }},
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { [sortBy]: order === 'asc' ? 1 : -1 } },
    { $facet: {
      results: [ { $skip: skip }, { $limit: safeLimit } ],
      total: [ { $count: 'count' } ]
    }}
  ];

  const agg = await EmployeePerformanceSnapshot.aggregate(pipeline);
  const results = agg[0]?.results || [];
  const count = agg[0]?.total?.[0]?.count || 0;
  
  const employees = results.map(r => ({
    userId: r.userId,
    userName: r.userName || '',
    latestMetrics: r.metrics,
    rankings: r.rankings
  }));
  
  return {
    employees,
    pagination: { page: safePage, limit: safeLimit, total: count, hasMore: skip + safeLimit < count }
  };
};
