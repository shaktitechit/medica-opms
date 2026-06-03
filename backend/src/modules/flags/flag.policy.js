/**
 * @fileoverview Flags: policy checks (ownership / dept / state).
 * @module modules/flags/flag.policy
 */
const workflowRules = require('../workflow/workflow.rules');
const { isValidFlagType } = require('../../constants/flagTypes');

module.exports = {
  flagBlocksTransition: workflowRules.flagBlocksTransition,
  isValidFlagType,
};
