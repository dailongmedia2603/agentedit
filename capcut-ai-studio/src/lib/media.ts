// Doc thoi luong + anh thumbnail cua 1 video tren may (dung chung Tao video / Video Remotion)
export async function loadVideoMeta(path: string): Promise<{ duration: number; thumb?: string }> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    v.src = `file://${path}`
    let done = false
    const finish = (duration: number, thumb?: string) => {
      if (done) return
      done = true
      resolve({ duration, thumb })
    }
    v.onloadedmetadata = () => {
      const dur = v.duration || 0
      v.currentTime = Math.min(1, dur / 2)
    }
    v.onseeked = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = Math.round((160 * (v.videoHeight || 16)) / (v.videoWidth || 9))
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(v, 0, 0, canvas.width, canvas.height)
        finish(v.duration || 0, canvas.toDataURL('image/jpeg', 0.6))
      } catch {
        finish(v.duration || 0)
      }
    }
    v.onerror = () => finish(0)
    setTimeout(() => finish(v.duration || 0), 5000)
  })
}
