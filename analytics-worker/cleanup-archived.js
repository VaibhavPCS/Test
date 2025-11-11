import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const mainDB = mongoose.createConnection(process.env.MAIN_DB_URI);
const reportingDB = mongoose.createConnection(process.env.REPORTING_DB_URI);

async function cleanup() {
  try {
    await Promise.all([
      new Promise(resolve => mainDB.once('connected', resolve)),
      new Promise(resolve => reportingDB.once('connected', resolve))
    ]);
    
    console.log('✅ Connected to databases\n');
    
    // Get archived workspace IDs
    const archivedWorkspaces = await mainDB.collection('workspaces').find({ 
      isArchived: true 
    }).toArray();
    
    const archivedWorkspaceIds = archivedWorkspaces.map(w => w._id);
    console.log(`📋 Found ${archivedWorkspaceIds.length} archived workspaces\n`);
    
    // Get projects from archived workspaces
    const projectsToRemove = await mainDB.collection('projects').find({
      workspace: { $in: archivedWorkspaceIds }
    }).toArray();
    
    const projectIdsToRemove = projectsToRemove.map(p => p._id);
    console.log(`📦 Found ${projectIdsToRemove.length} projects in archived workspaces\n`);
    
    if (projectIdsToRemove.length > 0) {
      // Delete leaderboard entries for these projects
      const result = await reportingDB.collection('project_leaderboard').deleteMany({
        projectId: { $in: projectIdsToRemove }
      });
      
      console.log(`✅ Deleted ${result.deletedCount} leaderboard entries from archived workspaces\n`);
    } else {
      console.log('✅ No cleanup needed\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mainDB.close();
    await reportingDB.close();
    process.exit(0);
  }
}

cleanup();
