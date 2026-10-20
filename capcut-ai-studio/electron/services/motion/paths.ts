import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { ENGINE_HOME } from '../paths'

/** Du lieu "Tao video" + "Automation Video": jobs.json, automation.json, jobs/<id>/, skill/<phien-ban>/, cache/ */
export const MOTION_HOME = join(ENGINE_HOME, 'motion')
export const MOTION_JOBS_DIR = join(MOTION_HOME, 'jobs')

/** Skill dong goi: prod <Resources>/skills/motionmaxxing ; dev <project>/skills/motionmaxxing */
export function bundledSkillDir(name = 'motionmaxxing'): string {
  if (app.isPackaged) return join(process.resourcesPath, 'skills', name)
  const dev = join(app.getAppPath(), 'skills', name)
  return existsSync(dev) ? dev : join(process.cwd(), 'skills', name)
}
