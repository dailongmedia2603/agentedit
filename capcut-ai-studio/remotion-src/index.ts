// Entry cho @remotion/bundler (scripts/bundle-remotion.mjs). Player trong app
// import thang ./AutoEdit, khong di qua file nay.
import { registerRoot } from 'remotion'
import { RemotionRoot } from './Root'

registerRoot(RemotionRoot)
