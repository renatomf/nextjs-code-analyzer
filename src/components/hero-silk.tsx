"use client";

import { useEffect, useRef } from "react";

const VERTEX = `
attribute vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Soft, slow-moving folds of dark fabric with a faint grain.
const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uv;
  p.x *= uRes.x / uRes.y;

  float t = uTime * 0.22;
  float a = -0.55;
  p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p * 2.1;

  float warp = sin(p.y * 1.6 + t * 1.3) * 0.55 + sin(p.y * 0.7 - t * 0.8) * 0.8;
  float f = sin(p.x * 2.4 + warp + t);
  float g = sin(p.x * 1.3 - p.y * 0.9 + sin(p.x * 0.8 - t * 1.1) * 1.6 - t * 0.7);
  float h = f * 0.62 + g * 0.38;

  float lit = pow(h * 0.5 + 0.5, 2.2);
  float crease = pow(max(0.0, 1.0 - abs(h - 0.6) * 3.0), 3.0);

  vec3 col = vec3(0.015) + vec3(0.24) * lit + vec3(0.1) * crease;

  // Keep the headline side calm: fade the folds toward the top-left.
  float focus = smoothstep(0.05, 0.95, uv.x * 0.75 + (1.0 - uv.y) * 0.35);
  col *= mix(0.55, 1.0, focus);

  col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function HeroSilk({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", {
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!canvas || !gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");

    // The folds are soft, so rendering below device resolution is invisible
    // and keeps the fragment cost low on large screens.
    const scale = Math.min(window.devicePixelRatio || 1, 1) * 0.6;
    const resize = () => {
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const start = performance.now();
    let frame = 0;
    let visible = true;

    const draw = (now: number) => {
      gl.uniform1f(uTime, (now - start) / 1000 + 12);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      resize();
      if (visible && !reduceMotion.matches) {
        frame = requestAnimationFrame(loop);
      } else {
        draw(performance.now());
      }
    };

    const resizeObserver = new ResizeObserver(sync);
    resizeObserver.observe(canvas);

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    intersection.observe(canvas);

    reduceMotion.addEventListener("change", sync);
    canvas.dataset.ready = "true";

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersection.disconnect();
      reduceMotion.removeEventListener("change", sync);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden />;
}
