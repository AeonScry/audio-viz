"use client";

import React, { useEffect, useRef, useState } from "react";

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Visual controls state
  const [fftSize, setFftSize] = useState<number>(1024);
  const [smoothing, setSmoothing] = useState<number>(0.88);
  const [lineWidth, setLineWidth] = useState<number>(3);
  const [barColor, setBarColor] = useState<string>("#ffffff");
  const [bgColor, setBgColor] = useState<string>("#0b0b0b");
  const [baseRadiusPct, setBaseRadiusPct] = useState<number>(22); // percent of min(width,height)
  const [maxBarPct, setMaxBarPct] = useState<number>(18);
  const [sensitivity, setSensitivity] = useState<number>(1.0);
  const [boostPow, setBoostPow] = useState<number>(0.7);
  const [showCore, setShowCore] = useState<boolean>(true);
  const [gradientBars, setGradientBars] = useState<boolean>(true);
  const [barCount, setBarCount] = useState<number>(128); // number of radial bars to draw (samples)
  const [rotationSpeed, setRotationSpeed] = useState<number>(0.0); // radians per frame
  const [globalAlpha, setGlobalAlpha] = useState<number>(0.9);
  const [capStyle, setCapStyle] = useState<CanvasLineCap>("butt");

  useEffect(() => {
    return () => {
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setupAudioGraph() {
    if (!audioElRef.current) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioCtx = audioCtxRef.current;

    if (!analyserRef.current) {
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = fftSize;
      analyser.smoothingTimeConstant = smoothing;
      analyserRef.current = analyser;
    }

    // Create source node once per <audio> element
    if (!srcNodeRef.current) {
      srcNodeRef.current = audioCtx.createMediaElementSource(audioElRef.current);
      srcNodeRef.current.connect(analyserRef.current!);
      analyserRef.current!.connect(audioCtx.destination);
    }
  }

  function applyAnalyserSettings() {
    if (!analyserRef.current) return;
    // FFT size must be a power of two between 32 and 32768
    analyserRef.current.fftSize = fftSize;
    analyserRef.current.smoothingTimeConstant = smoothing;
  }

  function stopLoop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setIsRunning(false);
  }

  function startLoop() {
    if (!canvasRef.current || !analyserRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth === 0 || cssHeight === 0) return;

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const analyser = analyserRef.current;

    // update analyser settings (in case changed)
    applyAnalyserSettings();

    const bufferLength = analyser.frequencyBinCount; // = fftSize / 2
    const rawData = new Uint8Array(bufferLength);

    setIsRunning(true);

    let rotation = 0;

    const draw = () => {
      analyser.getByteFrequencyData(rawData);

      // background
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const cx = cssWidth / 2;
      const cy = cssHeight / 2;

      // "sphere" base radius
      const baseR = Math.min(cssWidth, cssHeight) * (baseRadiusPct / 100);

      // bar length scale
      const maxBar = Math.min(cssWidth, cssHeight) * (maxBarPct / 100);

      // draw a subtle core circle
      if (showCore) {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();
      }

      // prepare gradient if requested
      let grad: CanvasGradient | null = null;
      if (gradientBars) {
        grad = ctx.createLinearGradient(0, 0, cssWidth, cssHeight);
        grad.addColorStop(0, barColor);
        // mix with a saturated tone for the outer end
        grad.addColorStop(0.5, "#ff7a18");
        grad.addColorStop(1, "#ffd200");
      }

      ctx.lineWidth = lineWidth;
      ctx.lineCap = capStyle;
      ctx.globalAlpha = globalAlpha;

      // Sample selection: evenly sample indices from the analyser buffer up to the requested barCount
      const step = Math.max(1, Math.floor(bufferLength / barCount));
      const usedBars = Math.min(barCount, Math.floor(bufferLength / step));

      for (let i = 0; i < usedBars; i++) {
        const idx = i * step;
        const v = rawData[idx] / 255; // 0..1

        // non-linear boost so quiet parts still show
        const boosted = Math.pow(v * sensitivity, boostPow);

        const angle = ((i / usedBars) * Math.PI * 2) + rotation;

        const innerR = baseR;
        const outerR = baseR + boosted * maxBar;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;

        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);

        if (gradientBars && grad) ctx.strokeStyle = grad as unknown as string;
        else ctx.strokeStyle = barColor;

        ctx.stroke();

        // subtle glow effect: draw a faint, wider line with low alpha
        if (lineWidth > 0) {
          ctx.strokeStyle = barColor;
          ctx.globalAlpha = 0.06;
          ctx.lineWidth = Math.min(lineWidth * 3, 40);
          ctx.stroke();
          // restore
          ctx.lineWidth = lineWidth;
          ctx.globalAlpha = globalAlpha;
        }
      }

      // update rotation
      rotation += rotationSpeed;

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
  }

  async function handlePlay() {
    setupAudioGraph();
    if (!audioCtxRef.current) return;

    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    // apply analyser settings each time we start
    applyAnalyserSettings();
    startLoop();
  }

  // When some analyser-related controls change, apply them live (no need to recreate graph)
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.fftSize = fftSize;
      analyserRef.current.smoothingTimeConstant = smoothing;
    }
    // adjust barCount to not exceed nyquist buffer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fftSize, smoothing]);

  return (
    <main className="p-6 font-sans text-gray-100 min-h-screen bg-gradient-to-b from-gray-900 to-black">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Radial Audio Visualizer</h1>
          <div className="text-sm text-gray-400">Status: <span className="font-medium">{isRunning ? "visualizing" : "stopped"}</span></div>
        </header>

        <div className="flex gap-6 flex-wrap">
          <section className="flex-1 min-w-[320px]">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <label className="inline-flex items-center gap-2">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (fileUrl) URL.revokeObjectURL(fileUrl);
                    const url = URL.createObjectURL(f);
                    setFileUrl(url);
                    stopLoop();
                  }}
                  className="hidden"
                />
                <button
                  onClick={() => document.querySelector<HTMLInputElement>('input[type=file]')?.click()}
                  className="px-3 py-2 bg-gray-800 rounded-md text-sm border border-gray-700 hover:bg-gray-700"
                >
                  Choose File
                </button>
              </label>

              <button
                onClick={async () => {
                  if (!audioElRef.current || !fileUrl) return;
                  await handlePlay();
                  await audioElRef.current.play();
                }}
                disabled={!fileUrl}
                className="px-3 py-2 bg-indigo-600 rounded-md text-sm disabled:opacity-40"
              >
                Play
              </button>

              <button
                onClick={() => {
                  audioElRef.current?.pause();
                  stopLoop();
                }}
                disabled={!fileUrl}
                className="px-3 py-2 bg-gray-700 rounded-md text-sm disabled:opacity-40"
              >
                Pause
              </button>

              <div className="ml-auto text-xs text-gray-400">Tips: use the panel to the right to tweak visuals</div>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-800">
              <canvas
                ref={canvasRef}
                className="w-full h-[500px] md:h-[600px] block"
                style={{ background: bgColor }}
              />
            </div>

            <audio
              ref={audioElRef}
              src={fileUrl ?? undefined}
              controls
              className="w-full mt-4"
              onPlay={handlePlay}
              onPause={stopLoop}
              onEnded={stopLoop}
            />
          </section>

          <aside className="w-80 bg-gray-800/60 p-4 rounded-xl border border-gray-700">
            <h2 className="text-sm font-medium mb-3">Visualizer Controls</h2>

            <div className="space-y-3 text-sm">
              <div>
                <label className="flex justify-between mb-1">FFT Size <span className="text-xs text-gray-400">{fftSize}</span></label>
                <select
                  value={fftSize}
                  onChange={(e) => setFftSize(Number(e.target.value))}
                  className="w-full bg-gray-900 px-2 py-1 rounded-md border border-gray-700 text-sm"
                >
                  <option value={512}>512</option>
                  <option value={1024}>1024</option>
                  <option value={2048}>2048</option>
                  <option value={4096}>4096</option>
                </select>
              </div>

              <div>
                <label className="flex justify-between mb-1">Smoothing <span className="text-xs text-gray-400">{smoothing.toFixed(2)}</span></label>
                <input
                  type="range"
                  min={0}
                  max={0.99}
                  step={0.01}
                  value={smoothing}
                  onChange={(e) => setSmoothing(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Bar Count <span className="text-xs text-gray-400">{barCount}</span></label>
                <input
                  type="range"
                  min={16}
                  max={512}
                  step={1}
                  value={barCount}
                  onChange={(e) => setBarCount(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Line Width <span className="text-xs text-gray-400">{lineWidth}px</span></label>
                <input
                  type="range"
                  min={1}
                  max={24}
                  step={1}
                  value={lineWidth}
                  onChange={(e) => setLineWidth(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Boost Power <span className="text-xs text-gray-400">{boostPow.toFixed(2)}</span></label>
                <input
                  type="range"
                  min={0.2}
                  max={1.6}
                  step={0.01}
                  value={boostPow}
                  onChange={(e) => setBoostPow(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Sensitivity <span className="text-xs text-gray-400">{sensitivity.toFixed(2)}</span></label>
                <input
                  type="range"
                  min={0.2}
                  max={4}
                  step={0.01}
                  value={sensitivity}
                  onChange={(e) => setSensitivity(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Base Radius <span className="text-xs text-gray-400">{baseRadiusPct}%</span></label>
                <input
                  type="range"
                  min={2}
                  max={45}
                  step={1}
                  value={baseRadiusPct}
                  onChange={(e) => setBaseRadiusPct(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Max Bar Length <span className="text-xs text-gray-400">{maxBarPct}%</span></label>
                <input
                  type="range"
                  min={2}
                  max={50}
                  step={1}
                  value={maxBarPct}
                  onChange={(e) => setMaxBarPct(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Rotation Speed <span className="text-xs text-gray-400">{rotationSpeed.toFixed(3)}</span></label>
                <input
                  type="range"
                  min={-0.06}
                  max={0.06}
                  step={0.001}
                  value={rotationSpeed}
                  onChange={(e) => setRotationSpeed(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Global Alpha <span className="text-xs text-gray-400">{globalAlpha.toFixed(2)}</span></label>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={globalAlpha}
                  onChange={(e) => setGlobalAlpha(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex justify-between mb-1">Line Cap</label>
                <select
                  value={capStyle}
                  onChange={(e) => setCapStyle(e.target.value as CanvasLineCap)}
                  className="w-full bg-gray-900 px-2 py-1 rounded-md border border-gray-700 text-sm"
                >
                  <option value="butt">butt</option>
                  <option value="round">round</option>
                  <option value="square">square</option>
                </select>
              </div>

              <div className="flex gap-2 items-center">
                <input type="color" value={barColor} onChange={(e) => setBarColor(e.target.value)} className="w-10 h-8 p-0 border rounded" />
                <label className="text-sm text-gray-300">Bar Color</label>
              </div>

              <div className="flex gap-2 items-center">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-10 h-8 p-0 border rounded" />
                <label className="text-sm text-gray-300">Background</label>
              </div>

              <div className="flex items-center gap-2">
                <input id="showCore" type="checkbox" checked={showCore} onChange={(e) => setShowCore(e.target.checked)} className="h-4 w-4" />
                <label htmlFor="showCore" className="text-sm text-gray-300">Show core circle</label>
              </div>

              <div className="flex items-center gap-2">
                <input id="gradientBars" type="checkbox" checked={gradientBars} onChange={(e) => setGradientBars(e.target.checked)} className="h-4 w-4" />
                <label htmlFor="gradientBars" className="text-sm text-gray-300">Gradient bars</label>
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => {
                    // reset to defaults
                    setFftSize(1024);
                    setSmoothing(0.88);
                    setLineWidth(3);
                    setBarColor("#ffffff");
                    setBgColor("#0b0b0b");
                    setBaseRadiusPct(22);
                    setMaxBarPct(18);
                    setSensitivity(1.0);
                    setBoostPow(0.7);
                    setShowCore(true);
                    setGradientBars(true);
                    setBarCount(128);
                    setRotationSpeed(0);
                    setGlobalAlpha(0.9);
                    setCapStyle("butt");
                  }}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded-md text-sm"
                >
                  Reset
                </button>

                <button
                  onClick={() => {
                    // neon preset
                    setFftSize(2048);
                    setSmoothing(0.93);
                    setLineWidth(6);
                    setBarColor("#00ffd5");
                    setBgColor("#050014");
                    setBaseRadiusPct(18);
                    setMaxBarPct(28);
                    setSensitivity(1.6);
                    setBoostPow(0.6);
                    setShowCore(false);
                    setGradientBars(true);
                    setBarCount(220);
                    setRotationSpeed(0.0025);
                    setGlobalAlpha(0.95);
                    setCapStyle("round");
                  }}
                  className="flex-1 px-3 py-2 bg-indigo-600 rounded-md text-sm"
                >
                  Neon
                </button>

                <button
                  onClick={() => {
                    const rand = (min: number, max: number) =>
                      Math.random() * (max - min) + min;

                    const randInt = (min: number, max: number) =>
                      Math.floor(rand(min, max));

                    const randomColor = () =>
                      `#${Math.floor(Math.random() * 16777215)
                        .toString(16)
                        .padStart(6, "0")}`;

                    const fftOptions = [512, 1024, 2048, 4096];

                    setFftSize(fftOptions[randInt(0, fftOptions.length)]);
                    setSmoothing(rand(0.6, 0.98));
                    setLineWidth(randInt(1, 16));
                    setBarColor(randomColor());
                    setBgColor(randomColor());
                    setBaseRadiusPct(randInt(8, 35));
                    setMaxBarPct(randInt(10, 40));
                    setSensitivity(rand(0.5, 3));
                    setBoostPow(rand(0.3, 1.4));
                    setShowCore(Math.random() > 0.5);
                    setGradientBars(Math.random() > 0.3);
                    setBarCount(randInt(32, 300));
                    setRotationSpeed(rand(-0.01, 0.01));
                    setGlobalAlpha(rand(0.4, 1));
                    setCapStyle(["butt", "round", "square"][randInt(0, 3)] as CanvasLineCap);
                  }}
                  className="flex-1 px-3 py-2 bg-pink-600 hover:bg-pink-500 rounded-md text-sm"
                >
                  Random
                </button>
              </div>

              <p className="mt-2 text-xs text-gray-400">Tip: change FFT size for more/less frequency detail, and use Bar Count to reduce visual clutter.</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
