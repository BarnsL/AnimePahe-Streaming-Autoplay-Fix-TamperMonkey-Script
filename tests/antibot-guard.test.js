'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'animepahe-autonext-v2.user.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const packageJson = require('../package.json');

const metadataVersion = source.match(/^\/\/ @version\s+(\S+)$/m);
assert.ok(metadataVersion, 'userscript metadata version must exist');
assert.equal(
  metadataVersion[1],
  packageJson.version,
  'userscript metadata and package release-check versions must match'
);

function extractFunction(functionName) {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${functionName} must exist`);

  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not extract ${functionName}`);
}

const guardSource = extractFunction('detectAntiBotChallengeDocument');

function classifyChallenge({
  hostname = 'animepahe.pw',
  pathname = '/',
  title = '',
  bodyText = '',
  matchedSelectorContains = ''
} = {}) {
  const sandbox = {
    location: { hostname, pathname },
    document: {
      title,
      body: { textContent: bodyText },
      querySelector(selector) {
        return matchedSelectorContains && selector.includes(matchedSelectorContains) ? {} : null;
      }
    }
  };

  return vm.runInNewContext(`(${guardSource})()`, sandbox);
}

function assertDetected(input, expectedProvider, expectedReason) {
  const result = classifyChallenge(input);
  assert.equal(result.detected, true, `expected challenge: ${JSON.stringify(input)}`);
  assert.equal(result.provider, expectedProvider);
  if (expectedReason) {
    assert.equal(result.reason, expectedReason);
  }
}

function assertAllowed(input) {
  const result = classifyChallenge(input);
  assert.equal(result.detected, false, `expected normal document: ${JSON.stringify(input)}`);
  assert.equal(result.provider, null);
  assert.equal(result.reason, null);
}

assertDetected({
  title: 'Just a moment...',
  bodyText: 'Verifying you are human. Performance and Security by Cloudflare. Ray ID: abc123'
}, 'Cloudflare', 'challenge-title-and-copy');

assertDetected({
  pathname: '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1'
}, 'Cloudflare', 'challenge-path');

assertDetected({
  pathname: '/_sec/cp_challenge/verify'
}, 'Akamai', 'challenge-path');

assertDetected({
  pathname: '/_Incapsula_Resource/'
}, 'Imperva', 'challenge-path');

assertDetected({
  pathname: '/.well-known/ddos-guard/check'
}, 'DDoS-Guard', 'challenge-path');

const strongShellCases = [
  ['#challenge-running', 'Cloudflare'],
  ['#px-captcha', 'HUMAN/PerimeterX'],
  ['#datadome-captcha', 'DataDome'],
  ['#incapsula-error-page', 'Imperva'],
  ['#aws-waf-captcha', 'AWS WAF'],
  ['#ddg-challenge', 'DDoS-Guard'],
  ['/_sec/cp_challenge/', 'Akamai']
];

for (const [selector, provider] of strongShellCases) {
  assertDetected({ matchedSelectorContains: selector }, provider, 'challenge-shell');
}

assertDetected({
  title: 'Security verification',
  bodyText: 'Complete the security check to continue.'
}, 'Unknown', 'challenge-title-and-copy');

assertDetected({
  title: 'Just a moment...',
  matchedSelectorContains: 'challenge-platform'
}, 'Cloudflare', 'challenge-title-and-asset');

assertDetected({
  title: 'CAPTCHA challenge',
  bodyText: 'Complete the CAPTCHA to continue.',
  matchedSelectorContains: 'hcaptcha.com'
}, 'hCaptcha', 'challenge-title-and-asset');

assertDetected({
  title: 'Robot check',
  bodyText: "I'm not a robot.",
  matchedSelectorContains: 'google.com/recaptcha/'
}, 'Google reCAPTCHA', 'challenge-title-and-asset');

assertDetected({
  title: 'Security verification',
  bodyText: 'Press and hold to verify that you are human.',
  matchedSelectorContains: 'captcha.px-cdn.net'
}, 'HUMAN/PerimeterX', 'challenge-title-and-asset');

assertDetected({
  title: 'AnimePahe',
  bodyText: 'DataDome bot verification is in progress.',
  matchedSelectorContains: 'captcha-delivery.com'
}, 'DataDome', 'provider-copy-and-asset');

assertDetected({
  title: 'AnimePahe',
  bodyText: 'Arkose Labs bot verification. Complete the CAPTCHA.',
  matchedSelectorContains: 'arkoselabs.com'
}, 'Arkose Labs', 'provider-copy-and-asset');

assertAllowed({
  title: 'AnimePahe',
  bodyText: 'Latest anime episodes'
});

assertAllowed({
  title: 'AnimePahe Login',
  bodyText: 'Sign in to continue',
  matchedSelectorContains: 'cf-turnstile-response'
});

assertAllowed({
  title: 'AnimePahe Login',
  bodyText: 'Sign in to continue',
  matchedSelectorContains: 'hcaptcha.com'
});

assertAllowed({
  title: 'Please wait for the episode list',
  bodyText: 'Loading episodes'
});

assertAllowed({
  title: 'AnimePahe',
  bodyText: 'Cloudflare powers part of our infrastructure.'
});

assertAllowed({
  title: 'AnimePahe',
  matchedSelectorContains: 'captcha-delivery.com'
});

assertAllowed({
  hostname: 'kwik.cx',
  title: 'Just a moment...',
  bodyText: 'Cloudflare'
});

assertAllowed({
  hostname: 'example.com',
  pathname: '/cdn-cgi/challenge-platform/',
  title: 'Just a moment...',
  bodyText: 'Cloudflare'
});

const guardCall = 'const antiBotChallenge = detectAntiBotChallengeDocument();';
assert.ok(
  source.indexOf(guardCall) < source.indexOf('main();'),
  'anti-bot guard must run before main()'
);

const forbiddenSideEffect = (name) => function forbiddenCall() {
  throw new Error(`Anti-bot document triggered forbidden side effect: ${name}`);
};

vm.runInNewContext(source, {
  console: { info() {}, log() {}, warn() {}, error() {} },
  location: { hostname: 'animepahe.pw', pathname: '/', href: 'https://animepahe.pw/' },
  document: {
    title: 'Just a moment...',
    body: {
      textContent: 'Verifying you are human. Performance and Security by Cloudflare.',
      appendChild: forbiddenSideEffect('document.body.appendChild')
    },
    querySelector() {
      return { id: 'challenge-running' };
    },
    getElementById: forbiddenSideEffect('document.getElementById'),
    createElement: forbiddenSideEffect('document.createElement')
  },
  GM_getValue: forbiddenSideEffect('GM_getValue'),
  GM_setValue: forbiddenSideEffect('GM_setValue'),
  addEventListener: forbiddenSideEffect('addEventListener'),
  setInterval: forbiddenSideEffect('setInterval'),
  setTimeout: forbiddenSideEffect('setTimeout'),
  MutationObserver: forbiddenSideEffect('MutationObserver'),
  history: {
    pushState: forbiddenSideEffect('history.pushState'),
    replaceState: forbiddenSideEffect('history.replaceState')
  }
});

console.log('Anti-bot guard regression tests passed.');
