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

const guardSource = extractFunction('isCloudflareChallengeDocument');

function detectsChallenge({
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

assert.equal(detectsChallenge({
  title: 'Just a moment...',
  bodyText: 'Verifying you are human. Performance and Security by Cloudflare.'
}), true);

assert.equal(detectsChallenge({
  pathname: '/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1'
}), true);

assert.equal(detectsChallenge({
  matchedSelectorContains: '#challenge-running'
}), true);

assert.equal(detectsChallenge({
  title: 'Just a moment...',
  matchedSelectorContains: 'challenge-platform'
}), true);

assert.equal(detectsChallenge({
  title: 'AnimePahe',
  bodyText: 'Latest anime episodes'
}), false);

assert.equal(detectsChallenge({
  title: 'AnimePahe Login',
  bodyText: 'Sign in to continue',
  matchedSelectorContains: 'cf-turnstile-response'
}), false);

assert.equal(detectsChallenge({
  hostname: 'kwik.cx',
  title: 'Just a moment...',
  bodyText: 'Cloudflare'
}), false);

const guardCall = 'if (isCloudflareChallengeDocument())';
assert.ok(
  source.indexOf(guardCall) < source.indexOf('main();'),
  'Cloudflare guard must run before main()'
);

const forbiddenSideEffect = (name) => function forbiddenCall() {
  throw new Error(`Challenge document triggered forbidden side effect: ${name}`);
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

console.log('Cloudflare guard regression tests passed.');
