import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure upload directories exist
const createUploadDirs = () => {
    const dirs = [
        'uploads',
        'uploads/comments',
        'uploads/comments/images',
        'uploads/comments/documents'
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
};

createUploadDirs();

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const isImage = file.mimetype.startsWith('image/');
        const subfolder = isImage ? 'images' : 'documents';
        cb(null, `uploads/comments/${subfolder}`);
    },
    filename: (req, file, cb) => {
        // Generate secure random filename to prevent directory traversal attacks
        const randomName = crypto.randomBytes(16).toString('hex');
        const extension = path.extname(file.originalname).toLowerCase();
        cb(null, `${randomName}${extension}`);
    }
});

// Allowed file types with extensions and MIME types
const allowedFileTypes = {
    // Images
    'image/jpeg': ['.jpg', '.jpeg'],
    'image/png': ['.png'],
    'image/gif': ['.gif'],
    // Documents
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    'text/plain': ['.txt']
};

// File filter with enhanced validation
const fileFilter = (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    // Check if MIME type is allowed
    if (!allowedFileTypes[mimetype]) {
        return cb(new Error(`File type ${mimetype} is not allowed. Only images (jpg, png, gif) and documents (pdf, docx, xlsx, txt) are allowed.`), false);
    }

    // Check if extension matches MIME type
    if (!allowedFileTypes[mimetype].includes(extension)) {
        return cb(new Error(`File extension ${extension} does not match MIME type ${mimetype}`), false);
    }

    // Reject files with no extension
    if (!extension) {
        return cb(new Error('Files must have a valid extension'), false);
    }

    cb(null, true);
};

// Configure multer
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB per file (configurable)
        files: 3, // Max 3 files per comment
        fieldSize: 1024 * 1024 // 1MB field size limit
    }
});

// Error handler middleware for multer errors
export const handleUploadErrors = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                status: 'fail',
                message: 'File size too large. Maximum size is 5MB per file.'
            });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                status: 'fail',
                message: 'Too many files. Maximum 3 files allowed.'
            });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                status: 'fail',
                message: 'Unexpected field in form data.'
            });
        }
        return res.status(400).json({
            status: 'fail',
            message: `Upload error: ${err.message}`
        });
    }

    if (err) {
        return res.status(400).json({
            status: 'fail',
            message: err.message || 'File upload failed'
        });
    }

    next();
};

export default upload;
