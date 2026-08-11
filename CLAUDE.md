# Verification

Before pushing frontend changes, run the real production build:

```
cd client && npm run build
```

This runs `tsc -b && vite build`, which is what Railway runs on deploy.

**Do not rely on `tsc --noEmit` from the client root.** `client/tsconfig.json`
uses `"files": []` with only project references, so `tsc --noEmit` there
compiles nothing and always exits 0. It will not surface `noUnusedLocals`,
`noUnusedParameters`, or any other error from `tsconfig.app.json`. If those
errors slip through, `tsc -b` fails on Railway and the deploy silently
sticks on the previous good build.

If you need a check that is faster than a full build, `npx tsc -b` from the
client directory is enough - it walks the references and honours the app
tsconfig.
