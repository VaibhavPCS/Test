
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Project Management System API',
      version: '1.0.0',
      description: 'Comprehensive API documentation for the Project Management System. Authentication standard: use Authorization header with Bearer JWT. Cookie fallback (auth_token) remains during migration for backward compatibility.',
      contact: {
        name: 'PMS API Support',
        email: 'support@pms.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'https://pms.upda.co.in:5001/api-v1',
        description: 'Production HTTPS Server'
      },
      {
        url: 'http://localhost:5000/api-v1',
        description: 'Development HTTP Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Authorization header using the Bearer scheme'
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'auth_token',
          description: 'Authentication via HTTP-only cookie'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message'
            },
            error: {
              type: 'string',
              description: 'Error details'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'User ID'
            },
            name: {
              type: 'string',
              description: 'User full name'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            isVerified: {
              type: 'boolean',
              description: 'Email verification status'
            },
            currentWorkspace: {
              type: 'string',
              description: 'Current workspace ID'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Workspace: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Workspace ID'
            },
            name: {
              type: 'string',
              description: 'Workspace name'
            },
            description: {
              type: 'string',
              description: 'Workspace description'
            },
            owner: {
              type: 'string',
              description: 'Owner user ID'
            },
            members: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  user: {
                    type: 'string',
                    description: 'User ID'
                  },
                  role: {
                    type: 'string',
                    enum: ['owner', 'admin', 'member'],
                    description: 'User role in workspace'
                  }
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Project: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Project ID'
            },
            title: {
              type: 'string',
              description: 'Project title'
            },
            description: {
              type: 'string',
              description: 'Project description'
            },
            status: {
              type: 'string',
              enum: ['planning', 'active', 'on-hold', 'completed', 'cancelled'],
              description: 'Project status'
            },
            workspace: {
              type: 'string',
              description: 'Workspace ID'
            },
            startDate: {
              type: 'string',
              format: 'date'
            },
            endDate: {
              type: 'string',
              format: 'date'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Task: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Task ID'
            },
            title: {
              type: 'string',
              description: 'Task title'
            },
            description: {
              type: 'string',
              description: 'Task description'
            },
            status: {
              type: 'string',
              enum: ['todo', 'in-progress', 'review', 'done'],
              description: 'Task status'
            },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'urgent'],
              description: 'Task priority'
            },
            assignedTo: {
              type: 'string',
              description: 'Assigned user ID'
            },
            project: {
              type: 'string',
              description: 'Project ID'
            },
            dueDate: {
              type: 'string',
              format: 'date'
            },
            handoverNotes: {
              type: 'string',
              description: 'Handover notes for task completion'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Comment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Comment ID'
            },
            content: {
              type: 'string',
              description: 'Comment content'
            },
            author: {
              type: 'string',
              description: 'Author user ID'
            },
            task: {
              type: 'string',
              description: 'Task ID'
            },
            parentComment: {
              type: 'string',
              description: 'Parent comment ID for replies'
            },
            attachments: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of attachment file paths'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Notification: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Notification ID'
            },
            recipient: {
              type: 'string',
              description: 'Recipient user ID'
            },
            type: {
              type: 'string',
              enum: ['task_assigned', 'task_updated', 'comment_added', 'workspace_invite', 'project_invite'],
              description: 'Notification type'
            },
            title: {
              type: 'string',
              description: 'Notification title'
            },
            message: {
              type: 'string',
              description: 'Notification message'
            },
            isRead: {
              type: 'boolean',
              description: 'Read status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    path.join(__dirname, '../routes/*.js'),
    path.join(__dirname, '../controllers/*.js'),
    path.join(__dirname, '../models/*.js')
  ],
};

const swaggerSpec = swaggerJSDoc(options);

export const swaggerDocs = (app) => {
  // Serve swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'PMS API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true
    }
  }));
  
  // Serve swagger spec as JSON
  app.get('/api-docs.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
};
