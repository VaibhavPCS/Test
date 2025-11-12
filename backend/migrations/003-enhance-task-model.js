import mongoose from 'mongoose';
import Task from '../models/task.js';

const migrateTaskModel = async () => {
  try {
    console.log('Starting Task model migration...');
    const tasks = await Task.find({ rejectionReason: { $exists: true, $ne: null, $ne: '' } }).lean();
    console.log(`Found ${tasks.length} tasks with rejectionReason to migrate`);

    for (const task of tasks) {
      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            rejections: [{
              rejectedBy: task.approvedBy || task.creator,
              rejectedAt: task.updatedAt || new Date(),
              reason: task.rejectionReason
            }],
            'metrics.timesRejected': 1
          }
        }
      );
    }

    console.log('Migration complete: migrated rejectionReason to rejections array');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

export default migrateTaskModel;

