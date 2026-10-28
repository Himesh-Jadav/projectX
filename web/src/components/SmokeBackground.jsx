import { useEffect, useRef } from 'react'

const VERT = `attribute vec4 a_position; void main(){ gl_Position = a_position; }`
const FRAG = `
precision mediump float;
uniform vec2 iResolution; uniform float iTime; uniform vec2 iMouse;
uniform vec3 u_c1; uniform vec3 u_c2; uniform float u_gain;
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 uv = fc / iResolution;
  vec2 p = (2.0 * fc - iResolution) / min(iResolution.x, iResolution.y);
  float t = iTime * 0.22;
  vec2 rc = 2.0 * (iMouse / iResolution) - 1.0;
  vec2 d = p;
  for (float i = 1.0; i < 8.0; i++) {
    d.x += 0.5 / i * cos(i * 2.0 * d.y + t + rc.x * 3.1415);
    d.y += 0.5 / i * cos(i * 2.0 * d.x + t + rc.y * 3.1415);
  }
  float glow = smoothstep(0.9, 0.2, abs(sin(d.x + d.y + t)));
  float k = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(d.x * 0.9 - d.y * 0.6 + t * 0.7)) * 0.6;
  float vig = 1.0 - 0.55 * smoothstep(0.25, 0.95, distance(uv, vec2(0.5)));
  gl_FragColor = vec4(mix(u_c1, u_c2, k) * glow * u_gain * vig, 1.0);
}`

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)

const SmokeBackground = ({ gain = 0.5, interactive = true, className = '' }) => {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) return // the calm layer underneath stays visible

    const compile = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return s
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_position')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const u = (n) => gl.getUniformLocation(prog, n)
    const uRes = u('iResolution')
    const uTime = u('iTime')
    const uMouse = u('iMouse')
    gl.uniform3fv(u('u_c1'), rgb('#1BA3E6')) // cerulean-500
    gl.uniform3fv(u('u_c2'), rgb('#FF3D8B')) // neon-500
    gl.uniform1f(u('u_gain'), gain)

    const SCALE = 0.5
    const m = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }
    const onMove = (e) => {
      m.tx = e.clientX / window.innerWidth
      m.ty = 1 - e.clientY / window.innerHeight
    }
    if (interactive) window.addEventListener('pointermove', onMove, { passive: true })

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t0 = performance.now()
    let raf = 0

    const draw = (now) => {
      const w = Math.max(2, Math.floor(canvas.clientWidth * SCALE))
      const h = Math.max(2, Math.floor(canvas.clientHeight * SCALE))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      m.x += (m.tx - m.x) * 0.04
      m.y += (m.ty - m.y) * 0.04 // smooth, no snapping
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uTime, reduce ? 12 : (now - t0) / 1000)
      gl.uniform2f(uMouse, m.x * w, m.y * h)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      raf = !reduce && !document.hidden ? requestAnimationFrame(draw) : 0
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    document.addEventListener('visibilitychange', kick)
    window.addEventListener('resize', kick)
    kick()

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', kick)
      window.removeEventListener('resize', kick)
      if (interactive) window.removeEventListener('pointermove', onMove)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [gain, interactive])

  return <canvas ref={ref} aria-hidden="true" className={`absolute inset-0 h-full w-full ${className}`} />
}

export default SmokeBackground
