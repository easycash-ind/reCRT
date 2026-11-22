import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

const AUDIO_SRC = "/audio/cathy_sexy_robot.mp3";

/**
 * 生成 80s 跑车车厢内部早期反射脉冲响应 (Cabin Early Reflections Impulse Response)
 * 模拟 DeLorean 紧凑皮革/玻璃座舱的短混响与温暖包裹感
 */
function createCarCabinImpulse(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const duration = 0.22; // 220ms 紧凑车厢空间反射
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);

  const earlyTapMs = [7, 13, 19, 28, 39, 54, 72];
  const earlyGains = [0.55, 0.42, 0.34, 0.25, 0.18, 0.12, 0.08];

  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    // 弥散尾音
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, 3.4);
      data[i] = (Math.random() * 2 - 1) * env * 0.18;
    }
    // 挡风玻璃与侧窗早期离散反射
    earlyTapMs.forEach((ms, idx) => {
      const offset = Math.floor(((ms + ch * 1.6) / 1000) * sampleRate);
      if (offset < length) {
        data[offset] += (ch === 0 ? 1 : -1) * earlyGains[idx];
      }
    });
  }
  return impulse;
}

/**
 * 生成模拟磁带饱和温暖度的软削波曲线 (Tape Saturation Curve)
 */
function makeTapeWarmthCurve(amount: number): Float32Array<ArrayBuffer> {
  const k = Math.max(0.1, amount * 14);
  const nSamples = 4096;
  const buffer = new ArrayBuffer(nSamples * 4);
  const curve = new Float32Array(buffer);
  const norm = Math.tanh(k);
  for (let i = 0; i < nSamples; i++) {
    const x = (i * 2) / nSamples - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/**
 * 生成循环的卡带嘶嘶底噪与黑胶微尘爆音 Buffer (Tape Hiss & Vinyl Crackle)
 */
function createLoFiNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const seconds = 4.0;
  const len = sampleRate * seconds;
  const buf = ctx.createBuffer(2, len, sampleRate);

  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // 粉红滤波磁带底噪
      b0 = 0.997 * b0 + white * 0.028;
      b1 = 0.985 * b1 + white * 0.045;
      b2 = 0.95 * b2 + white * 0.06;
      let sample = (b0 + b1 + b2) * 0.16;

      // 随机稀疏黑胶微爆音脉冲 (Vinyl Crackle)
      if (Math.random() < 0.00055) {
        sample += (Math.random() * 2 - 1) * 0.65;
      }
      out[i] = sample;
    }
  }
  return buf;
}

export interface CarStereoPlayerProps {
  /** 是否处于车内驾驶舱视角（车外追尾视角下模拟隔着车窗听车内音响的闷响效果） */
  isCockpitView: boolean;
}

/**
 * 80s 昭和车载音响拟物阻尼旋转编码器旋钮 (LO-FI Rotary Knob)
 * 支持鼠标上下/左右拖拽、双指滚轮微调、双击复位至默认值 (0.35)
 */
function LoFiRotaryKnob({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const draggingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, startVal: value });

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      startVal: value,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    const dy = startPosRef.current.y - e.clientY;
    const dx = e.clientX - startPosRef.current.x;
    const delta = (dy + dx * 0.6) / 110;
    const next = Math.min(1, Math.max(0, startPosRef.current.startVal + delta));
    onChange(next);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    draggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const step = (-e.deltaY + e.deltaX) * 0.0018;
    const next = Math.min(1, Math.max(0, value + step));
    onChange(next);
  };

  // 旋转角度映射：-135° (0%) -> +135° (100%)
  const deg = -135 + value * 270;
  const ticks = 9;

  return (
    <div
      className="flex items-center gap-2.5 select-none"
      title="上下拖拽或滚动调节 Lo-Fi 磁带失真与车厢滤波强度（双击复位）"
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onChange(0.35);
        }}
        className="relative flex h-9 w-9 items-center justify-center cursor-ns-resize"
      >
        {/* 外圈发光刻度点 */}
        {Array.from({ length: ticks }).map((_, i) => {
          const t = i / (ticks - 1);
          const tickDeg = -135 + t * 270;
          const rad = ((tickDeg - 90) * Math.PI) / 180;
          const cx = 18 + Math.cos(rad) * 16.5;
          const cy = 18 + Math.sin(rad) * 16.5;
          const isLit = t <= value + 0.02;
          return (
            <span
              key={i}
              style={{ left: `${cx}px`, top: `${cy}px` }}
              className={`pointer-events-none absolute h-[2.5px] w-[2.5px] -translate-x-1/2 -translate-y-1/2 transition-colors ${
                isLit
                  ? t > 0.72
                    ? "bg-[#EE4256] shadow-[0_0_4px_#EE4256]"
                    : "bg-[#FFBD1B] shadow-[0_0_4px_#FFBD1B]"
                  : "bg-white/22"
              }`}
            />
          );
        })}

        {/* 阳极氧化铝车铣旋钮本体 */}
        <div
          style={{ transform: `rotate(${deg.toFixed(1)}deg)` }}
          className="relative h-6 w-6 rounded-full border border-white/35 bg-gradient-to-b from-[#2A3958] to-[#0C1528] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_2px_6px_rgba(0,0,0,0.75)]"
        >
          {/* 旋钮顶部琥珀金指示刻线 */}
          <span className="absolute left-1/2 top-[2px] h-2.5 w-[2px] -translate-x-1/2 bg-[#FFBD1B] shadow-[0_0_4px_#FFBD1B]" />
        </div>
      </div>

      {/* 右侧参数读数 */}
      <div className="flex flex-col leading-none">
        <span className="font-mono text-[8.5px] tracking-[0.18em] text-white/50">
          LO-FI TAPE
        </span>
        <span className="mt-1 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#FFBD1B]">
          {Math.round(value * 100)}%
        </span>
      </div>
    </div>
  );
}

interface AudioGraphNodes {
  ctx: AudioContext;
  highpass: BiquadFilterNode;
  cabinPeak: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  shaper: WaveShaperNode;
  wowDelay: DelayNode;
  wowGain: GainNode;
  dryGain: GainNode;
  cabinWetGain: GainNode;
  hissGain: GainNode;
  masterGain: GainNode;
  analyser: AnalyserNode;
}

export function CarStereoPlayer({ isCockpitView }: CarStereoPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<AudioGraphNodes | null>(null);
  const specBarsRef = useRef<Array<HTMLSpanElement | null>>([]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  // 默认开启适度车内卡带 Lo-Fi 氛围 (32%)
  const [lofiAmount, setLofiAmount] = useState(0.32);

  // 初始化并连接 Web Audio API 车载音响 + Lo-Fi 效果器链路
  const ensureAudioGraph = useCallback(() => {
    if (graphRef.current) {
      if (graphRef.current.ctx.state === "suspended") {
        void graphRef.current.ctx.resume();
      }
      return graphRef.current;
    }
    const audioEl = audioRef.current;
    if (!audioEl) return null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioCtx();

    const source = ctx.createMediaElementSource(audioEl);

    // 1. 高通滤波：随 Lo-Fi 旋钮收窄低频边缘 (35Hz -> 240Hz)
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 65;
    highpass.Q.value = 0.75;

    // 2. 跑车车门/座舱箱体共振峰 (108Hz 温暖低频)
    const cabinPeak = ctx.createBiquadFilter();
    cabinPeak.type = "peaking";
    cabinPeak.frequency.value = 108;
    cabinPeak.Q.value = 1.25;
    cabinPeak.gain.value = 3.8;

    // 3. 磁带走带颤音 (Wow & Flutter: LFO 调制微延迟)
    const wowDelay = ctx.createDelay(0.05);
    wowDelay.delayTime.value = 0.008;
    const wowLfo = ctx.createOscillator();
    wowLfo.type = "sine";
    wowLfo.frequency.value = 2.15;
    const wowGain = ctx.createGain();
    wowGain.gain.value = 0.0005;
    wowLfo.connect(wowGain);
    wowGain.connect(wowDelay.delayTime);
    wowLfo.start();

    // 4. 磁带模拟软削波失真 (Tape Warmth Saturation)
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeTapeWarmthCurve(0.32);
    shaper.oversample = "2x";

    // 5. 低通滤波器（同时模拟车内/车外隔窗衰减 + Lo-Fi 卡带高频衰减）
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 4200;
    lowpass.Q.value = 1.1;

    // 6. 车厢空间早期反射卷积混响 (Cabin Early Reflections)
    const convolver = ctx.createConvolver();
    convolver.buffer = createCarCabinImpulse(ctx);

    const dryGain = ctx.createGain();
    dryGain.gain.value = 0.72;
    const cabinWetGain = ctx.createGain();
    cabinWetGain.gain.value = 0.48;

    // 7. 卡带嘶嘶底噪与黑胶微爆音通道
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = createLoFiNoiseBuffer(ctx);
    noiseSource.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1900;
    noiseFilter.Q.value = 0.9;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.03;
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(hissGain);
    noiseSource.start();

    // 8. 总输出与实时 VFD 频谱分析器
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0.88;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.76;

    // 串联主信号链：source -> highpass -> cabinPeak -> wowDelay -> shaper -> lowpass
    source.connect(highpass);
    highpass.connect(cabinPeak);
    cabinPeak.connect(wowDelay);
    wowDelay.connect(shaper);
    shaper.connect(lowpass);

    // 并联干声与车厢空间反射湿声
    lowpass.connect(dryGain);
    lowpass.connect(convolver);
    convolver.connect(cabinWetGain);

    dryGain.connect(masterGain);
    cabinWetGain.connect(masterGain);
    hissGain.connect(masterGain);

    masterGain.connect(analyser);
    analyser.connect(ctx.destination);

    const nodes: AudioGraphNodes = {
      ctx,
      highpass,
      cabinPeak,
      lowpass,
      shaper,
      wowDelay,
      wowGain,
      dryGain,
      cabinWetGain,
      hissGain,
      masterGain,
      analyser,
    };
    graphRef.current = nodes;
    return nodes;
  }, []);

  // 根据「车内/车外视角」与「Lo-Fi 旋钮值」实时更新滤波器参数
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    const now = g.ctx.currentTime;

    // 车内视角高频更通透但带车厢混响；车外追尾视角模拟隔着 DeLorean 车窗听车内音响的包裹感
    const maxCutoff = isCockpitView ? 12500 : 4600;
    const minCutoff = isCockpitView ? 1150 : 920;
    // 指数曲线映射截止频率
    const cutoff =
      maxCutoff * Math.pow(minCutoff / maxCutoff, Math.pow(lofiAmount, 0.85));

    g.lowpass.frequency.setTargetAtTime(cutoff, now, 0.06);
    g.lowpass.Q.setTargetAtTime(0.85 + lofiAmount * 2.1, now, 0.06);

    // 高通随 Lo-Fi 抬升，营造老式车载收音机/卡带的中频聚焦感
    g.highpass.frequency.setTargetAtTime(38 + lofiAmount * 235, now, 0.06);

    // 车门箱体低频共振
    g.cabinPeak.gain.setTargetAtTime(
      (isCockpitView ? 4.2 : 5.5) + lofiAmount * 2.4,
      now,
      0.06
    );

    // 磁带走带颤音深度 (Wow & Flutter)
    g.wowGain.gain.setTargetAtTime(0.0001 + Math.pow(lofiAmount, 1.5) * 0.0022, now, 0.06);

    // 磁带饱和曲线更新
    g.shaper.curve = makeTapeWarmthCurve(0.15 + lofiAmount * 0.85);

    // 车厢混响干湿比（车外视角湿声比例更高，空间距离感更明显）
    g.dryGain.gain.setTargetAtTime(isCockpitView ? 0.78 : 0.56, now, 0.08);
    g.cabinWetGain.gain.setTargetAtTime(
      (isCockpitView ? 0.38 : 0.62) + lofiAmount * 0.22,
      now,
      0.08
    );

    // 磁带嘶嘶底噪与黑胶微爆音音量
    g.hissGain.gain.setTargetAtTime(
      isPlaying && !isMuted ? Math.pow(lofiAmount, 1.3) * 0.11 : 0,
      now,
      0.06
    );
  }, [lofiAmount, isCockpitView, isPlaying, isMuted]);

  // 静音控制
  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    g.masterGain.gain.setTargetAtTime(
      isMuted ? 0 : 0.88,
      g.ctx.currentTime,
      0.04
    );
  }, [isMuted]);

  // 页面加载后默认尝试自动播放；若浏览器策略拦截，则在用户首次点击/按键/滚轮时立即无缝启动播放
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    let unlocked = false;
    const startPlayback = async () => {
      if (unlocked) return;
      try {
        const nodes = ensureAudioGraph();
        if (nodes && nodes.ctx.state === "suspended") {
          await nodes.ctx.resume();
        }
        await audioEl.play();
        unlocked = true;
        setIsPlaying(true);
      } catch {
        // 等待用户首次交互解锁
      }
    };

    void startPlayback();

    const handleUserGesture = () => {
      if (!unlocked && audioEl.paused) {
        void startPlayback();
      }
    };

    window.addEventListener("pointerdown", handleUserGesture, { passive: true });
    window.addEventListener("keydown", handleUserGesture, { passive: true });
    window.addEventListener("wheel", handleUserGesture, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", handleUserGesture);
      window.removeEventListener("keydown", handleUserGesture);
      window.removeEventListener("wheel", handleUserGesture);
    };
  }, [ensureAudioGraph]);

  // 实时 VFD 荧光频谱动画循环
  useEffect(() => {
    let rafId = 0;
    const freqData = new Uint8Array(32);

    const updateSpectrum = () => {
      const g = graphRef.current;
      if (g && isPlaying && !isMuted) {
        g.analyser.getByteFrequencyData(freqData);
        for (let i = 0; i < 8; i++) {
          const bar = specBarsRef.current[i];
          if (!bar) continue;
          const val = freqData[i + 1] / 255;
          const hPct = Math.max(14, Math.min(100, Math.round(val * 100)));
          bar.style.height = `${hPct}%`;
        }
      } else {
        for (let i = 0; i < 8; i++) {
          const bar = specBarsRef.current[i];
          if (bar) bar.style.height = "15%";
        }
      }
      rafId = window.requestAnimationFrame(updateSpectrum);
    };

    rafId = window.requestAnimationFrame(updateSpectrum);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, isMuted]);

  const togglePlay = async () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    const nodes = ensureAudioGraph();
    if (nodes && nodes.ctx.state === "suspended") {
      await nodes.ctx.resume();
    }
    if (audioEl.paused) {
      await audioEl.play();
      setIsPlaying(true);
    } else {
      audioEl.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="flex items-center gap-3 border-r border-white/18 px-3.5 py-1.5">
      <audio
        ref={audioRef}
        src={AUDIO_SRC}
        loop
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* 播放/暂停键 */}
      <button
        type="button"
        onClick={() => void togglePlay()}
        className={`flex h-7 w-7 items-center justify-center border border-white/25 transition-colors cursor-pointer ${
          isPlaying
            ? "bg-[#EE4256] text-white"
            : "bg-white/10 text-white/80 hover:bg-white/20"
        }`}
        title={isPlaying ? "暂停车载卡带播放" : "播放车载卡带音乐"}
      >
        {isPlaying ? <Pause size={12} /> : <Play size={12} />}
      </button>

      {/* VFD 曲目跑马灯与 8 段荧光电平表 */}
      <div className="flex items-center gap-2.5 border border-white/15 bg-[#030A18]/90 px-2.5 py-1">
        {/* 8 段 VFD 青柠荧光频谱柱 */}
        <div className="flex h-5 items-end gap-[2px]">
          {Array.from({ length: 8 }).map((_, i) => (
            <span
              key={i}
              ref={(el) => {
                specBarsRef.current[i] = el;
              }}
              style={{ height: "18%" }}
              className="w-[2.5px] bg-gradient-to-t from-[#29B2E8] via-[#66F7D0] to-[#FFBD1B] transition-[height] duration-75"
            />
          ))}
        </div>

        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="bg-[#29B2E8]/20 px-1 py-[1px] font-mono text-[8px] font-bold tracking-[0.14em] text-[#66F7D0]">
              {isCockpitView ? "CABIN EQ" : "EXT WINDOW"}
            </span>
            <span className="font-mono text-[8.5px] tracking-[0.12em] text-white/45">
              TAPE // 1983
            </span>
          </div>
          <span className="mt-1 max-w-[148px] truncate font-mono text-[10px] font-semibold tracking-[0.08em] text-[#FAF7F0]">
            CATHY — 当山ひとみ
          </span>
        </div>
      </div>

      {/* 拟物阻尼 Lo-Fi 磁带强度旋钮 */}
      <LoFiRotaryKnob value={lofiAmount} onChange={setLofiAmount} />

      {/* 静音开关 */}
      <button
        type="button"
        onClick={() => setIsMuted((m) => !m)}
        className="flex h-7 w-7 items-center justify-center border border-white/20 bg-white/5 text-white/70 transition-colors hover:bg-white/15 hover:text-white cursor-pointer"
        title={isMuted ? "取消静音" : "静音"}
      >
        {isMuted ? <VolumeX size={12} className="text-[#EE4256]" /> : <Volume2 size={12} />}
      </button>
    </div>
  );
}
