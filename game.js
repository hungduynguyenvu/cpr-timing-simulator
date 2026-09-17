(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const screens = {
    title: $("titleScreen"),
    game: $("gameScreen"),
    intermission: $("intermissionScreen"),
    ending: $("endingScreen"),
    result: $("resultScreen"),
    fail: $("failScreen")
  };

  const ui = {
    gameTitle: $("gameTitle"), gameSubtitle: $("gameSubtitle"), startTitle: $("startTitle"), startSubtitle: $("startSubtitle"),
    toggles: $("toggles"), volumeBox: $("volumeBox"), volumeSlider: $("volumeSlider"), volumeValue: $("volumeValue"),
    practiceToggle: $("practiceToggle"), guidesToggle: $("guidesToggle"), hideMidAccuracyToggle: $("hideMidAccuracyToggle"), fiveCyclesToggle: $("fiveCyclesToggle"),
    tutorialButton: $("tutorialButton"), tutorialModal: $("tutorialModal"), tutorialTitle: $("tutorialTitle"), tutorialContent: $("tutorialContent"),
    tutorialCloseTop: $("tutorialCloseTop"), tutorialCloseBottom: $("tutorialCloseBottom"),
    quitHint: $("quitHint"), statusText: $("statusText"), compressionPulse: $("compressionPulse"), approachCircle: $("approachCircle"), normalFeedback: $("normalFeedback"),
    practicePanel: $("practicePanel"), practiceCount: $("practiceCount"), practiceJudgement: $("practiceJudgement"), practiceCpm: $("practiceCpm"),
    practiceAverage: $("practiceAverage"), practiceAccuracy: $("practiceAccuracy"), cpmChart: $("cpmChart"),
    intermissionTopTitle: $("intermissionTopTitle"), intermissionAccuracy: $("intermissionAccuracy"), intermissionCountdown: $("intermissionCountdown"),
    endingText: $("endingText"),
    resultAccuracy: $("resultAccuracy"), resultRank: $("resultRank"), resultRankSubtitle: $("resultRankSubtitle"),
    modsList: $("modsList"), overallStats: $("overallStats"), overallCounts: $("overallCounts"), setResults: $("setResults"),
    returnButton: $("returnButton"), failReason: $("failReason"), failSubtitle: $("failSubtitle"), failReturnHint: $("failReturnHint")
  };

  const STATE = {
    TITLE: "title",
    ACTIVE: "active",
    STOP_TEST: "stop_test",
    INTERMISSION: "intermission",
    ENDING: "ending",
    RESTART_WINDOW: "restart_window",
    RESTART_LATE: "restart_late",
    RESULT: "result",
    FAILED: "failed"
  };

  let state = STATE.TITLE;
  let run = null;
  let tutorialOpen = false;
  let timers = [];
  let guideVisualTimers = [];
  let activeCompressionTimer = null;
  let stopTestTimer = null;
  let failDismissReady = false;
  let guideScheduler = null;
  let escapeTimer = null;
  let escapeArmed = false;

  // Audio is initialized early (while still suspended) so the first actual input
  // does not also have to pay the AudioContext construction cost.
  let audioContext = null;
  let masterGainNode = null;
  let clickBusNode = null;
  let guideBusNode = null;
  let masterVolume = CONFIG.audio.defaultMasterVolume;
  let clickBuffer = null;
  let guideBuffer = null;

  function makeSetData(setNumber) {
    return {
      set: setNumber,
      records: [],
      cpms: [],
      intervalsMs: [],
      counts: { perfect: 0, ok: 0, meh: 0, miss: 0 },
      points: 0,
      penalties: 0,
      overclicks: 0,
      lateStart: false
    };
  }

  function freshRun() {
    const fiveCycles = ui.fiveCyclesToggle.checked;
    const totalSets = fiveCycles ? CONFIG.rules.fiveCycleSets : CONFIG.rules.normalSets;
    return {
      totalSets,
      currentSet: 1,
      currentSetClicks: 0,
      totalScoredClicks: 0,
      points: 0,
      penalties: 0,
      overclicks: 0,
      lateStarts: 0,
      counts: { perfect: 0, ok: 0, meh: 0, miss: 0 },
      allCpms: [],
      allIntervalsMs: [],
      setSummaries: [],
      currentSetData: makeSetData(1),
      lastClickTime: null,
      practice: ui.practiceToggle.checked,
      guides: ui.guidesToggle.checked,
      hideMidAccuracy: ui.hideMidAccuracyToggle.checked,
      fiveCycles,
      // Freeze which custom samples are used for this run so a late-loading WAV
      // cannot suddenly change volume/timbre halfway through a set.
      audioClickBuffer: clickBuffer,
      audioGuideBuffer: guideBuffer
    };
  }

  // ------------------------------------------------------------
  // Initial text / title controls
  // ------------------------------------------------------------

  ui.gameTitle.textContent = CONFIG.text.title;
  ui.gameSubtitle.textContent = CONFIG.text.subtitle;
  ui.startTitle.textContent = CONFIG.text.startTitle;
  ui.startSubtitle.textContent = CONFIG.text.startSubtitle;

  [ui.toggles, ui.volumeBox, ui.tutorialModal].forEach((el) => {
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
  });

  const savedVolume = Number(localStorage.getItem("cprTimingVolume"));
  if (Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1) masterVolume = savedVolume;
  ui.volumeSlider.value = String(Math.round(masterVolume * 100));
  ui.volumeValue.textContent = `${Math.round(masterVolume * 100)}%`;
  ui.volumeSlider.addEventListener("input", () => {
    masterVolume = Number(ui.volumeSlider.value) / 100;
    ui.volumeValue.textContent = `${ui.volumeSlider.value}%`;
    localStorage.setItem("cprTimingVolume", String(masterVolume));
    applyMasterVolume();
  });

  // ------------------------------------------------------------
  // Tutorial
  // ------------------------------------------------------------

  function renderTutorial() {
    const t = CONFIG.text.tutorial;
    ui.tutorialTitle.textContent = t.title;
    ui.tutorialCloseBottom.textContent = t.closeText;
    ui.tutorialContent.innerHTML = "";

    t.sections.forEach((section) => {
      const block = document.createElement("section");
      block.className = "tutorial-section";
      const h = document.createElement("h3");
      h.textContent = section.heading;
      block.appendChild(h);
      section.paragraphs.forEach((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        block.appendChild(p);
      });
      ui.tutorialContent.appendChild(block);
    });
  }

  function openTutorial() {
    if (state !== STATE.TITLE) return;
    tutorialOpen = true;
    ui.tutorialModal.classList.remove("hidden");
    ui.tutorialContent.scrollTop = 0;
  }

  function closeTutorial() {
    tutorialOpen = false;
    ui.tutorialModal.classList.add("hidden");
  }

  ui.tutorialButton.addEventListener("click", openTutorial);
  ui.tutorialCloseTop.addEventListener("click", closeTutorial);
  ui.tutorialCloseBottom.addEventListener("click", closeTutorial);
  renderTutorial();

  // ------------------------------------------------------------
  // Generic helpers / timers
  // ------------------------------------------------------------

  function showScreen(name) {
    Object.values(screens).forEach((screen) => screen.classList.remove("active"));
    screens[name].classList.add("active");
  }

  function addTimer(callback, delay) {
    const id = window.setTimeout(callback, delay);
    timers.push(id);
    return id;
  }

  function clearActiveCompressionTimer() {
    if (activeCompressionTimer) {
      clearTimeout(activeCompressionTimer);
      activeCompressionTimer = null;
    }
  }

  function clearStopTestTimer() {
    if (stopTestTimer) {
      clearTimeout(stopTestTimer);
      stopTestTimer = null;
    }
  }

  function armStopTestTimer() {
    clearStopTestTimer();
    if (!run || state !== STATE.STOP_TEST) return;

    // The hidden stop window is measured from the most recent input, including
    // an extra compression. Every tolerated extra therefore restarts the 3 s wait.
    stopTestTimer = window.setTimeout(() => {
      stopTestTimer = null;
      if (!run || state !== STATE.STOP_TEST) return;
      saveSetSummary();
      if (run.currentSet >= run.totalSets) finishRunFlow();
      else beginIntermission();
    }, CONFIG.rules.hiddenStopSeconds * 1000);
  }

  function clearAllTimers() {
    timers.forEach((id) => window.clearTimeout(id));
    timers = [];
    clearActiveCompressionTimer();
    clearStopTestTimer();
  }

  function armActiveCompressionTimer() {
    clearActiveCompressionTimer();
    if (!run || state !== STATE.ACTIVE || run.currentSetClicks >= CONFIG.rules.compressionsPerSet) return;

    // Schedule just past the exact 1000 ms boundary so exactly 60 CPM remains legal.
    activeCompressionTimer = window.setTimeout(() => {
      if (!run || state !== STATE.ACTIVE || run.currentSetClicks >= CONFIG.rules.compressionsPerSet) return;
      const elapsed = performance.now() - run.lastClickTime;
      if (elapsed > CONFIG.rules.activeCompressionTimeoutMs) {
        failRun(CONFIG.text.fail.timedOut);
      } else {
        armActiveCompressionTimer();
      }
    }, CONFIG.rules.activeCompressionTimeoutMs + 1);
  }

  function resetEscapeState() {
    escapeArmed = false;
    ui.quitHint.classList.add("hidden");
    if (escapeTimer) {
      clearTimeout(escapeTimer);
      escapeTimer = null;
    }
  }

  // ------------------------------------------------------------
  // Audio
  // ------------------------------------------------------------

  function initAudioGraph() {
    if (audioContext) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    try {
      audioContext = new Ctx({ latencyHint: "interactive" });
    } catch (_) {
      audioContext = new Ctx();
    }

    masterGainNode = audioContext.createGain();
    clickBusNode = audioContext.createGain();
    guideBusNode = audioContext.createGain();

    clickBusNode.gain.value = 1;
    guideBusNode.gain.value = 1;
    clickBusNode.connect(masterGainNode);
    guideBusNode.connect(masterGainNode);
    masterGainNode.connect(audioContext.destination);
    applyMasterVolume();
  }

  function applyMasterVolume() {
    if (!masterGainNode || !audioContext) return;
    masterGainNode.gain.setValueAtTime(Math.max(0, Math.min(1.5, masterVolume)), audioContext.currentTime);
  }

  function resumeAudio() {
    initAudioGraph();
    if (audioContext?.state === "suspended") {
      audioContext.resume().catch(() => {});
    }
  }

  async function loadAudioBuffer(path) {
    try {
      initAudioGraph();
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      return await audioContext.decodeAudioData(bytes);
    } catch (_) {
      return null;
    }
  }

  async function preloadCustomSounds() {
    [clickBuffer, guideBuffer] = await Promise.all([
      loadAudioBuffer(CONFIG.audio.clickFile),
      loadAudioBuffer(CONFIG.audio.guideFile)
    ]);
  }

  function playBuffer(buffer, bus, when = null) {
    if (!audioContext || !buffer || !bus) return;
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(bus);
    source.start(when ?? audioContext.currentTime);
  }

  function fallbackTone(frequency, duration, gainScale, bus, when = null) {
    if (!audioContext || !bus) return;
    const start = when ?? audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    const peak = Math.max(0.0002, Math.min(1, gainScale));
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(peak, start + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(bus);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  function playCompressionSound(when = null) {
    resumeAudio();
    const buffer = run ? run.audioClickBuffer : clickBuffer;
    if (buffer) playBuffer(buffer, clickBusNode, when);
    else fallbackTone(CONFIG.audio.fallbackClickFrequencyHz, CONFIG.audio.fallbackClickDurationSeconds, CONFIG.audio.fallbackClickGain, clickBusNode, when);
  }

  function playGuideSound(when = null) {
    resumeAudio();
    const buffer = run ? run.audioGuideBuffer : guideBuffer;
    if (buffer) playBuffer(buffer, guideBusNode, when);
    else fallbackTone(CONFIG.audio.fallbackGuideFrequencyHz, CONFIG.audio.fallbackGuideDurationSeconds, CONFIG.audio.fallbackGuideGain, guideBusNode, when);
  }

  function startGuide() {
    stopGuide();

    if (!run?.guides || !audioContext) return;

    const intervalSeconds = 60 / CONFIG.rules.guideCpm;
    const intervalMs = intervalSeconds * 1000;

    const anchor = audioContext.currentTime;

    /*
    * Initial confirmation beep after the first compression.
    *
    * This is NOT one of the repeating metronome beats.
    */
    playGuideSound(
      anchor + CONFIG.audio.initialGuideBeepDelayMs / 1000
    );

    /*
    * The first approach circle starts immediately after
    * compression #1 and reaches the target at the first
    * real 110 CPM guide beat.
    */
    showGuideVisual();
    animateApproachCircle(intervalMs);

    let nextTime = anchor + intervalSeconds;

    const token = Symbol("guide");

    guideScheduler = {
      token,
      intervalId: null
    };


    function scheduleVisualBeat(beatTime) {
      const delayMs =
        Math.max(
          0,
          (beatTime - audioContext.currentTime) * 1000
        );

      const timer = window.setTimeout(() => {
        if (
          !guideScheduler ||
          guideScheduler.token !== token ||
          state !== STATE.ACTIVE
        ) {
          return;
        }

        /*
        * The previous ring has now reached the target.
        */
        flashGuideTarget();

        /*
        * Immediately start the next approach circle.
        */
        animateApproachCircle(intervalMs);

      }, delayMs);

      guideVisualTimers.push(timer);
    }


    const scheduler = () => {
      if (
        !guideScheduler ||
        guideScheduler.token !== token ||
        state !== STATE.ACTIVE
      ) {
        return;
      }

      /*
      * Schedule audio slightly ahead using Web Audio,
      * just like the existing v4 implementation.
      */
      while (
        nextTime <
        audioContext.currentTime + 0.12
      ) {
        playGuideSound(nextTime);

        /*
        * Schedule the visual contact at the same intended
        * beat time.
        */
        scheduleVisualBeat(nextTime);

        nextTime += intervalSeconds;
      }
    };

    scheduler();

    guideScheduler.intervalId =
      window.setInterval(scheduler, 20);
  }

  function stopGuide() {
    if (guideScheduler?.intervalId) {
      clearInterval(guideScheduler.intervalId);
    }

    guideScheduler = null;

    hideGuideVisual();
  }

  // ------------------------------------------------------------
  // Visual / chart helpers
  // ------------------------------------------------------------
  function showGuideVisual() {
    if (!run?.guides ||
    !CONFIG.rules.guideVisual?.enabled) {
      hideGuideVisual();
      return;
    }

    ui.approachCircle.classList.remove("hidden");
  }


  function hideGuideVisual() {
    ui.approachCircle.classList.add("hidden");

    // Stop any currently running approach animation.
    ui.approachCircle
      .getAnimations()
      .forEach(animation => animation.cancel());

    // Cancel any scheduled visual beat resets.
    guideVisualTimers.forEach(timer => clearTimeout(timer));
    guideVisualTimers = [];
  }


  function animateApproachCircle(durationMs) {
    if (
      !run?.guides ||
      !CONFIG.rules.guideVisual?.enabled ||
      state !== STATE.ACTIVE
    ) {
      return;
    }

    showGuideVisual();

    // Cancel only the previous approach animation.
    ui.approachCircle
      .getAnimations()
      .forEach(animation => animation.cancel());

    ui.approachCircle.animate(
      [
        {
          transform:
            `scale(${CONFIG.rules.guideVisual.approachScale})`,
          opacity: 0.65
        },
        {
          transform: "scale(1)",
          opacity: 1
        }
      ],
      {
        duration: durationMs,
        easing: "linear",
        fill: "forwards"
      }
    );
  }


  function flashGuideTarget() {
    ui.compressionPulse.classList.remove("guide-beat");

    // Force the browser to recognize the class reset.
    void ui.compressionPulse.offsetWidth;

    ui.compressionPulse.classList.add("guide-beat");
  }
  function pulse() {
    ui.compressionPulse.classList.remove("hit");
    void ui.compressionPulse.offsetWidth;
    ui.compressionPulse.classList.add("hit");
  }

  function classForTier(tier) { return `j-${tier}`; }

  function barHeightForCpm(cpm) {
    if (cpm == null) return 18;
    const normalized = Math.max(0, Math.min(1, (cpm - 50) / 120));
    return 24 + normalized * 150;
  }

  function makeBar(record) {
    const bar = document.createElement("div");
    bar.className = `cpm-bar ${record.tier}`;
    bar.style.height = `${barHeightForCpm(record.cpm)}px`;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = record.cpm == null ? (record.lateStart ? "LATE" : "START") : Math.round(record.cpm).toString();

    const index = document.createElement("span");
    index.className = "bar-index";
    index.textContent = record.index.toString();

    bar.append(value, index);
    return bar;
  }

  function updatePractice(record) {
    if (!run.practice) return;
    ui.practiceCount.textContent = `${run.currentSetClicks} / ${CONFIG.rules.compressionsPerSet}`;
    ui.practiceJudgement.textContent = record.label.toUpperCase();
    ui.practiceJudgement.className = classForTier(record.tier);
    ui.practiceCpm.textContent = record.cpm == null ? "START" : record.cpm.toFixed(1);
    const avg = average(run.currentSetData.cpms);
    ui.practiceAverage.textContent = Number.isFinite(avg) ? avg.toFixed(1) : "—";
    ui.practiceAccuracy.textContent = `${currentAccuracy().toFixed(2)}%`;
    ui.cpmChart.appendChild(makeBar(record));
    ui.cpmChart.parentElement.scrollLeft = ui.cpmChart.parentElement.scrollWidth;
  }

  // ------------------------------------------------------------
  // Scoring
  // ------------------------------------------------------------

  function judgementFromCpm(cpm) {
    const r = CONFIG.rules;

    // Slow-side failure is intentionally absent: >1 second is already handled
    // by the active timeout. Exactly 60 CPM remains a legal Miss.
    if (cpm > r.missFastMax) {
      return { fail: true, failInfo: CONFIG.text.fail.tooFast };
    }
    if (cpm >= r.perfectMin && cpm <= r.perfectMax) {
      return { tier: "perfect", label: CONFIG.text.judgement.perfect, points: r.perfectPoints };
    }
    if (cpm >= r.okSlowMin && cpm < r.perfectMin) {
      return { tier: "ok", label: CONFIG.text.judgement.okSlow, points: r.okPoints };
    }
    if (cpm > r.perfectMax && cpm <= r.okFastMax) {
      return { tier: "ok", label: CONFIG.text.judgement.okFast, points: r.okPoints };
    }
    if (cpm >= r.mehSlowMin && cpm < r.okSlowMin) {
      return { tier: "meh", label: CONFIG.text.judgement.mehSlow, points: r.mehPoints };
    }
    if (cpm > r.okFastMax && cpm <= r.mehFastMax) {
      return { tier: "meh", label: CONFIG.text.judgement.mehFast, points: r.mehPoints };
    }
    if (cpm >= r.missSlowMin && cpm < r.mehSlowMin) {
      return { tier: "miss", label: CONFIG.text.judgement.missSlow, points: r.missPoints };
    }
    return { tier: "miss", label: CONFIG.text.judgement.missFast, points: r.missPoints };
  }

  function recordScoredClick(judgement, cpm, intervalMs, lateStart = false) {
    const index = run.currentSetClicks;
    const record = { index, cpm, intervalMs, tier: judgement.tier, label: judgement.label, points: judgement.points, lateStart };

    run.points += judgement.points;
    run.totalScoredClicks += 1;
    run.counts[judgement.tier] += 1;

    const s = run.currentSetData;
    s.points += judgement.points;
    s.counts[judgement.tier] += 1;
    s.records.push(record);
    if (lateStart) s.lateStart = true;

    if (cpm != null) {
      run.allCpms.push(cpm);
      s.cpms.push(cpm);
    }
    if (intervalMs != null) {
      run.allIntervalsMs.push(intervalMs);
      s.intervalsMs.push(intervalMs);
    }

    return record;
  }

  function currentAccuracy() {
    if (!run || run.totalScoredClicks <= 0) return 100;
    const max = run.totalScoredClicks * CONFIG.rules.perfectPoints;
    return Math.min(100, Math.max(0, (run.points - run.penalties) / max * 100));
  }

  function finalAccuracy() {
    const expectedClicks = run.totalSets * CONFIG.rules.compressionsPerSet;
    const max = expectedClicks * CONFIG.rules.perfectPoints;
    return Math.min(100, Math.max(0, (run.points - run.penalties) / max * 100));
  }

  function getRank(accuracy) {
    return CONFIG.rules.ranks.find((r) => {
      const aboveMin = accuracy >= r.min;
      const belowMax = r.includeMax ? accuracy <= r.max : accuracy < r.max;
      return aboveMin && belowMax;
    }) || CONFIG.rules.ranks[CONFIG.rules.ranks.length - 1];
  }

  function getPpInfo(accuracy) {
    if (run.guides) {
      return { available: false, text: CONFIG.text.ppUnavailableWithGuide };
    }

    let maxPp;
    if (run.practice) maxPp = CONFIG.rules.pp.practiceMax;
    else if (run.fiveCycles) maxPp = CONFIG.rules.pp.fiveCyclesMax;
    else maxPp = CONFIG.rules.pp.normalMax;

    const pp = Math.floor(maxPp * (accuracy / 100));
    return { available: true, pp, maxPp, text: `${pp}/${maxPp}` };
  }

  function average(values) {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
  }

  function stdDev(values) {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
  }

  function minOrNa(values) { return values.length ? Math.min(...values) : NaN; }
  function maxOrNa(values) { return values.length ? Math.max(...values) : NaN; }

  // ------------------------------------------------------------
  // Run flow
  // ------------------------------------------------------------

  function startRunFromTitle(timestamp) {
    clearAllTimers();
    stopGuide();
    resetEscapeState();
    closeTutorial();
    run = freshRun();
    state = STATE.ACTIVE;
    showScreen("game");
    ui.statusText.textContent = "";
    ui.normalFeedback.textContent = "";
    ui.practicePanel.classList.toggle("hidden", !run.practice);
    ui.cpmChart.innerHTML = "";
    resumeAudio();
    registerFirstClick(timestamp, false);
  }

  function registerFirstClick(timestamp, late) {
    run.currentSetClicks = 1;
    run.lastClickTime = timestamp;

    const judgement = late
      ? { tier: "meh", label: CONFIG.text.judgement.lateStart, points: CONFIG.rules.mehPoints }
      : { tier: "perfect", label: CONFIG.text.judgement.perfect, points: CONFIG.rules.perfectPoints };

    if (late) run.lateStarts += 1;
    const record = recordScoredClick(judgement, null, null, late);

    playCompressionSound();
    pulse();
    if (run.practice) updatePractice(record);
    startGuide();
    armActiveCompressionTimer();
  }

  function registerCompression(timestamp) {
    if (state === STATE.STOP_TEST) {
      run.overclicks += 1;
      run.penalties += CONFIG.rules.overclickPenalty;
      run.currentSetData.overclicks += 1;
      run.currentSetData.penalties += CONFIG.rules.overclickPenalty;
      playCompressionSound();
      pulse();

      if (run.currentSetData.overclicks > CONFIG.rules.maxAllowedOverclicksPerSet) {
        failRun(CONFIG.text.fail.overclicks);
      } else {
        armStopTestTimer();
      }
      return;
    }

    if (state === STATE.RESTART_WINDOW) {
      state = STATE.ACTIVE;
      ui.statusText.textContent = "";
      registerFirstClick(timestamp, false);
      return;
    }

    if (state === STATE.RESTART_LATE) {
      state = STATE.ACTIVE;
      ui.statusText.textContent = "";
      registerFirstClick(timestamp, true);
      return;
    }

    if (state !== STATE.ACTIVE) return;

    const deltaMs = timestamp - run.lastClickTime;
    if (deltaMs <= 0) return;

    if (deltaMs > CONFIG.rules.activeCompressionTimeoutMs) {
      failRun(CONFIG.text.fail.timedOut);
      return;
    }

    const cpm = 60000 / deltaMs;
    const judgement = judgementFromCpm(cpm);
    if (judgement.fail) {
      failRun(judgement.failInfo);
      return;
    }

    clearActiveCompressionTimer();
    run.currentSetClicks += 1;
    run.lastClickTime = timestamp;
    const record = recordScoredClick(judgement, cpm, deltaMs, false);

    playCompressionSound();
    pulse();
    if (run.practice) updatePractice(record);

    if (run.currentSetClicks >= CONFIG.rules.compressionsPerSet) finishSet();
    else armActiveCompressionTimer();
  }

  function finishSet() {
    clearActiveCompressionTimer();
    stopGuide();
    state = STATE.STOP_TEST;
    ui.statusText.textContent = "";
    ui.normalFeedback.textContent = "";
    armStopTestTimer();
  }

  function saveSetSummary() {
    const s = run.currentSetData;
    const max = CONFIG.rules.compressionsPerSet * CONFIG.rules.perfectPoints;
    s.accuracy = Math.max(0, Math.min(100, (s.points - s.penalties) / max * 100));
    s.averageCpm = average(s.cpms);
    s.minCpm = minOrNa(s.cpms);
    s.maxCpm = maxOrNa(s.cpms);
    s.consistencyMs = stdDev(s.intervalsMs);
    run.setSummaries.push(s);
  }

  function beginIntermission() {
    state = STATE.INTERMISSION;
    showScreen("intermission");
    ui.intermissionTopTitle.textContent = CONFIG.text.intermissionTitle;
    ui.intermissionAccuracy.textContent = run.hideMidAccuracy ? "" : `Accuracy so far: ${currentAccuracy().toFixed(2)}%`;

    let remaining = CONFIG.rules.visibleRestSeconds;
    ui.intermissionCountdown.textContent = remaining.toString();

    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        beginRestartWindow();
        return;
      }
      ui.intermissionCountdown.textContent = remaining.toString();
      addTimer(tick, 1000);
    };

    addTimer(tick, 1000);
  }

  function beginRestartWindow() {
    run.currentSet += 1;
    run.currentSetClicks = 0;
    run.lastClickTime = null;
    run.currentSetData = makeSetData(run.currentSet);

    showScreen("game");
    state = STATE.RESTART_WINDOW;
    ui.practicePanel.classList.toggle("hidden", !run.practice);
    ui.cpmChart.innerHTML = "";

    if (run.practice) {
      ui.practiceCount.textContent = `0 / ${CONFIG.rules.compressionsPerSet}`;
      ui.practiceJudgement.textContent = "—";
      ui.practiceJudgement.className = "";
      ui.practiceCpm.textContent = "—";
      ui.practiceAverage.textContent = "—";
      ui.practiceAccuracy.textContent = `${currentAccuracy().toFixed(2)}%`;
    }

    ui.statusText.textContent = "Press any key or click to start the next set";

    addTimer(() => {
      if (state !== STATE.RESTART_WINDOW) return;
      state = STATE.RESTART_LATE;
      ui.statusText.textContent = "Late — start now";

      addTimer(() => {
        if (state === STATE.RESTART_LATE) failRun(CONFIG.text.fail.noRestart);
      }, CONFIG.rules.restartFailAfterAdditionalSeconds * 1000);
    }, CONFIG.rules.restartPerfectWindowSeconds * 1000);
  }

  function finishRunFlow() {
    const shouldShowFiveCycleEnding = run.fiveCycles && !run.practice && !run.guides;
    if (!shouldShowFiveCycleEnding) {
      completeRun();
      return;
    }

    state = STATE.ENDING;
    showScreen("ending");
    ui.endingText.textContent = CONFIG.text.fiveCycleEnding.checkingPulse;

    addTimer(() => {
      if (state !== STATE.ENDING) return;

      const rank = getRank(finalAccuracy());
      const pulselessRanks = CONFIG.text.fiveCycleEnding.pulselessRanks || ["D"];
      const remainsPulseless = pulselessRanks.includes(rank.rank);
      ui.endingText.textContent = remainsPulseless
        ? CONFIG.text.fiveCycleEnding.stillPulseless
        : CONFIG.text.fiveCycleEnding.pulseFound;

      addTimer(() => {
        if (state === STATE.ENDING) completeRun();
      }, CONFIG.rules.fiveCycleEnding.outcomeDurationMs);
    }, CONFIG.rules.fiveCycleEnding.checkingPulseDurationMs);
  }

  // ------------------------------------------------------------
  // Result rendering
  // ------------------------------------------------------------

  function makeStatCard(label, value) {
    const card = document.createElement("div");
    card.className = "stat-card";
    const l = document.createElement("span");
    l.className = "stat-label";
    l.textContent = label;
    const v = document.createElement("div");
    v.className = "stat-value";
    v.textContent = value;
    card.append(l, v);
    return card;
  }

  function renderMods() {
    ui.modsList.innerHTML = "";
    const mods = [];
    if (run.practice) mods.push("Practice mode");
    if (run.guides) mods.push("Guide enabled");
    if (run.fiveCycles) mods.push("5 cycles");
    if (!mods.length) mods.push("No mods");

    mods.forEach((name) => {
      const chip = document.createElement("div");
      chip.className = `mod-chip${name === "No mods" ? " none" : ""}`;
      chip.textContent = name;
      ui.modsList.appendChild(chip);
    });
  }

  function renderOverallStats(accuracy) {
    ui.overallStats.innerHTML = "";
    const avg = average(run.allCpms);
    const min = minOrNa(run.allCpms);
    const max = maxOrNa(run.allCpms);
    const consistency = stdDev(run.allIntervalsMs);
    const expectedMax = run.totalSets * CONFIG.rules.compressionsPerSet * CONFIG.rules.perfectPoints;
    const net = Math.max(0, run.points - run.penalties);
    const pp = getPpInfo(accuracy);

    const stats = [
      ["PP", pp.text],
      ["Net points", `${net} / ${expectedMax}`],
      ["Average CPM", Number.isFinite(avg) ? avg.toFixed(1) : "—"],
      ["Slowest CPM", Number.isFinite(min) ? min.toFixed(1) : "—"],
      ["Fastest CPM", Number.isFinite(max) ? max.toFixed(1) : "—"],
      ["Consistency (SD)", `${consistency.toFixed(1)} ms`],
      ["Overclicks", run.overclicks.toString()],
      ["Late starts", run.lateStarts.toString()]
    ];

    stats.forEach(([label, value]) => ui.overallStats.appendChild(makeStatCard(label, value)));
  }

  function renderOverallCounts() {
    ui.overallCounts.innerHTML = "";
    [
      ["Perfect", run.counts.perfect, "j-perfect"],
      ["OK", run.counts.ok, "j-ok"],
      ["Meh", run.counts.meh, "j-meh"],
      ["Miss", run.counts.miss, "j-miss"]
    ].forEach(([name, value, cls]) => {
      const card = document.createElement("div");
      card.className = "count-card";
      const strong = document.createElement("strong");
      strong.className = cls;
      strong.textContent = value;
      const span = document.createElement("span");
      span.textContent = name;
      card.append(strong, span);
      ui.overallCounts.appendChild(card);
    });
  }

  function renderSetResults() {
    ui.setResults.innerHTML = "";

    run.setSummaries.forEach((s) => {
      const card = document.createElement("section");
      card.className = "set-card";

      const head = document.createElement("div");
      head.className = "set-head";
      const title = document.createElement("h3");
      title.textContent = `Set ${s.set}`;
      const acc = document.createElement("div");
      acc.className = "set-accuracy";
      acc.textContent = `${s.accuracy.toFixed(2)}%`;
      head.append(title, acc);
      card.appendChild(head);

      const meta = document.createElement("div");
      meta.className = "set-meta";
      [
        ["Average CPM", Number.isFinite(s.averageCpm) ? s.averageCpm.toFixed(1) : "—"],
        ["Slowest CPM", Number.isFinite(s.minCpm) ? s.minCpm.toFixed(1) : "—"],
        ["Fastest CPM", Number.isFinite(s.maxCpm) ? s.maxCpm.toFixed(1) : "—"],
        ["Consistency", `${s.consistencyMs.toFixed(1)} ms`],
        ["Extras", s.overclicks.toString()]
      ].forEach(([label, value]) => meta.appendChild(makeStatCard(label, value)));
      card.appendChild(meta);

      const counts = document.createElement("div");
      counts.className = "set-counts";
      [
        `Perfect ${s.counts.perfect}`,
        `OK ${s.counts.ok}`,
        `Meh ${s.counts.meh}`,
        `Miss ${s.counts.miss}`,
        `Penalty -${s.penalties}`,
        s.lateStart ? "Late start: yes" : "Late start: no"
      ].forEach((text) => {
        const el = document.createElement("span");
        el.className = "mini-count";
        el.textContent = text;
        counts.appendChild(el);
      });
      card.appendChild(counts);

      const wrap = document.createElement("div");
      wrap.className = "result-chart-wrap";
      const chart = document.createElement("div");
      chart.className = "result-chart";
      s.records.forEach((record) => chart.appendChild(makeBar(record)));
      wrap.appendChild(chart);
      card.appendChild(wrap);

      ui.setResults.appendChild(card);
    });
  }

  function completeRun() {
    stopGuide();
    clearAllTimers();
    resetEscapeState();
    state = STATE.RESULT;
    showScreen("result");

    const accuracy = finalAccuracy();
    const rank = getRank(accuracy);
    ui.resultAccuracy.textContent = `${accuracy.toFixed(2)}%`;
    ui.resultRank.textContent = rank.rank;
    ui.resultRankSubtitle.textContent = rank.subtitle;

    renderMods();
    renderOverallStats(accuracy);
    renderOverallCounts();
    renderSetResults();
    document.querySelector(".results-shell").scrollTop = 0;
  }

  function failRun(failInfo) {
    stopGuide();
    clearAllTimers();
    resetEscapeState();
    failDismissReady = false;
    state = STATE.FAILED;
    showScreen("fail");
    ui.failReason.textContent = failInfo?.title ?? "Run failed.";
    ui.failSubtitle.textContent = failInfo?.subtitle ?? "";
    ui.failReturnHint.classList.add("hidden");

    addTimer(() => {
      if (state !== STATE.FAILED) return;
      failDismissReady = true;
      ui.failReturnHint.classList.remove("hidden");
    }, CONFIG.rules.failDismissDelayMs);
  }

  function quitRun() {
    stopGuide();
    clearAllTimers();
    resetEscapeState();
    closeTutorial();
    failDismissReady = false;
    ui.failReturnHint.classList.add("hidden");
    run = null;
    state = STATE.TITLE;
    showScreen("title");
  }

  // ------------------------------------------------------------
  // Input
  // ------------------------------------------------------------

  function handleCompressionInput(eventTime) {
    const timestamp = Number.isFinite(eventTime) ? eventTime : performance.now();

    if (state === STATE.TITLE) {
      if (!tutorialOpen) startRunFromTitle(timestamp);
      return;
    }
    if (state === STATE.FAILED) {
      if (failDismissReady) quitRun();
      return;
    }
    if (state === STATE.RESULT || state === STATE.INTERMISSION) return;

    registerCompression(timestamp);
  }

  function handleEscape() {
    if (tutorialOpen) {
      closeTutorial();
      return;
    }
    if (state === STATE.TITLE || state === STATE.RESULT || state === STATE.FAILED) return;

    if (!escapeArmed) {
      escapeArmed = true;
      ui.quitHint.classList.remove("hidden");
      escapeTimer = setTimeout(() => {
        escapeArmed = false;
        ui.quitHint.classList.add("hidden");
        escapeTimer = null;
      }, CONFIG.rules.escapeDoublePressWindowMs);
      return;
    }

    quitRun();
  }

  document.addEventListener("keydown", (event) => {
    if (event.repeat) return;

    resumeAudio();

    if (event.key === "Escape") {
      event.preventDefault();
      handleEscape();
      return;
    }

    if (tutorialOpen) return;

    if (state === STATE.TITLE && ["INPUT", "BUTTON", "LABEL"].includes(document.activeElement?.tagName)) return;

    event.preventDefault();
    handleCompressionInput(performance.now());
  }, { passive: false });

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    resumeAudio();

    if (event.target.closest(".toggles, .volume-box, .tutorial-modal, #returnButton")) return;
    if (state === STATE.RESULT || state === STATE.INTERMISSION) return;

    event.preventDefault();
    handleCompressionInput(performance.now());
  }, { passive: false });

  ui.returnButton.addEventListener("click", (event) => {
    event.stopPropagation();
    quitRun();
  });

  // ------------------------------------------------------------
  // Initialize
  // ------------------------------------------------------------

  showScreen("title");
  initAudioGraph();
  preloadCustomSounds();
})();
