// ============================================================
// CPR TIMING SIMULATOR — EASY-TO-TWEAK CONFIG
// Edit most balance values, text, ranks, tutorial content and audio here.
// ============================================================

const CONFIG = {
  text: {
    title: "CPR timing simulator",
    subtitle: "can you time your CPR chest compressions perfectly?",
    startTitle: "press any keys or mouse click to start compression",
    startSubtitle: "aim for 100-120 CPM!",
    intermissionTitle: "breathing through ambu bag...",

    fiveCycleEnding: {
      checkingPulse: "checking pulse again...",
      pulseFound: "patient has a pulse!",
      stillPulseless: "still pulseless, keep compressing",
      // Which result ranks use the pulseless ending. Everything else uses pulseFound.
      pulselessRanks: ["D"]
    },

    judgement: {
      perfect: "perfect",
      okFast: "a bit fast",
      okSlow: "a bit slow",
      mehFast: "fast",
      mehSlow: "slow",
      missFast: "too fast",
      missSlow: "too slow",
      lateStart: "late start"
    },

    fail: {
      tooFast: {
        title: "Compression rate exceeded 160 CPM.",
        subtitle: "easy there, this is CPR, not a speedrun."
      },
      timedOut: {
        title: "More than 1 second passed without the next compression.",
        subtitle: "what are you waiting for, the patient to consent?"
      },
      noRestart: {
        title: "You did not restart compressions in time.",
        subtitle: "breathing time's over. back to compressing boy."
      },
      overclicks: {
        title: "Too many extra compressions after 30.",
        subtitle: "too much compressing, too little breathing."
      }
    },

    ppUnavailableWithGuide: "not available with guide",

    tutorial: {
      title: "Tutorial",
      closeText: "Close tutorial",
      sections: [
        {
          heading: "The game",
          paragraphs: [
            "Press any keyboard key, click the mouse, or tap the screen. That is the whole game.",
            "The first input starts the run and counts as compression 1. Each set contains 30 compressions. Aim for 100-120 compressions per minute (CPM)."
          ]
        },
        {
          heading: "Judgements",
          paragraphs: [
            "100-120 CPM = Perfect (30 points). 90-100 or 120-130 CPM = Ok (10 points). 80-90 or 130-140 CPM = Meh (5 points). 60-80 or 140-160 CPM = Missed (0 points).",
            "Going above 160 CPM fails the run immediately. Waiting more than 1 second for the next compression also fails the run."
          ]
        },
        {
          heading: "Stopping after 30",
          paragraphs: [
            "After compression 30, there is a 3-second stop where you must stop compressing. Each extra compression costs 15 accuracy points. Up to 5 extras are tolerated; the 6th extra instantly fails the run.",
            "After the stop, the game gives a 7-second rest before the next set. Inputs during the rest are ignored."
          ]
        },
        {
          heading: "Starting the next set",
          paragraphs: [
            "When the next set is ready, you have 3 seconds to start. Starting within that window makes the first compression Perfect.",
            "If you start during the following 5 seconds, that first compression is only Meh. If you still do not start, the run fails instantly."
          ]
        },
        {
          heading: "Normal mode",
          paragraphs: [
            "During a set, almost everything is hidden. You only get visual and audio confirmation that your input registered. You do not see your live judgement, CPM, count, or accuracy.",
            "Unless 'hide accuracy in between sets' is enabled, your current accuracy so far is briefly shown between sets."
          ]
        },
        {
          heading: "Practice mode",
          paragraphs: [
            "Practice mode shows youlive stats so you can notice rhythm drift while it happens.",
          ]
        },
        {
          heading: "Guide mode",
          paragraphs: [
            "Provide a chain of beeping beats and shrinking circle visuals after the first compression of each set on an independent 110 CPM rhythm (one beat about every 0.545 seconds). It does not resync to your later clicks.",
            "Helps provide a visible and audio cue to sync your rhythm to."
          ]
        },
        {
          heading: "5 cycles",
          paragraphs: [
            "5 cycles changes the run from 2 sets to 5 sets, for 150 expected compressions total.",
          ]
        },
        {
          heading: "Accuracy and rank",
          paragraphs: [
            "Accuracy is based on the points earned from all expected compressions minus overclick penalties. The result is ranked either SS, S, A, B, C, or D.",
          ]
        },
        {
          heading: "Quitting and limitations",
          paragraphs: [
            "Press Esc twice within the short confirmation window to abandon the current run and return to the title without results.",
            "This game measures timing only. A keyboard, mouse, or touchscreen cannot measure real chest-compression depth, recoil, hand placement, or force, so this is a timing simulator rather than a complete CPR skills assessment."
          ]
        }
      ]
    }
  },

  rules: {
    compressionsPerSet: 30,
    normalSets: 2,
    fiveCycleSets: 5,

    perfectPoints: 30,
    okPoints: 10,
    mehPoints: 5,
    missPoints: 0,
    overclickPenalty: 15,
    maxAllowedOverclicksPerSet: 5,

    // CPM windows
    perfectMin: 100,
    perfectMax: 120,
    okSlowMin: 90,
    okFastMax: 130,
    mehSlowMin: 80,
    mehFastMax: 140,
    missSlowMin: 60,
    missFastMax: 160,

    // Waiting longer than this during an active set fails the run.
    // 1000 ms exactly is still 60 CPM and therefore a legal Miss.
    activeCompressionTimeoutMs: 1000,

    hiddenStopSeconds: 3,
    visibleRestSeconds: 7,
    restartPerfectWindowSeconds: 3,
    restartFailAfterAdditionalSeconds: 5,

    // Delay before the fail screen accepts an input to return to title.
    failDismissDelayMs: 1000,

    // Special 5-cycle ending shown only when Practice and Sound guide are both off.
    fiveCycleEnding: {
      checkingPulseDurationMs: 2500,
      outcomeDurationMs: 2500
    },

    guideCpm: 110,

    guideVisual: {
      enabled:true,
      approachScale: 3.0
    },                                

    escapeDoublePressWindowMs: 1500,

    // Joke PP values. PP = floor(maxPP * finalAccuracy / 100).
    pp: {
      normalMax: 12,
      practiceMax: 7,
      fiveCyclesMax: 28
    },

    // Rank ranges are editable here. min is inclusive.
    // max is exclusive unless includeMax is true.
    ranks: [
      { rank: "SS", min: 100, max: 100, includeMax: true, subtitle: "did you cheat son 🥀" },
      { rank: "S",  min: 95,  max: 100, includeMax: false, subtitle: "you did very well. extremely well, even." },
      { rank: "A",  min: 90,  max: 95,  includeMax: false, subtitle: "you did great, could save a life one day." },
      { rank: "B",  min: 80,  max: 90,  includeMax: false, subtitle: "you did ok, but could do a bit more practice." },
      { rank: "C",  min: 65,  max: 80,  includeMax: false, subtitle: "not bad, but not good either. hit practice mode today!" },
      { rank: "D",  min: 0,   max: 65,  includeMax: false, subtitle: "bro gotta listen to some baby shark 😭 (115 BPM)" }
    ]
  },

  audio: {
    // Put your own files here if desired. If loading fails, generated tones are used.
    clickFile: "assets/click.wav",
    guideFile: "assets/guide.wav",

    defaultMasterVolume: 0.90,

    // Web Audio is created with latencyHint: "interactive" for responsive playback.
    initialGuideBeepDelayMs: 35,

    fallbackClickFrequencyHz: 220,
    fallbackClickDurationSeconds: 0.045,
    fallbackClickGain: 0.75,

    fallbackGuideFrequencyHz: 980,
    fallbackGuideDurationSeconds: 0.070,
    fallbackGuideGain: 0.75
  }
};
