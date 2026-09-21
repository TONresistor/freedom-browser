const { rewriteGatewayLocation } = require('./gateway-location');

// The contract both transports depend on, pinned here so neither caller's suite
// is the only thing holding it: given a gateway-space `Location` and the
// gateway URL the request went to, produce a reference that resolves to the
// same content when Chromium applies it to the custom-scheme URL instead — or
// `null` when the target cannot be expressed that way and must be passed
// through exactly as the gateway wrote it.
describe('rewriteGatewayLocation', () => {
  const CID = 'bafybeidirectory';
  const REF = 'a'.repeat(64);

  test("rewrites Kubo's hash-rooted directory redirect", () => {
    expect(
      rewriteGatewayLocation(`/ipfs/${CID}/docs/`, `http://127.0.0.1:8080/ipfs/${CID}/docs`)
    ).toBe('./docs/');
  });

  test("rewrites Bee's hash-rooted directory redirect", () => {
    expect(
      rewriteGatewayLocation(`/bzz/${REF}/blog/`, `http://127.0.0.1:1633/bzz/${REF}/blog`)
    ).toBe('./blog/');
  });

  test('keeps query and fragment on the rewritten reference', () => {
    expect(
      rewriteGatewayLocation(
        `/bzz/${REF}/blog/?page=2#top`,
        `http://127.0.0.1:1633/bzz/${REF}/blog`
      )
    ).toBe('./blog/?page=2#top');
  });

  test('accepts a same-origin absolute Location', () => {
    expect(
      rewriteGatewayLocation(
        `http://127.0.0.1:1633/bzz/${REF}/blog/`,
        `http://127.0.0.1:1633/bzz/${REF}/blog`
      )
    ).toBe('./blog/');
  });

  test('is idempotent on a reference that is already relative', () => {
    expect(rewriteGatewayLocation('./blog/', `http://127.0.0.1:1633/bzz/${REF}/blog`)).toBe(
      './blog/'
    );
  });

  test('stays `./` when the target is the request directory itself', () => {
    expect(
      rewriteGatewayLocation(`/bzz/${REF}/blog/`, `http://127.0.0.1:1633/bzz/${REF}/blog/`)
    ).toBe('./');
  });

  // `./` is load-bearing: a bare `re:port/` parses as an absolute URL with
  // scheme `re:` (RFC 3986 §4.2), and `:` is a legal path segment on both
  // transports.
  test('prefixes `./` so a colon-bearing first segment is not read as a scheme', () => {
    const out = rewriteGatewayLocation(
      `/bzz/${REF}/re:port/`,
      `http://127.0.0.1:1633/bzz/${REF}/re:port`
    );
    expect(out).toBe('./re:port/');
    expect(new URL(out, 'bzz://meinhard.eth/re:port').toString()).toBe(
      'bzz://meinhard.eth/re:port/'
    );
  });

  test('declines a target that climbs out of the request directory', () => {
    expect(
      rewriteGatewayLocation(
        `/bzz/${'b'.repeat(64)}/blog/`,
        `http://127.0.0.1:1633/bzz/${REF}/blog`
      )
    ).toBeNull();
  });

  test('declines a cross-origin target', () => {
    expect(
      rewriteGatewayLocation(
        'http://127.0.0.1:5000/secret',
        `http://127.0.0.1:1633/bzz/${REF}/blog`
      )
    ).toBeNull();
  });

  test('declines an unparseable request URL', () => {
    expect(rewriteGatewayLocation('/bzz/x/', 'not a url')).toBeNull();
  });
});
