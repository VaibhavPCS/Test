import EmployeePerformanceSnapshot from '../models/employee-performance-snapshot.js';

export const getEmployeePerformance = async (userId, { period = 'daily', startDate, endDate } = {}) => {
  const q = { userId, period };
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

export const getAllEmployees = async ({ workspaceId, page = 1, limit = 50, sortBy = 'metrics.productivityScore', order = 'desc' } = {}) => {
  const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
  const safePage = Math.max(parseInt(page) || 1, 1);
  const skip = (safePage - 1) * safeLimit;

  const match = { period: 'daily' };
  if (workspaceId) match['rankings.inWorkspace'] = workspaceId;

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

