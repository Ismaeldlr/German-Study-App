/**
 * Release builds block plain HTTP. This lets the app reach a local server
 * over HTTP, such as the mock LLM at 10.0.2.2:8787 on the Android emulator,
 * and nothing else: every real provider is HTTPS. Debug builds keep plain
 * HTTP everywhere, which the dev server needs.
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const RELEASE = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`;

const DEBUG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`;

function write(root, variant, xml) {
  const dir = path.join(root, 'app', 'src', variant, 'res', 'xml');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'network_security_config.xml'), xml);
}

module.exports = function withLocalCleartext(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      write(cfg.modRequest.platformProjectRoot, 'main', RELEASE);
      write(cfg.modRequest.platformProjectRoot, 'debug', DEBUG);
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    return cfg;
  });
};
