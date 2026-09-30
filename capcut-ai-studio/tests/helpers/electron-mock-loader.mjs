// Node loader cho test service Electron chay bang Node:
//  - `import ... from 'electron'` -> ban gia lap (electron-mock.mjs)
//  - import tuong doi khong duoi (kieu bundler: './paths') -> thu them '.ts'
export async function resolve(specifier, context, next) {
  if (specifier === 'electron') return { url: new URL('./electron-mock.mjs', import.meta.url).href, shortCircuit: true }
  try {
    return await next(specifier, context)
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]s$/.test(specifier)) {
      return next(specifier + '.ts', context)
    }
    throw e
  }
}
