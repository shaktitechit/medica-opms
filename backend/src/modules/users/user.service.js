/**
 * @fileoverview Users: business rules and mongoose persistence helpers.
 * @module modules/users/user.service
 */
const bcrypt = require('bcryptjs');
const { getModels } = require('../../data/mongoRegistry');
const { toPlain } = require('../../utils/mongoJson');
const { ApiError } = require('../../utils/ApiError');
const { sanitizeUser } = require('../../utils/sanitize');
const activityService = require('../activity/activity.service');
const {
  resolveRoleIdsForUser,
  resolveDefaultRoleIdsForDepartment,
  assertRolesExist,
} = require('./userRoles.util');

async function list(query = {}) {
  const filter = { is_active: { $ne: false } };
  if (query.department) {
    filter.department = query.department;
  }
  const rows = await getModels()
    .User.find(filter)
    .populate('roles')
    .sort({ createdAt: -1 })
    .lean();
  return rows.map((u) => sanitizeUser(toPlain(u)));
}

async function get(id) {
  const row = await getModels().User.findById(id).populate('roles').lean();
  if (!row) throw new ApiError(404, 'User not found');
  return sanitizeUser(toPlain(row));
}

async function listRoles() {
  const rows = await getModels().Role.find({ is_active: { $ne: false } }).lean();
  return rows.map(toPlain);
}

async function listPermissions() {
  const rows = await getModels().Permission.find().sort({ code: 1 }).lean();
  return rows.map(toPlain);
}

async function create(body, actor) {
  const email = String(body.email).toLowerCase();

  const { User } = getModels();
  const dup = await User.findOne({ email }).lean();
  if (dup) throw new ApiError(409, 'Email already registered');

  const hash = await bcrypt.hash(body.password || 'ChangeMe123!', 10);

  const roleIds = await resolveRoleIdsForUser(body);
  if (!roleIds.length) {
    throw new ApiError(
      400,
      'At least one role is required. Run `npm run seed:roles` to sync roles, then assign a role or department.'
    );
  }
  await assertRolesExist(roleIds);

  const doc = await User.create({
    name: body.name,
    email,
    phone: body.phone || '',
    password: hash,
    department: body.department,
    roles: roleIds,
    is_active: body.is_active !== false,
  });

  await activityService.create({
    actor: actor._id,
    entity_type: 'user',
    entity_id: doc._id.toString(),
    action: 'created',
    message: `User ${email} created`,
  });

  return sanitizeUser(toPlain(await User.findById(doc._id).populate('roles').lean()));
}

async function update(id, body, actor) {
  const { User } = getModels();
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');

  const email =
    body.email !== undefined ? String(body.email).toLowerCase().trim() : undefined;
  if (email !== undefined) {
    const dup = await User.findOne({ email, _id: { $ne: id } })
      .select('_id')
      .lean();
    if (dup) throw new ApiError(409, 'Email already registered');
    user.email = email;
  }
  if (body.name !== undefined) user.name = body.name;
  if (body.phone !== undefined) user.phone = body.phone;
  if (body.department !== undefined) user.department = body.department;
  if (body.is_active !== undefined) user.is_active = body.is_active;
  const rolePayloadTouched =
    body.roles !== undefined || body.roleCode !== undefined || body.role !== undefined;
  const departmentChanged =
    body.department !== undefined && String(body.department) !== String(user.department);

  if (rolePayloadTouched) {
    const roleIds = await resolveRoleIdsForUser(body);
    await assertRolesExist(roleIds);
    user.roles = roleIds;
  } else if (departmentChanged) {
    const roleIds = await resolveDefaultRoleIdsForDepartment(body.department);
    await assertRolesExist(roleIds);
    user.roles = roleIds;
  }
  if (body.password !== undefined && String(body.password).length > 0) {
    user.password = await bcrypt.hash(body.password, 10);
  }

  await user.save();

  await activityService.create({
    actor: actor._id,
    entity_type: 'user',
    entity_id: user._id.toString(),
    action: 'updated',
    message: `User ${user.email} updated`,
  });

  return sanitizeUser(toPlain(await User.findById(id).populate('roles').lean()));
}

module.exports = {
  list,
  get,
  create,
  update,
  listRoles,
  listPermissions,
};
