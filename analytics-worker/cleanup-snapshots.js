// cleanup-snapshots.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI);

reportingDB.once('connected', async () => {
  console.log('✅ Connected to Reporting DB');
  
  try {
    const EmployeePerformanceSnapshot = reportingDB.model(
      'EmployeePerformanceSnapshot',
      new mongoose.Schema({}, { strict: false, collection: 'employeeperformancesnapshots' })
    );
    
    // Delete all snapshots for the user
    const result = await EmployeePerformanceSnapshot.deleteMany({
      userId: new mongoose.Types.ObjectId('69147255c96256a6b037aca1')
    });
    
    console.log(`✅ Deleted ${result.deletedCount} snapshots`);
    
    // Or delete ALL snapshots to regenerate everything
    // const result = await EmployeePerformanceSnapshot.deleteMany({});
    // console.log(`✅ Deleted ${result.deletedCount} total snapshots`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await reportingDB.close();
    process.exit(0);
  }
});
