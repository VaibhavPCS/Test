// ✅ Centralized Permission System
const PERMISSIONS = {
  workspace: {
    create: ['super_admin', 'admin'],
    invite: ['super_admin', 'admin'], // Only admin+ can invite
    settings: ['super_admin', 'admin', 'owner'], // Workspace settings
    upload_logo: ['super_admin', 'admin']
  },
  project: {
    create: ['super_admin', 'admin'], // Only admin+ can create projects
    view_all: ['super_admin', 'admin'],
    settings: ['super_admin', 'admin'],
    delete: ['super_admin', 'admin']
  },
  task: {
    create: ['super_admin', 'admin', 'lead'],
    edit: ['super_admin', 'admin', 'lead'],
    view_all: ['super_admin', 'admin'],
    assign: ['super_admin', 'admin', 'lead']
  },
  analytics: {
    view_all_workspaces: ['super_admin'],
    view_workspace: ['admin'],
    view_category: ['lead'],
    view_own: ['member']
  }
};

/**
 * Check if user has permission for a specific action
 * @param {string} userRole - Global user role (super_admin, admin, user)
 * @param {string} workspaceRole - Role in current workspace (owner, admin, lead, member, viewer)
 * @param {string} action - Action to check
 * @param {string} resource - Resource type
 * @returns {boolean}
 */
export const hasPermission = (userRole, workspaceRole, action, resource) => {
  const allowedRoles = PERMISSIONS[resource]?.[action] || [];
  
  // Check global role first
  if (allowedRoles.includes(userRole)) {
    return true;
  }
  
  // Then check workspace role
  if (allowedRoles.includes(workspaceRole)) {
    return true;
  }
  
  return false;
};

export default { hasPermission, PERMISSIONS };
