import Meeting from '../models/meeting.js';
import Notification from '../models/notification.js';
import cron from 'node-cron';

// Function to send meeting reminders
export const sendMeetingReminders = async () => {
  try {
    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    // Find meetings that need 24-hour reminders
    const meetingsFor24HourReminder = await Meeting.find({
      scheduledDate: {
        $gte: twentyFourHoursFromNow,
        $lte: new Date(twentyFourHoursFromNow.getTime() + 5 * 60 * 1000) // 5-minute window
      },
      status: 'scheduled',
      isActive: true,
      'remindersSent.twentyFourHour': false
    }).populate('organizer participants.user', 'name email');

    // Send 24-hour reminders
    for (const meeting of meetingsFor24HourReminder) {
      const recipients = [meeting.organizer, ...meeting.participants.map(p => p.user)];
      
      for (const recipient of recipients) {
        try {
          await Notification.create({
            recipient: recipient._id,
            type: 'meeting_reminder',
            title: '24-Hour Meeting Reminder',
            message: `Reminder: "${meeting.title}" is scheduled for tomorrow at ${meeting.scheduledDate.toLocaleString()}`,
            data: {
              meetingId: meeting._id,
              workspaceId: meeting.workspace,
              projectId: meeting.project
            }
          });
        } catch (notifError) {
          console.error('Error sending 24-hour reminder notification:', notifError);
        }
      }

      // Mark 24-hour reminder as sent
      meeting.remindersSent.twentyFourHour = true;
      await meeting.save();
    }

    // Find meetings that need 1-hour reminders
    const meetingsFor1HourReminder = await Meeting.find({
      scheduledDate: {
        $gte: oneHourFromNow,
        $lte: new Date(oneHourFromNow.getTime() + 5 * 60 * 1000) // 5-minute window
      },
      status: 'scheduled',
      isActive: true,
      'remindersSent.oneHour': false
    }).populate('organizer participants.user', 'name email');

    // Send 1-hour reminders
    for (const meeting of meetingsFor1HourReminder) {
      const recipients = [meeting.organizer, ...meeting.participants.map(p => p.user)];
      
      for (const recipient of recipients) {
        try {
          await Notification.create({
            recipient: recipient._id,
            type: 'meeting_reminder',
            title: '1-Hour Meeting Reminder',
            message: `Reminder: "${meeting.title}" starts in 1 hour at ${meeting.scheduledDate.toLocaleString()}${meeting.meetingLink ? `. Join here: ${meeting.meetingLink}` : ''}`,
            data: {
              meetingId: meeting._id,
              workspaceId: meeting.workspace,
              projectId: meeting.project
            }
          });
        } catch (notifError) {
          console.error('Error sending 1-hour reminder notification:', notifError);
        }
      }

      // Mark 1-hour reminder as sent
      meeting.remindersSent.oneHour = true;
      await meeting.save();
    }

    console.log(`Processed ${meetingsFor24HourReminder.length} 24-hour reminders and ${meetingsFor1HourReminder.length} 1-hour reminders`);

  } catch (error) {
    console.error('Error in sendMeetingReminders:', error);
  }
};

// Function to start the reminder cron job
export const startMeetingReminderCron = () => {
  // Run every 5 minutes to check for reminders
  cron.schedule('*/5 * * * *', () => {
    console.log('Running meeting reminder check...');
    sendMeetingReminders();
  });

  console.log('Meeting reminder cron job started - running every 5 minutes');
};

// Function to update meeting status based on time
export const updateMeetingStatuses = async () => {
  try {
    const now = new Date();

    // Update meetings that should be in-progress
    await Meeting.updateMany(
      {
        scheduledDate: { $lte: now },
        status: 'scheduled',
        isActive: true
      },
      {
        $set: { status: 'in-progress' }
      }
    );

    // Update meetings that should be completed (1 hour after scheduled time + duration)
    const completedMeetings = await Meeting.find({
      status: 'in-progress',
      isActive: true
    });

    for (const meeting of completedMeetings) {
      const endTime = new Date(meeting.scheduledDate.getTime() + meeting.duration * 60 * 1000);
      if (now > endTime) {
        meeting.status = 'completed';
        await meeting.save();
      }
    }

  } catch (error) {
    console.error('Error updating meeting statuses:', error);
  }
};

// Function to start the status update cron job
export const startMeetingStatusCron = () => {
  // Run every 10 minutes to update meeting statuses
  cron.schedule('*/10 * * * *', () => {
    console.log('Running meeting status update...');
    updateMeetingStatuses();
  });

  console.log('Meeting status update cron job started - running every 10 minutes');
};