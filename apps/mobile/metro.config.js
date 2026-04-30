const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("node:path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// react-native-fast-tflite ships .tflite weights as bundled assets; Metro
// only inlines extensions listed in `assetExts`, so opt-in here.
if (!config.resolver.assetExts.includes("tflite")) {
  config.resolver.assetExts.push("tflite");
}

// pnpm + Metro: Metro must follow symlinks so `node_modules/<pkg>` (which pnpm
// links into `.pnpm/<pkg>@<ver>/node_modules/<pkg>`) and the transitive deps
// nested inside that resolve correctly.
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Watch the whole monorepo so workspace imports (@advance-seeds/*) hot-reload.
config.watchFolders = [monorepoRoot];

// Look in both the app's node_modules and the monorepo root's. Hierarchical
// lookup stays enabled so transitive deps that live deep in pnpm's structure
// also resolve via parent traversal.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Workspace TS sources use `.js` import extensions (required by
// `verbatimModuleSyntax` in tsconfig.base) and rely on the resolver to find
// the actual `.ts` file. Vite does this automatically; Metro doesn't, so we
// rewrite `.js` → bare path inside our packages/* sources.
const pkgSrcRe = /[/\\]packages[/\\][^/\\]+[/\\]src[/\\]/;
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName.startsWith(".") &&
    moduleName.endsWith(".js") &&
    pkgSrcRe.test(context.originModulePath)
  ) {
    const stripped = moduleName.replace(/\.js$/, "");
    try {
      return context.resolveRequest(context, stripped, platform);
    } catch {
      // fall through to default
    }
  }
  return upstreamResolve
    ? upstreamResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
