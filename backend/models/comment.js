import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
    content: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 2000
    },
    author: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    task: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Task', 
        required: true 
    },
    parentComment: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Comment', 
        default: null 
    },
    attachments: [{
        fileName: {
            type: String,
            required: true
        },
        fileUrl: {
            type: String,
            required: true
        },
        fileType: {
            type: String,
            enum: ['image', 'document'],
            required: true
        },
        fileSize: {
            type: Number,
            required: true
        },
        mimeType: {
            type: String,
            required: true
        }
    }],
    isEdited: { 
        type: Boolean, 
        default: false 
    },
    editedAt: { 
        type: Date 
    },
    isActive: { 
        type: Boolean, 
        default: true 
    }
}, {
    timestamps: true
});

// Virtual field for reply count
commentSchema.virtual('replyCount', {
    ref: 'Comment',
    localField: '_id',
    foreignField: 'parentComment',
    count: true
});

commentSchema.virtual('hasReplies').get(function() {
    return this.replyCount > 0;
});

commentSchema.index({ task: 1, createdAt: 1 });
commentSchema.index({ parentComment: 1 });

export default mongoose.model('Comment', commentSchema);
