import Comment from '../models/comment.js';
import Task from '../models/task.js';
import User from '../models/user.js';
import Project from '../models/project.js';
import Notification from '../models/notification.js';
import { createNotification } from './notification-controller.js';
import path from 'path';
import fs from 'fs';

// Helper: determine if a user can view a given task
const canViewTask = async (userId, task) => {
    try {
        if (!task) return false;
        const user = await User.findById(userId);
        if (!user) return false;

        // Global roles can view
        if (["admin", "super_admin"].includes(user.role)) {
            return true;
        }

        // Assignee or creator can view
        if ((task.assignee && task.assignee.toString() === userId) ||
            (task.creator && task.creator.toString() === userId)) {
            return true;
        }

        // Project head or project member can view
        const project = await Project.findById(task.project)
            .populate('projectHead')
            .populate('members.userId');

        if (!project) return false;

        const isProjectHead = project.projectHead && project.projectHead._id.toString() === userId;
        const isMember = (project.members || []).some(m => m.userId && m.userId._id.toString() === userId);

        return isProjectHead || isMember;
    } catch (e) {
        return false;
    }
};

const createComment = async (req, res) => {
    try {
        const { content, taskId, parentCommentId } = req.body;
        const userId = req.user.id;
        
        if (!content?.trim()) {
            return res.status(400).json({ message: 'Comment content is required' });
        }
        
        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required' });
        }
        
        // Check if task exists
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        
        // Permission: anyone who can view the task can comment
        const canView = await canViewTask(userId, task);
        if (!canView) {
            return res.status(403).json({ message: "You don't have permission to comment on this task" });
        }

        // If replying, validate parent comment exists and belongs to same task
        const isReply = !!parentCommentId;
        if (isReply) {
            const parentComment = await Comment.findById(parentCommentId);
            if (!parentComment) {
                return res.status(404).json({ message: 'Parent comment not found' });
            }
            if (parentComment.task.toString() !== taskId.toString()) {
                return res.status(400).json({ message: 'Parent comment does not belong to this task' });
            }
        }
        
        // Process file attachments
        const attachments = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                const isImage = file.mimetype.startsWith('image/');
                const subfolder = isImage ? 'images' : 'documents';
                
                attachments.push({
                    fileName: file.originalname,
                    fileUrl: `/uploads/comments/${subfolder}/${file.filename}`,
                    fileType: isImage ? 'image' : 'document',
                    fileSize: file.size,
                    mimeType: file.mimetype
                });
            }
        }
        
        // Create comment
        const comment = new Comment({
            content: content.trim(),
            author: userId,
            task: taskId,
            parentComment: parentCommentId || null,
            attachments
        });
        
        await comment.save();
        
        // Populate author details
        await comment.populate('author', 'name email avatar');
        if (parentCommentId) {
            await comment.populate('parentComment', 'content author');
        }
        
        // Create notifications
        if (isReply && parentCommentId) {
            // Notify parent comment author
            const parentComment = await Comment.findById(parentCommentId);
            if (parentComment && parentComment.author.toString() !== userId.toString()) {
                await Notification.create({
                    recipient: parentComment.author,
                    type: 'comment_reply',
                    message: `${req.user.name} replied to your comment on "${task.title}"`,
                    relatedTask: taskId,
                    relatedComment: comment._id
                });
            }
        } else {
            // Notify task assignee and creator (if different from comment author)
            const notifyUsers = new Set();
            
            if (task.assignee && task.assignee.toString() !== userId.toString()) {
                notifyUsers.add(task.assignee.toString());
            }
            
            if (task.creator && task.creator.toString() !== userId.toString()) {
                notifyUsers.add(task.creator.toString());
            }
            
            for (const recipientId of notifyUsers) {
                await Notification.create({
                    recipient: recipientId,
                    type: 'task_comment',
                    message: `${req.user.name} commented on "${task.title}"`,
                    relatedTask: taskId,
                    relatedComment: comment._id
                });
            }
        }
        
        res.status(201).json({
            message: 'Comment created successfully',
            comment
        });
        
    } catch (error) {
        console.error('Error creating comment:', error);
        
        // Clean up uploaded files on error
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        
        res.status(500).json({ message: 'Internal server error' });
    }
};


const getTaskComments = async (req, res) => {
    try {
        const { taskId } = req.params;
        
        if (!taskId) {
            return res.status(400).json({ message: 'Task ID is required' });
        }
        // Ensure user can view task
        const userId = req.user.id;
        const task = await Task.findById(taskId);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        const canView = await canViewTask(userId, task);
        if (!canView) {
            return res.status(403).json({ message: "You don't have permission to view comments for this task" });
        }
        
        // Get top-level comments only
        const comments = await Comment.find({ 
            task: taskId, 
            parentComment: null,
            isActive: true 
        })
        .populate('author', 'name email avatar')
        .populate({
            path: 'replyCount'
        })
        .sort({ createdAt: 1 }); // Oldest first for chat feel
        
        // Add reply count manually (virtual populate might not work perfectly)
        const commentsWithReplyCount = await Promise.all(
            comments.map(async (comment) => {
                const replyCount = await Comment.countDocuments({
                    parentComment: comment._id,
                    isActive: true
                });
                
                return {
                    ...comment.toObject(),
                    replyCount,
                    hasReplies: replyCount > 0
                };
            })
        );
        
        res.status(200).json({ comments: commentsWithReplyCount });
        
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

const updateComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;
        
        if (!content?.trim()) {
            return res.status(400).json({ message: 'Content is required' });
        }
        
        const comment = await Comment.findById(commentId);
        
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        
        if (comment.author.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'You can only edit your own comments' });
        }

        // Ensure user can view the task associated with the comment
        const task = await Task.findById(comment.task);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        const canView = await canViewTask(userId, task);
        if (!canView) {
            return res.status(403).json({ message: "You don't have permission to edit comments on this task" });
        }
        
        comment.content = content.trim();
        comment.isEdited = true;
        comment.editedAt = new Date();
        
        await comment.save();
        await comment.populate('author', 'name email avatar');
        
        res.status(200).json({
            message: 'Comment updated successfully',
            comment
        });
        
    } catch (error) {
        console.error('Error updating comment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


const deleteComment = async (req, res) => {
    try {
        const { commentId } = req.params;
        const userId = req.user.id;
        
        const comment = await Comment.findById(commentId);
        
        if (!comment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        
        if (comment.author.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'You can only delete your own comments' });
        }

        // Ensure user can view the task associated with the comment
        const task = await Task.findById(comment.task);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        const canView = await canViewTask(userId, task);
        if (!canView) {
            return res.status(403).json({ message: "You don't have permission to delete comments on this task" });
        }
        
        // Clean up attached files
        if (comment.attachments && comment.attachments.length > 0) {
            comment.attachments.forEach(attachment => {
                const filePath = path.join(process.cwd(), attachment.fileUrl);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        // Soft delete
        comment.isActive = false;
        await comment.save();
        
        res.status(200).json({ message: 'Comment deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Removed role-based commenting helpers in favor of task visibility checks


export {
  createComment,
  getTaskComments,
  updateComment,
  deleteComment
};

export const getCommentReplies = async (req, res) => {
    try {
        const { commentId } = req.params;
        
        if (!commentId) {
            return res.status(400).json({ message: 'Comment ID is required' });
        }
        // Ensure user can view the task associated with the parent comment
        const userId = req.user.id;
        const parentComment = await Comment.findById(commentId);
        if (!parentComment) {
            return res.status(404).json({ message: 'Comment not found' });
        }
        const task = await Task.findById(parentComment.task);
        if (!task) {
            return res.status(404).json({ message: 'Task not found' });
        }
        const canView = await canViewTask(userId, task);
        if (!canView) {
            return res.status(403).json({ message: "You don't have permission to view replies for this task" });
        }

        const replies = await Comment.find({
            parentComment: commentId,
            isActive: true
        })
        .populate('author', 'name email avatar')
        .populate('parentComment', 'content author')
        .sort({ createdAt: 1 });
        
        res.status(200).json({ replies });
        
    } catch (error) {
        console.error('Error fetching replies:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
