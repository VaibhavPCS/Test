# Backend Changes Documentation - Approval Workflow System

## Overview
This document details all backend changes made to implement the approval workflow system and new project member management structure.

## Date: 2025-11-04

---

## 1. DATABASE MODEL CHANGES

### 1.1 Project Model (`backend/models/Project.js`)

**REMOVED:**
- `categories` array field with nested members and roles

**ADDED:**
- `projectHead` (ObjectId, ref: 'User', required) - The head/manager of the project
- `members` array with simplified structure:
  - `userId` (ObjectId, ref: 'User', required)
  - `addedAt` (Date, default: Date.now)

**Impact:**
- Projects now have a single project head (assigned by admin when creating project)
- Members are added without role distinction - all members have the same permissions
- Only project head (or admin) can add/remove members and create tasks

---

### 1.2 Task Model (`backend/models/Task.js`)

**MODIFIED:**
- `assignee` field is now **optional** (required: false) - tasks can be created without assignment

**REMOVED:**
- `category` field (no longer needed with new project structure)

**ADDED - Approval Workflow Fields:**
- `approvalStatus` (String, enum: ['not-required', 'pending-approval', 'approved', 'rejected'], default: 'not-required')
- `completedBy` (ObjectId, ref: 'User') - User who marked task as done
- `approvedBy` (ObjectId, ref: 'User') - Project head/admin who approved/rejected
- `approvedAt` (Date) - Timestamp of approval/rejection
- `rejectionReason` (String) - Optional reason for rejection

**Workflow States:**
1. **not-required** - Task is in progress (to-do, in-progress)
2. **pending-approval** - Task marked as done, waiting for project head approval
3. **approved** - Task approved by project head, hidden from regular members
4. **rejected** - Task rejected, moved back to in-progress with reason

---

## 2. CONTROLLER CHANGES

### 2.1 Task Controller (`backend/controllers/task-controller.js`)

#### Updated Functions:

**`createTask`:**
- ✅ Removed category-based permission logic
- ✅ Made assignee optional
- ✅ Now checks: only project head or admin can create tasks
- ✅ Verifies assignee is in project members (if provided)
- ✅ Sets default `approvalStatus: 'not-required'`

**`updateTaskStatus`:**
- ✅ When status changed to 'done':
  - Sets `approvalStatus = 'pending-approval'`
  - Sets `completedBy = userId`
  - Sets `completedAt = Date.now()`
  - Sends notification to project head for approval
- ✅ When status changed to 'in-progress':
  - Resets `approvalStatus = 'not-required'`
  - Clears `completedBy` and `completedAt`

**`getProjectTasks`:**
- ✅ Regular members: Tasks with `approvalStatus != 'approved'` (don't see approved tasks)
- ✅ Project head & admin: See ALL tasks including approved ones

**`getAssignableMembers`:**
- ✅ Returns all project members including project head
- ✅ Removed category-based filtering

**`getTaskById`:**
- ✅ Populates approval-related fields: `completedBy`, `approvedBy`
- ✅ Updated access control for new project structure

#### New Functions:

**`approveTask(req, res)`:**
- **Route:** `POST /api-v1/tasks/:taskId/approve`
- **Permission:** Project head or admin only
- **Validation:** Task must be in 'pending-approval' status
- **Actions:**
  - Sets `approvalStatus = 'approved'`
  - Sets `approvedBy = userId`
  - Sets `approvedAt = Date.now()`
  - Sends notification to task assignee

**`rejectTask(req, res)`:**
- **Route:** `POST /api-v1/tasks/:taskId/reject`
- **Permission:** Project head or admin only
- **Validation:** Task must be in 'pending-approval' status
- **Body:** `{ reason?: string }`
- **Actions:**
  - Sets `status = 'in-progress'`
  - Sets `approvalStatus = 'rejected'`
  - Sets `approvedBy = userId`
  - Sets `rejectionReason`
  - Clears `completedAt` and `completedBy`
  - Sends notification to task assignee with reason

---

### 2.2 Project Controller (`backend/controllers/project-controller.js`)

#### Updated Functions:

**`createProject`:**
- ✅ Now requires `projectHeadId` instead of `categories`
- ✅ Validates project head is in workspace
- ✅ Creates project with empty `members` array
- ✅ Populates `projectHead` and `members.userId`

**`getProjectDetails`:**
- ✅ Populates `projectHead` and `members.userId`

**`getUserProjectRole`:**
- ✅ Returns role: 'project-head', 'admin', 'member', or 'viewer'
- ✅ Added `canApprove: true` for project head and admin
- ✅ All project members receive 'member' role (no lead distinction)

**`getWorkspaceProjects` & `getRecentProjects`:**
- ✅ Updated queries to find projects where user is:
  - Creator
  - Project head
  - Member (`'members.userId': userId`)

#### Renamed Functions:

**`addMemberToProject` (formerly `addMemberToCategory`):**
- **Route:** `POST /api-v1/projects/:projectId/members`
- **Permission:** Project head or admin only
- **Body:** `{ memberEmail: string }`
- **Validation:**
  - Member must be in workspace
  - Cannot add if already project head
  - Cannot add if already in members array

**`removeMemberFromProject` (formerly `removeMemberFromCategory`):**
- **Route:** `DELETE /api-v1/projects/:projectId/members`
- **Permission:** Project head or admin only
- **Body:** `{ memberId: string }`
- **Validation:** Cannot remove project head

**✅ REMOVED: `changeMemberRoleInProject`:**
- No longer needed as members don't have role distinctions
- All members have the same permissions
- Route and function completely removed

---

## 3. ROUTE CHANGES

### 3.1 Task Routes (`backend/routes/task.js`)

**New Routes Added:**
```javascript
POST /api-v1/tasks/:taskId/approve    // Approve task
POST /api-v1/tasks/:taskId/reject     // Reject task with optional reason
```

**Updated Imports:**
- Added `approveTask` and `rejectTask` functions

---

### 3.2 Project Routes (`backend/routes/project.js`)

**Updated Imports:**
- `addMemberToCategory` → `addMemberToProject`
- `removeMemberFromCategory` → `removeMemberFromProject`

**Routes Updated:**
- `POST /:projectId/members` - Now uses `addMemberToProject`
- `DELETE /:projectId/members` - Now uses `removeMemberFromProject`

---

## 4. NOTIFICATION TYPES

**New Notification Types:**
1. `task_approval_pending` - Sent to project head when task marked done
2. `task_approved` - Sent to assignee when task approved
3. `task_rejected` - Sent to assignee when task rejected (includes reason)

---

## 5. PERMISSION MATRIX

| Action | Project Head | Member | Admin | Super Admin |
|--------|-------------|--------|-------|-------------|
| Create Project | ❌ | ❌ | ✅ | ✅ |
| Add Members | ✅ | ❌ | ✅ | ✅ |
| Remove Members | ✅ | ❌ | ✅ | ✅ |
| Create Tasks | ✅ | ❌ | ✅ | ✅ |
| Assign Tasks | ✅ | ❌ | ✅ | ✅ |
| Mark Task as Done | ✅ | ✅ | ✅ | ✅ |
| Approve Tasks | ✅ | ❌ | ✅ | ✅ |
| Reject Tasks | ✅ | ❌ | ✅ | ✅ |
| View Approved Tasks | ✅ | ❌ | ✅ | ✅ |

**Note:** All members have equal permissions - there is no role distinction within project members.

---

## 6. API REQUEST/RESPONSE EXAMPLES

### Create Project
```javascript
POST /api-v1/projects
{
  "title": "New Website Redesign",
  "description": "Redesign company website",
  "status": "Planning",
  "startDate": "2025-01-15",
  "endDate": "2025-03-30",
  "projectHeadId": "507f1f77bcf86cd799439011"
}
```

### Add Member to Project
```javascript
POST /api-v1/projects/507f.../members
{
  "memberEmail": "john@example.com"
  // No role field - all members have equal permissions
}
```

### Create Task (with or without assignee)
```javascript
POST /api-v1/tasks
{
  "title": "Design homepage mockup",
  "description": "Create Figma mockup",
  "projectId": "507f...",
  "assigneeId": "507f...",  // Optional!
  "startDate": "2025-01-20",
  "dueDate": "2025-01-25",
  "priority": "high"
}
```

### Approve Task
```javascript
POST /api-v1/tasks/507f.../approve
// No body needed
```

### Reject Task
```javascript
POST /api-v1/tasks/507f.../reject
{
  "reason": "Please add unit tests before marking as done"
}
```

---

## 7. BREAKING CHANGES

⚠️ **IMPORTANT:** These changes break existing functionality:

1. **Project Creation:**
   - Old: Required `categories` array with members
   - New: Requires `projectHeadId` only

2. **Task Creation:**
   - Old: Required `category` and `assigneeId`
   - New: `assigneeId` optional, no `category` field

3. **Member Management:**
   - Old: Add members to categories with specific roles
   - New: Add members directly to project without role distinction

4. **API Endpoints:**
   - Old: `/projects/:id/categories/:name/members`
   - New: `/projects/:id/members`
   - Removed: `/projects/:id/members/:memberId/role` (role changes no longer applicable)

---

## 8. DATABASE MIGRATION NOTES

⚠️ **Existing Data:** Projects with `categories` field will need migration:

```javascript
// Migration script needed to:
// 1. Select first category member as projectHead
// 2. Flatten all category members into members array (userId and addedAt only)
// 3. Remove categories field
// 4. Remove any 'role' fields from members array
```

---

## 9. FRONTEND INTEGRATION POINTS

**Required Frontend Updates:**

1. **Project Creation Modal:**
   - Remove category management UI
   - Add project head selection dropdown
   - Fetch workspace members for selection
   - Only accessible to admin and super admin

2. **Task Detail View:**
   - Show approval button when `status === 'done' && approvalStatus === 'pending-approval'`
   - Only visible to project head and admin
   - Show rejection reason if `approvalStatus === 'rejected'`
   - Hide task from regular members when `approvalStatus === 'approved'`

3. **Task List:**
   - Filter tasks: `approvalStatus !== 'approved'` for regular members
   - Show approval status badge: 'Pending Approval', 'Approved', 'Rejected'
   - Color coding: Orange for pending, Green for approved, Red for rejected

4. **Project Members UI:**
   - Show project head at top (non-removable, labeled as "Project Head")
   - List all members equally (no role badges)
   - Add member button only visible to project head and admin
   - Simple "Add Member" form with email input (no role selection)
   - Remove member button next to each member (not available for project head)

---

## 10. TESTING CHECKLIST

- [ ] Admin can create project with project head
- [ ] Project head can add members (no role selection)
- [ ] Project head can create tasks with/without assignee
- [ ] Only project head and admin can create tasks (members cannot)
- [ ] Member marks task as done → status becomes 'pending-approval'
- [ ] Project head receives notification for pending approval
- [ ] Project head can approve task
- [ ] Project head can reject task with reason
- [ ] Approved tasks hidden from regular members
- [ ] Approved tasks visible to project head and admin
- [ ] Rejected tasks return to in-progress with reason displayed
- [ ] Assignee receives approval/rejection notifications
- [ ] Members cannot add other members (only project head/admin)
- [ ] Project head cannot be removed from project

---

## 11. FILES MODIFIED

### Models:
- ✅ `backend/models/Project.js`
- ✅ `backend/models/Task.js`

### Controllers:
- ✅ `backend/controllers/task-controller.js`
- ✅ `backend/controllers/project-controller.js`

### Routes:
- ✅ `backend/routes/task.js`
- ✅ `backend/routes/project.js`

### No Changes Needed:
- `backend/models/Workspace.js` (already has member roles)
- `backend/libs/permission-system.js` (existing permissions still apply)
- `backend/controllers/notification-controller.js` (flexible notification system)

---

## COMPLETION STATUS

✅ **All backend changes complete and functional**

**Next Steps:**
1. Frontend project creation modal updates
2. Frontend task detail view with approval button
3. Frontend task list filtering logic
4. Test all workflows end-to-end
