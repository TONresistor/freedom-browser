/**
 * Translate a gateway redirect's `Location` into the custom-scheme URL space.
 *
 * Shared by both content-addressed transports that proxy an HTTP gateway
 * behind a custom scheme: `ipfs://` / `ipns://` (see `ipfs-manager.js`) and
 * `bzz://` (see `swarm/bzz-protocol.js`). Both glue a `/<ns>/<ref>` prefix in
 * front of the custom-scheme path to build the gateway URL, so both have the
 * same problem with a gateway-space `Location`, and both must fix it the same
 * way — hence one helper rather than a copy per transport.
 */

// A gateway redirect is written in the gateway's own URL space, but Chromium
// resolves it against the `ipfs://` / `ipns://` / `bzz://` request URL — it
// never saw the gateway origin. The canonical directory redirect is the
// everyday case: Kubo answers `GET /ipfs/<cid>/docs` with
// `301 Location: /ipfs/<cid>/docs/` (measured against a default-config Kubo
// 0.42.0 on 2026-09-14), and Bee/Ant answers `GET /bzz/<ref>/blog` for a
// directory with `308 Location: /bzz/<ref>/blog/` (upstream's
// `pkg/api/bzz.go` appends `/` to `r.URL` and calls `http.Redirect(...,
// StatusPermanentRedirect)`; read 2026-09-21, and reported as the observed
// behaviour in #95). Resolved against `ipfs://<cid>/docs` / `bzz://<name>/blog`
// those yield `ipfs://<cid>/ipfs/<cid>/docs/` / `bzz://<name>/bzz/<ref>/blog/` —
// a doubled path that 404s, leaks the resolved hash into the address bar and
// leaves the mangled URL there. So every directory URL typed, bookmarked or
// linked without its trailing slash breaks.
//
// The gateway path is the custom-scheme path with a `/<ns>/<ref>` prefix glued
// in front (see `buildGatewayUrl` in ipfs/ipfs-protocol.js and
// swarm/bzz-protocol.js), and the prefix is whatever the host resolved to — a
// CID, an IPNS key, a Swarm ref, or an Ethereum name whose contenthash carries
// its own base path, none of which this layer knows. A *relative* reference
// computed from the request's gateway path is therefore the one rewrite that
// resolves identically in both spaces, whatever the prefix is, so a
// same-directory-or-below target is re-expressed that way. A target that would
// need to climb out of the request's directory can't be expressed without
// knowing how deep the prefix goes, so it is passed through untouched — as is
// any cross-origin Location, which Chromium applies the normal cross-origin
// rules to (a hostile gateway must not be able to aim the custom-scheme origin
// at a loopback service; see the `redirect: 'manual'` notes at both call
// sites).
//
// `requestUrl` is the *gateway* URL the request was issued to, not the
// custom-scheme URL: the relative reference is computed against the gateway
// path and then resolved by Chromium against the custom-scheme path, which is
// exactly why it has to be relative.
//
// Returns the rewritten reference, or `null` when the Location must be left
// exactly as the gateway wrote it.
function rewriteGatewayLocation(location, requestUrl) {
  let requested;
  let target;
  try {
    requested = new URL(requestUrl);
    target = new URL(location, requested);
  } catch {
    return null;
  }
  if (target.origin !== requested.origin) return null;

  // Everything up to and including the last `/` of the request path — the
  // directory a relative reference is resolved against on both sides.
  const dir = requested.pathname.slice(0, requested.pathname.lastIndexOf('/') + 1);
  if (!dir || !target.pathname.startsWith(dir)) return null;

  const relative = target.pathname.slice(dir.length);
  // Always `./`-prefixed, never bare. A bare relative reference whose first
  // segment contains a `:` is parsed as an absolute URL with that segment as
  // its *scheme* (RFC 3986 §4.2 / the WHATWG URL parser), and `:` is a legal
  // UnixFS / Swarm manifest directory name: `ipfs://<cid>/re:port` → Kubo's
  // `301 Location: /ipfs/<cid>/re:port/` → bare `re:port/` would be read as
  // scheme `re:` and fail the navigation instead of opening the directory.
  // The prefix also keeps a name that starts the relative part with `/` or `//`
  // (a doubled slash in the gateway path) from resolving against the origin
  // root or being read as a scheme-relative authority. It is a no-op for the
  // everyday `docs/` case (`./docs/` resolves identically) and for the empty
  // target-is-the-directory case, which stays `./`.
  return `./${relative}${target.search}${target.hash}`;
}

module.exports = { rewriteGatewayLocation };
