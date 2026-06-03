'use strict';
/**
 * @fileoverview Mongoose plugin: softDelete.plugin.
 * @module plugins/softDelete.plugin
 */

const WITH_DELETED = 'withDeleted';

/**
 * Mongoose soft-delete plugin (Mongoose 8).
 *
 * @param {import('mongoose').Schema} schema
 * @param {{
 *   mode?: 'deletedAt' | 'boolean',
 *   deletedAtField?: string,
 *   booleanField?: string,
 *   index?: boolean,
 * }} [options]
 *
 * - `deletedAt` (default): adds `deletedAt`; active rows have `null`.
 * - `boolean`: uses `is_deleted` (or `booleanField`); active rows are `false` / absent.
 *
 * Queries exclude soft-deleted documents unless `.withDeleted()` is chained.
 *
 * Adds:
 * - `doc.softDelete()` / `doc.restore()`
 * - `schema.query.withDeleted()`
 * - `Model.findWithDeleted()`, `Model.findDeletedOnly()`
 */
module.exports = function softDeletePlugin(schema, options = {}) {
  const mode = options.mode || 'deletedAt';
  const deletedAtField = options.deletedAtField || 'deletedAt';
  const booleanField = options.booleanField || 'is_deleted';
  const index = options.index !== false;

  if (mode === 'deletedAt') {
    if (!schema.path(deletedAtField)) {
      schema.add({
        [deletedAtField]: { type: Date, default: null, index },
      });
    }
  } else if (mode === 'boolean') {
    if (!schema.path(booleanField)) {
      schema.add({
        [booleanField]: { type: Boolean, default: false, index },
      });
    }
  }

  /** @param {import('mongoose').Query} q */
  function applyExcludeDeleted(q) {
    const opts = q.getOptions?.() ?? {};
    if (opts[WITH_DELETED]) return;

    const filter = q.getFilter?.() ?? {};
    if (mode === 'deletedAt') {
      if (Object.prototype.hasOwnProperty.call(filter, deletedAtField)) return;
      q.where({ [deletedAtField]: null });
    } else {
      if (Object.prototype.hasOwnProperty.call(filter, booleanField)) return;
      q.where({ [booleanField]: { $ne: true } });
    }
  }

  const queryMiddlewareOps = [
    'countDocuments',
    'deleteMany',
    'deleteOne',
    'distinct',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndUpdate',
    'replaceOne',
    'updateOne',
    'updateMany',
  ];

  queryMiddlewareOps.forEach((hook) => {
    schema.pre(hook, function (next) {
      applyExcludeDeleted(this);
      next();
    });
  });

  schema.query.withDeleted = function withDeleted() {
    this.setOptions({ [WITH_DELETED]: true });
    return this;
  };

  schema.methods.softDelete = async function softDelete() {
    if (mode === 'deletedAt') {
      this.set(deletedAtField, new Date());
    } else {
      this.set(booleanField, true);
    }
    return this.save();
  };

  schema.methods.restore = async function restore() {
    if (mode === 'deletedAt') {
      this.set(deletedAtField, null);
    } else {
      this.set(booleanField, false);
    }
    return this.save();
  };

  schema.statics.findWithDeleted = function findWithDeleted(conditions, projection, opts) {
    return this.find(conditions, projection, opts).withDeleted();
  };

  schema.statics.findDeletedOnly = function findDeletedOnly(conditions, projection, opts) {
    const base =
      conditions && typeof conditions === 'object' && !Array.isArray(conditions)
        ? { ...conditions }
        : {};

    if (mode === 'deletedAt') {
      base[deletedAtField] = { $ne: null };
    } else {
      base[booleanField] = true;
    }
    return this.find(base, projection, opts).withDeleted();
  };
};
