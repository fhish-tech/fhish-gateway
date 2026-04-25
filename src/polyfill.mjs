import crypto from 'node:crypto';

const fakeSelf = {
  addEventListener: () => {},
  removeEventListener: () => {},
  postMessage: () => {},
  dispatchEvent: () => true,
  crypto: crypto.webcrypto,
  msCrypto: crypto.webcrypto,
  getRandomValues: (arr) => {
    const bytes = crypto.randomBytes(arr.byteLength);
    arr.set(bytes);
    return arr;
  },
};
(globalThis).self = fakeSelf;
(globalThis).globalThis = fakeSelf;
(globalThis).global = fakeSelf;
(globalThis).window = fakeSelf;
