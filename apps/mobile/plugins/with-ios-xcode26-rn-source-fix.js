const { withDangerousMod, withPodfileProperties } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const FMT_CXX17_PATCH = `    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'

      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end`;

function withIosXcode26RnSourceFix(config) {
  config = withPodfileProperties(config, (config) => {
    config.modResults["ios.buildReactNativeFromSource"] = "true";
    return config;
  });

  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      const podfile = fs.readFileSync(podfilePath, "utf8");
      if (podfile.includes("target.name == 'fmt'")) {
        return config;
      }

      const postInstallPattern =
        /(react_native_post_install\(\n\s+installer,\n\s+config\[:reactNativePath\],\n\s+:mac_catalyst_enabled => false,\n\s+:ccache_enabled => ccache_enabled\?\(podfile_properties\),\n\s+\)\n)/;
      const patched = podfile.replace(postInstallPattern, `$1\n${FMT_CXX17_PATCH}\n`);

      if (patched === podfile) {
        throw new Error("Unable to insert fmt C++17 workaround into ios/Podfile");
      }

      fs.writeFileSync(podfilePath, patched);
      return config;
    },
  ]);
}

module.exports = withIosXcode26RnSourceFix;
