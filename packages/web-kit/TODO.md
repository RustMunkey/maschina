# @maschina/web-kit

Shared primitives for all Maschina web apps (apps/auth, apps/web, apps/docs).

## TODO

### Components to extract from apps/auth
- [ ] ErrorBoundary — class component, error UI with noise/glow
- [ ] Noise — canvas grain texture (patternAlpha, patternRefreshInterval props)
- [ ] ScrollIndicator — 48-tick scroll progress bars, left + right edges
- [ ] SessionExpiredModal — focus-trapped modal, return_to support
- [ ] NotFound — 404 page
- [ ] Button — CVA button, all variants + sizes, asChild support
- [ ] Toaster — pre-configured sonner with brand colors (#F84242 error, green success)

### Components to extract from apps/web / apps/docs
- [ ] ScrambleText — bracket scramble animation

### Error status pages (from apps/auth)
- [ ] 400, 401, 403, 408, 410, 422, 429, 500, 502, 503, 504

### Utilities
- [ ] cn() — clsx + tailwind-merge
- [ ] sentryInit(dsn) — thin wrapper around @sentry/react init
- [ ] createQueryClient() — factory with staleTime:30s, retry:1
- [ ] theme — constants: ACCENT, BG, BORDER_*, opacity scales

### Hooks
- [ ] useOnlineStatus() — online/offline event listeners
- [ ] useSessionExpired() — checks ?session_expired query param

## Package shape

```
packages/web-kit/
  src/
    components/
      errors/
    hooks/
    lib/
    index.ts
  package.json
  tsconfig.json
```

## Notes
- Does NOT include auth-flow-specific code (OTP inputs, magic link, OAuth callbacks)
- Does NOT duplicate anything already in @maschina/ui
- Consumed as @maschina/web-kit in each app's package.json
