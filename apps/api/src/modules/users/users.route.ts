/**
 * Users routes — admin-only user management endpoints.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.1, 7.2
 *
 * All routes:
 *  - require an authenticated session (via authMiddleware)
 *  - require admin role (requireFeature('user_management'))
 *  - never serialize password or password_hash in any response
 *
 * Routes:
 *  GET  /users              → 200 + array of { id, email, name, role, isActive }
 *  POST /users              → 201 + { id, email, name, role } | 400 + { errors }
 *  PATCH /users/:id         → 200 + updated user
 *  PATCH /users/:id/active  → 200 + { id, isActive }
 */

import { Elysia } from 'elysia';
import { authMiddleware } from '../auth/auth.middleware';
import { listUsers, createUser, updateUser, setUserActive, deleteUser, countActiveAdmins, getUserPublicById } from './users.service';

export const usersRoutes = new Elysia({ prefix: '/users' })
  .use(authMiddleware)

  // ─── GET /users ────────────────────────────────────────────────────────
  // List all users.
  // Req 6.1: list with columns email, name, role, is_active.
  // Req 6.2: non-admin caller → 403 (enforced by requireFeature).
  .get('/', async ({ user, requireFeature, set }) => {
    requireFeature('user_management');

    try {
      const userList = await listUsers();
      return userList;
    } catch (err: any) {
      set.status = 500;
      return { ok: false, error: 'internal_error', message: err.message };
    }
  })

  // ─── POST /users ───────────────────────────────────────────────────────
  // Create a new user.
  // Req 6.3, 6.4, 6.5, 6.6, 6.7: validate, hash, insert, return 201 with
  // only { id, email, name, role } or 400 with field-level errors.
  .post('/', async ({ body, user, requireFeature, set }) => {
    requireFeature('user_management');

    const { email, name, role, password, username } = body as {
      email: unknown;
      name: unknown;
      role: unknown;
      password: unknown;
      username: unknown;
    };

    const result = await createUser({
      email: typeof email === 'string' ? email : '',
      name: typeof name === 'string' ? name : '',
      role: typeof role === 'string' ? role : '',
      password: typeof password === 'string' ? password : '',
      username: typeof username === 'string' ? username : null,
      companyId: user.companyId,
    });

    if (!result.ok) {
      set.status = 400;
      // Return field-level errors (Req 6.5)
      return { ok: false, errors: result.errors };
    }

    // 201 with ONLY id, email, name, role — never password or password_hash (Req 6.7)
    set.status = 201;
    return {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      role: result.user.role,
    };
  })

  // ─── PATCH /users/:id ─────────────────────────────────────────────────
  // Update a user's name, role, and/or isActive.
  // Cannot update password through this endpoint (use CLI, Req 7.3).
  .patch('/:id', async ({ params, body, user, requireFeature, set }) => {
    requireFeature('user_management');

    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id', message: 'User ID must be a positive integer' };
    }

    const bodyData = body as {
      name?: unknown;
      role?: unknown;
      isActive?: unknown;
    };

    // Build validated update data
    const updateData: { name?: string; role?: string; isActive?: boolean } = {};

    if (bodyData.name !== undefined) {
      if (typeof bodyData.name !== 'string') {
        set.status = 400;
        return { ok: false, errors: { name: 'Name must be a string' } };
      }
      updateData.name = bodyData.name;
    }

    if (bodyData.role !== undefined) {
      if (bodyData.role !== 'admin' && bodyData.role !== 'staff') {
        set.status = 400;
        return { ok: false, errors: { role: 'Role must be admin or staff' } };
      }
      updateData.role = bodyData.role;
    }

    if (bodyData.isActive !== undefined) {
      if (typeof bodyData.isActive !== 'boolean') {
        set.status = 400;
        return { ok: false, errors: { isActive: 'isActive must be a boolean' } };
      }
      updateData.isActive = bodyData.isActive;
    }

    // Guard: prevent self-lockout and orphaning the system of admins.
    // A deactivation OR a demotion (admin → staff) of the last active admin,
    // or deactivating your own account, is rejected.
    {
      const deactivating = updateData.isActive === false;
      const demoting = updateData.role === 'staff';

      if (deactivating && id === user.id) {
        set.status = 400;
        return {
          ok: false,
          error: 'cannot_deactivate_self',
          message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.',
        };
      }

      if (deactivating || demoting) {
        const target = await getUserPublicById(id);
        if (target && target.role === 'admin' && target.isActive) {
          const activeAdmins = await countActiveAdmins();
          if (activeAdmins <= 1) {
            set.status = 400;
            return {
              ok: false,
              error: 'last_admin',
              message: 'Tidak dapat menonaktifkan atau menurunkan admin aktif terakhir.',
            };
          }
        }
      }
    }

    try {
      const updated = await updateUser(id, updateData);
      if (!updated) {
        set.status = 404;
        return { ok: false, error: 'not_found', message: `User ${id} not found` };
      }
      // Return public fields — never password or password_hash
      return {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        isActive: updated.isActive,
      };
    } catch (err: any) {
      set.status = 400;
      return { ok: false, error: 'validation_error', message: err.message };
    }
  })

  // ─── PATCH /users/:id/active ──────────────────────────────────────────
  // Toggle a user's is_active status.
  // Req 6.8: when set to false, next request from that user's sessions is
  //          rejected per Req 2.7 (handled by validateSession's is_active check).
  .patch('/:id/active', async ({ params, body, user, requireFeature, set }) => {
    requireFeature('user_management');

    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id', message: 'User ID must be a positive integer' };
    }

    const bodyData = body as { isActive?: unknown };

    if (typeof bodyData.isActive !== 'boolean') {
      set.status = 400;
      return { ok: false, errors: { isActive: 'isActive must be a boolean' } };
    }

    // Guard: deactivation safety checks (prevent self-lockout and orphaning).
    if (bodyData.isActive === false) {
      // (a) Cannot deactivate your own account.
      if (id === user.id) {
        set.status = 400;
        return {
          ok: false,
          error: 'cannot_deactivate_self',
          message: 'Anda tidak dapat menonaktifkan akun Anda sendiri.',
        };
      }

      // (b) Cannot deactivate the last remaining active admin.
      const target = await getUserPublicById(id);
      if (target && target.role === 'admin' && target.isActive) {
        const activeAdmins = await countActiveAdmins();
        if (activeAdmins <= 1) {
          set.status = 400;
          return {
            ok: false,
            error: 'last_admin',
            message: 'Tidak dapat menonaktifkan admin aktif terakhir.',
          };
        }
      }
    }

    const updated = await setUserActive(id, bodyData.isActive);
    if (!updated) {
      set.status = 404;
      return { ok: false, error: 'not_found', message: `User ${id} not found` };
    }

    // Return only id and isActive for this convenience endpoint
    return {
      id: updated.id,
      isActive: updated.isActive,
    };
  })

  // ─── DELETE /users/:id ────────────────────────────────────────────────
  // Permanently delete a user. Guards mirror deactivation:
  //  - cannot delete your own account
  //  - cannot delete the last remaining active admin
  // revoked_sessions rows cascade-delete via FK.
  .delete('/:id', async ({ params, user, requireFeature, set }) => {
    requireFeature('user_management');

    const id = parseInt(params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      set.status = 400;
      return { ok: false, error: 'invalid_id', message: 'User ID must be a positive integer' };
    }

    // (a) Cannot delete your own account.
    if (id === user.id) {
      set.status = 400;
      return {
        ok: false,
        error: 'cannot_delete_self',
        message: 'Anda tidak dapat menghapus akun Anda sendiri.',
      };
    }

    // (b) Cannot delete the last remaining active admin.
    const target = await getUserPublicById(id);
    if (!target) {
      set.status = 404;
      return { ok: false, error: 'not_found', message: `User ${id} not found` };
    }
    if (target.role === 'admin' && target.isActive) {
      const activeAdmins = await countActiveAdmins();
      if (activeAdmins <= 1) {
        set.status = 400;
        return {
          ok: false,
          error: 'last_admin',
          message: 'Tidak dapat menghapus admin aktif terakhir.',
        };
      }
    }

    const deleted = await deleteUser(id);
    if (!deleted) {
      set.status = 404;
      return { ok: false, error: 'not_found', message: `User ${id} not found` };
    }

    set.status = 200;
    return { ok: true, id: deleted.id };
  });
