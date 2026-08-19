// Learn more: https://docs.expo.dev/guides/monorepo/
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

/**
 * Monorepo wiring. The shared packages are consumed as TypeScript SOURCE rather
 * than as a built `dist`, which is what makes editing a type in
 * `packages/types` show up here without a build step. For that to work Metro has
 * to be told two things:
 */

// 1. Watch the whole workspace, or a change in packages/* never triggers a reload.
config.watchFolders = [workspaceRoot];

// 2. Resolve from both node_modules trees. npm hoists most things to the root,
//    but a version conflict can leave a package installed locally, and Metro
//    only looks where it is told.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Force a single copy of React and React Native. Two copies is the classic
// monorepo failure — hooks throw "invalid hook call" with no useful stack.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
