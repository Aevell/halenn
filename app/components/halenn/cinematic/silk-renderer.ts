// Deform the selected fabric texture locally; the logo never enters this renderer.
const vertexSource = `
  attribute vec2 aPosition;
  varying vec2 vUv;
  void main() {
    vUv = aPosition * .5 + .5;
    gl_Position = vec4(aPosition, 0., 1.);
  }
`;

const fragmentSource = `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uTexture;
  uniform float uScroll;
  uniform float uTime;
  void main() {
    vec2 uv = vUv;
    float t = uScroll * 2.4 + uTime * .24;
    // Slow local ripples keep the cloth alive without moving the entire image.
    float envelope = smoothstep(0., .15, uv.x) * (1. - smoothstep(.85, 1., uv.x))
                   * smoothstep(0., .12, uv.y) * (1. - smoothstep(.88, 1., uv.y));
    float fold = uv.x * 8.5 + uv.y * 2.8 - t;
    float counterFold = uv.x * 13. - uv.y * 4.5 + t * .61;
    vec2 bend = vec2(
      .007 * sin(uv.y * 8. + uv.x * 2. + t * .73),
      .017 * sin(fold) + .006 * sin(counterFold)
    ) * envelope;
    vec3 silk = texture2D(uTexture, uv + bend).rgb;
    // A restrained change in fold shading, with no additional bright surface.
    float shade = 1. + .07 * cos(fold) * envelope;
    gl_FragColor = vec4(silk * shade, 1.);
  }
`;

export function createSilkRenderer(canvas: HTMLCanvasElement, image: HTMLImageElement) {
  const gl = canvas.getContext("webgl", {
    alpha: false, antialias: false, depth: false, stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  const dispose = () => {
    shaders.forEach((shader) => gl.deleteShader(shader));
    gl.deleteBuffer(buffer);
    gl.deleteTexture(texture);
    gl.deleteProgram(program);
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!program || !buffer || !texture || !vertex || !fragment) { dispose(); return null; }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { dispose(); return null; }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  } catch {
    dispose();
    return null;
  }
  gl.uniform1i(gl.getUniformLocation(program, "uTexture"), 0);
  const scroll = gl.getUniformLocation(program, "uScroll");
  const time = gl.getUniformLocation(program, "uTime");
  return {
    resize(width: number, height: number) {
      // Bound texture work even on high-DPI screens; this surface is only 15% visible.
      const ratio = Math.min(devicePixelRatio || 1, 1.25, 1400 / Math.max(1, width));
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(phase: number, seconds: number) {
      gl.uniform1f(scroll, phase);
      gl.uniform1f(time, seconds);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose,
  };
}
