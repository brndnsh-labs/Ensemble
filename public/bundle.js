(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn2, res) => function __init() {
    return fn2 && (res = (0, fn2[__getOwnPropNames(fn2)[0]])(fn2 = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // public/config.js
  var APP_VERSION, KEY_ORDER, ENHARMONIC_MAP, ROMAN_VALS, NNS_OFFSETS, INTERVAL_TO_NNS, INTERVAL_TO_ROMAN, TIME_SIGNATURES, MIXER_GAIN_MULTIPLIERS;
  var init_config = __esm({
    "public/config.js"() {
      APP_VERSION = "2.44";
      KEY_ORDER = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
      ENHARMONIC_MAP = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
      ROMAN_VALS = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
      NNS_OFFSETS = [0, 2, 4, 5, 7, 9, 11];
      INTERVAL_TO_NNS = {
        0: "1",
        1: "b2",
        2: "2",
        3: "b3",
        4: "3",
        5: "4",
        6: "b5",
        7: "5",
        8: "b6",
        9: "6",
        10: "b7",
        11: "7"
      };
      INTERVAL_TO_ROMAN = {
        0: "I",
        1: "bII",
        2: "II",
        3: "bIII",
        4: "III",
        5: "IV",
        6: "bV",
        7: "V",
        8: "bVI",
        9: "VI",
        10: "bVII",
        11: "VII"
      };
      TIME_SIGNATURES = {
        "2/4": {
          beats: 2,
          stepsPerBeat: 4,
          subdivision: "16th",
          pulse: [0, 4],
          grouping: [2],
          backbeat: [1]
        },
        "3/4": {
          beats: 3,
          stepsPerBeat: 4,
          subdivision: "16th",
          pulse: [0, 4, 8],
          grouping: [3],
          backbeat: [2]
        },
        "4/4": {
          beats: 4,
          stepsPerBeat: 4,
          subdivision: "16th",
          pulse: [0, 4, 8, 12],
          grouping: [2, 2],
          backbeat: [1, 3]
        },
        "5/4": {
          beats: 5,
          stepsPerBeat: 4,
          subdivision: "16th",
          pulse: [0, 4, 8, 12, 16],
          grouping: [3, 2],
          backbeat: [1, 3]
        },
        "6/8": {
          beats: 6,
          stepsPerBeat: 2,
          subdivision: "8th",
          pulse: [0, 6],
          grouping: [3, 3],
          isCompound: true,
          backbeat: [1]
        },
        "7/8": {
          beats: 7,
          stepsPerBeat: 2,
          subdivision: "8th",
          pulse: [0, 4, 8],
          grouping: [2, 2, 3],
          backbeat: [1, 2]
        },
        "7/4": {
          beats: 7,
          stepsPerBeat: 4,
          subdivision: "16th",
          pulse: [0, 4, 8, 12, 16, 20, 24],
          grouping: [4, 3],
          backbeat: [1, 3, 5]
        },
        "12/8": {
          beats: 12,
          stepsPerBeat: 2,
          subdivision: "8th",
          pulse: [0, 6, 12, 18],
          grouping: [3, 3, 3, 3],
          isCompound: true,
          backbeat: [1, 3]
        }
      };
      MIXER_GAIN_MULTIPLIERS = {
        master: 0.85,
        chords: 0.3,
        // Primary harmonic focus
        bass: 0.32,
        // Tucked from 0.35
        soloist: 0.38,
        // Primary melodic focus
        harmonies: 0.22,
        // Supportive background
        drums: 0.52
        // Supportive rhythm
      };
    }
  });

  // public/constants.js
  var MODULES;
  var init_constants = __esm({
    "public/constants.js"() {
      MODULES = {
        BASS: "bass",
        SOLOIST: "soloist",
        DRUMS_VIS: "drums_vis",
        CHORDS: "chords",
        HARMONIES: "harmonies",
        PLAYBACK: "playback",
        GROOVE: "groove",
        ARRANGER: "arranger",
        VIZ: "vizState",
        MIDI: "midi"
      };
    }
  });

  // public/types.js
  var ACTIONS;
  var init_types = __esm({
    "public/types.js"() {
      ACTIONS = {
        IMPORT_MUSICXML: "IMPORT_MUSICXML",
        CLEAR_LEAD_SHEET: "CLEAR_LEAD_SHEET",
        // --- Global / Conductor ---
        SET_PARAM: "SET_PARAM",
        SET_BAND_INTENSITY: "SET_BAND_INTENSITY",
        SET_COMPLEXITY: "SET_COMPLEXITY",
        SET_AUTO_INTENSITY: "SET_AUTO_INTENSITY",
        UPDATE_CONDUCTOR_DECISION: "UPDATE_CONDUCTOR_DECISION",
        TRIGGER_EMERGENCY_LOOKAHEAD: "TRIGGER_EMERGENCY_LOOKAHEAD",
        RESET_SESSION: "RESET_SESSION",
        SET_SESSION_STEPS: "SET_SESSION_STEPS",
        SHOW_TOAST: "SHOW_TOAST",
        TRIGGER_FLASH: "TRIGGER_FLASH",
        SET_UPDATE_AVAILABLE: "SET_UPDATE_AVAILABLE",
        SET_MODAL_OPEN: "SET_MODAL_OPEN",
        SET_VIZ_ENABLED: "SET_VIZ_ENABLED",
        TOGGLE_PLAY: "TOGGLE_PLAY",
        SET_BPM: "SET_BPM",
        // --- Instrument Settings ---
        SET_STYLE: "SET_STYLE",
        SET_DENSITY: "SET_DENSITY",
        SET_VOLUME: "SET_VOLUME",
        SET_REVERB: "SET_REVERB",
        SET_OCTAVE: "SET_OCTAVE",
        SET_SOLOIST_MODE: "SET_SOLOIST_MODE",
        SET_ACTIVE_TAB: "SET_ACTIVE_TAB",
        SET_SOLOIST_PRESET: "SET_SOLOIST_PRESET",
        UPDATE_SB: "UPDATE_SB",
        // --- Groove / Drums ---
        SET_SWING: "SET_SWING",
        SET_SWING_SUB: "SET_SWING_SUB",
        SET_HUMANIZE: "SET_HUMANIZE",
        SET_FOLLOW_PLAYBACK: "SET_FOLLOW_PLAYBACK",
        SET_LARS_MODE: "SET_LARS_MODE",
        SET_LARS_INTENSITY: "SET_LARS_INTENSITY",
        SET_CREATIVITY: "SET_CREATIVITY",
        SET_GENRE_FEEL: "SET_GENRE_FEEL",
        SET_GENRE_COUNTDOWN: "SET_GENRE_COUNTDOWN",
        SET_POCKET_CONFIG: "SET_POCKET_CONFIG",
        SET_GROOVE_STEPS: "SET_GROOVE_STEPS",
        SET_ACTIVE_MEASURE: "SET_ACTIVE_MEASURE",
        SET_GROOVE_SEED: "SET_GROOVE_SEED",
        STEP_TOGGLE: "STEP_TOGGLE",
        TRIGGER_FILL: "TRIGGER_FILL",
        UPDATE_HB: "UPDATE_HB",
        // --- Options / Arranger ---
        SET_ARRANGEMENT: "SET_ARRANGEMENT",
        SET_METRONOME: "SET_METRONOME",
        SET_PRESET_SETTINGS_MODE: "SET_PRESET_SETTINGS_MODE",
        SET_PIANO_ROOTS: "SET_PIANO_ROOTS",
        SET_NOTATION: "SET_NOTATION",
        SET_SESSION_TIMER: "SET_SESSION_TIMER",
        SET_SONG_MODE: "SET_SONG_MODE",
        SET_STOP_AT_END: "SET_STOP_AT_END",
        SET_ENDING_PENDING: "SET_ENDING_PENDING",
        RESET_STATE: "RESET_STATE",
        // --- MIDI ---
        SET_MIDI_CONFIG: "SET_MIDI_CONFIG"
      };
    }
  });

  // public/state/arranger.js
  function setArrangerParam(param, value) {
    switch (param) {
      case "sections":
        arranger.sections = value;
        break;
      case "progression":
        arranger.progression = value;
        break;
      case "key":
        arranger.key = value;
        break;
      case "timeSignature":
        arranger.timeSignature = value;
        break;
      case "grouping":
        arranger.grouping = value;
        break;
      case "isMinor":
        arranger.isMinor = value;
        break;
      case "notation":
        arranger.notation = value;
        break;
      case "valid":
        arranger.valid = value;
        break;
      case "totalSteps":
        arranger.totalSteps = value;
        break;
      case "stepMap":
        arranger.stepMap = value;
        break;
      case "measureMap":
        arranger.measureMap = value;
        break;
      case "sectionMap":
        arranger.sectionMap = value;
        break;
      case "history":
        arranger.history = value;
        break;
      case "lastInteractedSectionId":
        arranger.lastInteractedSectionId = value;
        break;
      case "lastChordPreset":
        arranger.lastChordPreset = value;
        break;
      case "mutatedSectionId":
        arranger.mutatedSectionId = value;
        break;
      case "isDirty":
        arranger.isDirty = value;
        break;
      default:
        console.warn(`[State] Unknown arranger param: ${param}`);
        break;
    }
  }
  function arrangerReducer(action, payload) {
    switch (action) {
      case ACTIONS.IMPORT_MUSICXML:
        if (payload.hasChords) {
          Object.assign(arranger, {
            sections: payload.sections,
            isDirty: true,
            notation: "name"
          });
        } else {
          arranger.isDirty = true;
        }
        break;
      case ACTIONS.RESET_STATE:
        Object.assign(arranger, {
          sections: [
            {
              id: "s1",
              label: "Intro",
              value: "I | V | vi | IV",
              color: "#3b82f6",
              repeat: 1
            }
          ],
          key: "C",
          timeSignature: "4/4",
          notation: "roman",
          isMinor: false,
          isDirty: false,
          history: [],
          grouping: null
        });
        return true;
      case ACTIONS.SET_NOTATION:
        Object.assign(arranger, { notation: payload });
        return true;
      case ACTIONS.SET_ARRANGEMENT:
        arranger.sections = payload;
        return true;
    }
    return false;
  }
  var arranger;
  var init_arranger = __esm({
    "public/state/arranger.js"() {
      init_types();
      arranger = {
        sections: [{ id: "s1", label: "Intro", value: "I | V | vi | IV", color: "#3b82f6", repeat: 1 }],
        progression: [],
        key: "C",
        timeSignature: "4/4",
        grouping: null,
        isMinor: false,
        notation: "roman",
        valid: false,
        totalSteps: 0,
        stepMap: [],
        measureMap: [],
        sectionMap: [],
        history: [],
        lastInteractedSectionId: "s1",
        lastChordPreset: "Pop (Standard)",
        mutatedSectionId: null,
        isDirty: false
      };
    }
  });

  // public/state/groove.js
  function setGrooveParam(param, value) {
    switch (param) {
      case "enabled":
        groove.enabled = value;
        break;
      case "volume":
        groove.volume = value;
        break;
      case "reverb":
        groove.reverb = value;
        break;
      case "measures":
        groove.measures = value;
        break;
      case "currentMeasure":
        groove.currentMeasure = value;
        break;
      case "followPlayback":
        groove.followPlayback = value;
        break;
      case "humanize":
        groove.humanize = value;
        break;
      case "swing":
        groove.swing = value;
        break;
      case "swingSub":
        groove.swingSub = value;
        break;
      case "lastDrumPreset":
        groove.lastDrumPreset = value;
        break;
      case "genreFeel":
        groove.genreFeel = value;
        break;
      case "larsMode":
        groove.larsMode = value;
        break;
      case "larsIntensity":
        groove.larsIntensity = value;
        break;
      case "lastSmartGenre":
        groove.lastSmartGenre = value;
        break;
      case "pendingGenreFeel":
        groove.pendingGenreFeel = value;
        break;
      case "genreSwitchCountdown":
        groove.genreSwitchCountdown = value;
        break;
      case "fillActive":
        groove.fillActive = value;
        break;
      case "activeTab":
        groove.activeTab = value;
        break;
      case "mobileTab":
        groove.mobileTab = value;
        break;
      case "lastHatGain":
        groove.lastHatGain = value;
        break;
      case "fillStartStep":
        groove.fillStartStep = value;
        break;
      case "fillLength":
        groove.fillLength = value;
        break;
      case "snareMask":
        groove.snareMask = value;
        break;
      case "pendingCrash":
        groove.pendingCrash = value;
        break;
      case "creativity":
        groove.creativity = value;
        break;
      case "gridVersion":
        groove.gridVersion = value;
        break;
      default:
        console.warn(`[State] Unknown groove param: ${param}`);
        break;
    }
  }
  function grooveReducer(action, payload, playback6) {
    switch (action) {
      case ACTIONS.RESET_STATE:
        Object.assign(groove, {
          enabled: true,
          volume: 0.5,
          reverb: 0.2,
          swing: 0,
          swingSub: "8th",
          genreFeel: "Rock",
          activeTab: "smart",
          lastSmartGenre: "Rock",
          measures: 1,
          currentMeasure: 0
        });
        Object.assign(groove.pocket, {
          globalDrive: 0,
          tightness: 0.5,
          bassGravity: 0.8,
          chordGravity: 0.6,
          soloistGravity: 0.4
        });
        groove.instruments.forEach((inst) => {
          inst.steps.fill(0);
          inst.muted = false;
        });
        return true;
      case ACTIONS.SET_POCKET_CONFIG:
        Object.assign(groove.pocket, payload);
        return true;
      case ACTIONS.SET_GROOVE_STEPS: {
        const inst = groove.instruments.find((i3) => i3.name === payload.instrument);
        if (inst) {
          inst.steps.fill(0);
          payload.steps.forEach((v3, i3) => {
            if (i3 < 128) {
              inst.steps[i3] = v3;
            }
          });
          return true;
        }
        return false;
      }
      case ACTIONS.SET_ACTIVE_MEASURE:
        Object.assign(groove, { currentMeasure: parseInt(payload, 10) });
        return true;
      case ACTIONS.SET_SWING:
        Object.assign(groove, { swing: payload });
        return true;
      case ACTIONS.SET_SWING_SUB:
        Object.assign(groove, { swingSub: payload });
        return true;
      case ACTIONS.SET_HUMANIZE:
        Object.assign(groove, { humanize: payload });
        return true;
      case ACTIONS.SET_VOLUME:
        if (payload.module === "groove" || payload.module === "drum" || payload.module === "drums") {
          Object.assign(groove, { volume: payload.value });
          return true;
        }
        return false;
      case ACTIONS.SET_REVERB:
        if (payload.module === "groove" || payload.module === "drum" || payload.module === "drums") {
          Object.assign(groove, { reverb: payload.value });
          return true;
        }
        return false;
      case ACTIONS.SET_FOLLOW_PLAYBACK:
        Object.assign(groove, { followPlayback: payload });
        return true;
      case ACTIONS.SET_LARS_MODE:
        Object.assign(groove, { larsMode: !!payload });
        return true;
      case ACTIONS.SET_LARS_INTENSITY:
        Object.assign(groove, { larsIntensity: Math.max(0, Math.min(1, payload)) });
        return true;
      case ACTIONS.SET_CREATIVITY:
        Object.assign(groove, { creativity: !!payload });
        return true;
      case ACTIONS.SET_GROOVE_SEED:
        if (!groove.sectionSeedMap) {
          groove.sectionSeedMap = {};
        }
        groove.sectionSeedMap[payload.sectionId] = payload.seed;
        return true;
      case ACTIONS.SET_GENRE_COUNTDOWN:
        if (groove.genreSwitchCountdown !== payload) {
          Object.assign(groove, { genreSwitchCountdown: payload });
          return true;
        }
        return false;
      case ACTIONS.SET_GENRE_FEEL:
        if (playback6.isPlaying) {
          Object.assign(groove, { pendingGenreFeel: payload });
        } else {
          const updates = {
            genreFeel: payload.feel,
            pendingGenreFeel: null,
            activeTab: "smart",
            // Create a fresh array reference to ensure UI components like SequencerGrid re-render
            instruments: groove.instruments.map((inst) => ({
              ...inst,
              steps: [...inst.steps]
            }))
          };
          if (payload.swing !== void 0) {
            updates.swing = payload.swing;
          }
          if (payload.sub !== void 0) {
            updates.swingSub = payload.sub;
          }
          Object.assign(groove, updates);
        }
        return true;
      case ACTIONS.SET_ACTIVE_TAB:
        if (payload.module === "groove") {
          Object.assign(groove, { activeTab: payload.tab });
          return true;
        }
        return false;
      case ACTIONS.TRIGGER_FILL:
        Object.assign(groove, {
          fillSteps: payload.steps,
          fillActive: true,
          fillStartStep: payload.startStep,
          fillLength: payload.length,
          pendingCrash: !!payload.crash
        });
        return true;
      case ACTIONS.STEP_TOGGLE:
        groove.gridVersion++;
        return true;
    }
    return false;
  }
  var groove;
  var init_groove = __esm({
    "public/state/groove.js"() {
      init_types();
      groove = {
        enabled: true,
        instruments: [
          { name: "Kick", symbol: "\u{1F941}", steps: new Array(128).fill(0), muted: false },
          { name: "Snare", symbol: "\u{1F44F}", steps: new Array(128).fill(0), muted: false },
          { name: "HiHat", symbol: "\u{1F3A9}", steps: new Array(128).fill(0), muted: false },
          { name: "Open", symbol: "\u{1F4C0}", steps: new Array(128).fill(0), muted: false },
          { name: "Clave", symbol: "\u{1F962}", steps: new Array(128).fill(0), muted: false },
          { name: "Conga", symbol: "\u{1FA98}", steps: new Array(128).fill(0), muted: false },
          { name: "Bongo", symbol: "\u{1F941}", steps: new Array(128).fill(0), muted: false },
          { name: "Perc", symbol: "\u{1FA87}", steps: new Array(128).fill(0), muted: false },
          { name: "Shaker", symbol: "\u{1F9C2}", steps: new Array(128).fill(0), muted: false },
          { name: "Guiro", symbol: "\u{1F956}", steps: new Array(128).fill(0), muted: false },
          { name: "High Tom", symbol: "\u{1FA98}", steps: new Array(128).fill(0), muted: false },
          { name: "Mid Tom", symbol: "\u{1FA98}", steps: new Array(128).fill(0), muted: false },
          { name: "Low Tom", symbol: "\u{1FA98}", steps: new Array(128).fill(0), muted: false }
        ],
        volume: 0.5,
        reverb: 0.2,
        measures: 1,
        currentMeasure: 0,
        followPlayback: true,
        humanize: 20,
        swing: 0,
        swingSub: "8th",
        lastDrumPreset: "Basic Rock",
        audioBuffers: {},
        genreFeel: "Rock",
        larsMode: false,
        larsIntensity: 0.5,
        lastSmartGenre: "Rock",
        pendingGenreFeel: null,
        genreSwitchCountdown: null,
        fillActive: false,
        fillSteps: {},
        buffer: /* @__PURE__ */ new Map(),
        activeTab: "smart",
        mobileTab: "chords",
        lastHatGain: null,
        fillStartStep: 0,
        fillLength: 0,
        snareMask: 0,
        pendingCrash: false,
        creativity: false,
        sectionSeedMap: {},
        gridVersion: 0,
        // --- Unified Rhythmic Pocket System ---
        pocket: {
          globalDrive: 0,
          // -1.0 (behind) to 1.0 (ahead)
          tightness: 0.5,
          // 0.0 (loose/jittery) to 1.0 (grid-locked)
          bassGravity: 0.8,
          // 0.0 to 1.0 (how much bass follows Kick)
          chordGravity: 0.6,
          // 0.0 to 1.0 (how much chords follow Bass)
          soloistGravity: 0.4
          // 0.0 to 1.0 (how much soloist follows Snare/Hats)
        }
      };
    }
  });

  // public/state/instruments.js
  function setChordsParam(param, value) {
    switch (param) {
      case "enabled":
        chords.enabled = value;
        break;
      case "volume":
        chords.volume = value;
        break;
      case "reverb":
        chords.reverb = value;
        break;
      case "instrument":
        chords.instrument = value;
        break;
      case "filterCutoff":
        chords.filterCutoff = value;
        break;
      case "attack":
        chords.attack = value;
        break;
      case "release":
        chords.release = value;
        break;
      case "sustain":
        chords.sustain = value;
        break;
      case "shape":
        chords.shape = value;
        break;
      case "delay":
        chords.delay = value;
        break;
      case "compingStyle":
        chords.compingStyle = value;
        break;
      case "inversionStrategy":
        chords.inversionStrategy = value;
        break;
      case "humanizeVoiceLeading":
        chords.humanizeVoiceLeading = value;
        break;
      case "drive":
        chords.drive = value;
        break;
      case "tremoloRate":
        chords.tremoloRate = value;
        break;
      case "tremoloDepth":
        chords.tremoloDepth = value;
        break;
      case "chorusRate":
        chords.chorusRate = value;
        break;
      case "chorusDepth":
        chords.chorusDepth = value;
        break;
      case "octaveShift":
        chords.octaveShift = value;
        break;
      default:
        console.warn(`[State] Unknown chords param: ${param}`);
        break;
    }
  }
  function setBassParam(param, value) {
    switch (param) {
      case "enabled":
        bass.enabled = value;
        break;
      case "volume":
        bass.volume = value;
        break;
      case "reverb":
        bass.reverb = value;
        break;
      case "instrument":
        bass.instrument = value;
        break;
      case "pattern":
        bass.pattern = value;
        break;
      case "octave":
        bass.octave = value;
        break;
      case "glide":
        bass.glide = value;
        break;
      case "drive":
        bass.drive = value;
        break;
      case "release":
        bass.release = value;
        break;
      case "pocketOffset":
        bass.pocketOffset = value;
        break;
      default:
        console.warn(`[State] Unknown bass param: ${param}`);
        break;
    }
  }
  function setSoloistParam(param, value) {
    switch (param) {
      case "enabled":
        soloist.enabled = value;
        break;
      case "volume":
        soloist.volume = value;
        break;
      case "reverb":
        soloist.reverb = value;
        break;
      case "instrument":
        soloist.instrument = value;
        break;
      case "drive":
        soloist.drive = value;
        break;
      case "delay":
        soloist.delay = value;
        break;
      case "chorus":
        soloist.chorus = value;
        break;
      case "density":
        soloist.density = value;
        break;
      case "syncopation":
        soloist.syncopation = value;
        break;
      case "motifRange":
        soloist.motifRange = value;
        break;
      case "isResting":
        soloist.isResting = value;
        break;
      case "currentPhraseSteps":
        soloist.currentPhraseSteps = value;
        break;
      case "lastNoteMidi":
        soloist.lastNoteMidi = value;
        break;
      case "isWaitingForEntry":
        soloist.isWaitingForEntry = value;
        break;
      case "isYielding":
        soloist.isYielding = value;
        break;
      case "motifTracking":
        soloist.motifTracking = value;
        break;
      case "phrasingState":
        soloist.phrasingState = value;
        break;
      case "motifCache":
        soloist.motifCache = value;
        break;
      case "lickDictionary":
        soloist.lickDictionary = value;
        break;
      case "recentNotes":
        soloist.recentNotes = value;
        break;
      case "phraseStartStep":
        soloist.phraseStartStep = value;
        break;
      case "phrasingIntensity":
        soloist.phrasingIntensity = value;
        break;
      default:
        console.warn(`[State] Unknown soloist param: ${param}`);
        break;
    }
  }
  function setHarmonyParam(param, value) {
    switch (param) {
      case "enabled":
        harmony.enabled = value;
        break;
      case "volume":
        harmony.volume = value;
        break;
      case "reverb":
        harmony.reverb = value;
        break;
      case "instrument":
        harmony.instrument = value;
        break;
      case "style":
        harmony.style = value;
        break;
      case "voices":
        harmony.voices = value;
        break;
      case "density":
        harmony.density = value;
        break;
      case "attack":
        harmony.attack = value;
        break;
      case "release":
        harmony.release = value;
        break;
      case "filterCutoff":
        harmony.filterCutoff = value;
        break;
      case "glide":
        harmony.glide = value;
        break;
      case "pocketOffset":
        harmony.pocketOffset = value;
        break;
      default:
        console.warn(`[State] Unknown harmony param: ${param}`);
        break;
    }
  }
  function instrumentReducer(action, payload) {
    switch (action) {
      case ACTIONS.IMPORT_MUSICXML: {
        const currentKey = arranger.key;
        const xmlKey = payload.xmlKey || "C";
        let transposedMelody = payload.leadSheetMelody;
        const currentIdx = KEY_ORDER.indexOf(currentKey);
        const xmlIdx = KEY_ORDER.indexOf(xmlKey);
        if (currentIdx !== -1 && xmlIdx !== -1 && currentIdx !== xmlIdx) {
          const interval = currentIdx - xmlIdx;
          transposedMelody = payload.leadSheetMelody.map((n2) => ({
            ...n2,
            midi: n2.midi + interval
          }));
        }
        Object.assign(soloist, {
          leadSheetMelody: transposedMelody,
          style: "lead_sheet",
          enabled: true
        });
        break;
      }
      case ACTIONS.CLEAR_LEAD_SHEET:
        Object.assign(soloist, {
          leadSheetMelody: [],
          style: soloist.lastSmartStyle || "smart"
        });
        break;
      case ACTIONS.RESET_STATE:
        Object.assign(chords, {
          enabled: true,
          volume: 0.5,
          reverb: 0.3,
          instrument: "Clean",
          octave: 65,
          density: "standard",
          pianoRoots: false,
          activeTab: "smart"
        });
        Object.assign(bass, {
          enabled: true,
          volume: 0.45,
          reverb: 0.05,
          octave: 38,
          style: "smart",
          activeTab: "smart"
        });
        Object.assign(soloist, {
          enabled: false,
          preset: "trumpet",
          volume: 0.5,
          reverb: 0.6,
          octave: 72,
          style: "smart",
          activeTab: "smart",
          mode: "monophonic",
          complexity: 0.5,
          tradeMode: "manual",
          isWaitingForEntry: false,
          isYielding: false,
          motifTracking: false,
          phrasingIntensity: 0.5
        });
        Object.assign(harmony, {
          enabled: false,
          volume: 0.4,
          reverb: 0.4,
          octave: 60,
          style: "smart",
          complexity: 0.5,
          activeTab: "smart"
        });
        return true;
      case ACTIONS.SET_STYLE:
        if (instrumentStateMap[payload.module]) {
          Object.assign(instrumentStateMap[payload.module], { style: payload.style });
        }
        return true;
      case ACTIONS.SET_DENSITY:
        Object.assign(chords, { density: payload });
        return true;
      case ACTIONS.SET_VOLUME:
        if (instrumentStateMap[payload.module]) {
          Object.assign(instrumentStateMap[payload.module], { volume: payload.value });
        }
        return true;
      case ACTIONS.SET_REVERB:
        if (instrumentStateMap[payload.module]) {
          Object.assign(instrumentStateMap[payload.module], { reverb: payload.value });
        }
        return true;
      case ACTIONS.SET_OCTAVE:
        if (instrumentStateMap[payload.module]) {
          Object.assign(instrumentStateMap[payload.module], { octave: payload.value });
        }
        return true;
      case ACTIONS.SET_PIANO_ROOTS:
        Object.assign(chords, { pianoRoots: payload });
        return true;
      case ACTIONS.SET_SOLOIST_MODE:
        Object.assign(soloist, { mode: payload });
        return true;
      case ACTIONS.SET_SOLOIST_PRESET:
        Object.assign(soloist, { preset: payload });
        return true;
      case ACTIONS.RESET_SESSION:
        Object.assign(soloist, { sessionSteps: 0 });
        return true;
      case ACTIONS.SET_SESSION_STEPS:
        Object.assign(soloist, { sessionSteps: payload });
        return true;
      case ACTIONS.SET_GENRE_FEEL:
        if (payload.chord) {
          Object.assign(chords, { style: payload.chord, activeTab: "smart" });
        }
        if (payload.bass) {
          Object.assign(bass, { style: payload.bass, activeTab: "smart" });
        }
        if (payload.soloist) {
          Object.assign(soloist, { style: payload.soloist, activeTab: "smart" });
        }
        if (payload.harmony) {
          Object.assign(harmony, { style: payload.harmony, activeTab: "smart" });
        }
        return true;
      case ACTIONS.UPDATE_CONDUCTOR_DECISION:
        if (payload.density) {
          Object.assign(chords, { density: payload.density });
        }
        if (payload.hookProb) {
          Object.assign(soloist, { hookRetentionProb: payload.hookProb });
        }
        return true;
      case ACTIONS.SET_ACTIVE_TAB:
        if (payload.module === "groove") {
          return false;
        } else if (instrumentStateMap[payload.module]) {
          Object.assign(instrumentStateMap[payload.module], { activeTab: payload.tab });
        }
        return true;
      case ACTIONS.UPDATE_HB:
        Object.assign(harmony, payload);
        return true;
      case ACTIONS.UPDATE_SB:
        Object.assign(soloist, payload);
        return true;
    }
    return false;
  }
  var chords, bass, soloist, harmony, instrumentStateMap;
  var init_instruments = __esm({
    "public/state/instruments.js"() {
      init_config();
      init_types();
      init_arranger();
      chords = {
        enabled: true,
        style: "smart",
        volume: 0.5,
        reverb: 0.3,
        octave: 65,
        density: "standard",
        pianoRoots: false,
        lastActiveChordIndex: null,
        scheduledChordIndex: null,
        buffer: /* @__PURE__ */ new Map(),
        rhythmicMask: 0,
        activeTab: "smart"
      };
      bass = {
        enabled: true,
        volume: 0.45,
        reverb: 0.05,
        lastFreq: null,
        lastPlayedFreq: null,
        buffer: /* @__PURE__ */ new Map(),
        octave: 38,
        style: "smart",
        busySteps: 0,
        activeTab: "smart",
        lastBassGain: null
      };
      soloist = {
        enabled: false,
        preset: "trumpet",
        volume: 0.5,
        reverb: 0.6,
        lastPlayedFreq: null,
        buffer: /* @__PURE__ */ new Map(),
        lastNoteEnd: 0,
        octave: 64,
        style: "smart",
        direction: 1,
        melodicTrend: "Static",
        contourSteps: 0,
        isResting: true,
        restSteps: 0,
        activeSteps: 0,
        lastAttackStep: -100,
        phrasingState: "rest",
        motifCache: null,
        rhythmicMotif: [],
        // Template for current phrase
        lickDictionary: [],
        recentNotes: [],
        phraseStartStep: null,
        busySteps: 0,
        hookBuffer: [],
        sharedHookBuffer: [],
        // Shared hooks for band interaction
        tension: 0,
        mode: "monophonic",
        doubleStopProb: 1,
        activeVoices: [],
        sessionSteps: 0,
        deviceBuffer: [],
        activeTab: "smart",
        lastMidiPlayed: null,
        lastFreq: null,
        lastRenderedFreq: null,
        complexity: 0.5,
        tradeMode: "manual",
        isWaitingForEntry: false,
        isYielding: false,
        motifTracking: false,
        leadSheetMelody: [],
        phrasingIntensity: 0.5
      };
      harmony = {
        enabled: false,
        volume: 0.4,
        reverb: 0.4,
        buffer: /* @__PURE__ */ new Map(),
        octave: 60,
        style: "smart",
        complexity: 0.5,
        motifBuffer: [],
        lastMidis: [],
        rhythmicMask: 0,
        activeTab: "smart"
      };
      instrumentStateMap = {
        cb: chords,
        chords,
        bb: bass,
        bass,
        sb: soloist,
        soloist,
        hb: harmony,
        harmony
      };
    }
  });

  // public/state/midi.js
  function setMidiParam(param, value) {
    switch (param) {
      case "enabled":
        midi.enabled = value;
        break;
      case "inputs":
        midi.inputs = value;
        break;
      case "outputs":
        midi.outputs = value;
        break;
      case "selectedOutputId":
        midi.selectedOutputId = value;
        break;
      case "learningState":
        midi.learningState = value;
        break;
      case "learnedMappings":
        midi.learnedMappings = value;
        break;
      case "ccValues":
        midi.ccValues = value;
        break;
      case "syncOut":
        midi.syncOut = value;
        break;
      case "channels":
        midi.channels = value;
        break;
      case "access":
        midi.access = value;
        break;
      case "noteToEngineMap":
        midi.noteToEngineMap = value;
        break;
      default:
        console.warn(`[State] Unknown midi param: ${param}`);
        break;
    }
  }
  function midiReducer(action, payload) {
    switch (action) {
      case ACTIONS.SET_MIDI_CONFIG:
        Object.assign(midi, payload);
        return true;
    }
    return false;
  }
  var midi;
  var init_midi = __esm({
    "public/state/midi.js"() {
      init_types();
      midi = {
        enabled: false,
        outputs: [],
        selectedOutputId: null,
        chordsChannel: 1,
        bassChannel: 2,
        soloistChannel: 3,
        harmonyChannel: 4,
        drumsChannel: 10,
        latency: 0,
        muteLocal: true,
        chordsOctave: 0,
        bassOctave: 0,
        soloistOctave: 0,
        harmonyOctave: 0,
        drumsOctave: 0,
        velocitySensitivity: 1
      };
    }
  });

  // public/state/playback.js
  function playbackReducer(action, payload) {
    switch (action) {
      case ACTIONS.RESET_STATE:
        Object.assign(playback, {
          bpm: 100,
          theme: "auto",
          bandIntensity: 0.35,
          complexity: 0.3,
          autoIntensity: true,
          metronome: false,
          countIn: true,
          visualFlash: false,
          haptic: false,
          sessionTimer: 5,
          applyPresetSettings: false,
          conductorVelocity: 1,
          updateAvailable: false
        });
        return true;
      case ACTIONS.SET_UPDATE_AVAILABLE:
        playback.updateAvailable = !!payload;
        return true;
      case ACTIONS.TOGGLE_PLAY:
        playback.isPlaying = !playback.isPlaying;
        if (playback.isPlaying) {
          playback.sessionStartTime = performance.now();
          playback.currentLoopCount = 0;
        }
        if (playback.autoIntensity) {
          playback.bandIntensity = 0.35;
        }
        return true;
      case ACTIONS.SET_BPM:
        playback.bpm = Math.max(40, Math.min(240, parseInt(payload, 10)));
        return true;
      case ACTIONS.SET_MODAL_OPEN:
        if (Object.hasOwn(playback.modals, payload.modal)) {
          playback.modals[payload.modal] = !!payload.open;
          return true;
        }
        return false;
      case ACTIONS.SET_PARAM:
        if (payload.module === "playback") {
          playback[payload.param] = payload.value;
          return true;
        }
        break;
      case ACTIONS.SET_BAND_INTENSITY:
        Object.assign(playback, { bandIntensity: Math.max(0, Math.min(1, payload)) });
        return true;
      case ACTIONS.SET_COMPLEXITY:
        Object.assign(playback, { complexity: Math.max(0, Math.min(1, payload)) });
        return true;
      case ACTIONS.SET_AUTO_INTENSITY:
        Object.assign(playback, { autoIntensity: !!payload });
        return true;
      case ACTIONS.SET_METRONOME:
        Object.assign(playback, { metronome: payload });
        return true;
      case ACTIONS.SET_PRESET_SETTINGS_MODE:
        Object.assign(playback, { applyPresetSettings: payload });
        return true;
      case ACTIONS.SET_SONG_MODE:
        Object.assign(playback, { songMode: !!payload });
        return true;
      case ACTIONS.SET_SESSION_TIMER:
        Object.assign(playback, { sessionTimer: payload });
        return true;
      case ACTIONS.SET_STOP_AT_END:
        Object.assign(playback, { stopAtEnd: payload });
        return true;
      case ACTIONS.SET_ENDING_PENDING:
        Object.assign(playback, { isEndingPending: payload });
        return true;
      case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
        if (playback.scheduleAheadTime < 0.4) {
          Object.assign(playback, { scheduleAheadTime: playback.scheduleAheadTime * 2 });
          console.warn(
            `[Performance] Emergency Lookahead Triggered: ${playback.scheduleAheadTime}s`
          );
          setTimeout(() => {
            Object.assign(playback, { scheduleAheadTime: 0.2 });
            console.log("[Performance] Lookahead reset to normal.");
          }, 1e4);
        }
        return true;
      case ACTIONS.UPDATE_CONDUCTOR_DECISION:
        if (payload.velocity) {
          playback.conductorVelocity = payload.velocity;
        }
        if (payload.lyricalBias !== void 0) {
          playback.lyricalBias = payload.lyricalBias;
        }
        if (payload.intent) {
          Object.assign(playback.intent, payload.intent);
        }
        break;
      case ACTIONS.SHOW_TOAST: {
        const id = Math.random().toString(36).substr(2, 9);
        playback.toasts = [...playback.toasts, { id, message: payload }];
        setTimeout(() => {
          playback.toasts = playback.toasts.filter((t3) => t3.id !== id);
          Promise.resolve().then(() => (init_state(), state_exports)).then(({ dispatch: dispatch2 }) => dispatch2("TOAST_EXPIRED"));
        }, 2e3);
        return true;
      }
      case ACTIONS.TRIGGER_FLASH:
        playback.flashIntensity = payload || 0.25;
        setTimeout(() => {
          playback.flashIntensity = 0;
          Promise.resolve().then(() => (init_state(), state_exports)).then(({ dispatch: dispatch2 }) => dispatch2("FLASH_EXPIRED"));
        }, 50);
        return true;
    }
    return false;
  }
  function setPlaybackParam(param, value) {
    switch (param) {
      case "audio":
        playback.audio = value;
        break;
      case "masterGain":
        playback.masterGain = value;
        break;
      case "saturator":
        playback.saturator = value;
        break;
      case "reverbNode":
        playback.reverbNode = value;
        break;
      case "chordsGain":
        playback.chordsGain = value;
        break;
      case "chordsReverb":
        playback.chordsReverb = value;
        break;
      case "chordsEQ":
        playback.chordsEQ = value;
        break;
      case "drumsReverb":
        playback.drumsReverb = value;
        break;
      case "drumsGain":
        playback.drumsGain = value;
        break;
      case "bassReverb":
        playback.bassReverb = value;
        break;
      case "bassGain":
        playback.bassGain = value;
        break;
      case "bassEQ":
        playback.bassEQ = value;
        break;
      case "soloistReverb":
        playback.soloistReverb = value;
        break;
      case "soloistGain":
        playback.soloistGain = value;
        break;
      case "harmoniesReverb":
        playback.harmoniesReverb = value;
        break;
      case "isPlaying":
        playback.isPlaying = value;
        break;
      case "bpm":
        playback.bpm = value;
        break;
      case "nextNoteTime":
        playback.nextNoteTime = value;
        break;
      case "unswungNextNoteTime":
        playback.unswungNextNoteTime = value;
        break;
      case "scheduleAheadTime":
        playback.scheduleAheadTime = value;
        break;
      case "step":
        playback.step = value;
        break;
      case "drawQueue":
        playback.drawQueue = value;
        break;
      case "isCountingIn":
        playback.isCountingIn = value;
        break;
      case "countInBeat":
        playback.countInBeat = value;
        break;
      case "isDrawing":
        playback.isDrawing = value;
        break;
      case "theme":
        playback.theme = value;
        break;
      case "wakeLock":
        playback.wakeLock = value;
        break;
      case "bandIntensity":
        playback.bandIntensity = value;
        break;
      case "complexity":
        playback.complexity = value;
        break;
      case "autoIntensity":
        playback.autoIntensity = value;
        break;
      case "metronome":
        playback.metronome = value;
        break;
      case "applyPresetSettings":
        playback.applyPresetSettings = value;
        break;
      case "sustainActive":
        playback.sustainActive = value;
        break;
      case "songMode":
        playback.songMode = value;
        break;
      case "sessionTimer":
        playback.sessionTimer = value;
        break;
      case "debugSoloist":
        playback.debugSoloist = value;
        break;
      case "loopLimit":
        playback.loopLimit = value;
        break;
      case "currentLoopCount":
        playback.currentLoopCount = value;
        break;
      case "sessionStartTime":
        playback.sessionStartTime = value;
        break;
      case "stopAtEnd":
        playback.stopAtEnd = value;
        break;
      case "isEndingPending":
        playback.isEndingPending = value;
        break;
      case "intent":
        playback.intent = value;
        break;
      case "lastActiveDrumElements":
        playback.lastActiveDrumElements = value;
        break;
      case "lastPlayingStep":
        playback.lastPlayingStep = value;
        break;
      case "workerLogging":
        playback.workerLogging = value;
        break;
      case "viz":
        playback.viz = value;
        break;
      case "suspendTimeout":
        playback.suspendTimeout = value;
        break;
      case "conductorVelocity":
        playback.conductorVelocity = value;
        break;
      case "lyricalBias":
        playback.lyricalBias = value;
        break;
      case "masterLimiter":
        playback.masterLimiter = value;
        break;
      case "masterVolume":
        playback.masterVolume = value;
        break;
      case "countIn":
        playback.countIn = value;
        break;
      case "visualFlash":
        playback.visualFlash = value;
        break;
      case "haptic":
        playback.haptic = value;
        break;
      case "toasts":
        playback.toasts = value;
        break;
      case "flashIntensity":
        playback.flashIntensity = value;
        break;
      case "updateAvailable":
        playback.updateAvailable = value;
        break;
      case "resolutionTriggered":
        playback.resolutionTriggered = value;
        break;
      case "isScheduling":
        playback.isScheduling = value;
        break;
      case "stateVersion":
        playback.stateVersion = value;
        break;
      case "modals":
        playback.modals = value;
        break;
      case "soloistEQ":
        playback.soloistEQ = value;
        break;
      case "harmoniesGain":
        playback.harmoniesGain = value;
        break;
      case "harmoniesEQ":
        playback.harmoniesEQ = value;
        break;
      default:
        console.warn(`[State] Unknown playback param: ${param}`);
        break;
    }
  }
  var playback;
  var init_playback = __esm({
    "public/state/playback.js"() {
      init_types();
      playback = {
        audio: null,
        masterGain: null,
        saturator: null,
        reverbNode: null,
        chordsGain: null,
        chordsReverb: null,
        chordsEQ: null,
        drumsReverb: null,
        drumsGain: null,
        bassReverb: null,
        bassGain: null,
        bassEQ: null,
        soloistReverb: null,
        soloistGain: null,
        harmoniesReverb: null,
        isPlaying: false,
        bpm: 100,
        nextNoteTime: 0,
        unswungNextNoteTime: 0,
        scheduleAheadTime: 0.2,
        step: 0,
        drawQueue: [],
        isCountingIn: false,
        countInBeat: 0,
        isDrawing: false,
        theme: "auto",
        wakeLock: null,
        bandIntensity: 0.35,
        complexity: 0.3,
        autoIntensity: true,
        metronome: false,
        applyPresetSettings: false,
        sustainActive: false,
        songMode: true,
        sessionTimer: 5,
        debugSoloist: false,
        loopLimit: 0,
        currentLoopCount: 0,
        sessionStartTime: 0,
        stopAtEnd: false,
        isEndingPending: false,
        intent: {
          syncopation: 0.2,
          anticipation: 0.1,
          layBack: 0,
          density: 0.5
        },
        lastActiveDrumElements: null,
        lastPlayingStep: 0,
        workerLogging: false,
        viz: null,
        suspendTimeout: null,
        conductorVelocity: 1,
        lyricalBias: 0.5,
        masterLimiter: null,
        masterVolume: 0.4,
        countIn: true,
        visualFlash: false,
        haptic: false,
        toasts: [],
        flashIntensity: 0,
        updateAvailable: false,
        resolutionTriggered: false,
        isScheduling: false,
        stateVersion: 0,
        modals: {
          settings: false,
          editor: false,
          export: false,
          templates: false,
          analyzer: false,
          generateSong: false
        }
      };
    }
  });

  // public/state/visualizer.js
  function setVizParam(param, value) {
    switch (param) {
      case "enabled":
        vizState.enabled = value;
        break;
      case "theme":
        vizState.theme = value;
        break;
      case "mode":
        vizState.mode = value;
        break;
      case "fullscreen":
        vizState.fullscreen = value;
        break;
      case "fps":
        vizState.fps = value;
        break;
      case "showGrid":
        vizState.showGrid = value;
        break;
      case "showNotes":
        vizState.showNotes = value;
        break;
      case "showChords":
        vizState.showChords = value;
        break;
      default:
        console.warn(`[State] Unknown viz param: ${param}`);
        break;
    }
  }
  function vizReducer(action, payload) {
    switch (action) {
      case ACTIONS.SET_VIZ_ENABLED:
        vizState.enabled = !!payload;
        return true;
      case ACTIONS.SET_PARAM:
        if (payload.module === "vizState") {
          vizState[payload.param] = payload.value;
          return true;
        }
        break;
    }
    return false;
  }
  var vizState;
  var init_visualizer = __esm({
    "public/state/visualizer.js"() {
      init_types();
      vizState = {
        enabled: false
      };
    }
  });

  // public/audio-recovery.js
  var AudioHealthMonitor, audioWatchdog;
  var init_audio_recovery = __esm({
    "public/audio-recovery.js"() {
      init_engine();
      init_state();
      AudioHealthMonitor = class {
        constructor() {
          this.checkInterval = 2e3;
          this.intervalId = null;
          this.analyser = null;
          this.dataBuffer = null;
          this.crashCount = 0;
          this.isRecovering = false;
        }
        start() {
          if (this.intervalId) {
            return;
          }
          this.intervalId = setInterval(() => this.healthCheck(), this.checkInterval);
          console.log("[AudioWatchdog] Monitoring started.");
        }
        stop() {
          if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
          }
        }
        attachToMaster(masterNode) {
          const { playback: playback6 } = getState();
          if (!playback6.audio) {
            return;
          }
          try {
            if (typeof playback6.audio.createAnalyser !== "function") {
              console.warn(
                "[AudioWatchdog] createAnalyser not supported by current AudioContext."
              );
              return;
            }
            this.analyser = playback6.audio.createAnalyser();
            this.analyser.fftSize = 256;
            this.dataBuffer = new Float32Array(this.analyser.fftSize);
            masterNode.connect(this.analyser);
          } catch (e3) {
            console.warn("[AudioWatchdog] Failed to attach analyser:", e3);
          }
        }
        async healthCheck() {
          const { playback: playback6 } = getState();
          if (!playback6.audio) {
            return;
          }
          if (this.isRecovering) {
            return;
          }
          const state2 = playback6.audio.state;
          const isPlaying = playback6.isPlaying;
          if (state2 === "suspended" && isPlaying) {
            console.warn("[AudioWatchdog] Context suspended while playing. Attempting resume...");
            try {
              await playback6.audio.resume();
            } catch (e3) {
              console.error("[AudioWatchdog] Resume failed:", e3);
            }
            return;
          }
          if (state2 === "closed" && isPlaying) {
            console.error("[AudioWatchdog] Context is CLOSED. Fatal error.");
            this.triggerFullRestart();
            return;
          }
          if (this.analyser && isPlaying) {
            this.analyser.getFloatTimeDomainData(this.dataBuffer);
            let hasNaN = false;
            for (let i3 = 0; i3 < this.dataBuffer.length; i3++) {
              const val = this.dataBuffer[i3];
              if (Number.isNaN(val) || !Number.isFinite(val)) {
                hasNaN = true;
                break;
              }
            }
            if (hasNaN) {
              console.error(
                "[AudioWatchdog] DSP CORRUPTION DETECTED (NaN/Infinity). Static detected."
              );
              this.triggerDSPReset();
            }
          }
        }
        async triggerDSPReset() {
          const { playback: playback6 } = getState();
          this.isRecovering = true;
          this.crashCount++;
          console.log("[AudioWatchdog] Initiating Emergency DSP Reset...");
          if (playback6.masterGain) {
            try {
              playback6.masterGain.disconnect();
              playback6.masterGain.gain.value = 0;
            } catch {
            }
          }
          await killAllNotes();
          try {
            playback6.audio.close().then(async () => {
              playback6.audio = null;
              initAudio();
              restoreGains();
              if (playback6.masterGain) {
                this.attachToMaster(playback6.masterGain);
              }
              console.log("[AudioWatchdog] DSP Reset Complete. Audio should be clean.");
              this.isRecovering = false;
            });
          } catch {
            console.error("[AudioWatchdog] DSP Reset Failed");
            this.isRecovering = false;
          }
        }
        triggerFullRestart() {
          this.triggerDSPReset();
        }
      };
      audioWatchdog = new AudioHealthMonitor();
    }
  });

  // public/utils.js
  function normalizeKey(k3) {
    return ENHARMONIC_MAP[k3] || k3;
  }
  function escapeHTML(str) {
    if (str === null || str === void 0) {
      return "";
    }
    if (typeof str !== "string") {
      return String(str);
    }
    return str.replace(REGEX_AMP, "&amp;").replace(REGEX_LT, "&lt;").replace(REGEX_GT, "&gt;").replace(REGEX_QUOT, "&quot;").replace(REGEX_APOS, "&#39;").replace(REGEX_BACKTICK, "&#96;");
  }
  function stripDangerousChars(str) {
    if (!str) {
      return "";
    }
    if (typeof str !== "string") {
      return String(str);
    }
    return str.replace(REGEX_DANGEROUS, "");
  }
  function getFrequency(midi2) {
    const freq = FREQUENCY_CACHE[midi2];
    if (freq !== void 0) {
      return freq;
    }
    return 440 * 2 ** ((midi2 - 69) / 12);
  }
  function midiToNote(midi2) {
    const notes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    return {
      name: notes[midi2 % 12],
      octave: Math.floor(midi2 / 12) - 1
    };
  }
  function getMidi(freq) {
    if (!freq || freq <= 0) {
      return null;
    }
    return Math.round(12 * Math.log2(freq / 440) + 69);
  }
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  function compressSections(sections) {
    const minified = sections.map((s3) => {
      const m3 = { l: s3.label, v: s3.value };
      if (s3.key) {
        m3.k = s3.key;
      }
      if (s3.repeat && s3.repeat > 1) {
        m3.r = s3.repeat;
      }
      if (s3.timeSignature) {
        m3.t = s3.timeSignature;
      }
      if (s3.seamless) {
        m3.s = 1;
      }
      return m3;
    });
    const json = JSON.stringify(minified);
    const bytes = new TextEncoder().encode(json);
    const binString = Array.from(bytes, (byte) => String.fromCodePoint(byte)).join("");
    return btoa(binString);
  }
  function decompressSections(str) {
    try {
      if (!str || typeof str !== "string") {
        throw new Error("Invalid input");
      }
      if (str.length > 102400) {
        throw new Error("Payload too large");
      }
      const binString = atob(str);
      const bytes = Uint8Array.from(binString, (m3) => m3.codePointAt(0));
      const json = new TextDecoder().decode(bytes);
      const minified = JSON.parse(json);
      if (!Array.isArray(minified)) {
        throw new Error("Invalid format: expected array");
      }
      const safeMinified = minified.slice(0, 500);
      return safeMinified.map((s3, i3) => {
        let safeLabel = escapeHTML(s3.l || `Section ${i3 + 1}`);
        if (safeLabel.length > 100) {
          safeLabel = safeLabel.substring(0, 100);
        }
        let safeValue = typeof s3.v === "string" ? s3.v : "";
        if (safeValue.length > 1e3) {
          safeValue = safeValue.substring(0, 1e3);
        }
        safeValue = stripDangerousChars(safeValue);
        return {
          id: generateId(),
          label: safeLabel,
          value: safeValue,
          key: typeof s3.k === "string" ? escapeHTML(s3.k) : "",
          repeat: Math.min(Math.max(1, parseInt(s3.r, 10) || 1), 64),
          // Clamp repeats
          timeSignature: typeof s3.t === "string" && s3.t.length < 10 ? s3.t : "",
          seamless: !!s3.s
        };
      });
    } catch (e3) {
      console.error("Failed to decompress sections", e3);
      return [{ id: generateId(), label: "Intro", value: "I | IV" }];
    }
  }
  function getStepsPerMeasure(ts) {
    if (ts === "2/4") {
      return 8;
    }
    if (ts === "3/4") {
      return 12;
    }
    if (ts === "6/8") {
      return 12;
    }
    if (ts === "7/8") {
      return 14;
    }
    if (ts === "5/4") {
      return 20;
    }
    if (ts === "7/4") {
      return 28;
    }
    if (ts === "12/8") {
      return 24;
    }
    return 16;
  }
  function getStepInfo(step, tsConfig, measureMap, allTSConfigs) {
    let currentTS = tsConfig;
    const allTS = allTSConfigs || {};
    if (typeof currentTS === "string") {
      currentTS = allTS[currentTS] || allTS["4/4"];
    } else if (currentTS && !currentTS.beats && currentTS.tsName) {
      currentTS = allTS[currentTS.tsName] || allTS["4/4"];
    }
    if (!currentTS) {
      currentTS = allTS["4/4"] || { beats: 4, stepsPerBeat: 4, grouping: [4], backbeat: [1, 3] };
    }
    if (!currentTS.grouping) {
      currentTS.grouping = [currentTS.beats];
    }
    if (!currentTS.backbeat) {
      currentTS.backbeat = currentTS.beats === 4 ? [1, 3] : [1];
    }
    let tsName = currentTS.tsName || (typeof tsConfig === "string" ? tsConfig : `${currentTS.beats}/${currentTS.stepsPerBeat === 4 ? 4 : 8}`);
    let mStep = step;
    let isMeasureStart = false;
    if (measureMap && measureMap.length > 0) {
      let measure = null;
      let low = 0;
      let high = measureMap.length - 1;
      while (low <= high) {
        const mid = low + high >>> 1;
        const m3 = measureMap[mid];
        if (step >= m3.start && step < m3.end) {
          measure = m3;
          break;
        } else if (step < m3.start) {
          high = mid - 1;
        } else {
          low = mid + 1;
        }
      }
      if (measure) {
        tsName = measure.ts || tsName;
        currentTS = allTSConfigs?.[tsName] ? allTSConfigs[tsName] : tsConfig;
        if (!currentTS) {
          currentTS = allTSConfigs?.["4/4"] ? allTSConfigs["4/4"] : { beats: 4, stepsPerBeat: 4 };
        }
        mStep = step - measure.start;
        if (mStep === 0) {
          isMeasureStart = true;
        }
      } else {
        const spm = getStepsPerMeasure(tsName);
        mStep = step % spm;
        isMeasureStart = mStep === 0;
      }
    } else {
      const spm = getStepsPerMeasure(tsName);
      mStep = step % spm;
      isMeasureStart = mStep === 0;
    }
    if (!currentTS) {
      currentTS = allTSConfigs?.["4/4"] ? allTSConfigs["4/4"] : { beats: 4, stepsPerBeat: 4 };
    }
    const grouping = currentTS.grouping || [currentTS.beats];
    const stepsPerBeat = currentTS.stepsPerBeat;
    let accumulatedSteps = 0;
    let isGroupStart = false;
    let groupIndex = -1;
    let stepInGroup = -1;
    for (let i3 = 0; i3 < grouping.length; i3++) {
      const groupBeats = grouping[i3];
      const groupSteps = groupBeats * stepsPerBeat;
      if (mStep >= accumulatedSteps && mStep < accumulatedSteps + groupSteps) {
        groupIndex = i3;
        stepInGroup = mStep - accumulatedSteps;
        if (stepInGroup === 0) {
          isGroupStart = true;
        }
        break;
      }
      accumulatedSteps += groupSteps;
    }
    const isBeatStart = mStep % stepsPerBeat === 0;
    const beatIndex = Math.floor(mStep / stepsPerBeat);
    const isCompound = !!currentTS.isCompound;
    let isBackbeat = false;
    const backbeatArray = currentTS.backbeat || [];
    if (isCompound) {
      if (isGroupStart && backbeatArray.includes(groupIndex)) {
        isBackbeat = true;
      }
    } else {
      if (isBeatStart && backbeatArray.includes(beatIndex)) {
        isBackbeat = true;
      }
    }
    const stepInBeat = mStep % stepsPerBeat;
    const isOffbeat = stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1;
    const isEOfBeat = stepsPerBeat === 4 && stepInBeat === 1;
    const isAOfBeat = stepsPerBeat === 4 && stepInBeat === 3;
    return {
      isMeasureStart,
      isGroupStart,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      isCompound,
      groupIndex,
      stepInGroup,
      beatIndex,
      mStep,
      tsName,
      tsConfig: currentTS
    };
  }
  function safeDisconnect(nodes) {
    nodes.forEach((node) => {
      if (node) {
        try {
          node.disconnect();
        } catch {
        }
      }
    });
  }
  function createReverbImpulse(audioCtx, duration = 2, decay = 2) {
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const impulse = audioCtx.createBuffer(2, length, sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i3 = 0; i3 < length; i3++) {
        data[i3] = (Math.random() * 2 - 1) * (1 - i3 / length) ** decay;
      }
    }
    return impulse;
  }
  function formatUnicodeSymbols(str) {
    if (!str) {
      return str;
    }
    return str.replace(REGEX_SHARP, "\u266F").replace(REGEX_FLAT1, "$1\u266D").replace(REGEX_FLAT2, "\u266D");
  }
  function createSoftClipCurve() {
    if (cachedSoftClipCurve) {
      return cachedSoftClipCurve;
    }
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    for (let i3 = 0; i3 < n_samples; ++i3) {
      const x3 = i3 * 2 / n_samples - 1;
      curve[i3] = (3 * x3 - x3 * x3 * x3) / 2;
    }
    cachedSoftClipCurve = curve;
    return curve;
  }
  function clampFreq(freq, max3 = 24e3) {
    return Math.min(Math.max(0, freq), max3);
  }
  function calculateTimingOffset(instrument, pocket, intensity) {
    if (!pocket) {
      return 0;
    }
    const driveBase = -(pocket.globalDrive * 0.012);
    const jitter = (1 - pocket.tightness) * (Math.random() - 0.5) * 0.016;
    let instrumentSpecific = 0;
    switch (instrument) {
      case "drums":
        if (intensity > 0.8) {
          instrumentSpecific -= 5e-3;
        }
        break;
      case "bass":
        instrumentSpecific += (1 - pocket.bassGravity) * 8e-3;
        break;
      case "chords":
        instrumentSpecific += (1 - pocket.chordGravity) * 6e-3;
        instrumentSpecific += (1 - pocket.bassGravity) * 3e-3;
        break;
      case "soloist":
        instrumentSpecific += (1 - pocket.soloistGravity) * 0.012;
        break;
    }
    const elasticity = 0.4 + intensity * 0.6;
    const finalOffset = driveBase + (instrumentSpecific + jitter) * (1.1 - elasticity);
    return finalOffset;
  }
  var REGEX_AMP, REGEX_LT, REGEX_GT, REGEX_QUOT, REGEX_APOS, REGEX_BACKTICK, REGEX_DANGEROUS, FREQUENCY_CACHE, REGEX_SHARP, REGEX_FLAT1, REGEX_FLAT2, cachedSoftClipCurve;
  var init_utils = __esm({
    "public/utils.js"() {
      init_config();
      REGEX_AMP = /&/g;
      REGEX_LT = /</g;
      REGEX_GT = />/g;
      REGEX_QUOT = /"/g;
      REGEX_APOS = /'/g;
      REGEX_BACKTICK = /`/g;
      REGEX_DANGEROUS = /[<>"=`]/g;
      FREQUENCY_CACHE = new Float32Array(128);
      for (let i3 = 0; i3 < 128; i3++) {
        FREQUENCY_CACHE[i3] = 440 * 2 ** ((i3 - 69) / 12);
      }
      REGEX_SHARP = /#/g;
      REGEX_FLAT1 = /([A-G])b/g;
      REGEX_FLAT2 = /b(?=[0-9IVivm\-/])/g;
      cachedSoftClipCurve = null;
    }
  });

  // public/engine/synth-bass.js
  function killBassNote() {
    const { playback: playback6, bass: bass2 } = getState();
    if (bass2.lastBassGain) {
      try {
        const g4 = bass2.lastBassGain.gain;
        g4.cancelScheduledValues(playback6.audio.currentTime);
        g4.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
      } catch {
      }
      bass2.lastBassGain = null;
    }
  }
  function playBassNote(freq, time, duration, velocity = 1, muted = false) {
    const { playback: playback6, bass: bass2, groove: groove2 } = getState();
    if (!Number.isFinite(freq) || !Number.isFinite(time) || !Number.isFinite(duration)) {
      return;
    }
    if (freq < 10 || freq > 24e3) {
      return;
    }
    try {
      const now = playback6.audio.currentTime;
      const startTime = Math.max(time, now);
      if (now - mixState.lastTick > 0.5) {
        mixState.recentHits *= 0.5;
        mixState.lastTick = now;
      }
      mixState.recentHits++;
      const densityThreshold = 4;
      mixState.densityDuck = Math.max(
        0.85,
        1 - Math.max(0, mixState.recentHits - densityThreshold) * 0.02
      );
      const vol = 1 * Math.sqrt(velocity) * mixState.densityDuck * (0.95 + Math.random() * 0.1);
      if (vol < 5e-3) {
        return;
      }
      const tonalVol = muted ? vol * 0.15 : vol;
      const oscSine = playback6.audio.createOscillator();
      oscSine.type = "sine";
      oscSine.frequency.setValueAtTime(freq, startTime);
      const oscTri = playback6.audio.createOscillator();
      oscTri.type = "triangle";
      oscTri.frequency.setValueAtTime(freq, startTime);
      const bodyMix = playback6.audio.createGain();
      oscSine.connect(bodyMix);
      oscTri.connect(bodyMix);
      oscSine.gain = 0.7;
      bodyMix.gain.setValueAtTime(0.8, startTime);
      const saturator = playback6.audio.createWaveShaper();
      saturator.curve = createSoftClipCurve();
      saturator.oversample = "4x";
      const oscGrowl = playback6.audio.createOscillator();
      oscGrowl.type = "sawtooth";
      oscGrowl.frequency.setValueAtTime(freq, startTime);
      const lp1 = playback6.audio.createBiquadFilter();
      const lp2 = playback6.audio.createBiquadFilter();
      lp1.type = lp2.type = "lowpass";
      const midi2 = 12 * Math.log2(freq / 440) + 69;
      const growlBase = 200 + midi2 * 5 + playback6.bandIntensity * 400;
      const growlDepth = 1200 * (0.5 + playback6.bandIntensity * 1);
      const cutoff = muted ? 300 : growlBase + vol * growlDepth;
      lp1.frequency.setValueAtTime(cutoff, startTime);
      lp2.frequency.setValueAtTime(cutoff, startTime);
      lp1.Q.setValueAtTime(1, startTime);
      lp2.Q.setValueAtTime(1, startTime);
      const growlGain = playback6.audio.createGain();
      growlGain.gain.setValueAtTime(0, startTime);
      growlGain.gain.setTargetAtTime(tonalVol * 0.35, startTime, 5e-3);
      const impact = playback6.audio.createBufferSource();
      impact.buffer = groove2.audioBuffers.noise;
      const impactFilter = playback6.audio.createBiquadFilter();
      impactFilter.type = "bandpass";
      impactFilter.frequency.setValueAtTime(600, startTime);
      impactFilter.Q.setValueAtTime(2, startTime);
      const impactGain = playback6.audio.createGain();
      impactGain.gain.setValueAtTime(0, startTime);
      impactGain.gain.setTargetAtTime(vol * 0.4, startTime, 1e-3);
      impactGain.gain.setTargetAtTime(0, startTime + 0.015, 0.02);
      const bodyEQ = playback6.audio.createBiquadFilter();
      bodyEQ.type = "peaking";
      bodyEQ.frequency.setValueAtTime(120, startTime);
      bodyEQ.Q.setValueAtTime(0.8, startTime);
      bodyEQ.gain.setValueAtTime(4, startTime);
      const mainGain = playback6.audio.createGain();
      mainGain.gain.setValueAtTime(0, startTime);
      mainGain.gain.setTargetAtTime(tonalVol, startTime, 8e-3);
      const releaseTime = muted ? 0.015 : duration;
      if (!muted) {
        mainGain.gain.setTargetAtTime(tonalVol * 0.5, startTime + 0.015, 0.06);
        mainGain.gain.setTargetAtTime(tonalVol * 0.2, startTime + 0.08, 0.6);
        mainGain.gain.setTargetAtTime(0, startTime + releaseTime, 0.08);
      } else {
        mainGain.gain.setTargetAtTime(0, startTime + releaseTime, 0.01);
      }
      bodyMix.connect(saturator);
      saturator.connect(mainGain);
      oscGrowl.connect(lp1);
      lp1.connect(lp2);
      lp2.connect(growlGain);
      growlGain.connect(mainGain);
      impact.connect(impactFilter);
      impactFilter.connect(impactGain);
      impactGain.connect(mainGain);
      mainGain.connect(bodyEQ);
      bodyEQ.connect(playback6.bassGain);
      if (bass2.lastBassGain && bass2.lastBassGain !== mainGain) {
        try {
          const prevGain = bass2.lastBassGain.gain;
          prevGain.cancelScheduledValues(startTime);
          prevGain.setTargetAtTime(0, startTime, 5e-3);
        } catch {
        }
      }
      bass2.lastBassGain = mainGain;
      oscSine.start(startTime);
      oscTri.start(startTime);
      oscGrowl.start(startTime);
      impact.start(startTime);
      const stopTime = startTime + releaseTime + 1;
      oscSine.stop(stopTime);
      oscTri.stop(stopTime);
      oscGrowl.stop(stopTime);
      impact.stop(startTime + 0.1);
      oscSine.onended = () => safeDisconnect([
        oscSine,
        oscTri,
        bodyMix,
        saturator,
        oscGrowl,
        lp1,
        lp2,
        growlGain,
        impact,
        impactFilter,
        impactGain,
        mainGain,
        bodyEQ
      ]);
    } catch (e3) {
      console.error("playBassNote error:", e3, { freq, time, duration });
    }
  }
  var mixState;
  var init_synth_bass = __esm({
    "public/engine/synth-bass.js"() {
      init_state();
      init_utils();
      mixState = {
        recentHits: 0,
        densityDuck: 1,
        lastTick: 0
      };
    }
  });

  // public/engine/synth-chords.js
  function createPianoWave(audioCtx) {
    const real = new Float32Array([0, 1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.08, 0.05, 0.03]);
    const imag = new Float32Array(real.length).fill(0);
    return audioCtx.createPeriodicWave(real, imag);
  }
  function updateSustain(active, time = null) {
    const { playback: playback6 } = getState();
    const scheduleTime = time !== null ? time : playback6.audio?.currentTime || 0;
    playback6.sustainActive = active;
    if (!active && playback6.heldNotes) {
      playback6.heldNotes.forEach((note) => {
        note.stop(scheduleTime);
      });
      playback6.heldNotes.clear();
    }
  }
  function killAllPianoNotes() {
    const { playback: playback6 } = getState();
    const now = playback6.audio?.currentTime || 0;
    if (playback6.heldNotes) {
      playback6.heldNotes.forEach((note) => {
        if (typeof note.stop === "function") {
          note.stop(now, true);
        }
      });
      playback6.heldNotes.clear();
    }
    playback6.sustainActive = false;
  }
  function playNote(freq, time, duration, { vol = 0.1, index = 0, instrument = "Piano", muted = false, numVoices = 1 } = {}) {
    const { playback: playback6, groove: groove2 } = getState();
    if (!Number.isFinite(freq)) {
      return;
    }
    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
    const finalVol = vol * polyphonyComp;
    if (!playback6.heldNotes) {
      playback6.heldNotes = /* @__PURE__ */ new Set();
    }
    try {
      if (instrument !== "Piano" && instrument !== "Warm") {
        instrument = "Piano";
      }
      const preset = INSTRUMENT_PRESETS[instrument] || INSTRUMENT_PRESETS.Piano;
      const now = playback6.audio.currentTime;
      const baseTime = Math.max(time, now);
      const isPiano = instrument === "Piano";
      if (isPiano && !pianoWave) {
        pianoWave = createPianoWave(playback6.audio);
      }
      const staggerMult = muted ? 0.4 : 1;
      const stagger = index * (5e-3 + Math.random() * 0.01) * staggerMult;
      const startTime = baseTime + stagger;
      const intensity = playback6.bandIntensity;
      const intensityShift = (intensity - 0.5) * 2400;
      const intensityDepthMult = 0.5 + intensity * 2.5;
      const velocityCutoff = Math.max(
        100,
        preset.filterBase + intensityShift + finalVol * preset.filterDepth * intensityDepthMult
      );
      if (isPiano && !muted) {
        const strike = playback6.audio.createBufferSource();
        strike.buffer = groove2.audioBuffers.noise;
        const strikeFilter = playback6.audio.createBiquadFilter();
        const strikeGain = playback6.audio.createGain();
        strikeFilter.type = "bandpass";
        strikeFilter.frequency.setValueAtTime(1200 + finalVol * 800, startTime);
        strikeFilter.Q.setValueAtTime(1.5, startTime);
        strikeGain.gain.setValueAtTime(0, startTime);
        strikeGain.gain.setTargetAtTime(finalVol * 0.15, startTime, 1e-3);
        strikeGain.gain.setTargetAtTime(0, startTime + 0.01, 0.01);
        strike.connect(strikeFilter);
        strikeFilter.connect(strikeGain);
        strikeGain.connect(playback6.chordsGain);
        strike.start(startTime);
        strike.stop(startTime + 0.1);
        strike.onended = () => safeDisconnect([strike, strikeFilter, strikeGain]);
      }
      const osc = playback6.audio.createOscillator();
      const mainGain = playback6.audio.createGain();
      const filter = playback6.audio.createBiquadFilter();
      if (isPiano) {
        osc.setPeriodicWave(pianoWave);
      } else {
        osc.type = preset.fundamental || "sine";
      }
      osc.frequency.setValueAtTime(freq, startTime);
      osc.detune.setValueAtTime(Math.random() * 4 - 2, startTime);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(velocityCutoff, startTime);
      filter.frequency.setTargetAtTime(preset.filterBase, startTime, isPiano ? 0.35 : 0.1);
      filter.Q.setValueAtTime(preset.resonance, startTime);
      mainGain.gain.setValueAtTime(0, startTime);
      mainGain.gain.setTargetAtTime(
        finalVol * (preset.gainMult || 1),
        startTime,
        preset.attack
      );
      const stopNote = (t3, isPanic = false) => {
        mainGain.gain.cancelScheduledValues(t3);
        const dampingConstant = isPanic ? 5e-3 : duration < 0.2 ? 0.02 : 0.12;
        mainGain.gain.setTargetAtTime(0, t3, dampingConstant);
        try {
          osc.stop(t3 + 0.5);
        } catch {
        }
      };
      if (playback6.sustainActive && !muted) {
        const noteRef = { stop: stopNote };
        playback6.heldNotes.add(noteRef);
        if (playback6.heldNotes.size > 64) {
          const firstNote = playback6.heldNotes.values().next().value;
          firstNote.stop(now);
          playback6.heldNotes.delete(firstNote);
        }
      } else {
        const actualDuration = muted ? 0.015 : duration;
        mainGain.gain.setTargetAtTime(0, startTime + actualDuration, 0.03);
      }
      osc.connect(filter);
      let lastNode = filter;
      if (intensity >= 0.8 && !muted) {
        const shaper = playback6.audio.createWaveShaper();
        const drive = 1 + (intensity - 0.8) * 10;
        if (!cachedShaperCurve || Math.abs(drive - cachedShaperDrive) > 0.01) {
          const n_samples = 44100;
          cachedShaperCurve = new Float32Array(n_samples);
          for (let i3 = 0; i3 < n_samples; ++i3) {
            const x3 = i3 * 2 / n_samples - 1;
            cachedShaperCurve[i3] = (Math.PI + drive) * x3 / (Math.PI + drive * Math.abs(x3));
          }
          cachedShaperDrive = drive;
        }
        shaper.curve = cachedShaperCurve;
        shaper.oversample = "2x";
        filter.connect(shaper);
        lastNode = shaper;
      }
      lastNode.connect(mainGain);
      const hpf = playback6.audio.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.setValueAtTime(150, startTime);
      const panner = playback6.audio.createStereoPanner ? playback6.audio.createStereoPanner() : playback6.audio.createGain();
      if (playback6.audio.createStereoPanner) {
        panner.pan.setValueAtTime(-0.2, startTime);
      }
      mainGain.connect(hpf);
      hpf.connect(panner);
      panner.connect(playback6.chordsGain);
      osc.start(startTime);
      if (!playback6.sustainActive || muted) {
        osc.stop(startTime + (muted ? 0.1 : duration + 1));
      }
      osc.onended = () => safeDisconnect([osc, filter, mainGain]);
    } catch (err) {
      console.error("playNote error:", err);
    }
  }
  function playChordScratch(time, vol = 0.1) {
    const { playback: playback6, groove: groove2 } = getState();
    try {
      const randomizedVol = vol * (0.8 + Math.random() * 0.4);
      const gain = playback6.audio.createGain();
      const filter = playback6.audio.createBiquadFilter();
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      filter.type = "bandpass";
      const scratchFreq = 1200 + Math.random() * 400;
      filter.frequency.value = scratchFreq;
      filter.frequency.setValueAtTime(scratchFreq, time);
      filter.Q.value = 1.5;
      filter.Q.setValueAtTime(1.5, time);
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, time);
      gain.gain.setTargetAtTime(randomizedVol, time, 5e-3);
      gain.gain.setTargetAtTime(0, time + 0.02, 0.02);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(playback6.chordsGain);
      noise.start(time);
      noise.stop(time + 0.2);
      noise.onended = () => safeDisconnect([gain, filter, noise]);
    } catch (e3) {
      console.error("playChordScratch error:", e3);
    }
  }
  var INSTRUMENT_PRESETS, pianoWave, cachedShaperCurve, cachedShaperDrive;
  var init_synth_chords = __esm({
    "public/engine/synth-chords.js"() {
      init_state();
      init_utils();
      INSTRUMENT_PRESETS = {
        Warm: {
          attack: 0.03,
          // Slightly softer attack
          decay: 0.6,
          // Shortened from 0.8 for better clarity
          filterBase: 600,
          // Darker base
          filterDepth: 1800,
          resonance: 2.2,
          // Increased for a "sweet" bloom
          tine: true,
          fundamental: "triangle",
          // Swapped from sine for more body
          harmonic: "sine",
          fifth: "sine",
          weights: [1.2, 0.3, 0.1],
          reverbMult: 1.1,
          gainMult: 1
        },
        Piano: {
          attack: 1e-3,
          // Faster transient for more immediate "hit"
          decay: 5,
          filterBase: 400,
          // Lower base for a warmer tone
          filterDepth: 2400,
          // Reduced from 4200 to significantly cut harsh high-end
          resonance: 1.2,
          // Smoother resonance
          gainMult: 1.25
          // Boosted from 1.1 to anchor the mix
        }
      };
      pianoWave = null;
      cachedShaperCurve = null;
      cachedShaperDrive = -1;
    }
  });

  // public/engine/synth-drums.js
  function killDrumNote() {
    const { playback: playback6, groove: groove2 } = getState();
    if (groove2.lastHatGain) {
      try {
        const g4 = groove2.lastHatGain.gain;
        g4.cancelScheduledValues(playback6.audio.currentTime);
        g4.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
      } catch {
      }
      groove2.lastHatGain = null;
    }
  }
  function playDrumSound(name, time, velocity = 1) {
    const { playback: playback6, groove: groove2 } = getState();
    if (!name) {
      return;
    }
    const now = playback6.audio.currentTime;
    if (now - mixState2.lastTick > 0.5) {
      mixState2.recentHits *= 0.5;
      mixState2.lastTick = now;
    }
    mixState2.recentHits++;
    const densityThreshold = 18;
    mixState2.densityDuck = Math.max(
      0.75,
      1 - Math.max(0, mixState2.recentHits - densityThreshold) * 0.015
    );
    const playTime = Math.max(time, now + 2e-3);
    const humanizeFactor = (groove2.humanize || 0) / 100;
    const velJitter = 1 + (Math.random() - 0.5) * (humanizeFactor * 0.4);
    const masterVol = velocity * 1.3 * velJitter * mixState2.densityDuck;
    const panner = playback6.audio.createStereoPanner ? playback6.audio.createStereoPanner() : playback6.audio.createGain();
    let panValue = 0;
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
      panValue = 0.35;
    } else if (name === "Snare" || name === "Sidestick") {
      panValue = -0.1;
    } else if (name.includes("Tom") || name.includes("Conga") || name.includes("Bongo")) {
      panValue = (Math.random() * 2 - 1) * 0.25;
    }
    if (playback6.audio.createStereoPanner) {
      panner.pan.setValueAtTime(panValue, playTime);
    }
    panner.connect(playback6.drumsGain);
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;
    if (name === "Kick") {
      const vol = masterVol * rr();
      const beater = playback6.audio.createOscillator();
      const beaterGain = playback6.audio.createGain();
      beaterGain.gain.value = 0;
      beaterGain.gain.setValueAtTime(0, playTime);
      beater.type = "sine";
      beater.frequency.setValueAtTime(3e3 * rr(), playTime);
      beater.frequency.exponentialRampToValueAtTime(600, playTime + 5e-3);
      beaterGain.gain.setTargetAtTime(vol * 0.4, playTime, 1e-3);
      beaterGain.gain.setTargetAtTime(0, playTime + 5e-3, 3e-3);
      const skin = playback6.audio.createBufferSource();
      skin.buffer = groove2.audioBuffers.noise;
      const skinFilter = playback6.audio.createBiquadFilter();
      const skinGain = playback6.audio.createGain();
      skinFilter.type = "bandpass";
      skinFilter.frequency.value = 1e3;
      skinFilter.Q.value = 1;
      skinGain.gain.value = 0;
      skinGain.gain.setValueAtTime(0, playTime);
      skinGain.gain.setTargetAtTime(vol * 0.2, playTime, 2e-3);
      skinGain.gain.setTargetAtTime(0, playTime + 0.01, 0.01);
      const knock = playback6.audio.createOscillator();
      const knockGain = playback6.audio.createGain();
      knockGain.gain.value = 0;
      knockGain.gain.setValueAtTime(0, playTime);
      knock.type = "triangle";
      knock.frequency.setValueAtTime(180 * rr(), playTime);
      knock.frequency.exponentialRampToValueAtTime(60, playTime + 0.02);
      knockGain.gain.setTargetAtTime(vol * 1.3, playTime, 1e-3);
      knockGain.gain.setTargetAtTime(0, playTime + 0.015, 0.03);
      const shell = playback6.audio.createOscillator();
      const shellGain = playback6.audio.createGain();
      shellGain.gain.value = 0;
      shellGain.gain.setValueAtTime(0, playTime);
      shell.type = "sine";
      shell.frequency.setValueAtTime(52 * rr(), playTime);
      shellGain.gain.setTargetAtTime(vol * 1, playTime, 5e-3);
      shellGain.gain.setTargetAtTime(0, playTime + 0.03, 0.07);
      beater.connect(beaterGain);
      skin.connect(skinFilter);
      skinFilter.connect(skinGain);
      knock.connect(knockGain);
      shell.connect(shellGain);
      [beaterGain, skinGain, knockGain, shellGain].forEach((g4) => g4.connect(panner));
      beater.start(playTime);
      skin.start(playTime);
      knock.start(playTime);
      shell.start(playTime);
      beater.stop(playTime + 0.1);
      skin.stop(playTime + 0.1);
      knock.stop(playTime + 0.2);
      shell.stop(playTime + 0.5);
      shell.onended = () => safeDisconnect([
        beater,
        beaterGain,
        skin,
        skinFilter,
        skinGain,
        knock,
        knockGain,
        shell,
        shellGain,
        panner
      ]);
    } else if (name === "Snare" || name === "Sidestick") {
      const isSidestick = name === "Sidestick";
      const vol = masterVol * rr() * (isSidestick ? 0.8 : 1);
      if (isSidestick) {
        const click = playback6.audio.createOscillator();
        const clickGain = playback6.audio.createGain();
        click.type = "sine";
        click.frequency.setValueAtTime(6500 * rr(), playTime);
        clickGain.gain.setValueAtTime(0, playTime);
        clickGain.gain.setTargetAtTime(vol * 0.4, playTime, 1e-3);
        clickGain.gain.setTargetAtTime(0, playTime + 5e-3, 5e-3);
        click.connect(clickGain);
        clickGain.connect(panner);
        const body = playback6.audio.createOscillator();
        const bodyGain = playback6.audio.createGain();
        const bodyFilter = playback6.audio.createBiquadFilter();
        body.type = "triangle";
        const bodyFreq = 330 * rr();
        body.frequency.setValueAtTime(bodyFreq, playTime);
        body.frequency.setTargetAtTime(bodyFreq * 0.9, playTime, 0.1);
        bodyFilter.type = "bandpass";
        bodyFilter.frequency.setValueAtTime(350, playTime);
        bodyFilter.Q.setValueAtTime(1.5, playTime);
        bodyGain.gain.setValueAtTime(0, playTime);
        bodyGain.gain.setTargetAtTime(vol * 0.8, playTime, 2e-3);
        bodyGain.gain.setTargetAtTime(0, playTime + 0.02, 0.04);
        body.connect(bodyFilter);
        bodyFilter.connect(bodyGain);
        bodyGain.connect(panner);
        const noise2 = playback6.audio.createBufferSource();
        noise2.buffer = groove2.audioBuffers.noise;
        const noiseFilter2 = playback6.audio.createBiquadFilter();
        const noiseGain2 = playback6.audio.createGain();
        noiseFilter2.type = "highpass";
        noiseFilter2.frequency.setValueAtTime(3500, playTime);
        noiseGain2.gain.setValueAtTime(0, playTime);
        noiseGain2.gain.setTargetAtTime(vol * 0.35, playTime, 2e-3);
        noiseGain2.gain.setTargetAtTime(0, playTime + 0.01, 0.02);
        noise2.connect(noiseFilter2);
        noiseFilter2.connect(noiseGain2);
        noiseGain2.connect(panner);
        click.start(playTime);
        body.start(playTime);
        noise2.start(playTime);
        const stopTime = playTime + 0.5;
        click.stop(stopTime);
        body.stop(stopTime);
        noise2.stop(stopTime);
        noise2.onended = () => safeDisconnect([
          click,
          clickGain,
          body,
          bodyFilter,
          bodyGain,
          noise2,
          noiseFilter2,
          noiseGain2,
          panner
        ]);
        return;
      }
      const tone1 = playback6.audio.createOscillator();
      const tone2 = playback6.audio.createOscillator();
      const toneGain = playback6.audio.createGain();
      toneGain.gain.value = 0;
      toneGain.gain.setValueAtTime(0, playTime);
      tone1.type = "triangle";
      tone2.type = "sine";
      tone1.frequency.setValueAtTime(180 * rr(), playTime);
      tone2.frequency.setValueAtTime(330 * rr(), playTime);
      toneGain.gain.setTargetAtTime(vol * 0.5, playTime, 1e-3);
      toneGain.gain.setTargetAtTime(0, playTime + 0.01, 0.05);
      tone1.connect(toneGain);
      tone2.connect(toneGain);
      toneGain.connect(panner);
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      const noiseFilter = playback6.audio.createBiquadFilter();
      const noiseGain = playback6.audio.createGain();
      noiseGain.gain.value = 0;
      noiseGain.gain.setValueAtTime(0, playTime);
      noiseFilter.type = "bandpass";
      const centerFreq = 1500 + velocity * 1e3;
      const finalFreq = centerFreq * rr();
      noiseFilter.frequency.value = finalFreq;
      noiseFilter.frequency.setValueAtTime(finalFreq, playTime);
      noiseFilter.Q.value = 1.2;
      noiseFilter.Q.setValueAtTime(1.2, playTime);
      noiseGain.gain.setTargetAtTime(vol * 1.25, playTime, 1e-3);
      noiseGain.gain.setTargetAtTime(0, playTime + 0.01, 0.08);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);
      tone1.start(playTime);
      tone2.start(playTime);
      noise.start(playTime);
      tone1.stop(playTime + 0.5);
      tone2.stop(playTime + 0.5);
      noise.stop(playTime + 0.5);
      noise.onended = () => safeDisconnect([tone1, tone2, toneGain, noise, noiseFilter, noiseGain, panner]);
    } else if (name === "HiHat" || name === "Open") {
      const isOpen = name === "Open";
      const vol = masterVol * (isOpen ? 0.5 : 0.7) * rr();
      if (groove2.lastHatGain) {
        try {
          const g4 = groove2.lastHatGain.gain;
          g4.cancelScheduledValues(playTime);
          g4.setTargetAtTime(0, playTime, 5e-3);
        } catch {
        }
      }
      if (!groove2.audioBuffers.hihatMetal) {
        groove2.audioBuffers.hihatMetal = createMetallicBuffer(playback6.audio);
      }
      const source = playback6.audio.createBufferSource();
      source.buffer = groove2.audioBuffers.hihatMetal;
      source.playbackRate.value = rr(0.05);
      const bpFilter = playback6.audio.createBiquadFilter();
      bpFilter.type = "bandpass";
      bpFilter.frequency.setValueAtTime(1e4, playTime);
      bpFilter.Q.value = 1;
      const hpFilter = playback6.audio.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.setValueAtTime(4800, playTime);
      const gain = playback6.audio.createGain();
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, playTime);
      if (isOpen) {
        gain.gain.setTargetAtTime(vol, playTime, 0.015);
        gain.gain.setTargetAtTime(0, playTime + 0.02, 0.35 * rr());
      } else {
        gain.gain.setTargetAtTime(vol, playTime, 2e-3);
        gain.gain.setTargetAtTime(0, playTime + 5e-3, 0.05 * rr());
      }
      groove2.lastHatGain = gain;
      source.connect(bpFilter);
      bpFilter.connect(hpFilter);
      hpFilter.connect(gain);
      gain.connect(panner);
      source.start(playTime);
      source.stop(playTime + (isOpen ? 2 : 0.4));
      source.onended = () => {
        if (groove2.lastHatGain === gain) {
          groove2.lastHatGain = null;
        }
        safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
      };
    } else if (name === "Crash") {
      const vol = masterVol * 0.85 * rr();
      const duration = 2 * rr();
      const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
      const baseFreq = 60 * rr();
      const oscs = ratios.map((r3) => {
        const o3 = playback6.audio.createOscillator();
        o3.type = "square";
        o3.frequency.setValueAtTime(baseFreq * r3, playTime);
        return o3;
      });
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      const hpFilter = playback6.audio.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.frequency.value = 6e3;
      hpFilter.frequency.setValueAtTime(6e3, playTime);
      hpFilter.frequency.setTargetAtTime(1200, playTime, duration * 0.4);
      hpFilter.Q.value = 0.5;
      const gain = playback6.audio.createGain();
      gain.gain.value = 0;
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.linearRampToValueAtTime(vol, playTime + 5e-3);
      gain.gain.setTargetAtTime(vol * 0.15, playTime + 0.01, 0.02);
      gain.gain.setTargetAtTime(0, playTime + 0.08, duration * 0.2);
      const killTime = playTime + duration;
      gain.gain.setValueAtTime(1e-3, killTime - 0.02);
      gain.gain.linearRampToValueAtTime(0, killTime);
      oscs.forEach((o3) => {
        o3.connect(hpFilter);
        o3.start(playTime);
        o3.stop(killTime + 0.1);
      });
      noise.connect(hpFilter);
      noise.start(playTime);
      noise.stop(killTime + 0.1);
      hpFilter.connect(gain);
      gain.connect(panner);
      oscs[0].onended = () => safeDisconnect([...oscs, noise, hpFilter, gain, panner]);
    } else if (name === "Clave") {
      const vol = masterVol * 0.7 * rr();
      const osc = playback6.audio.createOscillator();
      const gain = playback6.audio.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(2450 * rr(0.01), playTime);
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.setTargetAtTime(vol, playTime, 5e-4);
      gain.gain.setTargetAtTime(0, playTime + 5e-3, 8e-3);
      const strike = playback6.audio.createBufferSource();
      strike.buffer = groove2.audioBuffers.noise;
      const strikeFilter = playback6.audio.createBiquadFilter();
      const strikeGain = playback6.audio.createGain();
      strikeFilter.type = "highpass";
      strikeFilter.frequency.setValueAtTime(5e3, playTime);
      strikeFilter.Q.value = 0.5;
      strikeGain.gain.setValueAtTime(0, playTime);
      strikeGain.gain.setTargetAtTime(vol * 0.4, playTime, 5e-4);
      strikeGain.gain.setTargetAtTime(0, playTime + 2e-3, 3e-3);
      osc.connect(gain);
      gain.connect(panner);
      strike.connect(strikeFilter);
      strikeFilter.connect(strikeGain);
      strikeGain.connect(panner);
      osc.start(playTime);
      strike.start(playTime);
      osc.stop(playTime + 0.1);
      strike.stop(playTime + 0.1);
      osc.onended = () => safeDisconnect([osc, gain, strike, strikeFilter, strikeGain, panner]);
    } else if (name.startsWith("Conga") || name.startsWith("Bongo")) {
      const isBongo = name.startsWith("Bongo");
      const isHigh = name.includes("High");
      const isSlap = name.includes("Slap");
      const isMute = name.includes("Mute");
      const baseFreq = isBongo ? isHigh ? 420 : 280 : isHigh ? 210 : 155;
      const vol = masterVol * (isSlap ? 0.85 : 0.7) * rr();
      const tone = playback6.audio.createOscillator();
      const toneGain = playback6.audio.createGain();
      tone.type = isSlap ? "triangle" : "sine";
      tone.frequency.setValueAtTime(baseFreq * rr(0.01), playTime);
      tone.frequency.exponentialRampToValueAtTime(baseFreq * 0.95, playTime + 0.05);
      toneGain.gain.setValueAtTime(0, playTime);
      toneGain.gain.setTargetAtTime(vol, playTime, 2e-3);
      const decay = isMute ? 0.015 : isSlap ? 0.03 : 0.07;
      toneGain.gain.setTargetAtTime(0, playTime + 0.01, decay);
      tone.connect(toneGain);
      toneGain.connect(panner);
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      const noiseFilter = playback6.audio.createBiquadFilter();
      const noiseGain = playback6.audio.createGain();
      noiseFilter.type = "bandpass";
      noiseFilter.frequency.setValueAtTime(isSlap ? 2500 : 800, playTime);
      noiseFilter.Q.value = 1;
      noiseGain.gain.setValueAtTime(0, playTime);
      noiseGain.gain.setTargetAtTime(isSlap ? vol * 0.6 : vol * 0.25, playTime, 1e-3);
      noiseGain.gain.setTargetAtTime(0, playTime + 5e-3, 0.015);
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);
      tone.start(playTime);
      noise.start(playTime);
      tone.stop(playTime + 0.3);
      noise.stop(playTime + 0.3);
      tone.onended = () => safeDisconnect([tone, toneGain, noise, noiseFilter, noiseGain, panner]);
    } else if (name.startsWith("Agogo") || name === "Perc") {
      const isHigh = name.includes("High") || name === "Perc";
      const vol = masterVol * 0.35 * rr();
      const freq = isHigh ? 1150 : 780;
      const osc1 = playback6.audio.createOscillator();
      const osc2 = playback6.audio.createOscillator();
      const gain = playback6.audio.createGain();
      const filter = playback6.audio.createBiquadFilter();
      osc1.type = "sine";
      osc2.type = "triangle";
      osc1.frequency.setValueAtTime(freq * rr(5e-3), playTime);
      osc2.frequency.setValueAtTime(freq * 1.492 * rr(5e-3), playTime);
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freq * 1.5, playTime);
      filter.Q.value = 4;
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.setTargetAtTime(vol, playTime, 1e-3);
      gain.gain.setTargetAtTime(0, playTime + 0.02, 0.12);
      const body = playback6.audio.createOscillator();
      const bodyGain = playback6.audio.createGain();
      body.type = "sine";
      body.frequency.setValueAtTime(freq, playTime);
      bodyGain.gain.setValueAtTime(0, playTime);
      bodyGain.gain.setTargetAtTime(vol * 0.5, playTime, 2e-3);
      bodyGain.gain.setTargetAtTime(0, playTime + 0.01, 0.04);
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      body.connect(bodyGain);
      [gain, bodyGain].forEach((g4) => g4.connect(panner));
      [osc1, osc2, body].forEach((o3) => {
        o3.start(playTime);
        o3.stop(playTime + 0.5);
      });
      osc1.onended = () => safeDisconnect([osc1, osc2, body, filter, gain, bodyGain, panner]);
    } else if (name === "Guiro") {
      const vol = masterVol * 0.5 * rr();
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      noise.loop = true;
      const filter = playback6.audio.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(2500, playTime);
      filter.Q.value = 1;
      const gain = playback6.audio.createGain();
      gain.gain.setValueAtTime(0, playTime);
      for (let i3 = 0; i3 < 4; i3++) {
        const t3 = playTime + i3 * 0.035;
        gain.gain.setTargetAtTime(vol * (0.6 + i3 * 0.1), t3, 5e-3);
        gain.gain.setTargetAtTime(0, t3 + 0.015, 0.01);
      }
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      noise.start(playTime);
      noise.stop(playTime + 0.2);
      noise.onended = () => safeDisconnect([noise, filter, gain, panner]);
    } else if (name === "Shaker") {
      const vol = masterVol * 0.45 * rr();
      const noise = playback6.audio.createBufferSource();
      noise.buffer = groove2.audioBuffers.noise;
      const filter = playback6.audio.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(6e3, playTime);
      const gain = playback6.audio.createGain();
      gain.gain.setValueAtTime(0, playTime);
      gain.gain.setTargetAtTime(vol, playTime, 0.01);
      gain.gain.setTargetAtTime(0, playTime + 0.02, 0.05);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      noise.start(playTime);
      noise.stop(playTime + 0.2);
      noise.onended = () => safeDisconnect([noise, filter, gain, panner]);
    } else if (name.includes("Tom")) {
      const vol = masterVol * 0.8 * rr();
      const isHigh = name.includes("High");
      const isMid = name.includes("Mid");
      const freq = isHigh ? 180 : isMid ? 135 : 90;
      const tone = playback6.audio.createOscillator();
      const toneGain = playback6.audio.createGain();
      tone.type = "sine";
      tone.frequency.setValueAtTime(freq * 1.2 * rr(), playTime);
      tone.frequency.exponentialRampToValueAtTime(freq, playTime + 0.05);
      toneGain.gain.setValueAtTime(0, playTime);
      toneGain.gain.setTargetAtTime(vol, playTime, 2e-3);
      toneGain.gain.setTargetAtTime(0, playTime + 0.05, 0.2);
      tone.connect(toneGain);
      toneGain.connect(panner);
      const stick = playback6.audio.createOscillator();
      const stickGain = playback6.audio.createGain();
      stick.type = "square";
      stick.frequency.setValueAtTime(freq * 2.5, playTime);
      stick.frequency.exponentialRampToValueAtTime(freq, playTime + 0.01);
      stickGain.gain.setValueAtTime(0, playTime);
      stickGain.gain.setTargetAtTime(vol * 0.3, playTime, 1e-3);
      stickGain.gain.setTargetAtTime(0, playTime + 5e-3, 0.01);
      stick.connect(stickGain);
      stickGain.connect(panner);
      tone.start(playTime);
      stick.start(playTime);
      tone.stop(playTime + 1);
      stick.stop(playTime + 0.1);
      tone.onended = () => safeDisconnect([tone, toneGain, stick, stickGain, panner]);
    }
  }
  function createMetallicBuffer(audioCtx) {
    const duration = 2;
    const sampleRate = audioCtx.sampleRate;
    const length = sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21];
    const baseFreq = 40;
    for (let i3 = 0; i3 < length; i3++) {
      let sample = 0;
      const t3 = i3 / sampleRate;
      for (const r3 of ratios) {
        const freq = baseFreq * r3;
        const phase = t3 * freq % 1;
        sample += phase < 0.5 ? 1 : -1;
      }
      data[i3] = sample / ratios.length;
    }
    return buffer;
  }
  var RIGHT_PANNED_INSTRUMENTS, mixState2;
  var init_synth_drums = __esm({
    "public/engine/synth-drums.js"() {
      init_state();
      init_utils();
      RIGHT_PANNED_INSTRUMENTS = /* @__PURE__ */ new Set([
        "HiHat",
        "Open",
        "Crash",
        "Shaker",
        "Agogo",
        "Perc",
        "Guiro",
        "Clave"
      ]);
      mixState2 = {
        recentHits: 0,
        densityDuck: 1,
        lastTick: 0
      };
    }
  });

  // public/engine/synth-harmonies.js
  function killHarmonyNote(fadeTime = 0.05) {
    const { playback: playback6, harmony: harmony2 } = getState();
    if (harmony2.activeVoices && harmony2.activeVoices.length > 0) {
      harmony2.activeVoices.forEach((voice) => {
        try {
          const g4 = voice.gain.gain;
          g4.cancelScheduledValues(playback6.audio.currentTime);
          g4.setTargetAtTime(0, playback6.audio.currentTime, fadeTime);
        } catch {
        }
      });
      harmony2.activeVoices = [];
    }
  }
  function playHarmonyNote(freq, time, duration, vol = 0.4, style = "stabs", midi2 = null, slideInterval = 0, slideDuration = 0, vibrato = { rate: 0, depth: 0 }) {
    const { playback: playback6, harmony: harmony2, groove: groove2 } = getState();
    if (!Number.isFinite(freq) || !playback6.audio) {
      return;
    }
    const now = playback6.audio.currentTime;
    const playTime = Math.max(time, now);
    const feel = groove2.genreFeel;
    if (!harmony2.activeVoices) {
      harmony2.activeVoices = [];
    }
    harmony2.activeVoices = harmony2.activeVoices.filter((v3) => v3.time + v3.duration + 0.1 > playTime);
    if (midi2 !== null) {
      const existing = harmony2.activeVoices.find((v3) => v3.midi === midi2);
      if (existing) {
        existing.gain.gain.cancelScheduledValues(playTime);
        existing.gain.gain.setTargetAtTime(0, playTime, 5e-3);
        harmony2.activeVoices = harmony2.activeVoices.filter((v3) => v3 !== existing);
      }
    }
    if (harmony2.activeVoices.length >= 3) {
      const oldest = harmony2.activeVoices.shift();
      if (oldest) {
        oldest.gain.gain.cancelScheduledValues(playTime);
        oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
      }
    }
    const polyphonyDucking = harmony2.activeVoices.length > 1 ? 0.85 : 1;
    const finalVol = vol * polyphonyDucking;
    const gain = playback6.audio.createGain();
    gain.gain.value = 0;
    const filter = playback6.audio.createBiquadFilter();
    filter.type = "lowpass";
    const panner = playback6.audio.createStereoPanner ? playback6.audio.createStereoPanner() : null;
    if (panner) {
      const panRange = 0.1 + playback6.bandIntensity * 0.7;
      const panValue = (Math.random() * 2 - 1) * panRange;
      panner.pan.setValueAtTime(panValue, playTime);
    }
    const osc1 = playback6.audio.createOscillator();
    const osc2 = playback6.audio.createOscillator();
    const useSub = freq > 250;
    const sub = useSub ? playback6.audio.createOscillator() : null;
    let lfo = null;
    let lfoGain = null;
    let tremoloLfo = null;
    let tremoloGain = null;
    let fifthOsc = null;
    let click = null;
    let clickGain = null;
    let saturator = null;
    let subGain = null;
    let hp = null;
    if (style === "organ") {
      const leslieSpeed = 6.2;
      saturator = playback6.audio.createWaveShaper();
      saturator.curve = (() => {
        const n2 = 44100;
        const curve = new Float32Array(n2);
        const k3 = 2;
        for (let i3 = 0; i3 < n2; ++i3) {
          const x3 = i3 * 2 / n2 - 1;
          curve[i3] = (1 + k3) * x3 / (1 + k3 * Math.abs(x3));
        }
        return curve;
      })();
      lfo = playback6.audio.createOscillator();
      lfoGain = playback6.audio.createGain();
      lfo.frequency.setValueAtTime(leslieSpeed, playTime);
      lfoGain.gain.setValueAtTime(5, playTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);
      if (sub) {
        lfoGain.connect(sub.frequency);
      }
      lfo.start(playTime);
      tremoloLfo = playback6.audio.createOscillator();
      tremoloGain = playback6.audio.createGain();
      tremoloLfo.type = "sine";
      tremoloLfo.frequency.setValueAtTime(leslieSpeed, playTime);
      const tremDepth = 0.2;
      tremoloGain.gain.setValueAtTime(1 - tremDepth, playTime);
      const tremAmp = playback6.audio.createGain();
      tremAmp.gain.setValueAtTime(tremDepth, playTime);
      tremoloLfo.connect(tremAmp);
      tremAmp.connect(gain.gain);
      tremoloLfo.start(playTime);
    } else if (vibrato && vibrato.rate > 0 && vibrato.depth > 0) {
      lfo = playback6.audio.createOscillator();
      lfoGain = playback6.audio.createGain();
      lfo.frequency.setValueAtTime(vibrato.rate, playTime);
      lfoGain.gain.setValueAtTime(vibrato.depth, playTime);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfoGain.connect(osc2.frequency);
      if (sub) {
        lfoGain.connect(sub.frequency);
      }
      lfo.start(playTime);
    }
    if (feel === "Rock" || feel === "Metal") {
      osc1.type = "sawtooth";
      osc2.type = "sawtooth";
      osc2.detune.setValueAtTime(15, playTime);
      if (sub) {
        sub.type = "sawtooth";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    } else if (feel === "Neo-Soul" || feel === "Acoustic") {
      osc1.type = "triangle";
      osc2.type = "triangle";
      osc2.detune.setValueAtTime(2, playTime);
      if (sub) {
        sub.type = "triangle";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    } else if (style === "organ") {
      osc1.type = "sine";
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, playTime);
      fifthOsc = playback6.audio.createOscillator();
      fifthOsc.type = "sine";
      fifthOsc.frequency.setValueAtTime(freq * 1.5, playTime);
      if (sub) {
        sub.type = "sine";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
        subGain = playback6.audio.createGain();
        subGain.gain.setValueAtTime(0.5, playTime);
        sub.connect(subGain);
        if (saturator) {
          subGain.connect(saturator);
        }
      }
      click = playback6.audio.createOscillator();
      clickGain = playback6.audio.createGain();
      click.type = "square";
      click.frequency.setValueAtTime(freq * 4, playTime);
      clickGain.gain.setValueAtTime(finalVol * 0.6, playTime);
      clickGain.gain.exponentialRampToValueAtTime(1e-3, playTime + 0.04);
      click.connect(clickGain);
      clickGain.connect(gain);
      click.start(playTime);
      click.stop(playTime + 0.1);
      if (saturator) {
        osc1.connect(saturator);
        osc2.connect(saturator);
        fifthOsc.connect(saturator);
        hp = playback6.audio.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(120, playTime);
        saturator.connect(filter);
        filter.connect(hp);
        hp.connect(gain);
      } else {
        osc1.connect(filter);
        osc2.connect(filter);
        fifthOsc.connect(filter);
        filter.connect(gain);
      }
      fifthOsc.start(playTime);
      fifthOsc.stop(playTime + duration + 0.5);
      if (lfoGain) {
        lfoGain.connect(fifthOsc.frequency);
      }
    } else if (style === "plucks") {
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc2.detune.setValueAtTime(5, playTime);
      if (sub) {
        sub.type = "sine";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    } else if (style === "disco") {
      osc1.type = "triangle";
      osc2.type = "sawtooth";
      osc2.detune.setValueAtTime(4, playTime);
      if (sub) {
        sub.type = "sine";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    } else if (style === "counter") {
      osc1.type = "sawtooth";
      osc2.type = "triangle";
      osc2.detune.setValueAtTime(4, playTime);
    } else if (style === "stabs") {
      osc1.type = "sawtooth";
      osc2.type = "triangle";
      osc2.detune.setValueAtTime(12, playTime);
      if (sub) {
        sub.type = "triangle";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    } else {
      osc1.type = "triangle";
      osc2.type = "sawtooth";
      osc2.detune.setValueAtTime(8, playTime);
      if (sub) {
        sub.type = "sine";
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    }
    if (slideInterval !== 0 && slideDuration > 0) {
      const startFreq = freq * 2 ** (slideInterval / 12);
      osc1.frequency.setValueAtTime(startFreq, playTime);
      osc2.frequency.setValueAtTime(startFreq, playTime);
      if (sub) {
        sub.frequency.setValueAtTime(startFreq * 0.5, playTime);
      }
      osc1.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
      osc2.frequency.exponentialRampToValueAtTime(freq, playTime + slideDuration);
      if (sub) {
        sub.frequency.exponentialRampToValueAtTime(freq * 0.5, playTime + slideDuration);
      }
    } else {
      osc1.frequency.setValueAtTime(freq, playTime);
      osc2.frequency.setValueAtTime(freq, playTime);
      if (sub) {
        sub.frequency.setValueAtTime(freq * 0.5, playTime);
      }
    }
    const intensity = playback6.bandIntensity;
    const brightnessMult = 1 + intensity * 2;
    if (style === "stabs") {
      const qVal = feel === "Rock" || feel === "Metal" ? 5 + intensity * 5 : 3 + intensity * 2;
      const startFreq = Math.min(freq * 8 * brightnessMult, 12e3);
      filter.frequency.setValueAtTime(clampFreq(startFreq), playTime);
      filter.frequency.exponentialRampToValueAtTime(
        clampFreq(freq * 2 * brightnessMult),
        playTime + 0.1
      );
      filter.Q.setValueAtTime(qVal, playTime);
    } else if (style === "plucks") {
      filter.frequency.setValueAtTime(clampFreq(freq * 8), playTime);
      filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.1);
      filter.Q.setValueAtTime(5 + intensity * 5, playTime);
    } else if (style === "disco") {
      filter.frequency.setValueAtTime(clampFreq(freq * 6), playTime);
      filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2), playTime + 0.12);
      filter.Q.setValueAtTime(2 + intensity * 3, playTime);
    } else if (style === "counter") {
      const start = freq * 1.5;
      const peak = freq * 3 * brightnessMult;
      filter.frequency.setValueAtTime(clampFreq(start), playTime);
      filter.frequency.linearRampToValueAtTime(clampFreq(peak), playTime + duration * 0.6);
      filter.Q.setValueAtTime(1, playTime);
    } else {
      const cutoff = feel === "Neo-Soul" ? freq * 1.5 * brightnessMult : freq * 3 * brightnessMult;
      filter.frequency.setValueAtTime(clampFreq(cutoff), playTime);
      filter.frequency.exponentialRampToValueAtTime(
        clampFreq(cutoff * 1.2),
        playTime + duration * 0.5
      );
      filter.frequency.exponentialRampToValueAtTime(clampFreq(cutoff), playTime + duration);
      filter.Q.setValueAtTime(1 + intensity, playTime);
    }
    const isFastAttack = style === "stabs" || style === "plucks" || style === "organ";
    const baseAttack = isFastAttack ? 0.01 : 0.2;
    const attack = Math.max(5e-3, baseAttack - finalVol * 0.15);
    let release = 0.5;
    if (style === "stabs") {
      release = 0.1;
    }
    if (style === "plucks") {
      release = 0.02;
    }
    const detuneMult = 1 + finalVol * 0.5;
    osc2.detune.setValueAtTime((style === "stabs" ? 12 : 8) * detuneMult, playTime);
    gain.gain.setValueAtTime(0, playTime);
    gain.gain.linearRampToValueAtTime(finalVol, playTime + attack);
    gain.gain.setTargetAtTime(0, playTime + duration - release, release);
    if (style !== "organ") {
      osc1.connect(filter);
      osc2.connect(filter);
      if (sub) {
        sub.connect(filter);
      }
      filter.connect(gain);
    }
    if (panner) {
      gain.connect(panner);
      if (playback6.harmoniesGain) {
        panner.connect(playback6.harmoniesGain);
      }
    } else {
      if (playback6.harmoniesGain) {
        gain.connect(playback6.harmoniesGain);
      }
    }
    const voiceRefs = { gain, time: playTime, duration, midi: midi2 };
    harmony2.activeVoices.push(voiceRefs);
    osc1.start(playTime);
    osc2.start(playTime);
    if (sub) {
      sub.start(playTime);
    }
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (sub) {
      sub.stop(stopTime);
    }
    if (lfo) {
      lfo.stop(stopTime);
    }
    osc1.onended = () => {
      safeDisconnect([gain, filter, osc1, osc2, sub, lfo, lfoGain, panner, hp, subGain]);
      if (tremoloLfo) {
        safeDisconnect([tremoloLfo, tremoloGain]);
      }
      if (fifthOsc) {
        safeDisconnect([fifthOsc]);
      }
      if (click) {
        safeDisconnect([click, clickGain]);
      }
      if (saturator) {
        safeDisconnect([saturator]);
      }
    };
  }
  var init_synth_harmonies = __esm({
    "public/engine/synth-harmonies.js"() {
      init_state();
      init_utils();
    }
  });

  // public/engine/synth-soloist.js
  function killSoloistNote() {
    const { playback: playback6, soloist: soloist2 } = getState();
    if (soloist2.activeVoices && soloist2.activeVoices.length > 0) {
      soloist2.activeVoices.forEach((voice) => {
        try {
          if (voice.gain?.gain) {
            voice.gain.gain.cancelScheduledValues(playback6.audio.currentTime);
            voice.gain.gain.setTargetAtTime(0, playback6.audio.currentTime, 0.01);
          }
          if (voice.nodes) {
            voice.nodes.forEach((node) => {
              try {
                if (node.frequency) {
                  node.frequency.cancelScheduledValues(playback6.audio.currentTime);
                }
                if (node.detune) {
                  node.detune.cancelScheduledValues(playback6.audio.currentTime);
                }
                if (node.stop) {
                  node.stop(playback6.audio.currentTime + 0.02);
                }
              } catch {
              }
            });
          }
        } catch {
        }
      });
      soloist2.activeVoices = [];
    }
  }
  function playSoloNote(freq, time, duration, vol = 0.4, bendStartInterval = 0, style = "scalar", isLegato = false) {
    const { playback: playback6, soloist: soloist2 } = getState();
    if (!Number.isFinite(freq)) {
      return;
    }
    const preset = soloist2.preset || "trumpet";
    const ctx = playback6.audio;
    const now = ctx.currentTime;
    const playTime = Math.max(time, now);
    if (playback6.debugSoloist) {
      console.log(
        `[Soloist Debug] playSoloNote: freq=${freq.toFixed(2)}, vol=${vol.toFixed(2)}, duration=${duration.toFixed(2)}s, preset=${preset}`
      );
    }
    manageVoices(playTime, soloist2);
    const isPiano = soloist2.mode === "piano";
    if (isPiano) {
      isLegato = false;
    }
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (ctx.createStereoPanner) {
      pan.pan.setValueAtTime((Math.random() * 2 - 1) * 0.05, playTime);
    }
    gain.connect(pan);
    pan.connect(playback6.soloistGain);
    const voiceObj = { gain, time: playTime, duration, nodes: [], cleanup: [gain, pan] };
    const prevFreq = soloist2.lastRenderedFreq || freq;
    soloist2.lastRenderedFreq = freq;
    switch (preset) {
      case "neo":
        playNeoJuno(
          ctx,
          freq,
          playTime,
          duration,
          vol,
          bendStartInterval,
          style,
          gain,
          voiceObj,
          isLegato,
          prevFreq
        );
        break;
      case "vowel":
        playVowel(
          ctx,
          freq,
          playTime,
          duration,
          vol,
          bendStartInterval,
          style,
          gain,
          voiceObj,
          isLegato,
          prevFreq
        );
        break;
      case "trumpet":
        playTrumpet(
          ctx,
          freq,
          playTime,
          duration,
          vol,
          bendStartInterval,
          style,
          gain,
          voiceObj,
          isLegato,
          prevFreq
        );
        break;
      case "saxophone":
        playSaxophone(
          ctx,
          freq,
          playTime,
          duration,
          vol,
          bendStartInterval,
          style,
          gain,
          voiceObj,
          isLegato,
          prevFreq
        );
        break;
      default:
        playClassic(
          ctx,
          freq,
          playTime,
          duration,
          vol,
          bendStartInterval,
          style,
          gain,
          voiceObj,
          isLegato,
          prevFreq
        );
        break;
    }
    soloist2.activeVoices.push(voiceObj);
  }
  function manageVoices(playTime, soloist2) {
    if (!soloist2.activeVoices) {
      soloist2.activeVoices = [];
    }
    soloist2.activeVoices = soloist2.activeVoices.filter((v3) => v3.time + v3.duration + 1 > playTime);
    const VOICE_LIMIT = soloist2.mode !== "monophonic" ? 2 : 1;
    const isNewGesture = soloist2.activeVoices.length > 0 && Math.abs(playTime - soloist2.activeVoices[soloist2.activeVoices.length - 1].time) > 1e-3;
    if (isNewGesture || soloist2.activeVoices.length >= VOICE_LIMIT) {
      const voicesToKill = isNewGesture ? soloist2.activeVoices.length : soloist2.activeVoices.length - VOICE_LIMIT + 1;
      for (let i3 = 0; i3 < voicesToKill; i3++) {
        const oldest = soloist2.activeVoices.shift();
        if (oldest) {
          try {
            oldest.gain.gain.cancelScheduledValues(playTime);
            oldest.gain.gain.setTargetAtTime(0, playTime, 0.01);
            if (oldest.nodes) {
              oldest.nodes.forEach((node) => {
                try {
                  if (node.stop) {
                    node.stop(playTime + 0.05);
                  }
                } catch {
                }
              });
            }
          } catch {
          }
        }
      }
    }
  }
  function playTrumpet(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const { soloist: soloist2 } = getState();
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.detune.value = 5;
    voiceObj.nodes.push(osc1, osc2);
    applyPitchEnvelope(
      osc1,
      osc2,
      freq,
      playTime,
      duration,
      bendStartInterval,
      style,
      isLegato,
      prevFreq,
      soloist2.mode === "piano"
    );
    if (soloist2.mode !== "piano") {
      const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
      vibrato.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      voiceObj.nodes.push(vibrato);
      voiceObj.cleanup.push(vibGain);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(clampFreq(freq * 1.2), playTime);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 4), playTime + 0.08);
    filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 2.5), playTime + 0.15);
    filter.Q.value = 0.8;
    voiceObj.cleanup.push(filter);
    const bellFilter = ctx.createBiquadFilter();
    bellFilter.type = "peaking";
    bellFilter.frequency.value = 1200;
    bellFilter.Q.value = 1.5;
    bellFilter.gain.value = 4;
    voiceObj.cleanup.push(bellFilter);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(bellFilter);
    bellFilter.connect(outputGain);
    const attack = isLegato ? 5e-3 : 0.02;
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.2, playTime, attack);
    outputGain.gain.setTargetAtTime(vol * 0.9, playTime + 0.1, 0.05);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1);
    osc1.start(playTime);
    osc2.start(playTime);
    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (duration > 0.15 && soloist2.mode !== "piano") {
      const vibrato = voiceObj.nodes.find((n2) => n2.frequency && n2.frequency.value < 20);
      if (vibrato) {
        vibrato.start(playTime);
        vibrato.stop(stopTime);
      }
    }
    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
  }
  function playSaxophone(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const { soloist: soloist2 } = getState();
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.detune.value = -7;
    voiceObj.nodes.push(osc1, osc2);
    applyPitchEnvelope(
      osc1,
      osc2,
      freq,
      playTime,
      duration,
      bendStartInterval,
      style,
      isLegato,
      prevFreq,
      soloist2.mode === "piano"
    );
    if (soloist2.mode !== "piano") {
      const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
      vibrato.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      voiceObj.nodes.push(vibrato);
      voiceObj.cleanup.push(vibGain);
    }
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 900;
    f1.Q.value = 3;
    const f22 = ctx.createBiquadFilter();
    f22.type = "bandpass";
    f22.frequency.value = 2400;
    f22.Q.value = 4;
    voiceObj.cleanup.push(f1, f22);
    const breathLfo = ctx.createOscillator();
    breathLfo.frequency.value = 3.5;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.05;
    const masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    breathLfo.connect(breathGain);
    breathGain.connect(masterGain.gain);
    voiceObj.nodes.push(breathLfo);
    voiceObj.cleanup.push(breathGain, masterGain);
    osc1.connect(f1);
    osc2.connect(f1);
    osc1.connect(f22);
    osc2.connect(f22);
    f1.connect(masterGain);
    f22.connect(masterGain);
    masterGain.connect(outputGain);
    const attack = isLegato ? 8e-3 : 0.04;
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 2.9, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.85, 0.1);
    osc1.start(playTime);
    osc2.start(playTime);
    breathLfo.start(playTime);
    const stopTime = playTime + duration + 0.2;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    breathLfo.stop(stopTime);
    if (duration > 0.15 && soloist2.mode !== "piano") {
      const vibrato = voiceObj.nodes.find((n2) => n2.frequency && n2.frequency.value < 20);
      if (vibrato) {
        vibrato.start(playTime);
        vibrato.stop(stopTime);
      }
    }
    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
  }
  function playClassic(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const { playback: playback6, soloist: soloist2 } = getState();
    const intensity = playback6.bandIntensity || 0.5;
    const intensityGain = 0.5 + intensity * 0.9;
    const randomizedVol = vol * intensityGain * (0.95 + Math.random() * 0.1);
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.detune.setValueAtTime(style === "shred" ? 12 : 6, playTime);
    voiceObj.nodes.push(osc1, osc2);
    applyPitchEnvelope(
      osc1,
      osc2,
      freq,
      playTime,
      duration,
      bendStartInterval,
      style,
      isLegato,
      prevFreq,
      soloist2.mode === "piano"
    );
    if (soloist2.mode !== "piano") {
      const { vibrato, vibGain } = createVibrato(ctx, freq, playTime, duration, style);
      vibrato.connect(vibGain);
      vibGain.connect(osc1.frequency);
      vibGain.connect(osc2.frequency);
      voiceObj.nodes.push(vibrato);
      voiceObj.cleanup.push(vibGain);
    }
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    const brightnessBase = 1 + intensity * 1.5 + vol * 1.5;
    const cutoffBase = style === "bird" ? freq * 3.5 * brightnessBase : Math.min(freq * 4 * brightnessBase, 12e3);
    const muteThreshold = intensity < 0.4 ? 0.7 : 0.55;
    const isMuted = soloist2.mode === "guitar" && vol < muteThreshold;
    const isPiano = soloist2.mode === "piano";
    filter.frequency.setValueAtTime(clampFreq(cutoffBase), playTime);
    if (isMuted) {
      filter.frequency.exponentialRampToValueAtTime(clampFreq(freq * 1.5), playTime + 0.08);
      filter.Q.value = 4;
    } else {
      filter.frequency.exponentialRampToValueAtTime(
        clampFreq(cutoffBase * (style === "bird" ? 0.7 : 0.6)),
        playTime + duration
      );
      filter.Q.value = isPiano ? 0.7 : style === "bird" ? 1.5 : duration > 0.4 ? 2 : 1;
    }
    voiceObj.cleanup.push(filter);
    const baseAttack = style === "shred" ? 5e-3 : 0.015;
    const attack = isLegato ? 5e-3 : Math.min(baseAttack, duration * 0.25);
    let releaseTime = duration * (style === "minimal" ? 1.5 : 1.1);
    if (isMuted) {
      outputGain.gain.setValueAtTime(0, playTime);
      outputGain.gain.setTargetAtTime(randomizedVol, playTime, 5e-3);
      outputGain.gain.setTargetAtTime(0, playTime + 0.05, 0.02);
      releaseTime = 0.12;
    } else if (isPiano && (vol < 0.5 || duration > 0.6)) {
      outputGain.gain.setValueAtTime(0, playTime);
      outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
      const sustainDecay = Math.max(0.1, randomizedVol * 0.2);
      outputGain.gain.setTargetAtTime(sustainDecay, playTime + 0.1, 0.1);
      outputGain.gain.setTargetAtTime(0, playTime + duration * 0.95, 0.3);
      releaseTime = Math.max(0.5, duration * 1.2);
    } else {
      outputGain.gain.setValueAtTime(0, playTime);
      outputGain.gain.setTargetAtTime(randomizedVol, playTime, attack);
      outputGain.gain.setTargetAtTime(0, playTime + duration * 0.8, 0.1);
    }
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);
    osc1.start(playTime);
    osc2.start(playTime);
    const stopTime = playTime + releaseTime + 0.1;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    if (duration > 0.15 && soloist2.mode !== "piano") {
      const vibrato = voiceObj.nodes.find((n2) => n2.frequency && n2.frequency.value < 20);
      if (vibrato) {
        vibrato.start(playTime);
        vibrato.stop(stopTime);
      }
    }
    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
  }
  function playNeoJuno(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const { soloist: soloist2 } = getState();
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "sawtooth";
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.3;
    const lfo1Gain = ctx.createGain();
    lfo1Gain.gain.value = 8;
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.5;
    const lfo2Gain = ctx.createGain();
    lfo2Gain.gain.value = -7;
    lfo1.connect(lfo1Gain);
    lfo1Gain.connect(osc1.detune);
    lfo2.connect(lfo2Gain);
    lfo2Gain.connect(osc2.detune);
    voiceObj.nodes.push(osc1, osc2, lfo1, lfo2);
    voiceObj.cleanup.push(lfo1Gain, lfo2Gain);
    applyPitchEnvelope(
      osc1,
      osc2,
      freq,
      playTime,
      duration,
      bendStartInterval,
      style,
      isLegato,
      prevFreq,
      soloist2.mode === "piano"
    );
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(Math.min(freq * 6, 8e3), playTime);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 3, 4e3), playTime + duration);
    filter.Q.value = 2;
    voiceObj.cleanup.push(filter);
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(outputGain);
    const attack = isLegato ? 5e-3 : 0.02;
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 0.8, playTime, attack);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.15);
    osc1.start(playTime);
    osc2.start(playTime);
    lfo1.start(playTime);
    lfo2.start(playTime);
    const stopTime = playTime + duration + 0.5;
    osc1.stop(stopTime);
    osc2.stop(stopTime);
    lfo1.stop(stopTime);
    lfo2.stop(stopTime);
    osc1.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
  }
  function playVowel(ctx, freq, playTime, duration, vol, bendStartInterval, style, outputGain, voiceObj, isLegato, prevFreq) {
    const { soloist: soloist2 } = getState();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    applyPitchEnvelope(
      osc,
      null,
      freq,
      playTime,
      duration,
      bendStartInterval,
      style,
      isLegato,
      prevFreq,
      soloist2.mode === "piano"
    );
    voiceObj.nodes.push(osc);
    const f1 = ctx.createBiquadFilter();
    f1.type = "bandpass";
    f1.frequency.value = 600;
    f1.Q.value = 4;
    const f22 = ctx.createBiquadFilter();
    f22.type = "bandpass";
    f22.frequency.value = 1e3;
    f22.Q.value = 4;
    const f3 = ctx.createBiquadFilter();
    f3.type = "bandpass";
    f3.frequency.value = 2500;
    f3.Q.value = 5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.5;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 50;
    lfo.connect(lfoGain);
    lfoGain.connect(f1.frequency);
    lfoGain.connect(f22.frequency);
    voiceObj.nodes.push(lfo);
    voiceObj.cleanup.push(lfoGain);
    lfo.start(playTime);
    lfo.stop(playTime + duration + 0.5);
    osc.connect(f1);
    osc.connect(f22);
    osc.connect(f3);
    f1.connect(outputGain);
    f22.connect(outputGain);
    f3.connect(outputGain);
    voiceObj.cleanup.push(f1, f22, f3);
    outputGain.gain.setValueAtTime(0, playTime);
    outputGain.gain.setTargetAtTime(vol * 1.8, playTime, 0.03);
    outputGain.gain.setTargetAtTime(0, playTime + duration * 0.9, 0.1);
    osc.start(playTime);
    const stopTime = playTime + duration + 0.3;
    osc.stop(stopTime);
    osc.onended = () => safeDisconnect(voiceObj.cleanup.concat(voiceObj.nodes));
  }
  function applyPitchEnvelope(osc1, osc2, freq, time, duration, bendInterval, style, isLegato, prevFreq, isPiano = false) {
    if (isPiano) {
      if (osc1) {
        osc1.frequency.setValueAtTime(freq, time);
      }
      if (osc2) {
        osc2.frequency.setValueAtTime(freq, time);
      }
      return;
    }
    if (isLegato && prevFreq) {
      const { soloist: soloist2 } = getState();
      const glideTime = soloist2.mode === "monophonic" ? 0.06 : soloist2.mode === "guitar" ? 0.03 : 0.04;
      if (osc1) {
        osc1.frequency.setValueAtTime(prevFreq, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
      }
      if (osc2) {
        osc2.frequency.setValueAtTime(prevFreq, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + glideTime);
      }
    } else if (bendInterval !== 0) {
      const startFreq = freq * 2 ** (-bendInterval / 12);
      let bendDuration = 0.1;
      if (style === "blues") {
        bendDuration = 0.15;
      } else if (style === "bird") {
        bendDuration = 0.05;
      } else if (style === "minimal") {
        bendDuration = 0.25;
      }
      bendDuration = Math.min(duration * 0.6, bendDuration);
      if (osc1) {
        osc1.frequency.setValueAtTime(startFreq, time);
        osc1.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
      }
      if (osc2) {
        osc2.frequency.setValueAtTime(startFreq, time);
        osc2.frequency.exponentialRampToValueAtTime(freq, time + bendDuration);
      }
    } else {
      const scoop = style === "shred" ? 0.998 : 0.995;
      if (osc1) {
        osc1.frequency.setValueAtTime(freq * scoop, time);
        osc1.frequency.setTargetAtTime(freq, time, 0.01);
      }
      if (osc2) {
        osc2.frequency.setValueAtTime(freq * scoop, time);
        osc2.frequency.setTargetAtTime(freq, time, 0.01);
      }
    }
  }
  function createVibrato(ctx, freq, time, duration, style) {
    const { soloist: soloist2 } = getState();
    const vibrato = ctx.createOscillator();
    let vibSpeed = 5.5;
    let depthFactor = 5e-3;
    if (style === "blues") {
      vibSpeed = 4.8;
      depthFactor = 0.012;
    } else if (style === "neo") {
      vibSpeed = 4.2;
      depthFactor = 0.015;
    } else if (style === "shred") {
      vibSpeed = 6.5;
      depthFactor = 4e-3;
    }
    if (soloist2.mode === "monophonic") {
      vibSpeed -= 0.5;
      depthFactor *= 1.2;
    } else if (soloist2.mode === "guitar") {
      vibSpeed += 0.4;
      depthFactor *= 1.5;
    }
    vibrato.frequency.setValueAtTime(vibSpeed, time);
    const vibGain = ctx.createGain();
    const isLongNote = duration > 0.4;
    const vibDelay = 0.15 + Math.random() * 0.1;
    const finalVibDepth = freq * (isLongNote ? depthFactor : depthFactor * 0.3);
    vibGain.gain.setValueAtTime(0, time);
    vibGain.gain.setValueAtTime(0, time + vibDelay);
    vibGain.gain.exponentialRampToValueAtTime(
      Math.max(1e-3, finalVibDepth),
      time + vibDelay + (isLongNote ? 0.5 : 0.2)
    );
    return { vibrato, vibGain };
  }
  var init_synth_soloist = __esm({
    "public/engine/synth-soloist.js"() {
      init_state();
      init_utils();
    }
  });

  // public/midi-controller.js
  var midi_controller_exports = {};
  __export(midi_controller_exports, {
    initMIDI: () => initMIDI,
    normalizeMidiVelocity: () => normalizeMidiVelocity,
    panic: () => panic,
    sendMIDICC: () => sendMIDICC,
    sendMIDIDrum: () => sendMIDIDrum,
    sendMIDINote: () => sendMIDINote,
    sendMIDIPitchBend: () => sendMIDIPitchBend,
    sendMIDITransport: () => sendMIDITransport
  });
  function handleMIDIMessage(event) {
    const { midi: midi2 } = getState();
    if (!midi2.enabled) {
      return;
    }
    const [status, data1, data2] = event.data;
    const type = status & 240;
    if (type === 176) {
      if (data1 === 11 || data1 === 1) {
        const intensity = data2 / 127;
        dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
      }
    }
  }
  async function initMIDI() {
    if (!navigator.requestMIDIAccess) {
      console.warn("Web MIDI API not supported in this browser.");
      return false;
    }
    try {
      midiAccess = await navigator.requestMIDIAccess();
      midiAccess.onstatechange = () => {
        syncMIDIOutputs();
      };
      if (midiAccess.inputs) {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = handleMIDIMessage;
        }
      }
      syncMIDIOutputs();
      return true;
    } catch (err) {
      console.error("Failed to get MIDI access", err);
      return false;
    }
  }
  function syncMIDIOutputs() {
    if (!midiAccess) {
      return;
    }
    const outputs = [];
    for (const output of midiAccess.outputs.values()) {
      outputs.push({ id: output.id, name: output.name });
    }
    dispatch(ACTIONS.SET_MIDI_CONFIG, { outputs });
  }
  function sendMIDINoteOn(channel, note, velocity, time) {
    const { playback: playback6, midi: midi2 } = getState();
    if (!midi2.enabled || !midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    const midiTime = (time - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
    const status = 144 | channel - 1;
    output.send([status, note, velocity], midiTime);
    activeNotes.add(`${channel}_${note}`);
  }
  function sendMIDINoteOff(channel, note, time) {
    const { playback: playback6, midi: midi2 } = getState();
    if (!midi2.enabled || !midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    const midiTime = (time - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
    const status = 128 | channel - 1;
    output.send([status, note, 0], midiTime);
    activeNotes.delete(`${channel}_${note}`);
  }
  function sendMIDICC(channel, controller, value, time) {
    const { playback: playback6, midi: midi2 } = getState();
    if (!midi2.enabled || !midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    const key = `${channel}_${controller}`;
    if (sentCCValues.get(key) === value) {
      return;
    }
    sentCCValues.set(key, value);
    const midiTime = (time - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
    const status = 176 | channel - 1;
    output.send([status, controller, value], midiTime);
  }
  function normalizeMidiVelocity(internalVel) {
    const { midi: midi2 } = getState();
    if (internalVel <= 0.01) {
      return 1;
    }
    const sensitivity = midi2.velocitySensitivity || 1;
    const curve = 0.8 / sensitivity;
    const normalized = (Math.min(1.5, internalVel) / 1.5) ** curve;
    return Math.max(20, Math.min(127, Math.floor(normalized * 127)));
  }
  function sendMIDIPitchBend(channel, value, time) {
    const { playback: playback6, midi: midi2 } = getState();
    if (!midi2.enabled || !midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    if (sentBendValues.get(channel) === value) {
      return;
    }
    sentBendValues.set(channel, value);
    const midiTime = (time - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
    const status = 224 | channel - 1;
    const normalized = Math.max(0, Math.min(16383, value + 8192));
    const lsb = normalized & 127;
    const msb = normalized >> 7 & 127;
    output.send([status, lsb, msb], midiTime);
  }
  function sendMIDINote(channel, note, velocity, time, duration, options = false) {
    const { playback: playback6, midi: midi2 } = getState();
    const isMono = typeof options === "boolean" ? options : !!options.isMono;
    const bend = typeof options === "object" ? options.bend : 0;
    const key = `${channel}_${note}`;
    const now = playback6.audio.currentTime;
    if (isMono) {
      for (const activeKey of activeNotes) {
        const [chStr, nStr] = activeKey.split("_");
        const activeCh = parseInt(chStr, 10);
        const activeNote = parseInt(nStr, 10);
        if (activeCh === channel && activeNote !== note) {
          const output = midiAccess?.outputs.get(midi2.selectedOutputId);
          if (output) {
            const status = 128 | channel - 1;
            if (activeNoteOffs.has(activeKey)) {
              const prev = activeNoteOffs.get(activeKey);
              if (prev.endTime > time) {
                clearTimeout(prev.id);
                const cutoffTime = Math.max(now, time - 5e-3);
                const delayToCutoff = Math.max(0, (cutoffTime - now) * 1e3);
                const out = output;
                const ak = activeKey;
                setTimeout(() => {
                  if (activeNotes.has(ak)) {
                    out.send(
                      [status, activeNote, 0],
                      (cutoffTime - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency
                    );
                    activeNotes.delete(ak);
                  }
                }, delayToCutoff);
                activeNoteOffs.delete(ak);
              }
            }
          }
        }
      }
    }
    if (bend !== 0) {
      sendMIDIPitchBend(channel, bend, time);
      sendMIDIPitchBend(channel, 0, time + 0.1);
    }
    if (activeNoteOffs.has(key)) {
      const prev = activeNoteOffs.get(key);
      if (prev.endTime > time) {
        clearTimeout(prev.id);
        const cutoffTime = Math.max(now, time - 5e-3);
        if (midiAccess && midi2.selectedOutputId) {
          const output = midiAccess.outputs.get(midi2.selectedOutputId);
          if (output) {
            const midiTime = (cutoffTime - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
            const status = 128 | channel - 1;
            output.send([status, note, 0], midiTime);
            activeNotes.delete(key);
          }
        }
      }
      activeNoteOffs.delete(key);
    }
    sendMIDINoteOn(channel, note, velocity, time);
    const safeDuration = Math.max(0.02, duration - 0.015);
    const startTime = time;
    const endTime = startTime + safeDuration;
    const delaySeconds = endTime - now;
    const delayMs = Math.max(0, delaySeconds * 1e3);
    const timeoutId = setTimeout(() => {
      sendMIDINoteOff(channel, note, playback6.audio.currentTime);
      const current = activeNoteOffs.get(key);
      if (current && current.id === timeoutId) {
        activeNoteOffs.delete(key);
      }
    }, delayMs);
    activeNoteOffs.set(key, { id: timeoutId, endTime });
  }
  function sendMIDIDrum(instrumentName, time, velocity, octaveOffset = 0) {
    const { midi: midi2 } = getState();
    const note = (DRUM_MAP[instrumentName] || 36) + octaveOffset * 12;
    const vel = normalizeMidiVelocity(velocity);
    sendMIDINote(midi2.drumsChannel, note, vel, time, 0.05);
  }
  function sendMIDITransport(type, time) {
    const { playback: playback6, midi: midi2 } = getState();
    if (!midi2.enabled || !midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    const midiTime = (time - playback6.audio.currentTime) * 1e3 + performance.now() + midi2.latency;
    const msg = type === "start" ? 250 : 252;
    output.send([msg], midiTime);
  }
  function panic(resetAll = false) {
    const { midi: midi2 } = getState();
    for (const [, value] of activeNoteOffs) {
      clearTimeout(value.id);
    }
    activeNoteOffs.clear();
    if (!midi2.selectedOutputId || !midiAccess) {
      return;
    }
    const output = midiAccess.outputs.get(midi2.selectedOutputId);
    if (!output) {
      return;
    }
    for (const key of activeNotes) {
      const [chStr, noteStr] = key.split("_");
      const ch = parseInt(chStr, 10);
      const note = parseInt(noteStr, 10);
      const status = 128 | ch - 1;
      output.send([status, note, 0]);
    }
    activeNotes.clear();
    sentCCValues.clear();
    sentBendValues.clear();
    for (let ch = 0; ch < 16; ch++) {
      output.send([176 | ch, 123, 0]);
      if (resetAll) {
        output.send([176 | ch, 121, 0]);
        output.send([176 | ch, 64, 0]);
        output.send([176 | ch, 1, 0]);
      }
    }
  }
  var midiAccess, activeNoteOffs, activeNotes, sentCCValues, sentBendValues, DRUM_MAP;
  var init_midi_controller = __esm({
    "public/midi-controller.js"() {
      init_state();
      init_types();
      midiAccess = null;
      activeNoteOffs = /* @__PURE__ */ new Map();
      activeNotes = /* @__PURE__ */ new Set();
      sentCCValues = /* @__PURE__ */ new Map();
      sentBendValues = /* @__PURE__ */ new Map();
      DRUM_MAP = {
        Kick: 36,
        Snare: 38,
        HiHat: 42,
        Open: 46,
        Crash: 49,
        Ride: 51,
        Rim: 37,
        Clap: 39,
        Cowbell: 56,
        Shaker: 70,
        Clave: 75,
        Conga: 63,
        Bongo: 60,
        Perc: 67,
        Guiro: 74,
        "High Tom": 50,
        "Mid Tom": 47,
        "Low Tom": 43
      };
    }
  });

  // public/engine/engine.js
  var engine_exports = {};
  __export(engine_exports, {
    INSTRUMENT_PRESETS: () => INSTRUMENT_PRESETS,
    _resetChromiumCheck: () => _resetChromiumCheck,
    getVisualTime: () => getVisualTime,
    initAudio: () => initAudio,
    killAllNotes: () => killAllNotes,
    killAllPianoNotes: () => killAllPianoNotes,
    killBassBus: () => killBassBus,
    killBassNote: () => killBassNote,
    killChordBus: () => killChordBus,
    killDrumBus: () => killDrumBus,
    killDrumNote: () => killDrumNote,
    killHarmonyBus: () => killHarmonyBus,
    killHarmonyNote: () => killHarmonyNote,
    killSoloistBus: () => killSoloistBus,
    killSoloistNote: () => killSoloistNote,
    playBassNote: () => playBassNote,
    playChordScratch: () => playChordScratch,
    playDrumSound: () => playDrumSound,
    playHarmonyNote: () => playHarmonyNote,
    playNote: () => playNote,
    playSoloNote: () => playSoloNote,
    restoreGains: () => restoreGains,
    updateSustain: () => updateSustain
  });
  function _resetChromiumCheck() {
    isChromium = null;
  }
  function initAudio() {
    const { playback: playback6, groove: groove2, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, midi: midi2 } = getState();
    if (!playback6.audio || playback6.audio.state === "closed") {
      if (navigator.audioSession) {
        navigator.audioSession.type = "playback";
      }
      playback6.audio = new (window.AudioContext || window.webkitAudioContext)();
      playback6.audio.onstatechange = () => {
        if (playback6.audio.state === "suspended" && playback6.isPlaying) {
          playback6.audio.resume().catch((e3) => console.error("[DSP] Auto-resume failed:", e3));
        }
      };
      playback6.masterGain = playback6.audio.createGain();
      const volEl = document.getElementById("masterVolume");
      const initMasterVol = (parseFloat(volEl?.value) || 0.4) * MIXER_GAIN_MULTIPLIERS.master;
      playback6.masterGain.gain.setValueAtTime(1e-4, playback6.audio.currentTime);
      playback6.masterGain.gain.exponentialRampToValueAtTime(
        initMasterVol,
        playback6.audio.currentTime + 0.04
      );
      audioWatchdog.attachToMaster(playback6.masterGain);
      audioWatchdog.start();
      playback6.saturator = playback6.audio.createWaveShaper();
      playback6.saturator.curve = createSoftClipCurve();
      playback6.saturator.oversample = "4x";
      playback6.masterLimiter = playback6.audio.createDynamicsCompressor();
      playback6.masterLimiter.threshold.setValueAtTime(-1.5, playback6.audio.currentTime);
      playback6.masterLimiter.knee.setValueAtTime(30, playback6.audio.currentTime);
      playback6.masterLimiter.ratio.setValueAtTime(20, playback6.audio.currentTime);
      playback6.masterLimiter.attack.setValueAtTime(2e-3, playback6.audio.currentTime);
      playback6.masterLimiter.release.setValueAtTime(0.5, playback6.audio.currentTime);
      playback6.masterGain.connect(playback6.saturator);
      playback6.saturator.connect(playback6.masterLimiter);
      playback6.masterLimiter.connect(playback6.audio.destination);
      playback6.reverbNode = playback6.audio.createConvolver();
      playback6.reverbNode.buffer = createReverbImpulse(playback6.audio, 1.5, 3);
      playback6.reverbNode.connect(playback6.masterGain);
      const modules = [
        { name: MODULES.CHORDS, state: chords2, mult: MIXER_GAIN_MULTIPLIERS.chords },
        { name: MODULES.BASS, state: bass2, mult: MIXER_GAIN_MULTIPLIERS.bass },
        { name: MODULES.SOLOIST, state: soloist2, mult: MIXER_GAIN_MULTIPLIERS.soloist },
        { name: MODULES.HARMONIES, state: harmony2, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
        { name: "drums", state: groove2, mult: MIXER_GAIN_MULTIPLIERS.drums }
      ];
      modules.forEach((m3) => {
        const gainNode = playback6.audio.createGain();
        const isLocalMuted = midi2.enabled && midi2.muteLocal;
        const targetGain = m3.state.enabled && !isLocalMuted ? Math.max(1e-4, m3.state.volume * m3.mult) : 1e-4;
        gainNode.gain.setValueAtTime(1e-4, playback6.audio.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
          targetGain,
          playback6.audio.currentTime + 0.04
        );
        if (m3.name === "chords") {
          const hp = playback6.audio.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.setValueAtTime(180, playback6.audio.currentTime);
          const lowShelf = playback6.audio.createBiquadFilter();
          lowShelf.type = "lowshelf";
          lowShelf.frequency.setValueAtTime(350, playback6.audio.currentTime);
          lowShelf.gain.setValueAtTime(-6, playback6.audio.currentTime);
          const notch = playback6.audio.createBiquadFilter();
          notch.type = "peaking";
          notch.frequency.setValueAtTime(2500, playback6.audio.currentTime);
          notch.Q.setValueAtTime(0.7, playback6.audio.currentTime);
          notch.gain.setValueAtTime(-4, playback6.audio.currentTime);
          gainNode.connect(hp);
          hp.connect(lowShelf);
          lowShelf.connect(notch);
          notch.connect(playback6.masterGain);
          playback6.chordsEQ = hp;
        } else if (m3.name === "bass") {
          const weight = playback6.audio.createBiquadFilter();
          weight.type = "lowshelf";
          weight.frequency.setValueAtTime(100, playback6.audio.currentTime);
          weight.gain.setValueAtTime(2, playback6.audio.currentTime);
          const scoop = playback6.audio.createBiquadFilter();
          scoop.type = "peaking";
          scoop.frequency.setValueAtTime(450, playback6.audio.currentTime);
          scoop.Q.setValueAtTime(1.2, playback6.audio.currentTime);
          scoop.gain.setValueAtTime(-12, playback6.audio.currentTime);
          const definition = playback6.audio.createBiquadFilter();
          definition.type = "peaking";
          definition.frequency.setValueAtTime(2e3, playback6.audio.currentTime);
          definition.Q.setValueAtTime(1.2, playback6.audio.currentTime);
          definition.gain.setValueAtTime(3, playback6.audio.currentTime);
          const comp = playback6.audio.createDynamicsCompressor();
          comp.threshold.setValueAtTime(-16, playback6.audio.currentTime);
          comp.knee.setValueAtTime(12, playback6.audio.currentTime);
          comp.ratio.setValueAtTime(4, playback6.audio.currentTime);
          comp.attack.setValueAtTime(5e-3, playback6.audio.currentTime);
          comp.release.setValueAtTime(0.125, playback6.audio.currentTime);
          gainNode.connect(weight);
          weight.connect(scoop);
          scoop.connect(definition);
          definition.connect(comp);
          comp.connect(playback6.masterGain);
          playback6.bassEQ = weight;
        } else if (m3.name === "soloist") {
          const presence = playback6.audio.createBiquadFilter();
          presence.type = "peaking";
          presence.frequency.setValueAtTime(3500, playback6.audio.currentTime);
          presence.gain.setValueAtTime(4, playback6.audio.currentTime);
          presence.Q.setValueAtTime(1, playback6.audio.currentTime);
          const air = playback6.audio.createBiquadFilter();
          air.type = "highshelf";
          air.frequency.setValueAtTime(8e3, playback6.audio.currentTime);
          air.gain.setValueAtTime(3, playback6.audio.currentTime);
          gainNode.connect(presence);
          presence.connect(air);
          air.connect(playback6.masterGain);
          playback6.soloistEQ = presence;
        } else if (m3.name === "harmonies") {
          const hp = playback6.audio.createBiquadFilter();
          hp.type = "highpass";
          hp.frequency.setValueAtTime(300, playback6.audio.currentTime);
          const warmth = playback6.audio.createBiquadFilter();
          warmth.type = "peaking";
          warmth.frequency.setValueAtTime(1200, playback6.audio.currentTime);
          warmth.gain.setValueAtTime(2, playback6.audio.currentTime);
          gainNode.connect(hp);
          hp.connect(warmth);
          warmth.connect(playback6.masterGain);
          playback6.harmoniesEQ = hp;
        } else if (m3.name === "drums") {
          const drumComp = playback6.audio.createDynamicsCompressor();
          drumComp.threshold.setValueAtTime(-20, playback6.audio.currentTime);
          drumComp.ratio.setValueAtTime(8, playback6.audio.currentTime);
          drumComp.attack.setValueAtTime(1e-3, playback6.audio.currentTime);
          drumComp.release.setValueAtTime(0.1, playback6.audio.currentTime);
          gainNode.connect(drumComp);
          drumComp.connect(playback6.masterGain);
          gainNode.connect(playback6.masterGain);
        } else {
          gainNode.connect(playback6.masterGain);
        }
        playback6[`${m3.name}Gain`] = gainNode;
        const reverbGain = playback6.audio.createGain();
        const targetReverb = Math.max(1e-4, m3.state.reverb);
        reverbGain.gain.setValueAtTime(1e-4, playback6.audio.currentTime);
        reverbGain.gain.exponentialRampToValueAtTime(
          targetReverb,
          playback6.audio.currentTime + 0.04
        );
        gainNode.connect(reverbGain);
        reverbGain.connect(playback6.reverbNode);
        playback6[`${m3.name}Reverb`] = reverbGain;
      });
      const bufSize = playback6.audio.sampleRate * 2;
      const buffer = playback6.audio.createBuffer(1, bufSize, playback6.audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i3 = 0; i3 < bufSize; i3++) {
        data[i3] = Math.random() * 2 - 1;
      }
      groove2.audioBuffers.noise = buffer;
    }
    if (playback6.audio.state === "suspended") {
      playback6.audio.resume();
    }
  }
  function killChordBus() {
    const { playback: playback6 } = getState();
    if (playback6.chordsGain) {
      playback6.chordsGain.gain.cancelScheduledValues(playback6.audio.currentTime);
      playback6.chordsGain.gain.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
    }
  }
  function killBassBus() {
    const { playback: playback6 } = getState();
    if (playback6.bassGain) {
      playback6.bassGain.gain.cancelScheduledValues(playback6.audio.currentTime);
      playback6.bassGain.gain.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
    }
  }
  function killSoloistBus() {
    const { playback: playback6 } = getState();
    if (playback6.soloistGain) {
      playback6.soloistGain.gain.cancelScheduledValues(playback6.audio.currentTime);
      playback6.soloistGain.gain.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
    }
  }
  function killHarmonyBus() {
    const { playback: playback6 } = getState();
    if (playback6.harmoniesGain) {
      playback6.harmoniesGain.gain.cancelScheduledValues(playback6.audio.currentTime);
      playback6.harmoniesGain.gain.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
    }
  }
  function killDrumBus() {
    const { playback: playback6 } = getState();
    if (playback6.drumsGain) {
      playback6.drumsGain.gain.cancelScheduledValues(playback6.audio.currentTime);
      playback6.drumsGain.gain.setTargetAtTime(0, playback6.audio.currentTime, 5e-3);
    }
  }
  async function killAllNotes() {
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killHarmonyNote();
    killDrumNote();
    killChordBus();
    killBassBus();
    killSoloistBus();
    killHarmonyBus();
    killDrumBus();
    try {
      const { panic: panic2 } = await Promise.resolve().then(() => (init_midi_controller(), midi_controller_exports));
      panic2();
    } catch {
    }
  }
  function restoreGains() {
    const { playback: playback6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, groove: groove2, midi: midi2 } = getState();
    if (!playback6.audio) {
      return;
    }
    const t3 = playback6.audio.currentTime;
    const modules = [
      { node: playback6.chordsGain, state: chords2, mult: MIXER_GAIN_MULTIPLIERS.chords },
      { node: playback6.bassGain, state: bass2, mult: MIXER_GAIN_MULTIPLIERS.bass },
      { node: playback6.soloistGain, state: soloist2, mult: MIXER_GAIN_MULTIPLIERS.soloist },
      { node: playback6.harmoniesGain, state: harmony2, mult: MIXER_GAIN_MULTIPLIERS.harmonies },
      { node: playback6.drumsGain, state: groove2, mult: MIXER_GAIN_MULTIPLIERS.drums }
    ];
    modules.forEach((m3) => {
      if (m3.node) {
        const isLocalMuted = midi2.enabled && midi2.muteLocal;
        const target = m3.state.enabled && !isLocalMuted ? m3.state.volume * m3.mult : 1e-4;
        m3.node.gain.cancelScheduledValues(t3);
        m3.node.gain.setTargetAtTime(target, t3, 0.04);
      }
    });
  }
  function getVisualTime() {
    const { playback: playback6 } = getState();
    if (!playback6.audio) {
      return 0;
    }
    const audioTime = playback6.audio.currentTime;
    const perfTime = performance.now();
    if (audioTime !== lastAudioTime) {
      lastAudioTime = audioTime;
      lastPerfTime = perfTime;
    }
    const dt = (perfTime - lastPerfTime) / 1e3;
    const smoothAudioTime = audioTime + Math.min(dt, 0.1);
    const outputLatency = playback6.audio.outputLatency || 0;
    if (isChromium === null) {
      isChromium = typeof navigator !== "undefined" && /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
    }
    const offset = outputLatency > 0 ? outputLatency : isChromium ? 0.015 : 0.045;
    return smoothAudioTime - offset;
  }
  var isChromium, lastAudioTime, lastPerfTime;
  var init_engine = __esm({
    "public/engine/engine.js"() {
      init_audio_recovery();
      init_config();
      init_constants();
      init_state();
      init_utils();
      init_synth_bass();
      init_synth_chords();
      init_synth_drums();
      init_synth_harmonies();
      init_synth_soloist();
      isChromium = null;
      lastAudioTime = 0;
      lastPerfTime = 0;
    }
  });

  // public/persistence.js
  function saveCurrentState() {
    const { arranger: arranger6, playback: playback6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, groove: groove2, vizState: vizState2, midi: midi2 } = getState();
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    const data = {
      sections: arranger6.sections,
      key: arranger6.key,
      timeSignature: arranger6.timeSignature,
      isMinor: arranger6.isMinor,
      notation: arranger6.notation,
      lastChordPreset: arranger6.lastChordPreset,
      theme: playback6.theme,
      bpm: playback6.bpm,
      metronome: playback6.metronome,
      visualFlash: playback6.visualFlash,
      haptic: playback6.haptic,
      countIn: playback6.countIn,
      applyPresetSettings: playback6.applyPresetSettings,
      sessionTimer: playback6.sessionTimer,
      songMode: playback6.songMode,
      vizEnabled: vizState2.enabled,
      autoIntensity: playback6.autoIntensity,
      chords: {
        enabled: chords2.enabled,
        style: chords2.style,
        instrument: chords2.instrument,
        octave: chords2.octave,
        density: chords2.density,
        volume: chords2.volume,
        reverb: chords2.reverb,
        pianoRoots: chords2.pianoRoots,
        activeTab: chords2.activeTab
      },
      bass: {
        enabled: bass2.enabled,
        style: bass2.style,
        octave: bass2.octave,
        volume: bass2.volume,
        reverb: bass2.reverb,
        activeTab: bass2.activeTab
      },
      soloist: {
        enabled: soloist2.enabled,
        style: soloist2.style,
        preset: soloist2.preset,
        octave: soloist2.octave,
        volume: soloist2.volume,
        reverb: soloist2.reverb,
        mode: soloist2.mode,
        activeTab: soloist2.activeTab
      },
      harmony: {
        enabled: harmony2.enabled,
        style: harmony2.style,
        octave: harmony2.octave,
        volume: harmony2.volume,
        reverb: harmony2.reverb,
        complexity: harmony2.complexity,
        activeTab: harmony2.activeTab
      },
      groove: {
        enabled: groove2.enabled,
        volume: groove2.volume,
        reverb: groove2.reverb,
        swing: groove2.swing,
        swingSub: groove2.swingSub,
        followPlayback: groove2.followPlayback,
        humanize: groove2.humanize,
        lastDrumPreset: groove2.lastDrumPreset,
        genreFeel: groove2.genreFeel,
        larsMode: groove2.larsMode,
        larsIntensity: groove2.larsIntensity,
        lastSmartGenre: groove2.lastSmartGenre,
        activeTab: groove2.activeTab,
        mobileTab: groove2.mobileTab,
        creativity: groove2.creativity,
        sectionSeedMap: groove2.sectionSeedMap,
        pattern: groove2.instruments.map((inst) => ({
          name: inst.name,
          steps: [...inst.steps]
        }))
      },
      midi: {
        enabled: midi2.enabled,
        selectedOutputId: midi2.selectedOutputId,
        chordsChannel: midi2.chordsChannel,
        bassChannel: midi2.bassChannel,
        soloistChannel: midi2.soloistChannel,
        harmonyChannel: midi2.harmonyChannel,
        drumsChannel: midi2.drumsChannel,
        chordsOctave: midi2.chordsOctave,
        bassOctave: midi2.bassOctave,
        soloistOctave: midi2.soloistOctave,
        harmonyOctave: midi2.harmonyOctave,
        drumsOctave: midi2.drumsOctave,
        latency: midi2.latency,
        muteLocal: midi2.muteLocal,
        velocitySensitivity: midi2.velocitySensitivity
      }
    };
    storage.save("currentState", data);
  }
  function debounceSaveState() {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(saveCurrentState, 1e3);
  }
  var saveTimeout;
  var init_persistence = __esm({
    "public/persistence.js"() {
      init_state();
    }
  });

  // public/presets.js
  var presets_exports = {};
  __export(presets_exports, {
    BASS_STYLES: () => BASS_STYLES,
    CHORD_PRESETS: () => CHORD_PRESETS,
    CHORD_STYLES: () => CHORD_STYLES,
    DRUM_PRESETS: () => DRUM_PRESETS,
    HARMONY_STYLES: () => HARMONY_STYLES,
    SMART_GENRES: () => SMART_GENRES,
    SOLOIST_STYLES: () => SOLOIST_STYLES,
    SONG_TEMPLATES: () => SONG_TEMPLATES
  });
  var SONG_TEMPLATES, DRUM_PRESETS, SMART_GENRES, CHORD_STYLES, BASS_STYLES, SOLOIST_STYLES, HARMONY_STYLES, CHORD_PRESETS;
  var init_presets = __esm({
    "public/presets.js"() {
      SONG_TEMPLATES = [
        {
          name: "Standard Pop",
          sections: [
            { label: "Intro", value: "I | IV | V | I" },
            { label: "Verse", value: "I | vi | IV | V" },
            { label: "Chorus", value: "IV | V | I | vi" },
            { label: "Verse", value: "I | vi | IV | V" },
            { label: "Chorus", value: "IV | V | I | vi" },
            { label: "Outro", value: "I | IV | I | I" }
          ]
        },
        {
          name: "Jazz AABA",
          sections: [
            { label: "A", value: "iim7 | V7 | Imaj7 | VI7" },
            { label: "A", value: "iim7 | V7 | Imaj7 | VI7" },
            { label: "B", value: "IVmaj7 | IVm7 | iiim7 | VI7" },
            { label: "A", value: "iim7 | V7 | Imaj7 | Imaj7" }
          ]
        },
        {
          name: "Blues (12 Bar)",
          sections: [
            {
              label: "Blues",
              value: "I7 | IV7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7"
            }
          ]
        },
        {
          name: "EDM / Loop",
          sections: [
            { label: "Build", value: "vi | V | IV | III7" },
            { label: "Drop", value: "vi | IV | I | V" }
          ],
          isMinor: false
        },
        {
          name: "Alternative Loop",
          sections: [{ label: "Loop", value: "I | I | III | III | IV | IV | iv | iv" }],
          isMinor: false
        },
        {
          name: "Neo-Soul (Deep)",
          sections: [
            { label: "Verse", value: "IVmaj9 | III7#9 | vi11 | V9sus4", repeat: 2 },
            { label: "Chorus", value: "ii9 | bIImaj7 | Imaj9 | vi9", repeat: 2 }
          ],
          isMinor: false
        },
        {
          name: "Funk (Grand Groove)",
          sections: [
            { label: "Verse", value: "im11 | im11 | IV9 | IV13", repeat: 2 },
            { label: "Chorus", value: "bVII13 | bVImaj7 | v11 | I7#9", repeat: 2 }
          ],
          isMinor: true
        }
      ];
      DRUM_PRESETS = {
        Standard: {
          category: "Basic",
          swing: 0,
          sub: "8th",
          Kick: "2000000010000000",
          Snare: "0000200000002000",
          HiHat: "2010201020102010",
          Open: "0000000000000000",
          "3/4": {
            // Waltz-ish K-S-S
            Kick: "200000000000",
            Snare: "000020002000",
            HiHat: "201020102010"
          },
          "5/4": {
            // 3+2 feel (Take Five ish)
            Kick: "20000000001000000000",
            Snare: "00000000000020000000",
            // Snare on 4
            HiHat: "20102010201020102010"
          },
          "7/8": {
            // 2+2+3 feel
            Kick: "20000000200000",
            Snare: "00002000000000",
            HiHat: "20102010201010"
          },
          "7/4": {
            // Money-ish feel (4+3)
            // 28 steps.
            // Kick on 1, 3(ish), 5(ish)
            Kick: "2000000020000000200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "2010201020102010201020102010"
          },
          "12/8": {
            // Slow Blues / Doo-wop feel
            // 24 steps. Kick on 1(0), 3(12). Snare on 2(6), 4(18).
            Kick: "200000000000200000000000",
            Snare: "000000200000000000200000",
            HiHat: "201010201010201010201010"
          }
        },
        "Backbeat Only": {
          category: "Basic",
          swing: 0,
          sub: "8th",
          Kick: "0000000000000000",
          Snare: "0000200000002000",
          HiHat: "0000000000000000",
          Open: "0000000000000000",
          "3/4": { Snare: "000020002000" },
          "5/4": { Snare: "00000000000020000000" },
          "6/8": { Snare: "000000200000" },
          "7/8": { Snare: "00000000002000" },
          "7/4": { Snare: "0000200000002000000020000000" },
          "12/8": { Snare: "000000200000000000200000" }
        },
        "Basic Rock": {
          category: "Pop/Rock",
          swing: 0,
          sub: "8th",
          Kick: "2000000020100000",
          Snare: "0000200000002000",
          HiHat: "2020202020202020",
          variations: [
            {
              name: "Standard",
              Kick: "2000000020100000",
              Snare: "0000200000002000",
              HiHat: "2020202020202020"
            },
            {
              name: "Sparse",
              Kick: "2000000020000000",
              Snare: "0000200000002000",
              HiHat: "2000200020002000"
            },
            {
              name: "Driven",
              Kick: "2000100020100000",
              Snare: "0000200000002000",
              HiHat: "2020202020202020",
              Open: "0000000000000000"
              // Open hats handled by procedural logic but defined here for structure
            }
          ],
          Open: "0000000000000000",
          "3/4": {
            // Rock Waltz K-- S-- K--
            Kick: "200000002000",
            Snare: "000020000000",
            HiHat: "212121212121"
          },
          "5/4": {
            Kick: "20000000200000000000",
            Snare: "00000000000020000000",
            HiHat: "21212121212121212121"
          },
          "6/8": {
            // Rock 6/8
            Kick: "200000200000",
            Snare: "000000200000",
            HiHat: "212121212121"
          },
          "7/8": {
            Kick: "20000000200000",
            Snare: "00002000000000",
            HiHat: "21212121212121"
          },
          "7/4": {
            Kick: "2000000020000000200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "2121212121212121212121212121"
          },
          "12/8": {
            // Slow Rock 12/8
            Kick: "200000000000200000000000",
            Snare: "000000200000000000200000",
            HiHat: "212121212121212121212121"
          }
        },
        House: {
          category: "Electronic",
          swing: 0,
          sub: "16th",
          Kick: "2000200020002000",
          Snare: "0000200000002000",
          HiHat: "0020002000200020",
          Open: "0010001000100010",
          "3/4": {
            // 3-on-the-floor
            Kick: "200020002000",
            Snare: "000020000000",
            HiHat: "002000200020",
            Open: "001000100010"
          },
          "5/4": {
            // 5-on-the-floor
            Kick: "20002000200020002000",
            Snare: "00002000000020000000",
            HiHat: "00200020002000200020",
            Open: "00100010001000100010"
          },
          "6/8": {
            // House in 6/8?? "6-step"
            Kick: "200020002000",
            // K on 1, 3, 5
            Snare: "000000002000",
            // S on 5
            HiHat: "002000200020",
            Open: "001000100010"
          },
          "7/8": {
            // 7-on-the-floor (intense)
            Kick: "20002000200020",
            Snare: "00000000200000",
            HiHat: "00200020002000"
          },
          "7/4": {
            // 7-on-the-floor
            Kick: "2000200020002000200020002000",
            Snare: "0000200000002000000020000000",
            HiHat: "0020002000200020002000200020",
            Open: "0010001000100010001000100010"
          },
          "12/8": {
            // 4-on-the-floor shuffle
            Kick: "200000200000200000200000",
            Snare: "000000200000000000200000",
            HiHat: "000200000200000200000200"
          }
        },
        "House (2-Bar)": {
          category: "Electronic",
          swing: 0,
          sub: "16th",
          measures: 2,
          Kick: "20002000200020002000200020002000",
          Snare: "00002000000020000000200000002010",
          HiHat: "20202020202020202020202020202020",
          Open: "00000000000000000000000000000000",
          "3/4": {
            Kick: "200020002000200020002000",
            Snare: "000020000000000020000010",
            HiHat: "202020202020202020202020"
          },
          "7/4": {
            measures: 1,
            Kick: "2000200020002000200020002000",
            Snare: "0000200000002000000020000000",
            HiHat: "2020202020202020202020202020",
            Open: "0000000000000000000000000000"
          }
        },
        "Hip Hop": {
          category: "Soul/R&B",
          swing: 25,
          sub: "16th",
          Kick: "2000000002100000",
          Snare: "0000200000002000",
          HiHat: "2111211121112111",
          Open: "0000000000000000",
          "3/4": {
            Kick: "200000100000",
            Snare: "000000002000",
            HiHat: "211121112111"
          },
          "5/4": {
            // Dilla-esque
            Kick: "20000000000002100000",
            Snare: "00000000000020000000",
            HiHat: "21112111211121112111"
          },
          "7/4": {
            Kick: "2000000000000000021000000000",
            Snare: "0000000020000000000000002000",
            HiHat: "2111211121112111211121112111",
            Open: "0000000000000000000000000000"
          }
        },
        Funk: {
          category: "Soul/Funk",
          swing: 15,
          sub: "16th",
          measures: 2,
          variations: [
            {
              name: "Standard",
              Kick: "20010020010000102001002001001020",
              Snare: "00002000000020000000200001012000",
              HiHat: "21212121212121212121212121212121"
            },
            {
              name: "Linear",
              Kick: "20000020000000102000002000001020",
              Snare: "00002000010120000000200001012000",
              HiHat: "20202020202020202020202020202020"
            },
            {
              name: "Heavy",
              Kick: "20010020010010102001002001001020",
              Snare: "00002000000020000000200000002000",
              HiHat: "21212121212121212121212121212121"
            }
          ],
          Kick: "20010020010000102001002001001020",
          Snare: "00002000000020000000200001012000",
          HiHat: "21212121212121212121212121212121",
          Open: "00000000000000000000000000000000",
          "3/4": {
            Kick: "200100200010200100201020",
            Snare: "000020002000000020002000",
            HiHat: "212121212121212121212121"
          },
          "6/8": {
            Kick: "200100200000200100201000",
            Snare: "000000200000000000200000",
            HiHat: "212121212121212121212121"
          },
          "7/4": {
            measures: 1,
            Kick: "2001002001000010200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "2121212121212121212121212121",
            Open: "0000000000000000000000000000"
          }
        },
        "Neo-Soul": {
          category: "Soul/R&B",
          swing: 45,
          sub: "16th",
          measures: 2,
          variations: [
            {
              name: "Standard",
              Kick: "20000001002000002000010000200010",
              Snare: "00002000000020000000200000002000",
              HiHat: "11111111111111111111111111111111"
            },
            {
              name: "Lazy",
              Kick: "20000000002000002000000000200000",
              Snare: "00002000000020000000200000002000",
              HiHat: "10101010101010101010101010101010"
            },
            {
              name: "Complex",
              Kick: "20000001002000002000010000200010",
              Snare: "00002000000020000000200000002000",
              HiHat: "11111111111111111111111111111111",
              Open: "00000000000000200000000000000020"
            }
          ],
          Kick: "20000001002000002000010000200010",
          Snare: "00002000000020000000200000002000",
          HiHat: "11111111111111111111111111111111",
          Open: "00000000000000200000000000000020",
          "3/4": {
            Kick: "200000010020200001000010",
            Snare: "000020000000000020000000",
            HiHat: "111111111111111111111111"
          },
          "7/4": {
            measures: 1,
            Kick: "2000000100200000200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "1111111111111111111111111111",
            Open: "0000000000000020000000000000"
          }
        },
        Trap: {
          category: "Soul/R&B",
          swing: 0,
          sub: "16th",
          Kick: "2000000000200100",
          Snare: "0000000020000000",
          HiHat: "2112112121121121",
          Open: "0000000000000000",
          "3/4": { Snare: "000000002000" },
          "6/8": { Snare: "000000200000" },
          "7/4": {
            measures: 1,
            Kick: "2000000000200100200000000000",
            Snare: "0000000020000000000020000000",
            HiHat: "2112112121121121211211212112"
          }
        },
        "Blues Shuffle": {
          category: "Blues",
          swing: 100,
          sub: "8th",
          Kick: "2000000020000010",
          Snare: "0000200000002000",
          HiHat: "2010201020102010",
          Open: "1000000000001000",
          "12/8": {
            // Native home of the shuffle
            measures: 1,
            Kick: "200000000000200000001000",
            Snare: "000000200000000000200000",
            HiHat: "201010201010201010201010"
          },
          "6/8": {
            measures: 1,
            Kick: "200000200000",
            Snare: "000000200000",
            HiHat: "201010201010"
          },
          "7/4": {
            measures: 1,
            Kick: "2000000020000000200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "2010201020102010201020102010"
          }
        },
        Reggae: {
          category: "World/Latin",
          swing: 20,
          sub: "16th",
          Kick: "0000000020000000",
          Snare: "0000000020000000",
          HiHat: "2010201020102010",
          Open: "0000002000000020",
          "3/4": {
            measures: 1,
            Kick: "000000002000",
            // One drop on 3
            Snare: "000000002000",
            HiHat: "201020102010"
          },
          "7/4": {
            measures: 1,
            Kick: "0000000020000000000000002000",
            Snare: "0000000020000000000000002000",
            HiHat: "2010201020102010201020102010"
          }
        },
        Acoustic: {
          category: "Pop/Rock",
          swing: 15,
          sub: "8th",
          Kick: "2000000010000000",
          Snare: "0000200000002000",
          HiHat: "1010101010101010",
          Open: "0000000000000000",
          "3/4": {
            Kick: "200000000000",
            Snare: "000020002000",
            HiHat: "101010101010"
          },
          "5/4": {
            Kick: "20000000000000000000",
            Snare: "00000000000020000000",
            HiHat: "10101010101010101010"
          },
          "6/8": {
            Kick: "200000000000",
            Snare: "000000200000",
            HiHat: "101010101010"
          },
          "7/4": {
            Kick: "2000000000000000200000000000",
            Snare: "000000200000000000200000",
            HiHat: "1010101010101010101010101010"
          },
          "12/8": {
            Kick: "200000000000200000000000",
            Snare: "000000200000000000200000",
            HiHat: "101010101010101010101010"
          }
        },
        Ska: {
          category: "Pop/Rock",
          swing: 0,
          sub: "8th",
          Kick: "2000000020000000",
          Snare: "0000200000002000",
          HiHat: "1010101010101010",
          Open: "0000000000000000"
        },
        "Country (Two-Step)": {
          category: "Country/Folk",
          swing: 55,
          sub: "8th",
          Kick: "2000000020000000",
          Snare: "0000200000002000",
          // Simple backbeat
          HiHat: "1010101010101010",
          // Closed 8ths
          Open: "0000000000000000",
          "3/4": {
            // Country Waltz
            Kick: "200000000000",
            Snare: "000020002000",
            HiHat: "101010101010"
          },
          "6/8": {
            Kick: "200000200000",
            Snare: "000000200000",
            HiHat: "101010101010"
          }
        },
        "Metal (Speed)": {
          category: "Rock/Metal",
          swing: 0,
          sub: "16th",
          Kick: "2222222222222222",
          // Double bass 16ths
          Snare: "0000200000002000",
          // Hard backbeat
          HiHat: "1010101010101010",
          Open: "2000200020002000",
          "3/4": {
            Kick: "222222222222",
            Snare: "000020000000"
          },
          "6/8": {
            // Gallop
            Kick: "211211211211",
            Snare: "000000200000"
          },
          "7/4": {
            measures: 1,
            Kick: "2222222222222222222222222222",
            Snare: "0000200000002000000020000000"
          }
        },
        DnB: {
          category: "Electronic",
          swing: 0,
          sub: "16th",
          Kick: "2000000000200100",
          Snare: "0000200000002000",
          HiHat: "2121212121212121",
          Open: "0000000000000000",
          "3/4": { Snare: "000020000000" },
          "7/4": {
            measures: 1,
            Kick: "2000000000200100200000000000",
            Snare: "0000200000002000000020000000",
            HiHat: "2121212121212121212121212121"
          }
        },
        Disco: {
          category: "Soul/Funk",
          swing: 0,
          sub: "16th",
          Kick: "2000200020002000",
          Snare: "0000200000002000",
          HiHat: "1010101010101010",
          Open: "0020002000200020",
          "3/4": {
            measures: 1,
            Kick: "200020002000",
            Snare: "000020000000",
            HiHat: "101010101010",
            Open: "002000200020"
          },
          "5/4": {
            measures: 1,
            Kick: "20002000200020002000",
            Snare: "00002000000020000000",
            Open: "00200020002000200020"
          },
          "6/8": {
            // Disco in 6/8 (Compound)
            measures: 1,
            Kick: "200020002000",
            Snare: "000000200000",
            Open: "002000200020"
          },
          "7/8": {
            measures: 1,
            Kick: "20002000200020",
            Snare: "00002000000000",
            Open: "00200020002000"
          },
          "7/4": {
            measures: 1,
            Kick: "2000200020002000200020002000",
            Snare: "0000200000002000000020000000",
            Open: "0020002000200020002000200020"
          },
          "12/8": {
            measures: 1,
            Kick: "200000200000200000200000",
            Snare: "000000200000000000200000",
            Open: "000200000200000200000200"
          }
        },
        Jazz: {
          category: "Jazz",
          swing: 60,
          sub: "8th",
          measures: 2,
          variations: [
            {
              name: "Standard",
              Kick: "10001000100010001000100010001000",
              Snare: "00000000000000000000000001001000",
              HiHat: "00002000000020000000200000002000",
              Open: "20001020200010202000102020101020"
            },
            {
              name: "Minimal",
              Kick: "10001000100010001000100010001000",
              HiHat: "00002000000020000000200000002000",
              Open: "20001020200010202000102020001020"
            },
            {
              name: "Active",
              Kick: "10001000100010001000100010001000",
              Snare: "00000000000006000000000001001000",
              HiHat: "00002000000020000000200000002000",
              Open: "20001020200010202000102020101020"
            }
          ],
          Kick: "10001000100010001000100010001000",
          Snare: "00000000000000000000000001001000",
          HiHat: "00002000000020000000200000002000",
          Open: "20001020200010202000102020101020",
          "3/4": {
            // Jazz Waltz
            measures: 1,
            Kick: "100000000000",
            Snare: "000000000000",
            HiHat: "000020002000",
            Open: "200010201020"
          },
          "5/4": {
            // Take Five
            measures: 1,
            Kick: "20000000000000000000",
            Snare: "00000000000000000000",
            HiHat: "00002000200020002000",
            Open: "20001020102010201020"
          },
          "6/8": {
            // Jazz Waltz / 6/8 Afro-Cuban feel
            measures: 1,
            Kick: "100000000000",
            Snare: "000000000000",
            HiHat: "000020000020",
            Open: "200010200010"
          },
          "7/8": {
            measures: 1,
            Kick: "10000000000000",
            Snare: "00000000000000",
            Open: "20001020102010"
          },
          "7/4": {
            measures: 1,
            Kick: "1000000000000000000000000000",
            Snare: "0000000000000000000000000000",
            HiHat: "0000200020002000200020002000",
            Open: "2000102010201020102010201020"
          },
          "12/8": {
            // Afro-Blue feel
            measures: 1,
            Kick: "100000000000000000000000",
            Open: "200010201020102000102010"
          }
        },
        "Bossa Nova": {
          category: "World/Latin",
          swing: 0,
          sub: "16th",
          measures: 2,
          Kick: "20000020200000202000002020000020",
          Snare: "20000020000020000000200000200000",
          HiHat: "11111111111111111111111111111111",
          Conga: "00000000000000000000000100000000",
          "3/4": {
            // Bossa Waltz (adapted)
            Kick: "200000202000200000202000",
            Snare: "200200200020200200200020"
          },
          "5/4": {
            measures: 1,
            Kick: "20000020200000202000",
            Snare: "20020020002002002002"
          },
          "6/8": {
            // Samba 6/8
            measures: 1,
            Kick: "200000200000",
            Snare: "200200200200"
          },
          "7/8": {
            measures: 1,
            Kick: "20000020200000",
            Snare: "20020020002000"
          },
          "7/4": {
            measures: 1,
            Kick: "2000002020000020200000202000",
            Snare: "2002002000200200200200200020"
          },
          "12/8": {
            measures: 1,
            Kick: "200000200000200000200000",
            Snare: "200200200200200200200200"
          }
        },
        Samba: {
          category: "World/Latin",
          swing: 0,
          sub: "16th",
          measures: 2,
          Kick: "20022020200220202002202020022020",
          Snare: "00002000000020000000200000002000",
          HiHat: "21212121212121212121212121212121",
          Perc: "20202010101020202020201010102020",
          Shaker: "11111111111111111111111111111111"
        },
        "Afro-Cuban 6/8": {
          category: "World/Latin",
          swing: 0,
          sub: "8th",
          measures: 1,
          Kick: "200000200000",
          Perc: "202010202010",
          Conga: "002002002102",
          Bongo: "100100100100"
        },
        Afrobeat: {
          category: "World/Latin",
          swing: 10,
          sub: "16th",
          measures: 2,
          Kick: "20000000200000102000000020100100",
          Snare: "00002000002020000000200000202000",
          HiHat: "22022022022022022202202202202212",
          Open: "00000000000000000020000000000000",
          "3/4": {
            Kick: "200000002000200000002000",
            Snare: "000020000020000020000020",
            HiHat: "220220220220220220220220"
          },
          "5/4": {
            measures: 1,
            Kick: "20000000200000002000",
            Snare: "00002000002020000020",
            HiHat: "22022022022022022022"
          },
          "6/8": {
            measures: 1,
            Kick: "200000200000",
            Snare: "000020002020",
            HiHat: "220220220220"
          },
          "7/8": {
            measures: 1,
            Kick: "20000020000000",
            Snare: "00002000202000"
          },
          "7/4": {
            measures: 1,
            Kick: "2000000020000010200000002010",
            Snare: "0000200000202000000020000020",
            HiHat: "2202202202202202220220220220"
          },
          "12/8": {
            measures: 1,
            Kick: "200000200000200000200000",
            Snare: "000020002020000020002020"
          }
        },
        "Latin/Salsa": {
          category: "World/Latin",
          swing: 0,
          sub: "16th",
          measures: 2,
          Kick: "20000000200000002000000020000000",
          Clave: "20020020000202002002002000020200",
          HiHat: "21212121212121212121212121212121",
          Conga: "00000000000021200000000000002120",
          Perc: "20002000200020002000200020002000",
          Guiro: "00001000000010000000100000001000",
          "3/4": {
            Clave: "200200200002"
          },
          "12/8": {
            measures: 1,
            Kick: "200000000000200000000000",
            Perc: "202010202010"
          }
        }
      };
      SMART_GENRES = {
        Rock: {
          swing: 0,
          sub: "8th",
          drum: "Basic Rock",
          feel: "Rock",
          chord: "smart",
          bass: "rock",
          soloist: "shred",
          harmony: "smart"
        },
        Jazz: {
          swing: 60,
          sub: "8th",
          drum: "Jazz",
          feel: "Jazz",
          chord: "jazz",
          bass: "quarter",
          soloist: "bird",
          harmony: "horns"
        },
        Funk: {
          swing: 15,
          sub: "16th",
          drum: "Funk",
          feel: "Funk",
          chord: "funk",
          bass: "funk",
          soloist: "funk",
          harmony: "horns"
        },
        Disco: {
          swing: 0,
          sub: "16th",
          drum: "Disco",
          feel: "Disco",
          chord: "smart",
          bass: "disco",
          soloist: "disco",
          harmony: "smart"
        },
        "Hip Hop": {
          swing: 25,
          sub: "16th",
          drum: "Hip Hop",
          feel: "Hip Hop",
          chord: "smart",
          bass: "neo",
          soloist: "neo",
          harmony: "smart"
        },
        Blues: {
          swing: 100,
          sub: "8th",
          drum: "Blues Shuffle",
          feel: "Blues",
          chord: "jazz",
          bass: "quarter",
          soloist: "blues",
          harmony: "horns"
        },
        "Neo-Soul": {
          swing: 30,
          sub: "16th",
          drum: "Neo-Soul",
          feel: "Neo-Soul",
          chord: "smart",
          bass: "neo",
          soloist: "neo",
          harmony: "strings"
        },
        Reggae: {
          swing: 20,
          sub: "16th",
          drum: "Reggae",
          feel: "Reggae",
          chord: "smart",
          bass: "dub",
          soloist: "minimal",
          harmony: "smart"
        },
        Acoustic: {
          swing: 15,
          sub: "8th",
          drum: "Acoustic",
          feel: "Acoustic",
          chord: "pad",
          bass: "half",
          soloist: "minimal",
          harmony: "strings"
        },
        Bossa: {
          swing: 0,
          sub: "16th",
          drum: "Bossa Nova",
          feel: "Bossa Nova",
          chord: "jazz",
          bass: "bossa",
          soloist: "bossa",
          harmony: "strings"
        },
        Country: {
          swing: 55,
          sub: "16th",
          drum: "Country (Two-Step)",
          feel: "Country",
          chord: "strum-country",
          bass: "country",
          soloist: "country",
          harmony: "smart"
        },
        Metal: {
          swing: 0,
          sub: "16th",
          drum: "Metal (Speed)",
          feel: "Metal",
          chord: "power-metal",
          bass: "metal",
          soloist: "metal",
          harmony: "smart"
        },
        "Ska-Punk": {
          swing: 0,
          sub: "8th",
          drum: "Ska",
          feel: "Ska",
          chord: "ska-upstroke",
          bass: "walking-ska",
          soloist: "ska-horns",
          harmony: "horns"
        }
      };
      CHORD_STYLES = [
        { id: "smart", name: "Smart (Rhythmic)", category: "Modern" },
        { id: "pad", name: "Pad (Sustain)", category: "Modern" },
        { id: "strum8", name: "Strum (8th)", category: "Pop/Rock" },
        { id: "strum-country", name: "Country Strum", category: "Country/Folk" },
        { id: "power-metal", name: "Power Metal", category: "Rock/Metal" },
        { id: "jazz", name: "Jazz Comp", category: "Jazz" },
        { id: "funk", name: "Funk Scratch", category: "Soul/Funk" },
        { id: "ska-upstroke", name: "Ska Upstroke", category: "Pop/Rock" }
      ];
      BASS_STYLES = [
        { id: "smart", name: "Smart (Auto)", category: "Experimental" },
        { id: "whole", name: "Whole", category: "Basic" },
        { id: "half", name: "Half", category: "Basic" },
        { id: "arp", name: "Arp (1-3-5-3)", category: "Basic" },
        { id: "rock", name: "Rock (8th)", category: "Pop/Rock" },
        { id: "country", name: "Country (1-5)", category: "Country/Folk" },
        { id: "metal", name: "Metal (Gallop)", category: "Rock/Metal" },
        { id: "quarter", name: "Walking", category: "Jazz" },
        { id: "funk", name: "Funk", category: "Soul/Funk" },
        { id: "rocco", name: "Rocco (16ths)", category: "Soul/Funk" },
        { id: "disco", name: "Disco (Octaves)", category: "Soul/Funk" },
        { id: "dub", name: "Dub (Reggae)", category: "World/Latin" },
        { id: "neo", name: "Neo-Soul", category: "Soul/R&B" },
        { id: "bossa", name: "Bossa Nova", category: "World/Latin" },
        { id: "walking-ska", name: "Walking (Ska)", category: "Pop/Rock" }
      ];
      SOLOIST_STYLES = [
        { id: "lead_sheet", name: "Lead Sheet", category: "Special" },
        { id: "smart", name: "Smart (Auto)", category: "Experimental" },
        { id: "scalar", name: "Scalar", category: "Basic" },
        { id: "country", name: "Country", category: "Country/Folk" },
        { id: "shred", name: "Shreddy", category: "Rock/Metal" },
        { id: "metal", name: "Metal", category: "Rock/Metal" },
        { id: "blues", name: "Blues", category: "Blues" },
        { id: "neo", name: "Neo-Soul", category: "Soul/R&B" },
        { id: "minimal", name: "Minimal", category: "Basic" },
        { id: "bird", name: "Bird", category: "Jazz" },
        { id: "disco", name: "Disco", category: "Soul/Funk" },
        { id: "ska-horns", name: "Ska Horns", category: "Modern" }
      ];
      HARMONY_STYLES = [
        { id: "smart", name: "Smart (Auto)", category: "Experimental" },
        { id: "horns", name: "Horns (Stabs)", category: "Modern" },
        { id: "strings", name: "Strings (Pads)", category: "Classical/Trad" },
        { id: "organ", name: "Organ (B3)", category: "Soul/Funk" },
        { id: "plucks", name: "Modern Synth (Plucks)", category: "Electronic" },
        { id: "counter", name: "Contrapuntal", category: "Jazz" }
      ];
      CHORD_PRESETS = [
        {
          name: "Pop (Standard)",
          sections: [{ label: "Main", value: "I | V | vi | IV" }],
          category: "Pop/Rock",
          isMinor: false,
          settings: { bpm: 120, style: "pop" }
        },
        {
          name: "Pop (Ballad)",
          sections: [{ label: "Main", value: "vi | IV | I | V" }],
          category: "Pop/Rock",
          isMinor: false,
          settings: { bpm: 85, style: "pad" }
        },
        {
          name: "Country Standard",
          sections: [{ label: "Main", value: "I | I | IV | IV | I | V | I | I" }],
          category: "Country/Folk",
          isMinor: false,
          settings: { bpm: 100, style: "strum-country" }
        },
        {
          name: "Metal Core",
          sections: [{ label: "Main", value: "im | bVI | bVII | im" }],
          category: "Rock/Metal",
          isMinor: true,
          settings: { bpm: 160, style: "power-metal" }
        },
        {
          name: "50s Rock",
          sections: [{ label: "Main", value: "I | vi | IV | V" }],
          category: "Pop/Rock",
          isMinor: false,
          settings: { bpm: 140, style: "rock", timeSignature: "4/4" }
        },
        {
          name: "Royal Road",
          sections: [{ label: "Main", value: "IVmaj7 | V7 | iii7 | vi7" }],
          category: "Pop/Rock",
          isMinor: false,
          settings: { bpm: 110, style: "pop" }
        },
        {
          name: "Canon",
          sections: [{ label: "Main", value: "I | V | vi | iii | IV | I | IV | V" }],
          category: "Classical/Trad",
          isMinor: false,
          settings: { bpm: 90, style: "arpeggio" }
        },
        {
          name: "Andalusian",
          sections: [{ label: "Main", value: "i | bVII | bVI | V" }],
          category: "Classical/Trad",
          isMinor: true,
          settings: { bpm: 130, style: "skank" }
        },
        {
          name: "12-Bar Blues",
          sections: [
            {
              label: "Main",
              value: "I7 | I7 | I7 | I7 | IV7 | IV7 | I7 | I7 | V7 | IV7 | I7 | V7"
            }
          ],
          category: "Blues",
          isMinor: false,
          settings: { bpm: 100, style: "blues" }
        },
        {
          name: "Minor Blues",
          sections: [
            {
              label: "Main",
              value: "i7 | i7 | i7 | i7 | iv7 | iv7 | i7 | i7 | bVI7 | V7 | i7 | V7"
            }
          ],
          category: "Blues",
          isMinor: true,
          settings: { bpm: 90, style: "blues" }
        },
        {
          name: "8-Bar Blues",
          sections: [{ label: "Main", value: "I7 | V7 | IV7 | IV7 | I7 | V7 | I7 | V7" }],
          category: "Blues",
          isMinor: false,
          settings: { bpm: 110, style: "blues" }
        },
        {
          name: "Jazz Blues",
          sections: [
            {
              label: "Main",
              value: "I7 | IV7 | I7 | v7 I7 | IV7 | IV7 | I7 | iii7 VI7 | ii7 | V7 | I7 VI7 | ii7 V7"
            }
          ],
          category: "Blues",
          isMinor: false,
          settings: { bpm: 140, style: "jazz" }
        },
        {
          name: "Giant Steps",
          sections: [
            {
              label: "Main",
              value: "Imaj7 bIII7 | bVImaj7 VII7 | IIImaj7 | bviim7 bIII7 | bVImaj7 VII7 | IIImaj7 V7 | Imaj7 | #ivm7 VII7 | IIImaj7 | bviim7 bIII7 | bVImaj7 | iim7 V7 | Imaj7 | #ivm7 VII7 | IIImaj7 | iim7 V7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 220, style: "jazz" }
        },
        {
          name: "Ornithology",
          sections: [
            {
              label: "A",
              value: "Imaj7 | Imaj7 | im7 | IV7 | bVIImaj7 | bVIImaj7 | bviim7 | bIII7"
            },
            {
              label: "A",
              value: "Imaj7 | Imaj7 | im7 | IV7 | bVIImaj7 | bVIImaj7 | bviim7 | bIII7"
            },
            { label: "B", value: "bVImaj7 | bVImaj7 | iim7b5 | V7b9 | im7 | im7 | iim7 | V7" },
            {
              label: "A",
              value: "Imaj7 | Imaj7 | im7 | IV7 | bviim7 | bIII7 | bVImaj7 V7 | Imaj7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 160, style: "jazz" }
        },
        {
          name: "Donna Lee",
          sections: [
            { label: "A", value: "Imaj7 | VI7 | II7 | II7 | iim7 | V7 | Imaj7 | iim7 V7" },
            { label: "B (G)", value: "Imaj7 | VI7 | II7 | II7 | #im7 #IV7 | VIImaj7 | iim7 | V7" },
            { label: "A", value: "Imaj7 | VI7 | II7 | II7 | iim7 | V7 | III7 | vi7" },
            { label: "C", value: "IVmaj7 | #IVdim7 | Imaj7/V | VI7 | II7 | V7 | Imaj7 | iim7 V7" }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 220, style: "jazz" }
        },
        {
          name: "Rhythm Changes",
          sections: [
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" },
            { label: "B", value: "III7 | III7 | VI7 | VI7 | II7 | II7 | V7 | V7" },
            { label: "A", value: "I vi7 | ii7 V7 | I vi7 | ii7 V7 | I I7 | IV iv7 | I V7 | I" }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 180, style: "jazz" }
        },
        {
          name: "Autumn Leaves",
          sections: [
            { label: "A", value: "ii7 | V7 | Imaj7 | IVmaj7 | vii\xF87 | III7+ | vi7 | vi7" },
            { label: "A", value: "ii7 | V7 | Imaj7 | IVmaj7 | vii\xF87 | III7+ | vi7 | vi7" },
            { label: "B", value: "vii\xF87 | III7+ | vi7 | vi7 | ii7 | V7 | Imaj7 | IVmaj7" },
            { label: "C", value: "vii\xF87 | III7+ | vi7 | vi7 | vii\xF87 | III7+ | vi7 | vi7" }
          ],
          category: "Jazz",
          isMinor: false,
          // Often treated as relative minor of Bb, but starts major-ish. Let's keep false or set true? Relative minor G minor. But usually called Bb Major.
          settings: { bpm: 140, style: "jazz" }
        },
        {
          name: "Stella by Starlight",
          sections: [
            { label: "A", value: "#ivm7b5 | VII7alt | iim7 | V7 | vm7 | I7 | IVmaj7 | bVII7" },
            {
              label: "B",
              value: "Imaj7 | #ivm7b5 VII7 | iiim7b5 | VI7alt | iim7b5 | V7alt | Imaj7 | vm7 I7"
            },
            {
              label: "C",
              value: "IVmaj7 | bVII7#11 | Imaj7 | #ivm7b5 VII7alt | iiim7b5 | VI7alt | iim7b5 | V7alt"
            },
            {
              label: "D",
              value: "Imaj7 | #ivm7b5 VII7alt | iiim7b5 | VI7alt | iim7b5 | V7alt | Imaj7 | iim7 V7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 120, style: "jazz" }
        },
        {
          name: "All The Things You Are",
          sections: [
            { label: "A (Tonic)", value: "vi7 | ii7 | V7 | Imaj7 | IVmaj7" },
            { label: "A (III)", value: "#ivm7 | VII7 | IIImaj7", seamless: true },
            { label: "A2 (V)", value: "iiim7 | vi7 | II7 | Vmaj7 | Imaj7" },
            { label: "A2 (VII)", value: "biim7 | #IV7 | VIImaj7", seamless: true },
            { label: "B (VII)", value: "biim7 | #IV7 | VIImaj7 | VIImaj7" },
            { label: "B (#IV)", value: "vm7b5 | I7 | IVmaj7 | II7+", seamless: true },
            {
              label: "A3 (Tonic)",
              value: "vi7 | ii7 | V7 | Imaj7 | IVmaj7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7+ | Imaj7 | Imaj7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 135, style: "jazz" }
        },
        {
          name: "Neo-Soul (Deep)",
          sections: [
            { label: "Verse", value: "IVmaj9 | III7#9 | vi11 | V9sus4", repeat: 2 },
            { label: "Chorus", value: "ii9 | bIImaj7 | Imaj9 | vi9", repeat: 2 }
          ],
          category: "Soul/R&B",
          isMinor: false,
          settings: { bpm: 85, style: "neo" }
        },
        {
          name: "Acid Jazz (London)",
          sections: [
            {
              label: "Loop",
              value: "im9 | IV13 | bviim9 | bIII13 | bVImaj7 | bIImaj7 | im9 | V7alt"
            }
          ],
          category: "Soul/R&B",
          isMinor: true,
          settings: { bpm: 115, style: "funk" }
        },
        {
          name: "Funk (i-IV)",
          sections: [{ label: "Main", value: "i7 | IV7 | i7 | IV7" }],
          category: "Soul/R&B",
          isMinor: true,
          settings: { bpm: 110, style: "funk" }
        },
        {
          name: "Funk (Grand Groove)",
          sections: [
            { label: "Verse", value: "im11 | im11 | IV9 | IV13", repeat: 2 },
            { label: "Chorus", value: "bVII13 | bVImaj7 | v11 | I7#9", repeat: 2 }
          ],
          category: "Soul/R&B",
          isMinor: true,
          settings: { bpm: 108, style: "funk" }
        },
        {
          name: "Circle of 4ths",
          sections: [{ label: "Main", value: "I7 | IV7 | bVII7 | bIII7 | bVI7 | bII7 | V7 | I7" }],
          category: "Theory",
          isMinor: false
        },
        {
          name: "Plagal Flow",
          sections: [{ label: "Main", value: "I | IV | I | IV" }],
          category: "Theory",
          isMinor: false
        },
        {
          name: "Cherokee",
          sections: [
            {
              label: "A",
              value: "Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | iim7 V7"
            },
            {
              label: "A",
              value: "Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | Imaj7"
            },
            { label: "B (bII)", value: "biim7 | bVI7 | bIImaj7 | bIImaj7" },
            { label: "B (VII)", value: "viim7 | III7 | VIImaj7 | VIImaj7", seamless: true },
            { label: "B (bVI)", value: "bviim7 | bIII7 | bVImaj7 | bVImaj7", seamless: true },
            { label: "B (I)", value: "vim7 II7 | iim7 V7", seamless: true },
            {
              label: "A",
              value: "Imaj7 | vm7 I7 | IVmaj7 | ivm7 bVII7 | Imaj7 II7 | iim7 V7 | Imaj7 | Imaj7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 240, style: "jazz" }
        },
        {
          name: "Blue Bossa",
          sections: [
            { label: "Main", value: "im7 | im7 | ivm7 | ivm7 | iim7b5 | V7alt | im7 | im7" },
            { label: "Modulation", value: "biim7 | bVI7 | bIImaj7 | bIImaj7" },
            { label: "Turnaround", value: "iim7b5 | V7alt | im7 | iim7b5 V7alt" }
          ],
          category: "Jazz",
          isMinor: true,
          settings: { bpm: 140, style: "bossa" }
        },
        {
          name: "Night and Day",
          sections: [
            { label: "Verse (A)", value: "iim7 | V7 | Imaj7 | Imaj7", repeat: 2 },
            {
              label: "Verse (B)",
              value: "#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7"
            },
            {
              label: "Verse (B2)",
              value: "#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | bVII7"
            },
            { label: "Bridge", value: "bIIImaj7 | bIIImaj7 | Imaj7 | Imaj7", repeat: 2 },
            {
              label: "Outro",
              value: "#ivm7 | ivm7 | iiim7 | bIIIdim7 | iim7 | V7 | Imaj7 | Imaj7"
            }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 130, style: "jazz" }
        },
        {
          name: "All Blues",
          sections: [
            {
              label: "Head",
              value: "G7 | G7 | G7 | G7 | C7 | C7 | G7 | G7 | D7#9 | Eb7#9 D7alt | G7 | G7",
              timeSignature: "6/8"
            },
            { label: "Vamp", value: "G7 | G7 | G7 | G7", timeSignature: "6/8", repeat: 2 }
          ],
          category: "Jazz",
          isMinor: false,
          settings: { bpm: 110, style: "jazz", timeSignature: "6/8" }
        },
        {
          name: "Alternative Loop",
          sections: [{ label: "Loop", value: "I | I | III | III | IV | IV | iv | iv" }],
          category: "Pop/Rock",
          settings: { bpm: 120, style: "smart" }
        }
      ];
      for (const p3 of Object.values(DRUM_PRESETS)) {
        const expand = (obj) => {
          for (const [key, val] of Object.entries(obj)) {
            if (typeof val === "string" && /^[0-2]+$/.test(val)) {
              obj[key] = Array.from(val, Number);
            } else if (key === "variations" && Array.isArray(val)) {
              val.forEach((v3) => expand(v3));
            } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
              expand(val);
            }
          }
        };
        expand(p3);
      }
    }
  });

  // public/ui.js
  function showToast(msg) {
    dispatch(ACTIONS.SHOW_TOAST, msg);
  }
  function triggerFlash(intensity = 0.25) {
    dispatch(ACTIONS.TRIGGER_FLASH, intensity);
  }
  var init_ui = __esm({
    "public/ui.js"() {
      init_state();
      init_types();
    }
  });

  // public/worker-types.js
  var WORKER_MSG, WORKER_RESP;
  var init_worker_types = __esm({
    "public/worker-types.js"() {
      WORKER_MSG = {
        START: "start",
        STOP: "stop",
        SYNC_STATE: "syncState",
        REQUEST_BUFFER: "requestBuffer",
        FLUSH: "flush",
        EXPORT: "export",
        RESOLUTION: "resolution",
        PRIME: "prime"
      };
      WORKER_RESP = {
        NOTES: "notes",
        TICK: "tick",
        EXPORT_COMPLETE: "exportComplete",
        EXPORT_PROGRESS: "exportProgress",
        ERROR: "error"
      };
    }
  });

  // public/worker-client.js
  function initWorker(onSchedulerRequest, onNotesReceived) {
    if (timerWorker) {
      schedulerRequestHandler = onSchedulerRequest;
      notesReceivedHandler = onNotesReceived;
      return;
    }
    schedulerRequestHandler = onSchedulerRequest;
    notesReceivedHandler = onNotesReceived;
    const workerPath = typeof WORKER_PATH !== "undefined" ? WORKER_PATH : "logic-worker.js";
    timerWorker = new Worker(workerPath, { type: "module" });
    timerWorker.onmessage = (e3) => {
      const { type, notes, data, requestTimestamp, workerProcessTime } = e3.data;
      if (type === WORKER_RESP.TICK) {
        if (typeof schedulerRequestHandler === "function") {
          schedulerRequestHandler();
        }
      } else if (type === WORKER_RESP.NOTES) {
        if (typeof notesReceivedHandler === "function") {
          notesReceivedHandler(
            notes,
            requestTimestamp,
            workerProcessTime,
            e3.data.isResolution
          );
        }
      } else if (type === WORKER_RESP.EXPORT_PROGRESS) {
        if (typeof exportProgressHandler === "function") {
          exportProgressHandler(e3.data.progress);
        }
      } else if (type === WORKER_RESP.ERROR) {
        console.error("[Worker Error]", data);
      } else if (type === WORKER_RESP.EXPORT_COMPLETE) {
        if (typeof exportProgressHandler === "function") {
          exportProgressHandler(1);
        }
        const { blob, filename } = e3.data;
        const url = URL.createObjectURL(new Blob([blob], { type: "audio/midi" }));
        const a3 = document.createElement("a");
        a3.href = url;
        let safeName = (filename || "ensemble-export").replace(/\.midi?$/i, "");
        safeName = safeName.replace(/[^a-zA-Z0-9\s\-_()]/g, "").substring(0, 64).trim() || "ensemble-export";
        a3.download = `${safeName}.mid`;
        a3.click();
        URL.revokeObjectURL(url);
      }
    };
  }
  function startExport(options) {
    if (timerWorker) {
      timerWorker.postMessage({ type: WORKER_MSG.EXPORT, data: options });
    }
  }
  function startWorker() {
    if (timerWorker) {
      timerWorker.postMessage({ type: WORKER_MSG.START });
    }
  }
  function stopWorker() {
    if (timerWorker) {
      timerWorker.postMessage({ type: WORKER_MSG.STOP });
    }
  }
  function flushWorker(step, syncData = null, primeSteps = 0) {
    if (timerWorker) {
      timerWorker.postMessage({
        type: WORKER_MSG.FLUSH,
        data: { step, syncData, primeSteps, requestTimestamp: performance.now() }
      });
    }
  }
  function requestBuffer(step) {
    if (timerWorker) {
      timerWorker.postMessage({
        type: WORKER_MSG.REQUEST_BUFFER,
        data: { step, requestTimestamp: performance.now() }
      });
    }
  }
  function requestResolution(step) {
    if (timerWorker) {
      timerWorker.postMessage({
        type: WORKER_MSG.RESOLUTION,
        data: { step, requestTimestamp: performance.now() }
      });
    }
  }
  function syncWorker(action, payload) {
    if (!timerWorker) {
      return;
    }
    const { arranger: arranger6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, groove: groove2, playback: playback6 } = getState();
    let data = {};
    if (!action) {
      data = {
        arranger: {
          progression: arranger6.progression,
          stepMap: arranger6.stepMap,
          sectionMap: arranger6.sectionMap,
          totalSteps: arranger6.totalSteps,
          key: arranger6.key,
          isMinor: arranger6.isMinor,
          timeSignature: arranger6.timeSignature,
          grouping: arranger6.grouping
        },
        chords: {
          style: chords2.style,
          octave: chords2.octave,
          density: chords2.density,
          enabled: chords2.enabled,
          volume: chords2.volume
        },
        bass: {
          style: bass2.style,
          octave: bass2.octave,
          enabled: bass2.enabled,
          lastFreq: bass2.lastFreq,
          volume: bass2.volume
        },
        soloist: {
          style: soloist2.style,
          octave: soloist2.octave,
          enabled: soloist2.enabled,
          lastFreq: soloist2.lastFreq,
          volume: soloist2.volume,
          mode: soloist2.mode,
          sessionSteps: soloist2.sessionSteps,
          leadSheetMelody: soloist2.leadSheetMelody
        },
        harmony: {
          style: harmony2.style,
          octave: harmony2.octave,
          enabled: harmony2.enabled,
          volume: harmony2.volume,
          complexity: harmony2.complexity,
          pocketOffset: harmony2.pocketOffset
        },
        groove: {
          genreFeel: groove2.genreFeel,
          lastDrumPreset: groove2.lastDrumPreset,
          enabled: groove2.enabled,
          volume: groove2.volume,
          measures: groove2.measures,
          swing: groove2.swing,
          swingSub: groove2.swingSub,
          instruments: groove2.instruments.map((i3) => ({
            name: i3.name,
            steps: [...i3.steps],
            muted: i3.muted
          }))
        },
        playback: {
          bpm: playback6.bpm,
          bandIntensity: playback6.bandIntensity,
          complexity: playback6.complexity,
          autoIntensity: playback6.autoIntensity,
          sessionTimer: playback6.sessionTimer,
          sessionStartTime: playback6.sessionStartTime
        }
      };
    } else {
      switch (action) {
        case "SET_BAND_INTENSITY":
          data.playback = { bandIntensity: playback6.bandIntensity };
          break;
        case "SET_COMPLEXITY":
          data.playback = { complexity: playback6.complexity };
          data.harmony = { complexity: harmony2.complexity };
          break;
        case "SET_AUTO_INTENSITY":
          data.playback = { autoIntensity: playback6.autoIntensity };
          break;
        case "UPDATE_HB":
          data.harmony = payload;
          break;
        case "UPDATE_SB":
          data.soloist = payload;
          break;
        case "SET_PARAM":
          if (payload.module) {
            data[payload.module] = { [payload.param]: payload.value };
          }
          break;
        case "UPDATE_CONDUCTOR_DECISION":
          data.chords = { density: chords2.density };
          data.soloist = { hookRetentionProb: soloist2.hookRetentionProb };
          data.playback = {
            conductorVelocity: playback6.conductorVelocity,
            intent: playback6.intent
          };
          break;
        case "SET_STYLE":
          if (payload.module) {
            data[payload.module] = { style: payload.style };
          }
          break;
        case "SET_VOLUME":
          if (payload.module) {
            data[payload.module] = { volume: payload.value };
          }
          break;
        case "SET_OCTAVE":
          if (payload.module) {
            data[payload.module] = { octave: payload.value };
          }
          break;
        case "SET_GENRE_FEEL":
          data.groove = {
            genreFeel: groove2.genreFeel,
            swing: groove2.swing,
            swingSub: groove2.swingSub
          };
          break;
        case "SET_SWING":
          data.groove = { swing: payload };
          break;
        case "SET_SWING_SUB":
          data.groove = { swingSub: payload };
          break;
        case "SET_SESSION_STEPS":
          data.soloist = { sessionSteps: payload };
          break;
        case "SET_SOLOIST_MODE":
          data.soloist = { mode: payload };
          break;
        case "SET_BPM":
          data.playback = { bpm: playback6.bpm };
          break;
        case "IMPORT_MUSICXML":
          data.arranger = {
            progression: arranger6.progression,
            stepMap: arranger6.stepMap,
            sectionMap: arranger6.sectionMap,
            totalSteps: arranger6.totalSteps,
            key: arranger6.key,
            isMinor: arranger6.isMinor,
            timeSignature: arranger6.timeSignature
          };
          data.soloist = {
            leadSheetMelody: soloist2.leadSheetMelody,
            style: soloist2.style,
            enabled: soloist2.enabled
          };
          break;
        case "SET_SESSION_TIMER":
          data.playback = { sessionTimer: payload };
          break;
        case "TOGGLE_PLAY":
          data.playback = {
            isPlaying: playback6.isPlaying,
            sessionStartTime: playback6.sessionStartTime
          };
          break;
        case "ARRANGER_UPDATE":
          data.arranger = {
            progression: arranger6.progression,
            stepMap: arranger6.stepMap,
            sectionMap: arranger6.sectionMap,
            totalSteps: arranger6.totalSteps,
            key: arranger6.key,
            isMinor: arranger6.isMinor,
            timeSignature: arranger6.timeSignature
          };
          break;
      }
    }
    if (Object.keys(data).length > 0) {
      timerWorker.postMessage({ type: WORKER_MSG.SYNC_STATE, data });
    }
  }
  var timerWorker, schedulerRequestHandler, notesReceivedHandler, exportProgressHandler;
  var init_worker_client = __esm({
    "public/worker-client.js"() {
      init_state();
      init_worker_types();
      timerWorker = null;
      schedulerRequestHandler = null;
      notesReceivedHandler = null;
      exportProgressHandler = null;
    }
  });

  // public/instrument-controller.js
  var instrument_controller_exports = {};
  __export(instrument_controller_exports, {
    clearDrumPresetHighlight: () => clearDrumPresetHighlight,
    cloneMeasure: () => cloneMeasure,
    flushBuffer: () => flushBuffer,
    flushBuffers: () => flushBuffers,
    handleTap: () => handleTap,
    loadDrumPreset: () => loadDrumPreset,
    saveDrumPreset: () => saveDrumPreset,
    setInstrumentControllerRefs: () => setInstrumentControllerRefs,
    switchMeasure: () => switchMeasure,
    togglePower: () => togglePower,
    updateMeasures: () => updateMeasures
  });
  function setInstrumentControllerRefs(_scheduler, viz2) {
    vizRef = viz2;
  }
  function switchMeasure(idx) {
    const { groove: groove2 } = getState();
    if (groove2.currentMeasure === idx) {
      return;
    }
    dispatch(ACTIONS.SET_ACTIVE_MEASURE, idx);
  }
  function updateMeasures(val) {
    const numVal = parseInt(val, 10);
    dispatch(ACTIONS.SET_PARAM, { module: "groove", param: "measures", value: numVal });
    const { groove: groove2 } = getState();
    if (groove2.currentMeasure >= numVal) {
      dispatch(ACTIONS.SET_ACTIVE_MEASURE, 0);
    }
    saveCurrentState();
  }
  function loadDrumPreset(name) {
    const { groove: groove2, arranger: arranger6 } = getState();
    let p3 = DRUM_PRESETS[name];
    if (p3[arranger6.timeSignature]) {
      p3 = { ...p3, ...p3[arranger6.timeSignature] };
    }
    const newInstruments = groove2.instruments.map((inst) => {
      const spm = getStepsPerMeasure(arranger6.timeSignature);
      const pattern = p3[inst.name] || new Array(spm).fill(0);
      const newSteps = new Array(128).fill(0);
      pattern.forEach((v3, i3) => {
        if (i3 < 128) {
          newSteps[i3] = v3;
        }
      });
      return { ...inst, steps: newSteps };
    });
    Object.assign(groove2, {
      lastDrumPreset: name,
      measures: p3.measures || 1,
      currentMeasure: 0,
      instruments: [...newInstruments],
      // Force new array reference
      swing: p3.swing !== void 0 ? p3.swing : groove2.swing,
      swingSub: p3.sub || groove2.swingSub
    });
    dispatch("DRUM_PRESET_LOADED");
  }
  function saveDrumPreset() {
    const { groove: groove2 } = getState();
    const name = prompt("Name your drum pattern:", groove2.lastDrumPreset || "My Pattern");
    if (!name) {
      return;
    }
    const userPresets = JSON.parse(localStorage.getItem("ensemble_userDrumPresets") || "[]");
    const newPreset = {
      name: name.substring(0, 32),
      measures: groove2.measures,
      swing: groove2.swing,
      swingSub: groove2.swingSub,
      pattern: groove2.instruments.map((inst) => ({
        name: inst.name,
        steps: [...inst.steps]
      })),
      timestamp: Date.now()
    };
    userPresets.push(newPreset);
    localStorage.setItem("ensemble_userDrumPresets", JSON.stringify(userPresets));
    window.dispatchEvent(new Event("storage_sync"));
    showToast(`Saved "${name}" to drum library`);
  }
  function cloneMeasure() {
    const { groove: groove2, arranger: arranger6 } = getState();
    const spm = getStepsPerMeasure(arranger6.timeSignature);
    const sourceOffset = groove2.currentMeasure * spm;
    const newInstruments = groove2.instruments.map((inst) => {
      const newSteps = [...inst.steps];
      const pattern = inst.steps.slice(sourceOffset, sourceOffset + spm);
      for (let m3 = 0; m3 < groove2.measures; m3++) {
        if (m3 === groove2.currentMeasure) {
          continue;
        }
        const targetOffset = m3 * spm;
        for (let i3 = 0; i3 < spm; i3++) {
          newSteps[targetOffset + i3] = pattern[i3];
        }
      }
      return { ...inst, steps: newSteps };
    });
    Object.assign(groove2, { instruments: newInstruments });
    showToast(`Measure ${groove2.currentMeasure + 1} copied to all`);
    dispatch("DRUM_MEASURE_CLONED");
  }
  function clearDrumPresetHighlight() {
    dispatch(ACTIONS.SET_PARAM, { module: "groove", param: "lastDrumPreset", value: null });
  }
  function handleTap(setBpmRef) {
    const now = performance.now();
    if (tapTimes.length > 0 && now - tapTimes[tapTimes.length - 1] > 2e3) {
      tapTimes = [];
    }
    tapTimes.push(now);
    if (tapTimes.length > 8) {
      tapTimes.shift();
    }
    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i3 = 1; i3 < tapTimes.length; i3++) {
        intervals.push(tapTimes[i3] - tapTimes[i3 - 1]);
      }
      const avg = intervals.reduce((a3, b2) => a3 + b2) / intervals.length;
      setBpmRef(Math.round(6e4 / avg));
    }
  }
  function flushBuffers(primeSteps = 0) {
    const { groove: groove2, arranger: arranger6, playback: playback6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2 } = getState();
    bass2.buffer.clear();
    soloist2.buffer.clear();
    chords2.buffer.clear();
    harmony2.buffer.clear();
    killAllPianoNotes();
    killSoloistNote();
    killBassNote();
    killDrumNote();
    killChordBus();
    killBassBus();
    killSoloistBus();
    killDrumBus();
    const syncData = {
      arranger: {
        progression: arranger6.progression,
        stepMap: arranger6.stepMap,
        sectionMap: arranger6.sectionMap,
        totalSteps: arranger6.totalSteps,
        key: arranger6.key,
        isMinor: arranger6.isMinor,
        timeSignature: arranger6.timeSignature
      },
      chords: {
        style: chords2.style,
        octave: chords2.octave,
        density: chords2.density,
        enabled: chords2.enabled,
        volume: chords2.volume
      },
      bass: {
        style: bass2.style,
        octave: bass2.octave,
        enabled: bass2.enabled,
        lastFreq: bass2.lastFreq,
        volume: bass2.volume
      },
      soloist: {
        style: soloist2.style,
        octave: soloist2.octave,
        enabled: soloist2.enabled,
        lastFreq: soloist2.lastFreq,
        volume: soloist2.volume,
        mode: soloist2.mode,
        sessionSteps: soloist2.sessionSteps
      },
      harmony: {
        style: harmony2.style,
        octave: harmony2.octave,
        enabled: harmony2.enabled,
        volume: harmony2.volume,
        complexity: harmony2.complexity
      },
      groove: {
        genreFeel: groove2.genreFeel,
        enabled: groove2.enabled,
        volume: groove2.volume,
        measures: groove2.measures,
        swing: groove2.swing,
        swingSub: groove2.swingSub,
        instruments: groove2.instruments.map((i3) => ({
          name: i3.name,
          steps: [...i3.steps],
          muted: i3.muted
        }))
      },
      playback: {
        bpm: playback6.bpm,
        bandIntensity: playback6.bandIntensity,
        complexity: playback6.complexity,
        autoIntensity: playback6.autoIntensity
      }
    };
    flushWorker(playback6.step, syncData, primeSteps);
    restoreGains();
  }
  function flushBuffer(type, primeSteps = 0) {
    const { playback: playback6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2 } = getState();
    if (type === "bass" || type === "all") {
      if (bass2.lastPlayedFreq !== null) {
        bass2.lastFreq = bass2.lastPlayedFreq;
      }
      bass2.buffer.clear();
      killBassNote();
      killBassBus();
    }
    if (type === "soloist" || type === "all") {
      if (soloist2.lastPlayedFreq !== null) {
        soloist2.lastFreq = soloist2.lastPlayedFreq;
      }
      soloist2.buffer.clear();
      killSoloistNote();
      killSoloistBus();
    }
    if (type === "chord" || type === "all") {
      chords2.buffer.clear();
      killAllPianoNotes();
      killChordBus();
    }
    if (type === "harmony" || type === "all") {
      harmony2.buffer.clear();
      killHarmonyNote();
      killHarmonyBus();
    }
    if (type === "groove" || type === "all") {
      killDrumNote();
      killDrumBus();
    }
    if (type !== "none") {
      flushWorker(playback6.step, null, primeSteps);
    }
    restoreGains();
  }
  function togglePower(type) {
    const { groove: groove2, vizState: vizState2, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2 } = getState();
    const normalizedType = type === "chords" ? "chord" : type === "harmonies" ? "harmony" : type;
    const stateMap2 = {
      chord: chords2,
      bass: bass2,
      soloist: soloist2,
      harmony: harmony2,
      groove: groove2,
      viz: vizState2
    };
    const state2 = stateMap2[normalizedType];
    if (!state2) {
      return;
    }
    const newState = !state2.enabled;
    const moduleName = normalizedType === "chord" ? "chords" : normalizedType === "viz" ? "vizState" : normalizedType;
    dispatch(ACTIONS.SET_PARAM, { module: moduleName, param: "enabled", value: newState });
    if (normalizedType === "soloist") {
      if (newState) {
        dispatch(ACTIONS.SET_PARAM, {
          module: "soloist",
          param: "isWaitingForEntry",
          value: true
        });
        dispatch(ACTIONS.SET_PARAM, { module: "soloist", param: "isResting", value: true });
        dispatch(ACTIONS.SET_PARAM, { module: "soloist", param: "isYielding", value: false });
      } else {
        dispatch(ACTIONS.SET_PARAM, { module: "soloist", param: "tradeMode", value: "manual" });
        dispatch(ACTIONS.SET_PARAM, { module: "soloist", param: "isYielding", value: false });
        dispatch(ACTIONS.SET_PARAM, {
          module: "soloist",
          param: "isWaitingForEntry",
          value: false
        });
      }
    }
    if (normalizedType === "viz" && !newState && vizRef) {
      vizRef.clear();
    }
    syncWorker();
    if (["chord", "bass", "soloist", "harmony"].includes(normalizedType)) {
      flushBuffer(normalizedType);
    } else {
      restoreGains();
    }
    if (newState) {
      restoreGains();
    }
    saveCurrentState();
  }
  var vizRef, tapTimes;
  var init_instrument_controller = __esm({
    "public/instrument-controller.js"() {
      init_engine();
      init_persistence();
      init_presets();
      init_state();
      init_types();
      init_ui();
      init_utils();
      init_worker_client();
      vizRef = null;
      tapTimes = [];
    }
  });

  // public/animation-loop.js
  function draw(viz2) {
    const { playback: playback6, groove: groove2, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, vizState: vizState2, arranger: arranger6 } = getState();
    if (!playback6.isDrawing) {
      return;
    }
    const nowFrame = performance.now();
    if (lastFrameTime > 0) {
      const delta = nowFrame - lastFrameTime;
      if (delta > 35) {
        missedFrames++;
        if (missedFrames > 15) {
          dispatch(ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD);
          missedFrames = 0;
        }
      } else if (delta < 20) {
        missedFrames = Math.max(0, missedFrames - 1);
      }
    }
    lastFrameTime = nowFrame;
    if (!playback6.audio) {
      playback6.isDrawing = false;
      return;
    }
    if (!playback6.isPlaying && playback6.drawQueue.length === 0) {
      playback6.isDrawing = false;
      if (chords2.lastActiveChordIndex !== null) {
        chords2.lastActiveChordIndex = null;
        dispatch("VIS_RESET");
      }
      if (viz2) {
        viz2.clear();
      }
      return;
    }
    const now = getVisualTime();
    while (playback6.drawQueue.length > 0 && playback6.drawQueue[0].time < now - 2) {
      playback6.drawQueue.shift();
    }
    if (playback6.drawQueue.length > 300) {
      playback6.drawQueue = playback6.drawQueue.slice(playback6.drawQueue.length - 200);
    }
    const spm = getStepsPerMeasure(arranger6.timeSignature);
    while (playback6.drawQueue.length && playback6.drawQueue[0].time <= now) {
      const ev = playback6.drawQueue.shift();
      if (ev.type === "drum_vis") {
        const stepMeasure = Math.floor(ev.step / spm);
        if (groove2.followPlayback && stepMeasure !== groove2.currentMeasure && playback6.isPlaying) {
          switchMeasure(stepMeasure, true);
        }
        playback6.lastPlayingStep = ev.step;
      } else if (ev.type === "chord_vis") {
        if (chords2.lastActiveChordIndex !== ev.index) {
          chords2.lastActiveChordIndex = ev.index;
          dispatch("VIS_UPDATE", { type: "chord", index: ev.index });
        }
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          ev.notes = ev.chordNotes;
          viz2.pushChord(ev);
        }
      } else if (ev.type === "bass_vis") {
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          ev.noteName = ev.name;
          viz2.pushNote("bass", ev);
        }
      } else if (ev.type === "soloist_vis") {
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          viz2.truncateNotes("soloist", ev.time);
          ev.noteName = ev.name;
          viz2.pushNote("soloist", ev);
        }
      } else if (ev.type === "harmony_vis") {
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          ev.noteName = ev.name;
          viz2.pushNote("harmony", ev);
        }
      } else if (ev.type === "drums_vis") {
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          viz2.pushNote("drums", ev);
        }
      } else if (ev.type === "fill_active") {
        if (viz2 && vizState2.enabled && playback6.isDrawing) {
          viz2.isFillActive = ev.active;
        }
      }
    }
    if (viz2 && vizState2.enabled && playback6.isDrawing) {
      try {
        viz2.setRegister("bass", bass2.octave);
        viz2.setRegister("soloist", soloist2.octave);
        viz2.setRegister("chords", chords2.octave);
        viz2.setRegister("harmony", harmony2.octave);
        const ts = TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"];
        viz2.render(now, playback6.bpm, ts);
        vizCrashCount = 0;
      } catch (e3) {
        console.error("[Visualizer Error]", e3);
        vizCrashCount++;
        if (vizCrashCount > 3) {
          console.warn("Visualizer disabled due to repeated errors.");
          vizState2.enabled = false;
          vizCrashCount = 0;
        }
      }
    }
    requestAnimationFrame(() => draw(viz2));
  }
  var lastFrameTime, missedFrames, vizCrashCount;
  var init_animation_loop = __esm({
    "public/animation-loop.js"() {
      init_config();
      init_engine();
      init_instrument_controller();
      init_state();
      init_types();
      init_utils();
      lastFrameTime = 0;
      missedFrames = 0;
      vizCrashCount = 0;
    }
  });

  // public/fills.js
  function generateProceduralFill(genre, intensity, stepsPerMeasure) {
    const fill = {};
    const templates = FILL_TEMPLATES[genre] || FILL_TEMPLATES.Rock;
    let level = "low";
    if (intensity > 0.4) {
      level = "medium";
    }
    if (intensity > 0.75) {
      level = "high";
    }
    const options = templates[level];
    if (!options || options.length === 0) {
      return fill;
    }
    const template = options[Math.floor(Math.random() * options.length)];
    const offset = stepsPerMeasure - 16;
    template.steps.forEach((stepIdx, i3) => {
      const inst = template.instruments[i3];
      const vel = template.velocities[i3];
      const actualStep = stepIdx + offset;
      if (actualStep >= 0 && actualStep < stepsPerMeasure) {
        if (!fill[actualStep]) {
          fill[actualStep] = [];
        }
        fill[actualStep].push({ name: inst, vel });
      }
    });
    return fill;
  }
  var FILL_TEMPLATES;
  var init_fills = __esm({
    "public/fills.js"() {
      FILL_TEMPLATES = {
        Rock: {
          low: [
            // Simple snare hits on 4, 4&
            { steps: [12, 14], instruments: ["Snare", "Snare"], velocities: [0.8, 0.7] },
            // Kick/Snare interplay
            {
              steps: [12, 13, 14],
              instruments: ["Kick", "Snare", "Snare"],
              velocities: [1, 0.7, 0.9]
            }
          ],
          medium: [
            // 8th note build
            {
              steps: [8, 10, 12, 14],
              instruments: ["Snare", "Snare", "Snare", "Snare"],
              velocities: [0.6, 0.7, 0.8, 0.9]
            },
            // Tom-Snare movement
            {
              steps: [8, 10, 12, 14],
              instruments: ["High Tom", "Mid Tom", "Low Tom", "Kick"],
              velocities: [0.8, 0.8, 0.9, 1.1]
            }
          ],
          high: [
            // 16th note roll
            {
              steps: [8, 9, 10, 11, 12, 13, 14, 15],
              instruments: [
                "Snare",
                "Snare",
                "High Tom",
                "High Tom",
                "Mid Tom",
                "Mid Tom",
                "Low Tom",
                "Low Tom"
              ],
              velocities: [0.5, 0.4, 0.6, 0.5, 0.7, 0.6, 0.9, 0.8]
            },
            // Flam-like accents (using Flam logic if engine supported, or just tight notes)
            {
              steps: [0, 2, 4, 6, 8, 10, 12, 14],
              instruments: ["Kick", "Crash", "Snare", "Snare", "Kick", "Crash", "Snare", "Kick"],
              velocities: [1.2, 1, 0.9, 0.9, 1.2, 1, 1, 1.2]
            }
          ]
        },
        Funk: {
          low: [
            // Ghost note syncopation
            { steps: [13, 15], instruments: ["Snare", "Snare"], velocities: [0.3, 0.4] },
            // Hi-hat open on upbeat
            { steps: [14], instruments: ["Open"], velocities: [0.8] }
          ],
          medium: [
            // Linear pattern
            {
              steps: [12, 13, 14, 15],
              instruments: ["Kick", "Snare", "Kick", "Snare"],
              velocities: [0.9, 0.4, 0.9, 0.8]
            }
          ],
          high: [
            // Syncopated 16ths
            {
              steps: [8, 10, 11, 13, 14],
              instruments: ["Snare", "Snare", "Kick", "Snare", "Kick"],
              velocities: [0.9, 0.4, 1, 0.9, 1.1]
            }
          ]
        },
        Jazz: {
          low: [
            // Soft snare comping
            { steps: [11, 14], instruments: ["Snare", "Snare"], velocities: [0.4, 0.5] }
          ],
          medium: [
            // Triplet feel on snare (mapped to 16ths roughly or Swing engine handles it)
            {
              steps: [8, 11, 14],
              instruments: ["Snare", "Snare", "Snare"],
              velocities: [0.5, 0.6, 0.7]
            }
          ],
          high: [
            // Busy snare/kick interaction
            {
              steps: [4, 7, 10, 13],
              instruments: ["Snare", "Kick", "Snare", "Kick"],
              velocities: [0.7, 0.8, 0.8, 0.9]
            }
          ]
        },
        Blues: {
          low: [
            // Simple shuffle pickup (the 'and' of 4)
            { steps: [14], instruments: ["Snare"], velocities: [0.6] },
            // Kick pickup
            { steps: [14], instruments: ["Kick"], velocities: [0.8] }
          ],
          medium: [
            // Standard shuffle fill (3... and-4-and)
            {
              steps: [10, 12, 14],
              instruments: ["Snare", "Snare", "Snare"],
              velocities: [0.6, 0.7, 0.9]
            },
            // Kick support on the beat
            { steps: [12, 14], instruments: ["Kick", "Snare"], velocities: [0.9, 0.8] }
          ],
          high: [
            // Classic triplet-feel turnaround (on 8th grid: 3, 3&, 4, 4&)
            {
              steps: [8, 10, 12, 14],
              instruments: ["Snare", "Kick", "Snare", "Crash"],
              velocities: [0.8, 0.9, 0.9, 1.1]
            },
            // Snare roll (8th notes only)
            {
              steps: [8, 10, 12, 14],
              instruments: ["Snare", "Snare", "Snare", "Snare"],
              velocities: [0.7, 0.8, 0.9, 1]
            }
          ]
        },
        Disco: {
          low: [
            // Open Hi-hat bark
            { steps: [14], instruments: ["Open"], velocities: [0.9] },
            // Snare pickup
            { steps: [12, 14], instruments: ["Snare", "Snare"], velocities: [0.7, 0.8] }
          ],
          medium: [
            // Classic Disco roll (Snare build)
            {
              steps: [8, 10, 12, 13, 14, 15],
              instruments: ["Snare", "Snare", "Snare", "Snare", "Snare", "Snare"],
              velocities: [0.6, 0.7, 0.8, 0.9, 0.9, 1]
            }
          ],
          high: [
            // 16th note chaos with open hats
            {
              steps: [8, 9, 10, 11, 12, 13, 14, 15],
              instruments: ["Snare", "Kick", "Snare", "Kick", "Snare", "Open", "Snare", "Crash"],
              velocities: [0.8, 0.9, 0.9, 1, 1, 1.1, 1.1, 1.2]
            }
          ]
        },
        Acoustic: {
          low: [
            { steps: [14], instruments: ["Kick"], velocities: [0.6] },
            { steps: [12, 14], instruments: ["Snare", "Snare"], velocities: [0.4, 0.5] }
          ],
          medium: [
            {
              steps: [12, 13, 14, 15],
              instruments: ["Snare", "Snare", "Snare", "Snare"],
              velocities: [0.4, 0.5, 0.6, 0.5]
            },
            {
              steps: [10, 12, 14],
              instruments: ["Kick", "Snare", "Kick"],
              velocities: [0.7, 0.6, 0.8]
            }
          ],
          high: [
            {
              steps: [8, 10, 12, 14],
              instruments: ["Snare", "Snare", "Snare", "Crash"],
              velocities: [0.6, 0.7, 0.8, 0.9]
            }
          ]
        },
        "Bossa Nova": {
          low: [{ steps: [14, 15], instruments: ["Snare", "Snare"], velocities: [0.6, 0.4] }],
          medium: [
            {
              steps: [12, 13, 14, 15],
              instruments: ["Snare", "High Tom", "Mid Tom", "Conga"],
              velocities: [0.7, 0.6, 0.7, 0.9]
            }
          ],
          high: [
            {
              steps: [8, 10, 12, 14, 15],
              instruments: ["High Tom", "Conga", "Mid Tom", "Snare", "Crash"],
              velocities: [0.6, 0.8, 0.7, 0.9, 1.1]
            }
          ]
        },
        "Ska-Punk": {
          low: [
            {
              steps: [12, 14, 15],
              instruments: ["Snare", "Snare", "Snare"],
              velocities: [0.8, 0.9, 1.1]
            }
          ],
          medium: [
            {
              steps: [8, 10, 12, 13, 14, 15],
              instruments: ["Snare", "Snare", "Snare", "Snare", "Snare", "Crash"],
              velocities: [0.6, 0.7, 0.8, 0.9, 1, 1.2]
            }
          ],
          high: [
            {
              steps: [0, 2, 4, 6, 8, 10, 12, 14],
              instruments: ["Kick", "Crash", "Kick", "Crash", "Kick", "Crash", "Snare", "Crash"],
              velocities: [1.2, 1.1, 1.2, 1.1, 1.2, 1.1, 1.2, 1.3]
            }
          ]
        }
      };
    }
  });

  // public/form-analysis.js
  function getSectionEnergy(label) {
    if (!label) {
      return 0.5;
    }
    const lower = label.toLowerCase();
    for (const [key, val] of Object.entries(SECTION_ENERGY_MAP)) {
      if (lower.includes(key)) {
        return val;
      }
    }
    return 0.5;
  }
  function calculateHarmonicFlux(sectionSteps) {
    if (!sectionSteps.length) {
      return 0;
    }
    let changes = 0;
    let lastChordId = null;
    sectionSteps.forEach((entry) => {
      const chordId = `${entry.chord.value}_${entry.chord.rootMidi}`;
      if (chordId !== lastChordId) {
        changes++;
        lastChordId = chordId;
      }
    });
    const bars = sectionSteps.length / 16;
    return bars > 0 ? changes / bars : 0;
  }
  function analyzeForm() {
    const { arranger: arranger6 } = getState();
    if (!arranger6.stepMap.length) {
      return null;
    }
    const sections = [];
    let currentSection = null;
    arranger6.stepMap.forEach((entry) => {
      if (!currentSection || entry.chord.sectionId !== currentSection.id) {
        currentSection = {
          id: entry.chord.sectionId,
          label: entry.chord.sectionLabel,
          steps: [],
          chords: []
        };
        sections.push(currentSection);
      }
      currentSection.steps.push(entry);
      const chordSym = entry.chord.value;
      if (currentSection.chords[currentSection.chords.length - 1] !== chordSym) {
        currentSection.chords.push(chordSym);
      }
    });
    const sectionSignatures = sections.map((s3) => s3.chords.join("|"));
    const occurrenceCount = {};
    sections.forEach((s3, i3) => {
      const sig = sectionSignatures[i3];
      occurrenceCount[sig] = (occurrenceCount[sig] || 0) + 1;
      s3.iteration = occurrenceCount[sig];
      s3.flux = calculateHarmonicFlux(s3.steps);
    });
    const roles = sections.map((s3, i3) => {
      const isFirstOccurrence = s3.iteration === 1;
      const isLastSection = i3 === sections.length - 1;
      const label = s3.label.toLowerCase();
      if (label.includes("intro")) {
        return "Intro";
      }
      if (label.includes("outro")) {
        return "Outro";
      }
      if (label.includes("solo") || label.includes("chorus") || label.includes("drop")) {
        return "Peak";
      }
      if (isFirstOccurrence) {
        if (i3 === 0) {
          return "Main Theme";
        }
        if (label === "b" || label.includes("bridge")) {
          return "Bridge";
        }
        if (s3.flux > 2.8) {
          return "Variation";
        }
        return "Theme B";
      } else {
        if (label === "b" || label.includes("bridge")) {
          return "Bridge";
        }
        if (s3.iteration >= 3) {
          return "Refrain";
        }
        if (s3.flux > 2.2) {
          return "Build";
        }
        if (isLastSection) {
          return "Refrain";
        }
        return "Main Theme";
      }
    });
    return {
      sections: sections.map((s3, i3) => ({
        id: s3.id,
        label: s3.label,
        role: roles[i3],
        flux: s3.flux,
        iteration: s3.iteration
      })),
      sequence: roles.join("-")
    };
  }
  var SECTION_ENERGY_MAP;
  var init_form_analysis = __esm({
    "public/form-analysis.js"() {
      init_state();
      SECTION_ENERGY_MAP = {
        intro: 0.4,
        verse: 0.5,
        "pre-chorus": 0.6,
        build: 0.7,
        chorus: 0.9,
        drop: 1,
        bridge: 0.6,
        solo: 0.8,
        outro: 0.4,
        breakdown: 0.3
      };
    }
  });

  // public/conductor.js
  function applyConductor() {
    const { playback: playback6, soloist: soloist2, groove: groove2, chords: chords2, bass: bass2, harmony: harmony2, arranger: arranger6 } = getState();
    const intensity = playback6.bandIntensity;
    const complexity = playback6.complexity;
    let targetDensity = "standard";
    if (intensity < 0.4) {
      targetDensity = "thin";
    } else if (intensity > 0.85) {
      targetDensity = "rich";
    }
    const targetVelocity = 0.7 + intensity * 0.45;
    const targetHookProb = 0.2 + complexity * 0.6;
    const isSoloistBusy = soloist2.enabled && soloist2.busySteps > 0;
    const targetIntentDensity = isSoloistBusy ? 0.3 * (1 - complexity) : 0.5 + intensity * 0.4;
    let targetHbComplexity = complexity;
    const elapsedMins = playback6.sessionTimer > 0 && playback6.sessionStartTime > 0 ? (performance.now() - playback6.sessionStartTime) / 6e4 : 0;
    const progress = playback6.sessionTimer > 0 ? Math.min(1, elapsedMins / playback6.sessionTimer) : 0;
    if (playback6.songMode && playback6.isEndingPending) {
      targetHbComplexity = Math.max(targetHbComplexity, 0.85);
    }
    let lyricalBias = 0.5;
    if (playback6.songMode && playback6.sessionTimer > 0) {
      if (progress < 0.3) {
        lyricalBias = 0.9 - progress / 0.3 * 0.4;
      } else if (progress < 0.7) {
        lyricalBias = 0.5 - (progress - 0.3) / 0.4 * 0.3;
      } else if (progress < 0.9) {
        lyricalBias = 0.2;
      } else {
        lyricalBias = 0.2 + (progress - 0.9) / 0.1 * 0.75;
      }
    }
    const modStep = arranger6.totalSteps > 0 ? playback6.step % arranger6.totalSteps : 0;
    const currentEntry = arranger6.stepMap.find((e3) => modStep >= e3.start && modStep < e3.end);
    if (currentEntry) {
      const label = currentEntry.chord.sectionLabel.toLowerCase();
      let sectionBias = 0.5;
      if (label.includes("solo")) {
        sectionBias = 0.2;
      } else if (label.includes("verse")) {
        sectionBias = 0.75;
      } else if (label.includes("outro") || label.includes("intro")) {
        sectionBias = 0.9;
      }
      lyricalBias = sectionBias * 0.7 + lyricalBias * 0.3;
    }
    const isFirstHalfOfSection = currentEntry && modStep - currentEntry.start < (currentEntry.end - currentEntry.start) / 2;
    const soloistIntensityMod = isFirstHalfOfSection ? -0.15 : 0.05;
    dispatch(ACTIONS.UPDATE_CONDUCTOR_DECISION, {
      density: targetDensity,
      velocity: targetVelocity,
      hookProb: targetHookProb,
      intent: {
        density: targetIntentDensity,
        soloistMod: soloistIntensityMod
      },
      lyricalBias
    });
    dispatch(ACTIONS.UPDATE_HB, {
      complexity: targetHbComplexity
    });
    let targetBassPocket = 0;
    const genre = groove2.genreFeel;
    if (genre === "Neo-Soul") {
      targetBassPocket = 0.025;
    } else if (genre === "Funk") {
      targetBassPocket = -5e-3;
    }
    dispatch(ACTIONS.SET_PARAM, { module: "bass", param: "pocketOffset", value: targetBassPocket });
    if (playback6.audio) {
      const time = playback6.audio.currentTime;
      const ramp = 0.5;
      if (playback6.masterLimiter) {
        const targetThreshold = -0.5 - intensity * 1.5;
        const targetRatio = 12 + intensity * 8;
        playback6.masterLimiter.threshold.setTargetAtTime(targetThreshold, time, ramp);
        playback6.masterLimiter.ratio.setTargetAtTime(targetRatio, time, ramp);
      }
      const targetReverb = 0.6 - intensity * 0.4;
      const reverbNodes = [
        { state: chords2, gain: "chordsReverb" },
        { state: bass2, gain: "bassReverb" },
        { state: soloist2, gain: "soloistReverb" },
        { state: harmony2, gain: "harmoniesReverb" },
        { state: groove2, gain: "drumsReverb" }
      ];
      reverbNodes.forEach((node) => {
        let bias = 1;
        if (node.gain === "drumsReverb") {
          bias = 0.7;
        } else if (node.gain === "soloistReverb") {
          bias = 1.2;
        }
        const finalReverb = Math.max(1e-3, targetReverb * bias);
        node.state.reverb = finalReverb;
        if (playback6[node.gain]) {
          playback6[node.gain].gain.setTargetAtTime(finalReverb, time, ramp);
        }
      });
    }
    debounceSaveState();
  }
  function updateAutoConductor() {
    const { playback: playback6 } = getState();
    if (!playback6.autoIntensity || !playback6.isPlaying) {
      return;
    }
    if (Math.abs(playback6.bandIntensity - conductorState.target) > 1e-3) {
      const multiplier = playback6.bandIntensity > conductorState.target ? 2.5 : 1;
      let newIntensity = playback6.bandIntensity + (playback6.bandIntensity < conductorState.target ? Math.abs(conductorState.stepSize) : -Math.abs(conductorState.stepSize)) * multiplier;
      newIntensity = Math.max(0.01, Math.min(1, newIntensity));
      if (newIntensity !== playback6.bandIntensity) {
        dispatch(ACTIONS.SET_BAND_INTENSITY, newIntensity);
      }
      applyConductor();
    }
  }
  function updateLarsTempo(currentStep) {
    const { groove: groove2, playback: playback6, arranger: arranger6 } = getState();
    if (!groove2.larsMode || !playback6.isPlaying) {
      if (conductorState.larsBpmOffset !== 0) {
        conductorState.larsBpmOffset = 0;
        updateBpmUI();
      }
      return;
    }
    const total = arranger6.totalSteps;
    if (total === 0) {
      return;
    }
    const modStep = currentStep % total;
    const entry = arranger6.stepMap.find((e3) => modStep >= e3.start && modStep < e3.end);
    if (!entry) {
      return;
    }
    const labelEnergy = getSectionEnergy(entry.chord.sectionLabel);
    const isGeneric = entry.chord.sectionLabel.toLowerCase().includes("section");
    const energy = isGeneric ? playback6.bandIntensity : labelEnergy * 0.6 + playback6.bandIntensity * 0.4;
    const maxDrift = 15 * groove2.larsIntensity;
    let targetOffset = (energy - 0.5) * 2 * maxDrift;
    if (groove2.fillActive) {
      targetOffset += 8 * groove2.larsIntensity;
    }
    const lerpFactor = groove2.fillActive ? 0.08 : 0.03;
    conductorState.larsBpmOffset += (targetOffset - conductorState.larsBpmOffset) * lerpFactor;
    if (Math.abs(conductorState.larsBpmOffset) < 0.01) {
      if (Math.abs(targetOffset) < 0.01) {
        conductorState.larsBpmOffset = 0;
      }
    }
    updateBpmUI();
  }
  function updateBpmUI() {
    const { groove: groove2, playback: playback6 } = getState();
    const bpmInput = document.getElementById("bpmInput");
    const bpmControlGroup = document.getElementById("bpmControlGroup");
    const bpmLabel = document.getElementById("bpmLabel");
    if (!bpmInput || !bpmControlGroup) {
      return;
    }
    const baseBpm = playback6.bpm;
    const offset = conductorState.larsBpmOffset;
    const effectiveBpm = Math.round(baseBpm + offset);
    if (groove2.larsMode && playback6.isPlaying) {
      bpmControlGroup.classList.add("lars-active");
      const intensity = Math.min(1, Math.abs(offset) / 6);
      if (Math.abs(offset) > 0.1) {
        const isPushing = offset > 0;
        const targetColor = isPushing ? "var(--blue)" : "var(--red)";
        const mixPercent = 20 + Math.round(intensity * 80);
        const blendedColor = `color-mix(in srgb, var(--text-color), ${targetColor} ${mixPercent}%)`;
        bpmInput.style.color = blendedColor;
        if (bpmLabel) {
          const direction = isPushing ? "\u2197" : "\u2198";
          bpmLabel.textContent = `${effectiveBpm} ${direction}`;
          bpmLabel.style.color = blendedColor;
        }
      } else {
        bpmInput.style.color = "";
        if (bpmLabel) {
          bpmLabel.textContent = "BPM";
          bpmLabel.style.color = "";
        }
      }
    } else {
      bpmControlGroup.classList.remove("lars-active");
      bpmInput.style.color = "";
      if (bpmLabel) {
        bpmLabel.textContent = "BPM";
        bpmLabel.style.color = "";
      }
    }
  }
  function checkSectionTransition(currentStep, stepsPerMeasure) {
    const { groove: groove2, arranger: arranger6, playback: playback6 } = getState();
    if (!groove2.enabled) {
      return;
    }
    const total = arranger6.totalSteps;
    if (total === 0) {
      return;
    }
    const modStep = currentStep % total;
    if (modStep % stepsPerMeasure === 0) {
      const measureEnd = modStep + stepsPerMeasure;
      const effectiveStep = measureEnd - 1;
      const entry2 = arranger6.stepMap.find(
        (e3) => effectiveStep >= e3.start && effectiveStep < e3.end
      );
      if (!entry2) {
        return;
      }
      const isLoopEnd = measureEnd >= total;
      const nextChordIdx = isLoopEnd ? 0 : arranger6.stepMap.findIndex((e3) => measureEnd >= e3.start && measureEnd < e3.end);
      const nextEntry = nextChordIdx !== -1 ? arranger6.stepMap[nextChordIdx] : null;
      if (nextEntry && (isLoopEnd || nextEntry.chord.sectionId !== entry2.chord.sectionId)) {
        const { soloist: soloistState } = getState();
        if (soloistState && (soloistState.tradeMode === "sections" || soloistState.tradeMode === "loops" && isLoopEnd)) {
          const nextSoloState = !soloistState.enabled;
          const sbUpdate = { enabled: nextSoloState };
          if (nextSoloState) {
            Object.assign(sbUpdate, {
              isWaitingForEntry: true,
              isResting: true,
              isYielding: false,
              activeSteps: 0,
              restSteps: 0
            });
          } else {
            Object.assign(sbUpdate, {
              isYielding: true,
              isWaitingForEntry: false
            });
          }
          dispatch(ACTIONS.UPDATE_SB, sbUpdate);
          dispatch(ACTIONS.SET_ACTIVE_TAB, {
            module: "soloist",
            tab: soloistState.activeTab
          });
          saveCurrentState();
        }
        let shouldFill = true;
        const nextSectionId = nextEntry.chord.sectionId;
        const nextSection = arranger6.sections.find((s3) => s3.id === nextSectionId);
        if (nextSection?.seamless) {
          shouldFill = false;
        }
        if (isLoopEnd && shouldFill) {
          conductorState.loopCount++;
          conductorState.formIteration++;
          const isShortLoop = arranger6.totalSteps <= stepsPerMeasure * 4;
          if (isShortLoop) {
            const loopFrequency = playback6.bandIntensity > 0.75 ? 1 : playback6.bandIntensity > 0.4 ? 2 : 4;
            shouldFill = conductorState.loopCount % loopFrequency === 0;
          }
        }
        if (shouldFill) {
          let targetEnergy = 0.5;
          const currentInt = playback6.bandIntensity;
          let macroFloor = 0.2, macroCeiling = 0.6;
          if (playback6.sessionTimer > 0 && playback6.sessionStartTime > 0) {
            const elapsedMins = (performance.now() - playback6.sessionStartTime) / 6e4;
            const progress = Math.min(1, elapsedMins / playback6.sessionTimer);
            if (progress < 0.15) {
              macroFloor = 0.2;
              macroCeiling = 0.45;
            } else if (progress < 0.4) {
              macroFloor = 0.4;
              macroCeiling = 0.7;
            } else if (progress < 0.65) {
              macroFloor = 0.5;
              macroCeiling = 0.8;
            } else if (progress < 0.85) {
              macroFloor = 0.7;
              macroCeiling = 1;
            } else {
              macroFloor = 0.2;
              macroCeiling = 0.5;
            }
          } else {
            const grandCycle = conductorState.formIteration % 8;
            if (grandCycle === 0) {
              macroFloor = 0.15;
              macroCeiling = 0.45;
            } else if (grandCycle < 3) {
              macroFloor = 0.35;
              macroCeiling = 0.75;
            } else if (grandCycle < 5) {
              macroFloor = 0.6;
              macroCeiling = 1;
            } else if (grandCycle < 7) {
              macroFloor = 0.3;
              macroCeiling = 0.6;
            } else {
              macroFloor = 0.1;
              macroCeiling = 0.35;
            }
          }
          if (conductorState.form?.sections) {
            const nextSection2 = conductorState.form.sections.find(
              (s3) => s3.id === nextEntry.chord.sectionId
            );
            if (nextSection2) {
              const role = nextSection2.role;
              switch (role) {
                case "Exposition":
                  targetEnergy = macroFloor + 0.1;
                  break;
                case "Development":
                  targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1;
                  break;
                case "Contrast":
                  targetEnergy = currentInt > (macroFloor + macroCeiling) / 2 ? macroFloor : macroCeiling;
                  break;
                case "Build":
                  targetEnergy = macroCeiling;
                  break;
                case "Climax":
                  targetEnergy = macroCeiling + 0.1;
                  break;
                case "Recapitulation":
                  targetEnergy = macroFloor + 0.2;
                  break;
                case "Resolution":
                  targetEnergy = macroFloor - 0.1;
                  break;
                default:
                  targetEnergy = getSectionEnergy(nextSection2.label);
              }
              if (nextSection2.flux > 2.6) {
                targetEnergy += 0.1;
              }
              if (nextSection2.iteration === 2) {
                targetEnergy += 0.1;
              } else if (nextSection2.iteration >= 3) {
                targetEnergy -= 0.15;
              }
            } else {
              targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
            }
          } else {
            targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
          }
          targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
          targetEnergy += Math.random() * 0.15 - 0.075;
          targetEnergy = Math.max(0.1, Math.min(1, targetEnergy));
          if (isLoopEnd && playback6.autoIntensity) {
            targetEnergy = Math.max(
              0.3,
              Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1))
            );
          }
          const fillSteps = generateProceduralFill(
            groove2.genreFeel,
            playback6.bandIntensity,
            stepsPerMeasure
          );
          dispatch(ACTIONS.TRIGGER_FILL, {
            steps: fillSteps,
            startStep: currentStep,
            length: stepsPerMeasure,
            crash: true
          });
          if (playback6.visualFlash) {
            triggerFlash(0.25);
          }
          if (playback6.autoIntensity) {
            conductorState.target = targetEnergy;
            conductorState.stepSize = (conductorState.target - playback6.bandIntensity) / stepsPerMeasure;
          }
          if (groove2.creativity && nextSection) {
            if (groove2.sectionSeedMap[nextSection.id] === void 0) {
              const seed = Math.random();
              dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
            }
          } else if (!groove2.creativity && nextSection) {
            dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed: 0.5 });
          }
        }
      }
    }
    const currentChordIdx = arranger6.stepMap.findIndex(
      (e3) => modStep >= e3.start && modStep < e3.end
    );
    if (currentChordIdx === -1) {
      return;
    }
    const entry = arranger6.stepMap[currentChordIdx];
    const isChordEnd = modStep === entry.end - 1;
    if (isChordEnd) {
      const nextEntry = arranger6.stepMap[currentChordIdx + 1];
      const isTransition = !nextEntry || nextEntry.chord.sectionId !== entry.chord.sectionId;
      if (isTransition && !groove2.fillActive && playback6.bandIntensity > 0.4) {
        dispatch(ACTIONS.TRIGGER_FILL, {
          steps: {
            0: [
              { name: "Kick", vel: 0.6 },
              { name: "Open", vel: 0.9 }
            ]
          },
          startStep: currentStep,
          length: 1,
          crash: true
        });
      }
    }
  }
  var conductorState;
  var init_conductor = __esm({
    "public/conductor.js"() {
      init_fills();
      init_form_analysis();
      init_persistence();
      init_state();
      init_types();
      init_ui();
      conductorState = {
        target: 0.35,
        stepSize: 5e-4,
        loopCount: 0,
        formIteration: 0,
        // Tracks how many times the ENTIRE song has looped
        form: null,
        larsBpmOffset: 0
      };
    }
  });

  // public/platform.js
  function initPlatform() {
    if (typeof Audio !== "undefined") {
      state.silentAudio = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA== "
      );
      if (state.silentAudio.loop !== void 0) {
        state.silentAudio.loop = true;
      }
    } else {
      state.silentAudio = { pause: () => {
      }, play: () => Promise.resolve(), currentTime: 0 };
    }
  }
  function unlockAudio() {
    if (!state.iosAudioUnlocked && state.silentAudio) {
      state.silentAudio.play().catch(() => {
      });
      state.iosAudioUnlocked = true;
    } else if (state.silentAudio) {
      state.silentAudio.play().catch(() => {
      });
    }
  }
  function lockAudio() {
    if (state.silentAudio) {
      state.silentAudio.pause();
      state.silentAudio.currentTime = 0;
    }
  }
  async function activateWakeLock() {
    if (!("wakeLock" in navigator)) {
      return;
    }
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch {
    }
  }
  function deactivateWakeLock() {
    if (state.wakeLock) {
      state.wakeLock.release();
      state.wakeLock = null;
    }
  }
  var state;
  var init_platform = __esm({
    "public/platform.js"() {
      state = {
        wakeLock: null,
        silentAudio: null,
        iosAudioUnlocked: false
      };
    }
  });

  // public/engine/grooves/utils.js
  function roll(probability, intensity = 1) {
    return Math.random() < probability * intensity;
  }
  function scaleVelocity(base, intensity, factor = 0.2) {
    return base + intensity * factor;
  }
  var INTENSITY_BANDS, DEFAULT_CONFIG;
  var init_utils2 = __esm({
    "public/engine/grooves/utils.js"() {
      INTENSITY_BANDS = {
        LOW: 0.35,
        MID: 0.65,
        HIGH: 0.85
      };
      DEFAULT_CONFIG = {
        entropyMultiplier: 0.15,
        blockAdjacentSnare: false,
        exemptFromPulseShaping: false,
        dillaFeel: false,
        backbeatCrack: false,
        isLatin: false
      };
    }
  });

  // public/engine/grooves/acoustic.js
  var acoustic_exports = {};
  __export(acoustic_exports, {
    applyOverrides: () => applyOverrides,
    config: () => config,
    getMotif: () => getMotif
  });
  function getMotif(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.25) {
      return 0;
    }
    if (seed < 0.5) {
      return 1;
    }
    if (intensity < 0.7) {
      return seed < 0.8 ? 0 : 1;
    }
    if (seed < 0.8) {
      return 2;
    }
    return 3;
  }
  function applyOverrides(context, state2) {
    const {
      inst,
      playback: playback6,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;
    if (inst.name === "Snare") {
      shouldPlay = false;
      soundName = intensity > 0.65 ? "Snare" : "Sidestick";
      if (activeMotif === 2 || activeMotif === 3) {
        if (isBackbeat) {
          shouldPlay = true;
        }
      } else {
        if (isBeatStart && beatIndex === 2) {
          shouldPlay = true;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(0.85, intensity, 0.15) + Math.random() * 0.1;
      }
      if (intensity > 0.8 && activeMotif === 3) {
        if (isAOfBeat && roll(0.25)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.2, intensity, 0.2);
          soundName = "Sidestick";
        }
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (isDownbeat) {
        shouldPlay = true;
      }
      if (intensity > 0.45) {
        if (activeMotif === 0 && isOffbeat && beatIndex === 1) {
          shouldPlay = true;
        }
        if (activeMotif >= 2 && isBeatStart && beatIndex === 2) {
          shouldPlay = true;
        }
      }
      if (intensity > 0.75 && activeMotif === 3) {
        if (isOffbeat && beatIndex === 2 && roll(0.4)) {
          shouldPlay = true;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(0.9, intensity, 0.1);
      }
    } else if (inst.name === "HiHat" || inst.name === "Open") {
      shouldPlay = true;
      if (isBeatStart) {
        velocity = scaleVelocity(0.7, intensity, 0.15);
      } else if (isOffbeat) {
        velocity = scaleVelocity(0.5, intensity, 0.1);
      } else {
        velocity = scaleVelocity(0.3, intensity, 0.1);
        if (intensity < 0.5 && roll(0.4)) {
          shouldPlay = false;
        }
      }
      if (activeMotif === 3 && !isEighthNote) {
        velocity *= 1.2;
      }
    } else if (inst.name === "Shaker" || inst.name === "Tambourine") {
      shouldPlay = isEighthNote;
      if (intensity > 0.6) {
        shouldPlay = true;
      }
      velocity = isBeatStart ? 0.8 : 0.5;
      velocity *= scaleVelocity(0.7, intensity, 0.3);
    }
    if (shouldPlay) {
      if (inst.name === "Snare" && intensity < INTENSITY_BANDS.LOW) {
        soundName = "Sidestick";
      }
      instTimeOffset += (Math.random() - 0.5) * 4e-3;
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config;
  var init_acoustic = __esm({
    "public/engine/grooves/acoustic.js"() {
      init_utils2();
      config = {
        ...DEFAULT_CONFIG,
        entropyMultiplier: 0.08,
        blockAdjacentSnare: true
      };
    }
  });

  // public/engine/grooves/blues.js
  var blues_exports = {};
  __export(blues_exports, {
    applyOverrides: () => applyOverrides2,
    config: () => config2,
    getMotif: () => getMotif2
  });
  function getMotif2(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (intensity < 0.6) {
      return seed < 0.8 ? 0 : 2;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
      if (seed < 0.5) {
        return 0;
      }
      if (seed < 0.8) {
        return 2;
      }
      return 1;
    }
    if (seed < 0.3) {
      return 0;
    }
    if (seed < 0.6) {
      return 2;
    }
    if (seed < 0.75) {
      return 1;
    }
    return 3;
  }
  function applyOverrides2(context, state2) {
    const {
      inst,
      playback: playback6,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif2(sectionSeed, drumComplexity, intensity);
    if (inst.name === "Open" && isDownbeat && intensity > 0.8 && roll(0.25)) {
      shouldPlay = true;
      velocity = 1.2;
      soundName = "Crash";
      return { shouldPlay, velocity, soundName, instTimeOffset };
    }
    if (inst.name === "HiHat" || inst.name === "Open") {
      shouldPlay = false;
      if (activeMotif === 0 || activeMotif === 2 || activeMotif === 3) {
        if (isBeatStart && (beatIndex === 0 || beatIndex === 2) || isOffbeat && (beatIndex === 1 || beatIndex === 3)) {
          shouldPlay = true;
          soundName = activeMotif === 2 ? "Open" : "HiHat";
          if (isOffbeat) {
            velocity = scaleVelocity(0.6, intensity, 0.1);
          } else {
            velocity = scaleVelocity(0.85, intensity, 0.2);
          }
        }
      } else if (activeMotif === 1) {
        if (isBeatStart || isOffbeat) {
          shouldPlay = true;
          velocity = 0.9;
        }
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (isBeatStart && !isBackbeat) {
        shouldPlay = true;
      }
      if (activeMotif === 3 && isOffbeat && beatIndex === 1) {
        shouldPlay = true;
      }
      if (shouldPlay) {
        velocity = 1.15;
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isBackbeat) {
        shouldPlay = true;
        velocity = 1.15;
      }
      if (intensity > 0.6) {
        if (activeMotif === 0 && isAOfBeat && (beatIndex === 0 || beatIndex === 2) && roll(0.4)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.4, intensity, 0.1);
          instTimeOffset += 5e-3;
        }
        if (activeMotif === 3) {
          if (isOffbeat && beatIndex === 3 && roll(0.6)) {
            shouldPlay = true;
            velocity = 0.7;
          }
          if (isOffbeat && beatIndex === 2 && roll(0.4)) {
            shouldPlay = true;
            velocity = 0.5;
          }
        }
      }
    }
    if (shouldPlay && inst.name === "Snare" && intensity < 0.35) {
      soundName = "Sidestick";
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config2;
  var init_blues = __esm({
    "public/engine/grooves/blues.js"() {
      init_utils2();
      config2 = {
        ...DEFAULT_CONFIG,
        entropyMultiplier: 0.08,
        blockAdjacentSnare: true,
        backbeatCrack: false
      };
    }
  });

  // public/engine/grooves/disco.js
  var disco_exports = {};
  __export(disco_exports, {
    applyOverrides: () => applyOverrides3,
    config: () => config3,
    getMotif: () => getMotif3
  });
  function getMotif3(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.25) {
      return 0;
    }
    if (seed < 0.55) {
      return 1;
    }
    if (intensity < 0.7) {
      return seed < 0.8 ? 0 : 1;
    }
    if (seed < 0.8) {
      return 2;
    }
    return 3;
  }
  function applyOverrides3(context, state2) {
    const {
      inst,
      playback: playback6,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      stepsPerBar,
      loopStep
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif3(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;
    if (inst.name === "Kick") {
      shouldPlay = isBeatStart;
      if (shouldPlay) {
        velocity = beatIndex === 0 ? scaleVelocity(1.2, intensity, 0.15) : scaleVelocity(1.1, intensity, 0.1);
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isBackbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.15, intensity, 0.1);
      }
      if (intensity > 0.7 && activeMotif >= 2) {
        if (isAOfBeat && beatIndex >= 3 && roll(0.4, intensity)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.3, intensity, 0.3);
        }
      }
      if (isTurnaround && intensity > 0.65) {
        if (loopStep === stepsPerBar - 1) {
          shouldPlay = true;
          velocity = 1.3;
          soundName = "Snare";
        }
      }
      if (shouldPlay && intensity < INTENSITY_BANDS.LOW) {
        soundName = "Sidestick";
      }
    } else if (inst.name === "HiHat" || inst.name === "Open") {
      shouldPlay = false;
      if (isOffbeat) {
        shouldPlay = true;
        soundName = "Open";
        velocity = scaleVelocity(1.1, intensity, 0.2);
      }
      if (activeMotif === 1 || activeMotif === 3) {
        if (isEighthNote && soundName !== "Open") {
          shouldPlay = true;
          soundName = "HiHat";
          velocity = scaleVelocity(0.8, intensity, 0.15);
        }
      }
      if (activeMotif === 2) {
        if (isOffbeat && beatIndex === 3) {
          shouldPlay = true;
          soundName = "Open";
          velocity = 1.2;
        }
      }
    } else if (inst.name === "Perc" || inst.name.includes("Cowbell")) {
      if (activeMotif === 3) {
        if (isEighthNote) {
          shouldPlay = true;
          velocity = scaleVelocity(0.8, intensity, 0.2);
          soundName = isBeatStart && (beatIndex === 0 || beatIndex === 2) ? "CowbellHigh" : "CowbellLow";
        }
        if (intensity > 0.9 && !isEighthNote && roll(0.3)) {
          shouldPlay = true;
          velocity = 0.6;
          soundName = "CowbellHigh";
        }
      }
    }
    if (shouldPlay) {
      if (inst.name === "Snare" && intensity < 0.35) {
        soundName = "Sidestick";
      }
      if (inst.name === "Open") {
        velocity *= 1.15;
      }
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config3;
  var init_disco = __esm({
    "public/engine/grooves/disco.js"() {
      init_utils2();
      config3 = {
        ...DEFAULT_CONFIG,
        entropyMultiplier: 0.08,
        blockAdjacentSnare: true
      };
    }
  });

  // public/engine/grooves/funk.js
  var funk_exports = {};
  __export(funk_exports, {
    applyOverrides: () => applyOverrides4,
    config: () => config4,
    getMotif: () => getMotif4
  });
  function getMotif4(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (intensity < 0.75) {
      if (seed < 0.4) {
        return 0;
      }
      if (seed < 0.75) {
        return 1;
      }
      return 2;
    }
    if (seed < 0.25) {
      return 0;
    }
    if (seed < 0.5) {
      return 1;
    }
    if (seed < 0.75) {
      return 2;
    }
    return 3;
  }
  function applyOverrides4(context, state2) {
    const {
      inst,
      playback: playback6,
      stepVal,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed,
      isTurnaround
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif4(sectionSeed, drumComplexity, intensity);
    if (inst.name === "Kick" && isDownbeat) {
      shouldPlay = true;
      velocity = scaleVelocity(1.3, intensity, 0.1);
    }
    if (inst.name === "HiHat" || inst.name === "Open") {
      if (isTurnaround && isOffbeat && beatIndex >= 3) {
        shouldPlay = true;
        soundName = "Open";
        velocity = 1.15;
      } else if (shouldPlay) {
        if (isBeatStart) {
          velocity *= 1.1;
        } else if (isEOfBeat || isAOfBeat) {
          velocity *= 0.8;
        }
        const barkProb = intensity > 0.6 ? 0.3 * intensity : 0.05;
        if (activeMotif >= 2 && isOffbeat && (beatIndex === 1 || beatIndex === 2) && roll(barkProb)) {
          soundName = "Open";
          velocity *= 1.1;
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (activeMotif === 0) {
        if (isBackbeat) {
          shouldPlay = true;
        }
        if (stepVal === 0 && isAOfBeat && beatIndex === 1) {
          shouldPlay = true;
          velocity = scaleVelocity(0.12, intensity, 0.1);
        }
      } else if (activeMotif === 1) {
        if (isBackbeat) {
          shouldPlay = true;
        } else if (isAOfBeat && (beatIndex === 0 || beatIndex === 1 || beatIndex === 2) || isOffbeat && beatIndex === 2) {
          shouldPlay = true;
          velocity = scaleVelocity(0.06, intensity, 0.15) + Math.random() * 0.1;
        }
      } else if (activeMotif === 2) {
        if (isBackbeat && beatIndex === 1) {
          shouldPlay = true;
        }
        if (isOffbeat && beatIndex === 3) {
          shouldPlay = true;
          velocity = 1.1;
        }
        if (isAOfBeat && beatIndex === 1 || isEOfBeat && beatIndex === 2) {
          shouldPlay = true;
          velocity = scaleVelocity(0.1, intensity, 0.1);
        }
      } else if (activeMotif === 3) {
        if (isBackbeat) {
          shouldPlay = true;
          velocity = 1.15;
        } else if (isOffbeat && (beatIndex === 0 || beatIndex === 3) || isEOfBeat && (beatIndex === 1 || beatIndex === 2)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.1, intensity, 0.1);
        }
      }
      if (isTurnaround && intensity > 0.75) {
        if (beatIndex >= 3 && !isBeatStart && roll(0.7)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.6, intensity, 0.4);
          if (isAOfBeat) {
            velocity = 1.2;
          }
        }
      }
      if (shouldPlay) {
        if (isBackbeat || isOffbeat && beatIndex >= 3) {
          velocity = Math.max(velocity, 1.1);
        }
        if (intensity < 0.4 && velocity > 0.8) {
          soundName = "Sidestick";
        }
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (activeMotif === 0) {
        if (isBeatStart && !isBackbeat) {
          shouldPlay = true;
        }
        if (isOffbeat && beatIndex === 2 && (drumComplexity > 0.5 || intensity > 0.6)) {
          shouldPlay = true;
        }
      } else if (activeMotif === 1) {
        if (isDownbeat || isOffbeat && (beatIndex === 1 || beatIndex === 2)) {
          shouldPlay = true;
        }
        if (isEOfBeat && beatIndex === 3 && roll(0.5, intensity)) {
          shouldPlay = true;
        }
      } else if (activeMotif === 2) {
        if (isBeatStart && !isBackbeat || isAOfBeat && beatIndex === 2) {
          shouldPlay = true;
        }
      } else if (activeMotif === 3) {
        if (isDownbeat || isAOfBeat && (beatIndex === 0 || beatIndex === 1) || isOffbeat && beatIndex === 2) {
          shouldPlay = true;
        }
        if (intensity > 0.9 && isAOfBeat && beatIndex >= 3) {
          shouldPlay = true;
          velocity = 0.4;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(1.1, intensity, 0.1) + Math.random() * 0.1;
      }
    }
    if (shouldPlay) {
      if (inst.name === "HiHat" || inst.name === "Open") {
        if (stepVal === 2 && intensity > 0.6) {
          velocity = 1;
        } else if (stepVal !== 2 && soundName !== "Open") {
          velocity = Math.min(velocity, scaleVelocity(0.75, intensity, 0.1));
        }
      }
      if (inst.name === "Snare") {
        if (intensity < 0.35) {
          soundName = "Sidestick";
        }
        if (isBackbeat) {
          instTimeOffset -= 4e-3 + intensity * 2e-3;
        }
      }
      if (stepVal === 2) {
        velocity *= 1.1;
      }
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config4;
  var init_funk = __esm({
    "public/engine/grooves/funk.js"() {
      init_utils2();
      config4 = {
        ...DEFAULT_CONFIG,
        backbeatCrack: true
      };
    }
  });

  // public/engine/grooves/jazz.js
  var jazz_exports = {};
  __export(jazz_exports, {
    applyOverrides: () => applyOverrides5,
    config: () => config5,
    getMotif: () => getMotif5
  });
  function getMotif5(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (intensity < 0.6) {
      return seed < 0.75 ? 0 : 1;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
      if (seed < 0.3) {
        return 0;
      }
      if (seed < 0.6) {
        return 1;
      }
      if (seed < 0.85) {
        return 2;
      }
      return 3;
    }
    if (seed < 0.2) {
      return 0;
    }
    if (seed < 0.4) {
      return 1;
    }
    if (seed < 0.6) {
      return 2;
    }
    if (seed < 0.8) {
      return 3;
    }
    return 4;
  }
  function applyOverrides5(context, state2) {
    const {
      inst,
      playback: playback6,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      isEOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      isSoloistBusy,
      stepsPerBar,
      loopStep
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif5(sectionSeed, drumComplexity, intensity);
    const halfBarStep = Math.floor(stepsPerBar / 2);
    const lastBeatIndex = Math.max(1, Math.round(stepsPerBar / 4) - 1);
    if (inst.name === "Open") {
      shouldPlay = false;
      const isSkipBeat = isOffbeat && beatIndex % 2 !== 0;
      const isRideStep = isBeatStart || isSkipBeat;
      if (isTurnaround && loopStep >= halfBarStep) {
      } else if (isRideStep) {
        const rideProb = isSkipBeat ? 0.6 + drumComplexity * 0.3 : 1;
        if (roll(rideProb)) {
          shouldPlay = true;
          if (isBackbeat) {
            velocity = scaleVelocity(0.9, intensity, 0.2);
          } else if (isBeatStart && beatIndex % 2 === 0) {
            velocity = scaleVelocity(0.8, intensity, 0.15);
          } else {
            velocity = 0.6 + drumComplexity * 0.1;
          }
        }
      }
      if (activeMotif === 1 && isOffbeat && beatIndex === 1 || activeMotif === 2 && isBeatStart && beatIndex === 2 || activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex) {
        velocity *= 1.2;
      }
      if (playback6.bpm > 180 && isSkipBeat && roll(0.4)) {
        shouldPlay = false;
      }
    } else if (inst.name === "HiHat") {
      shouldPlay = false;
      if (isBackbeat) {
        shouldPlay = true;
        velocity = 1;
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (isBeatStart) {
        shouldPlay = true;
        velocity = scaleVelocity(0.15, intensity, 0.1);
      }
      if (isTurnaround && isBeatStart && beatIndex === lastBeatIndex) {
        shouldPlay = true;
        velocity = 0.9;
      } else if (activeMotif === 1 && isOffbeat && beatIndex === 1 && sectionSeed > 0.5) {
        shouldPlay = true;
        velocity = scaleVelocity(0.7, intensity, 0.2);
      } else if (activeMotif === 4 && isOffbeat && beatIndex >= 2) {
        shouldPlay = true;
        velocity = scaleVelocity(0.8, Math.random(), 0.2);
      } else if (activeMotif === 0) {
        let bombProb = intensity * 0.15;
        if (isSoloistBusy) {
          bombProb *= 1.5;
        }
        if (playback6.bpm > 170) {
          bombProb *= 0.4;
        }
        if (roll(bombProb) && (isOffbeat && beatIndex % 2 !== 0 || isAOfBeat && beatIndex === lastBeatIndex)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.8, Math.random(), 0.3);
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isTurnaround) {
        if ((isBeatStart || isOffbeat || isAOfBeat) && beatIndex === lastBeatIndex - 1 || isOffbeat && beatIndex === lastBeatIndex) {
          if (roll(0.7)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.6, Math.random(), 0.4);
            if (isOffbeat && beatIndex === lastBeatIndex) {
              velocity = 1.1;
            }
          }
        }
      } else {
        if (activeMotif === 1 && isOffbeat && beatIndex === 1) {
          shouldPlay = true;
          velocity = scaleVelocity(0.7, intensity, 0.3);
        } else if (activeMotif === 2 && (isOffbeat && beatIndex === 0 || isBeatStart && beatIndex === 2)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.6, intensity, 0.3);
        } else if (activeMotif === 3 && isOffbeat && beatIndex === lastBeatIndex) {
          shouldPlay = true;
          velocity = scaleVelocity(0.8, intensity, 0.3);
        } else if (activeMotif === 4 && isAOfBeat && beatIndex < lastBeatIndex) {
          shouldPlay = true;
          velocity = scaleVelocity(0.5, Math.random(), 0.3);
        } else {
          let compProb = 0.1 + drumComplexity * 0.3;
          if (!isSoloistBusy) {
            compProb += 0.2;
          }
          if (playback6.bpm > 175) {
            compProb *= 0.5;
          }
          if (isOffbeat && beatIndex === lastBeatIndex && roll(0.5 + compProb) || isOffbeat && beatIndex === 1 && roll(0.3 + compProb) || isAOfBeat && beatIndex !== 1 && roll(compProb * 0.4)) {
            shouldPlay = true;
            velocity = 0.25 + Math.random() * 0.3 + intensity * 0.2;
          }
        }
      }
      if (shouldPlay && intensity < 0.4) {
        soundName = "Sidestick";
        velocity *= 0.8;
      }
      if (playback6.songMode && playback6.isEndingPending) {
        if ((isEOfBeat && beatIndex === lastBeatIndex || isAOfBeat && beatIndex === lastBeatIndex) && roll(0.7)) {
          shouldPlay = true;
          velocity = 1.1;
          instTimeOffset -= 5e-3;
        }
      }
    }
    if (shouldPlay && inst.name === "Snare" && intensity < 0.35) {
      soundName = "Sidestick";
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config5;
  var init_jazz = __esm({
    "public/engine/grooves/jazz.js"() {
      init_utils2();
      config5 = {
        ...DEFAULT_CONFIG,
        entropyMultiplier: 0.05
      };
    }
  });

  // public/engine/grooves/latin.js
  var latin_exports = {};
  __export(latin_exports, {
    applyOverrides: () => applyOverrides6,
    config: () => config6,
    getMotif: () => getMotif6
  });
  function getMotif6(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.2) {
      return 0;
    }
    if (seed < 0.5) {
      return 1;
    }
    if (intensity < 0.75) {
      return seed < 0.8 ? 0 : 1;
    }
    if (seed < 0.8) {
      return 2;
    }
    return 3;
  }
  function applyOverrides6(context, state2) {
    const {
      step,
      inst,
      playback: playback6,
      groove: groove2,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      isDownbeat,
      isBeatStart,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      beatIndex,
      stepsPerBar,
      tsConfig
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif6(sectionSeed, drumComplexity, intensity);
    const midBeatIndex = tsConfig.isCompound ? Math.floor(tsConfig.grouping.length / 2) : Math.floor(tsConfig.beats / 2);
    const quarterBeatIndex = Math.floor(midBeatIndex / 2);
    const lastBeatIndex = tsConfig.isCompound ? tsConfig.grouping.length - 1 : tsConfig.beats - 1;
    if (inst.name === "Kick") {
      shouldPlay = false;
      if (isDownbeat || isAOfBeat && beatIndex === 0 || isBeatStart && beatIndex === midBeatIndex || isAOfBeat && beatIndex === midBeatIndex) {
        shouldPlay = true;
        velocity = isBeatStart ? scaleVelocity(1.1, intensity, 0.1) : scaleVelocity(0.85, intensity, 0.1);
      }
      if (intensity > 0.75 && (activeMotif === 2 || activeMotif === 3)) {
        if (isAOfBeat && (beatIndex === midBeatIndex - 1 || beatIndex === lastBeatIndex)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.7, intensity, 0.2);
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      soundName = "Sidestick";
      if (activeMotif === 0) {
        if (isDownbeat || isAOfBeat && beatIndex === 0 || isOffbeat && beatIndex === quarterBeatIndex || isOffbeat && beatIndex === midBeatIndex || isEOfBeat && beatIndex === lastBeatIndex) {
          shouldPlay = true;
        }
      } else if (activeMotif === 1) {
        if (isOffbeat && beatIndex === 0 || isEOfBeat && beatIndex === quarterBeatIndex || isBeatStart && beatIndex === midBeatIndex || isAOfBeat && beatIndex === midBeatIndex || isOffbeat && beatIndex === lastBeatIndex) {
          shouldPlay = true;
        }
      } else if (activeMotif === 2) {
        if (isDownbeat || isBeatStart && beatIndex === quarterBeatIndex || isAOfBeat && beatIndex === quarterBeatIndex || isBeatStart && beatIndex === midBeatIndex || isAOfBeat && beatIndex === midBeatIndex || isEOfBeat && beatIndex === lastBeatIndex || isAOfBeat && beatIndex === lastBeatIndex) {
          shouldPlay = true;
        }
      } else if (activeMotif === 3) {
        if (isDownbeat || isAOfBeat && beatIndex === 0 || isOffbeat && beatIndex === quarterBeatIndex || isOffbeat && beatIndex === midBeatIndex || isBeatStart && beatIndex === lastBeatIndex) {
          shouldPlay = true;
        }
      }
      if (isTurnaround && intensity > 0.8) {
        if (beatIndex === lastBeatIndex) {
          shouldPlay = true;
          velocity = 1 + Math.random() * 0.2;
          soundName = "Snare";
        }
      }
      if (shouldPlay) {
        velocity = 0.9 + intensity * 0.1 + Math.random() * 0.2;
        if (intensity > 0.85 && roll(0.4)) {
          soundName = "Snare";
          velocity *= 1.15;
        }
      }
      if (groove2.lastDrumPreset === "Bossa Nova") {
        soundName = "Sidestick";
        const bossaStep = step % (stepsPerBar * 2);
        const isFirstBar = bossaStep < stepsPerBar;
        if (isFirstBar) {
          if (isDownbeat || isAOfBeat && beatIndex === 0 || isOffbeat && beatIndex === quarterBeatIndex || isOffbeat && beatIndex === midBeatIndex || isEOfBeat && beatIndex === lastBeatIndex) {
            shouldPlay = true;
            velocity = scaleVelocity(0.9, intensity, 0.15);
          }
        } else {
          if (isBeatStart && beatIndex === 0 || isAOfBeat && beatIndex === 0 || isOffbeat && beatIndex === quarterBeatIndex || isEOfBeat && beatIndex === midBeatIndex || isEOfBeat && beatIndex === lastBeatIndex) {
            shouldPlay = true;
            velocity = scaleVelocity(0.9, intensity, 0.15);
          }
        }
      }
    } else if (inst.name === "Shaker") {
      shouldPlay = true;
      velocity = isBeatStart || isOffbeat ? scaleVelocity(0.8, intensity, 0.15) : scaleVelocity(0.4, intensity, 0.3);
      if (isBeatStart) {
        velocity *= 1.15;
      }
    } else if (inst.name === "Conga") {
      if (isBeatStart && beatIndex === quarterBeatIndex || isAOfBeat && beatIndex === midBeatIndex || isBeatStart && beatIndex === lastBeatIndex || isAOfBeat && beatIndex === lastBeatIndex) {
        shouldPlay = true;
        if (isBeatStart && beatIndex === lastBeatIndex) {
          soundName = "CongaHighSlap";
          velocity = scaleVelocity(0.8, intensity, 0.25);
        } else if (isAOfBeat && beatIndex === lastBeatIndex) {
          soundName = "CongaHigh";
          velocity = scaleVelocity(0.7, intensity, 0.1);
        } else {
          soundName = "CongaHighMute";
          velocity = 0.6;
        }
      }
    } else if (inst.name === "Agogo" || inst.name.includes("Cowbell")) {
      if (intensity > 0.8 && (activeMotif === 2 || activeMotif === 3)) {
        if ((isAOfBeat && beatIndex === 0 || isOffbeat && beatIndex === quarterBeatIndex || isAOfBeat && beatIndex === midBeatIndex || isOffbeat && beatIndex === lastBeatIndex) && roll(0.25, intensity)) {
          shouldPlay = true;
          velocity = 0.9;
          soundName = beatIndex < midBeatIndex ? "CowbellHigh" : "CowbellLow";
        }
      }
    }
    if (shouldPlay && inst.name === "Snare" && intensity < INTENSITY_BANDS.LOW) {
      soundName = "Sidestick";
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config6;
  var init_latin = __esm({
    "public/engine/grooves/latin.js"() {
      init_utils2();
      config6 = {
        ...DEFAULT_CONFIG,
        isLatin: true
      };
    }
  });

  // public/engine/grooves/neo-soul.js
  var neo_soul_exports = {};
  __export(neo_soul_exports, {
    applyOverrides: () => applyOverrides7,
    config: () => config7,
    getMotif: () => getMotif7
  });
  function getMotif7(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.3) {
      return 0;
    }
    if (seed < 0.6) {
      return 1;
    }
    if (intensity < 0.7) {
      return seed < 0.8 ? 0 : 1;
    }
    if (seed < 0.8) {
      return 2;
    }
    return 3;
  }
  function applyOverrides7(context, state2) {
    const {
      inst,
      playback: playback6,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed,
      isTurnaround
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif7(sectionSeed, drumComplexity, intensity);
    const snareDrag = 4e-3 + intensity * 8e-3;
    const hiHatPush = -6e-3 - intensity * 9e-3;
    if (inst.name === "HiHat" || inst.name === "Open") {
      instTimeOffset += hiHatPush;
    } else if (inst.name === "Snare") {
      instTimeOffset += snareDrag;
    } else if (inst.name === "Kick") {
      instTimeOffset += 5e-3;
    }
    if (inst.muted) {
      return state2;
    }
    const drunkenFactor = intensity * 0.015;
    if (!isBackbeat && !isBeatStart) {
      instTimeOffset += (Math.random() - 0.5) * drunkenFactor;
    }
    if (inst.name === "HiHat" || inst.name === "Open") {
      if (shouldPlay) {
        if (!isBeatStart && !isOffbeat) {
          velocity *= 0.75 - intensity * 0.1;
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (activeMotif === 1 || activeMotif === 3) {
        if (isBackbeat) {
          shouldPlay = true;
          velocity = scaleVelocity(1.05, intensity, 0.1);
        } else if (isAOfBeat) {
          shouldPlay = true;
          velocity = scaleVelocity(0.15, intensity, 0.15) + Math.random() * 0.1;
        }
      } else {
        if (isBackbeat) {
          shouldPlay = true;
        }
      }
      if (isTurnaround && intensity > 0.6) {
        if (beatIndex >= 3 && !isBeatStart && roll(0.6)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.3, intensity, 0.3);
          instTimeOffset += 0.01;
        }
      }
      if (shouldPlay && intensity < 0.35) {
        soundName = "Sidestick";
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (activeMotif === 0) {
        if (isDownbeat || isOffbeat && beatIndex === 2) {
          shouldPlay = true;
        }
      } else if (activeMotif === 2) {
        if (isDownbeat || isAOfBeat && beatIndex === 1 || isOffbeat && beatIndex === 2 || isAOfBeat && beatIndex === 3) {
          shouldPlay = true;
        }
      } else {
        if (isBeatStart && !isBackbeat) {
          shouldPlay = true;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(1.1, intensity, 0.1);
      }
    }
    if (shouldPlay) {
      const dampening = 0.65 + intensity * 0.15;
      velocity *= dampening;
      if (inst.name === "Snare" && intensity < INTENSITY_BANDS.LOW) {
        soundName = "Sidestick";
      }
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config7;
  var init_neo_soul = __esm({
    "public/engine/grooves/neo-soul.js"() {
      init_utils2();
      config7 = {
        ...DEFAULT_CONFIG,
        dillaFeel: true
      };
    }
  });

  // public/engine/grooves/reggae.js
  var reggae_exports = {};
  __export(reggae_exports, {
    applyOverrides: () => applyOverrides8,
    config: () => config8,
    getMotif: () => getMotif8
  });
  function getMotif8(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.06) {
      return 0;
    }
    if (seed < 0.15) {
      return 1;
    }
    if (intensity < INTENSITY_BANDS.MID) {
      return seed < 0.98 ? 0 : 1;
    }
    if (seed < 0.6) {
      return 1;
    }
    if (seed < 0.85) {
      return 2;
    }
    return 3;
  }
  function applyOverrides8(context, state2) {
    const {
      inst,
      playback: playback6,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      isDownbeat,
      isBeatStart,
      isOffbeat,
      isAOfBeat,
      beatIndex,
      tsConfig
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif8(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;
    const midBeatIndex = tsConfig.isCompound ? Math.floor(tsConfig.grouping.length / 2) : Math.floor(tsConfig.beats / 2);
    const lastBeatIndex = tsConfig.isCompound ? tsConfig.grouping.length - 1 : tsConfig.beats - 1;
    if (inst.name === "Kick") {
      shouldPlay = false;
      if (activeMotif === 0) {
        if (isBeatStart && beatIndex === midBeatIndex) {
          shouldPlay = true;
        }
      } else if (activeMotif === 1) {
        if (isBeatStart) {
          shouldPlay = true;
        }
      } else if (activeMotif === 2) {
        if (isBeatStart || isOffbeat && beatIndex === lastBeatIndex) {
          shouldPlay = true;
          if (isOffbeat && beatIndex === lastBeatIndex) {
            velocity = 0.85;
          }
        }
      } else {
        if (isDownbeat || isAOfBeat && (beatIndex === 0 || beatIndex === midBeatIndex || beatIndex === lastBeatIndex) || isBeatStart && beatIndex === midBeatIndex) {
          shouldPlay = true;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(1.1, intensity, 0.15);
        if (isBeatStart && beatIndex === midBeatIndex) {
          instTimeOffset += 5e-3;
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isBeatStart && beatIndex === midBeatIndex) {
        shouldPlay = true;
        velocity = scaleVelocity(1.2, intensity, 0.1);
        soundName = intensity > 0.65 ? "Snare" : "Sidestick";
      }
      if (activeMotif === 3) {
        if ((isAOfBeat && (beatIndex === 0 || beatIndex === midBeatIndex) || isOffbeat && (beatIndex === 1 || beatIndex === lastBeatIndex)) && roll(0.3, intensity)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.4, intensity, 0.3);
          soundName = "Sidestick";
        }
      }
      if (isTurnaround && intensity > 0.75) {
        if (isAOfBeat && beatIndex === lastBeatIndex && roll(0.4)) {
          shouldPlay = true;
          velocity = 0.9;
          instTimeOffset -= 0.01;
        }
      }
      if (shouldPlay && soundName === "Sidestick" && intensity > 0.8) {
        velocity *= 1.15;
      }
    } else if (inst.name === "HiHat" || inst.name === "Open") {
      shouldPlay = false;
      if (isEighthNote) {
        shouldPlay = true;
        velocity = isBeatStart ? 0.9 : 0.7;
        if (activeMotif === 3 && intensity > 0.8 && roll(0.4)) {
          shouldPlay = true;
          velocity = 0.4;
        }
      }
      if (isOffbeat && beatIndex === lastBeatIndex && intensity > 0.7 && roll(0.25)) {
        shouldPlay = true;
        soundName = "Open";
        velocity = 1.1;
      }
    }
    if (shouldPlay && inst.name === "Snare" && intensity < INTENSITY_BANDS.LOW) {
      soundName = "Sidestick";
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config8;
  var init_reggae = __esm({
    "public/engine/grooves/reggae.js"() {
      init_utils2();
      config8 = {
        ...DEFAULT_CONFIG
      };
    }
  });

  // public/engine/grooves/rock.js
  var rock_exports = {};
  __export(rock_exports, {
    applyOverrides: () => applyOverrides9,
    config: () => config9,
    getMotif: () => getMotif9
  });
  function getMotif9(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (intensity < 0.6) {
      return seed < 0.75 ? 0 : 2;
    }
    if (intensity < INTENSITY_BANDS.HIGH) {
      if (seed < 0.4) {
        return 0;
      }
      if (seed < 0.7) {
        return 2;
      }
      return 1;
    }
    if (seed < 0.25) {
      return 0;
    }
    if (seed < 0.5) {
      return 1;
    }
    if (seed < 0.75) {
      return 2;
    }
    return 3;
  }
  function applyOverrides9(context, state2) {
    const {
      inst,
      playback: playback6,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      beatIndex,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      stepsPerBar,
      loopStep
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif9(sectionSeed, drumComplexity, intensity);
    const halfBarStep = Math.floor(stepsPerBar / 2);
    const safeIsOffbeat = isOffbeat !== void 0 ? isOffbeat : loopStep % (stepsPerBar / 8) === 2;
    const isEighthNote = isBeatStart || safeIsOffbeat;
    if (inst.name === "HiHat" || inst.name === "Open") {
      if (isTurnaround && loopStep >= halfBarStep) {
        shouldPlay = false;
      } else if (!shouldPlay) {
        if (isEighthNote) {
          shouldPlay = true;
          velocity = isBeatStart ? 1.05 : 0.85;
          if (intensity > 0.7) {
            soundName = "Open";
            velocity *= 1.1;
          } else {
            soundName = "HiHat";
          }
        }
      }
    } else if (inst.name === "Kick") {
      if (!shouldPlay) {
        shouldPlay = false;
        if (isBeatStart && !isBackbeat) {
          shouldPlay = true;
        } else {
          if (activeMotif === 1) {
            if (safeIsOffbeat && (beatIndex === 1 || beatIndex === 2)) {
              shouldPlay = true;
            }
          } else if (activeMotif === 2) {
            if (safeIsOffbeat && beatIndex === 2) {
              shouldPlay = true;
            }
          } else if (activeMotif === 3) {
            if (safeIsOffbeat && (beatIndex === 1 || beatIndex === 3)) {
              shouldPlay = true;
            }
          }
        }
        if (shouldPlay) {
          velocity = isDownbeat ? 1.25 : 1.1;
        }
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isBackbeat) {
        shouldPlay = true;
      }
      if (isTurnaround && loopStep >= halfBarStep && drumComplexity > 0.5) {
        if (isEighthNote && roll(0.4)) {
          shouldPlay = true;
          velocity = scaleVelocity(0.8, Math.random(), 0.2);
        }
      } else if (drumComplexity > 0.5) {
        if (!shouldPlay && (isAOfBeat && beatIndex === 1 || isEOfBeat && beatIndex === 2)) {
          if (intensity > 0.4 && intensity < 0.8 && roll(0.12)) {
            shouldPlay = true;
            velocity = scaleVelocity(0.25, Math.random(), 0.2);
          }
        }
      }
      if (shouldPlay) {
        if (isBackbeat) {
          velocity = 1.15;
        }
        if (intensity < 0.25) {
          soundName = "Sidestick";
        }
      }
    } else if (inst.name.includes("Tom")) {
      if (isTurnaround && loopStep >= halfBarStep && drumComplexity > 0.5) {
        if (isEighthNote && roll(0.6)) {
          shouldPlay = true;
          velocity = 1.1;
        }
      }
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config9;
  var init_rock = __esm({
    "public/engine/grooves/rock.js"() {
      init_utils2();
      config9 = {
        ...DEFAULT_CONFIG,
        entropyMultiplier: 0.06,
        blockAdjacentSnare: true,
        backbeatCrack: true
      };
    }
  });

  // public/engine/grooves/ska-punk.js
  var ska_punk_exports = {};
  __export(ska_punk_exports, {
    applyOverrides: () => applyOverrides10,
    config: () => config10,
    getMotif: () => getMotif10
  });
  function getMotif10(seed, complexity, intensity = 1) {
    if (complexity < 0.3 || intensity < INTENSITY_BANDS.LOW) {
      return 0;
    }
    if (seed < 0.25) {
      return 0;
    }
    if (seed < 0.55) {
      return 1;
    }
    if (intensity < 0.7) {
      return seed < 0.8 ? 0 : 1;
    }
    if (seed < 0.8) {
      return 2;
    }
    return 3;
  }
  function applyOverrides10(context, state2) {
    const {
      inst,
      playback: playback6,
      drumComplexity,
      sectionSeed,
      isTurnaround,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      isOffbeat,
      isAOfBeat,
      beatIndex
    } = context;
    let { shouldPlay, velocity, soundName, instTimeOffset } = state2;
    if (inst.muted) {
      return state2;
    }
    const intensity = playback6.bandIntensity;
    const activeMotif = getMotif10(sectionSeed, drumComplexity, intensity);
    const isEighthNote = isBeatStart || isOffbeat;
    instTimeOffset -= 5e-3 + intensity * 7e-3;
    if (inst.name === "HiHat" || inst.name === "Open") {
      shouldPlay = false;
      if (isOffbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.3, intensity, 0.2);
        if (intensity > 0.6 && roll(0.4, intensity)) {
          soundName = "Open";
        }
      } else if (activeMotif >= 1 && isEighthNote) {
        shouldPlay = true;
        velocity = scaleVelocity(0.85, intensity, 0.1);
      }
      if (isDownbeat && intensity > 0.85 && roll(0.3)) {
        shouldPlay = true;
        soundName = "Open";
        velocity = 1.4;
      }
    } else if (inst.name === "Kick") {
      shouldPlay = false;
      if (activeMotif === 0) {
        if (isBeatStart && !isBackbeat) {
          shouldPlay = true;
        }
      } else if (activeMotif === 1) {
        if (isBeatStart) {
          shouldPlay = true;
        }
      } else if (activeMotif === 2) {
        if (isBeatStart && !isBackbeat || isAOfBeat && (beatIndex === 0 || beatIndex === 2) || isOffbeat && (beatIndex === 1 || beatIndex === 3)) {
          shouldPlay = true;
        }
      } else if (activeMotif === 3) {
        if (isEighthNote) {
          shouldPlay = true;
        }
      }
      if (shouldPlay) {
        velocity = scaleVelocity(1.2, intensity, 0.15);
      }
    } else if (inst.name === "Snare") {
      shouldPlay = false;
      if (isBackbeat) {
        shouldPlay = true;
        velocity = scaleVelocity(1.15, intensity, 0.15);
      }
      if (isTurnaround && intensity > 0.7) {
        if (beatIndex >= 3 && !isBeatStart) {
          shouldPlay = true;
          velocity = 1.1;
        }
      }
      if (shouldPlay) {
        soundName = intensity > 0.35 ? "Snare" : "Sidestick";
      }
    }
    return { shouldPlay, velocity, soundName, instTimeOffset };
  }
  var config10;
  var init_ska_punk = __esm({
    "public/engine/grooves/ska-punk.js"() {
      init_utils2();
      config10 = {
        ...DEFAULT_CONFIG,
        exemptFromPulseShaping: true
      };
    }
  });

  // public/engine/groove-engine.js
  function getStrategy(groove2) {
    const isLatinStyle = groove2.genreFeel === "Bossa Nova" || ["Bossa Nova", "Latin/Salsa", "Afro-Cuban 6/8", "Samba"].includes(groove2.lastDrumPreset) || groove2.lastSmartGenre === "Bossa";
    if (isLatinStyle) {
      return latin_exports;
    }
    return strategies[groove2.genreFeel] || null;
  }
  function humanizeVelocity(vel, amount = 0.05) {
    return vel * (1 + (Math.random() - 0.5) * amount);
  }
  function applyGrooveOverrides({
    step,
    inst,
    stepVal,
    playback: playback6,
    groove: groove2,
    isDownbeat,
    isBeatStart,
    isGroupStart,
    isBackbeat,
    isOffbeat,
    isEOfBeat,
    isAOfBeat,
    beatIndex,
    tsConfig
  }) {
    const { soloist: soloist2 } = getState();
    const stateObj = getState();
    const arrangerState = stateObj?.arranger || { timeSignature: "4/4" };
    const stepsPerBar = getStepsPerMeasure(arrangerState.timeSignature);
    const loopStep = step % stepsPerBar;
    let currentState = {
      shouldPlay: stepVal > 0,
      velocity: stepVal === 2 ? 1.25 : 0.9,
      soundName: inst.name,
      instTimeOffset: 0
    };
    const strategy = getStrategy(groove2);
    const config11 = strategy ? strategy.config : DEFAULT_CONFIG;
    let pulseWeight = 1;
    if ((inst.name === "HiHat" || inst.name === "Open") && !config11.exemptFromPulseShaping) {
      const isSyncopated = loopStep % 2 === 1;
      if (isOffbeat) {
        pulseWeight = 0.85;
      } else if (isSyncopated) {
        pulseWeight = 0.7;
      }
    }
    const drumComplexity = groove2.creativity ? 0.8 : 0.3;
    const barIndex = Math.floor(step / stepsPerBar);
    const prevBarIndex = Math.floor((step - 1) / stepsPerBar);
    const isFirstStepOfNewBar = loopStep === 0 && barIndex !== prevBarIndex;
    const sectionEntry = arrangerState.sectionMap?.find((e3) => step >= e3.start && step < e3.end);
    let measuresInSection = 4;
    let startStep = 0;
    if (sectionEntry) {
      measuresInSection = Math.max(1, (sectionEntry.end - sectionEntry.start) / stepsPerBar);
      startStep = sectionEntry.start;
    }
    const barInSection = Math.floor((step - startStep) / stepsPerBar);
    const isTurnaround = groove2.creativity && measuresInSection > 1 && barInSection % measuresInSection === measuresInSection - 1;
    const prevStep = step - stepsPerBar;
    const prevSectionEntry = arrangerState.sectionMap?.find(
      (e3) => prevStep >= e3.start && prevStep < e3.end
    );
    let prevMeasuresInSection = 4;
    let prevStartStep = 0;
    if (prevSectionEntry) {
      prevMeasuresInSection = Math.max(
        1,
        (prevSectionEntry.end - prevSectionEntry.start) / stepsPerBar
      );
      prevStartStep = prevSectionEntry.start;
    } else {
      prevMeasuresInSection = measuresInSection;
      prevStartStep = startStep;
    }
    const prevBarInSection = Math.floor((prevStep - prevStartStep) / stepsPerBar);
    const prevWasTurnaround = groove2.creativity && prevMeasuresInSection > 1 && barIndex > 0 && prevBarInSection % prevMeasuresInSection === prevMeasuresInSection - 1;
    const justFinishedTurnaround = prevWasTurnaround && isFirstStepOfNewBar;
    const chordEntry = arrangerState.stepMap?.find((e3) => step >= e3.start && step < e3.end);
    const sectionId = chordEntry?.chord?.sectionId;
    let sectionSeed = groove2.sectionSeedMap?.[sectionId];
    if (sectionSeed === void 0) {
      sectionSeed = (barIndex * 137 + (groove2.creativity ? 42 : 0)) % 256 / 256;
    }
    if (justFinishedTurnaround && isDownbeat) {
      if (inst.name === "Kick") {
        currentState.shouldPlay = true;
        currentState.velocity = 1.35;
      } else if (inst.name === "HiHat" || inst.name === "Open") {
        currentState.shouldPlay = true;
        if (playback6.bandIntensity > 0.45) {
          currentState.soundName = "Open";
          currentState.velocity = 1.2;
        } else {
          currentState.soundName = "HiHat";
          currentState.velocity = 1.1;
        }
      }
    }
    const context = {
      step,
      inst,
      stepVal,
      playback: playback6,
      groove: groove2,
      isDownbeat,
      isBeatStart,
      isGroupStart,
      isBackbeat,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      beatIndex,
      tsConfig,
      stepsPerBar,
      loopStep,
      drumComplexity,
      barIndex,
      isFirstStepOfNewBar,
      sectionSeed,
      isTurnaround,
      isSoloistBusy: soloist2.enabled && soloist2.busySteps > 0
    };
    if (strategy) {
      currentState = strategy.applyOverrides(context, currentState);
    }
    if (groove2.creativity && !currentState.shouldPlay && Math.random() < playback6.bandIntensity * config11.entropyMultiplier * (config11.blockAdjacentSnare && groove2.genreFeel !== "Rock" ? 0.7 : 1)) {
      const isSyncopated = loopStep % 2 === 1;
      const subdivision = stepsPerBar / (arrangerState.timeSignature.includes("/8") ? 2 : 4);
      const isHeavySync = loopStep % subdivision === Math.floor(subdivision / 2);
      let isBackbeatAdjacent = false;
      let isEOfBeatCheck = false;
      if (arrangerState.timeSignature === "4/4") {
        isBackbeatAdjacent = [3, 5, 11, 13].includes(loopStep);
        isEOfBeatCheck = [1, 9].includes(loopStep);
      }
      const blockSnare = config11.blockAdjacentSnare && (isBackbeatAdjacent || isEOfBeatCheck);
      if (inst.name === "Snare" && isSyncopated && !blockSnare && !config11.isLatin) {
        currentState.shouldPlay = true;
        currentState.velocity = 0.1 + Math.random() * 0.15;
        currentState.soundName = playback6.bandIntensity < 0.4 ? "Sidestick" : "Snare";
      } else if ((inst.name === "HiHat" || inst.name === "Open") && isHeavySync && !config11.blockAdjacentSnare) {
        currentState.shouldPlay = true;
        currentState.velocity = 0.2 + Math.random() * 0.2;
        currentState.soundName = "HiHat";
      }
    }
    if (currentState.shouldPlay && !inst.muted) {
      if (inst.name === "HiHat" || inst.name === "Open") {
        currentState.velocity *= pulseWeight;
      }
      if (inst.name === "Snare" && isBackbeat && config11.backbeatCrack) {
        currentState.velocity *= 1.15;
      }
      const jitterAmount = inst.name === "Kick" ? 0.04 : 0.08;
      currentState.velocity = humanizeVelocity(currentState.velocity, jitterAmount);
    }
    return currentState;
  }
  function calculatePocketOffset(playback6, groove2) {
    let pocketOffset = calculateTimingOffset("drums", groove2.pocket, playback6.bandIntensity);
    const strategy = getStrategy(groove2);
    if (strategy?.config.dillaFeel) {
      pocketOffset += 0.015;
    }
    return pocketOffset;
  }
  function getDrumMotif(seed, genreFeel, complexity, intensity = 1) {
    const mockGroove = { genreFeel };
    const strategy = getStrategy(mockGroove);
    if (strategy?.getMotif) {
      return strategy.getMotif(seed, complexity, intensity);
    }
    return 0;
  }
  var strategies;
  var init_groove_engine = __esm({
    "public/engine/groove-engine.js"() {
      init_config();
      init_state();
      init_utils();
      init_acoustic();
      init_blues();
      init_disco();
      init_funk();
      init_jazz();
      init_latin();
      init_neo_soul();
      init_reggae();
      init_rock();
      init_ska_punk();
      init_utils2();
      strategies = {
        Jazz: jazz_exports,
        Blues: blues_exports,
        Rock: rock_exports,
        Funk: funk_exports,
        "Neo-Soul": neo_soul_exports,
        "Hip Hop": neo_soul_exports,
        Acoustic: acoustic_exports,
        Disco: disco_exports,
        Reggae: reggae_exports,
        "Bossa Nova": latin_exports,
        Latin: latin_exports,
        "Ska-Punk": ska_punk_exports
      };
    }
  });

  // public/soloist-config.js
  var STYLE_CONFIG, STYLE_EMPHASIS, GENRE_STYLE_MAPPING;
  var init_soloist_config = __esm({
    "public/soloist-config.js"() {
      STYLE_CONFIG = {
        scalar: {
          genreGravityOffset: 0,
          restBase: 0.1,
          tensionScale: 0.6,
          timingJitter: 8,
          maxNotesPerPhrase: 24,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.1,
          anticipationProb: 0.1,
          targetExtensions: [2, 9],
          deviceProb: 0.12,
          allowedDevices: ["run", "slide", "guitarDouble"],
          rhythmicDensity: 0.5,
          syncopationLikelihood: 0.2,
          targetAnchoring: 0.8,
          chromaticism: 0.1,
          contourSkeletons: [
            [
              { interval: 1, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 4 },
              { interval: -1, durationSteps: 2 },
              { interval: 1, durationSteps: 2 }
            ],
            [
              { interval: -1, durationSteps: 2 },
              { interval: -2, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ]
          ]
        },
        shred: {
          genreGravityOffset: 0,
          restBase: 0.05,
          tensionScale: 0.3,
          timingJitter: 4,
          maxNotesPerPhrase: 64,
          minNotesPerPhrase: 8,
          doubleStopProb: 0.05,
          anticipationProb: 0.05,
          targetExtensions: [2],
          deviceProb: 0.4,
          allowedDevices: ["run", "guitarDouble"],
          rhythmicDensity: 0.9,
          syncopationLikelihood: 0.4,
          targetAnchoring: 0.4,
          chromaticism: 0.5,
          contourSkeletons: [
            [
              { interval: 1, durationSteps: 1 },
              { interval: 2, durationSteps: 1 },
              { interval: 3, durationSteps: 1 },
              { interval: 4, durationSteps: 1 }
            ],
            [
              { interval: -1, durationSteps: 1 },
              { interval: 1, durationSteps: 1 },
              { interval: -2, durationSteps: 1 },
              { interval: 0, durationSteps: 1 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 2 },
              { interval: 6, durationSteps: 2 },
              { interval: 7, durationSteps: 2 }
            ]
          ]
        },
        blues: {
          genreGravityOffset: 0,
          restBase: 0.15,
          tensionScale: 0.8,
          timingJitter: 25,
          maxNotesPerPhrase: 24,
          minNotesPerPhrase: 3,
          doubleStopProb: 0.35,
          anticipationProb: 0.3,
          targetExtensions: [9, 10],
          deviceProb: 0.4,
          allowedDevices: ["bluesLick", "slide", "guitarDouble"],
          rhythmicDensity: 0.6,
          syncopationLikelihood: 0.8,
          targetAnchoring: 0.9,
          chromaticism: 0.6,
          contourSkeletons: [
            [
              { interval: 3, durationSteps: 2 },
              { interval: 4, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: 0, durationSteps: 2 },
              { interval: -2, durationSteps: 2 },
              { interval: -3, durationSteps: 4 }
            ],
            [
              { interval: 5, durationSteps: 2 },
              { interval: 6, durationSteps: 1 },
              { interval: 7, durationSteps: 5 }
            ]
          ]
        },
        neo: {
          genreGravityOffset: 0.015,
          restBase: 0.12,
          tensionScale: 0.7,
          timingJitter: 25,
          maxNotesPerPhrase: 24,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.15,
          anticipationProb: 0.45,
          targetExtensions: [2, 6, 9, 11],
          deviceProb: 0.25,
          allowedDevices: ["quartal", "slide", "guitarDouble"],
          rhythmicDensity: 0.5,
          syncopationLikelihood: 0.9,
          targetAnchoring: 0.6,
          chromaticism: 0.4,
          contourSkeletons: [
            [
              { interval: 2, durationSteps: 3 },
              { interval: 4, durationSteps: 1 },
              { interval: 6, durationSteps: 4 }
            ],
            [
              { interval: 1, durationSteps: 2 },
              { interval: 3, durationSteps: 4 },
              { interval: 0, durationSteps: 2 }
            ],
            [
              { interval: 4, durationSteps: 4 },
              { interval: 2, durationSteps: 2 },
              { interval: -1, durationSteps: 2 }
            ]
          ]
        },
        funk: {
          genreGravityOffset: -5e-3,
          restBase: 0.1,
          tensionScale: 0.4,
          timingJitter: 5,
          maxNotesPerPhrase: 32,
          minNotesPerPhrase: 3,
          doubleStopProb: 0.15,
          anticipationProb: 0.2,
          targetExtensions: [9, 13],
          deviceProb: 0.2,
          allowedDevices: ["slide", "run"],
          rhythmicDensity: 0.8,
          syncopationLikelihood: 0.9,
          targetAnchoring: 0.7,
          chromaticism: 0.3,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 1 },
              { interval: 0, durationSteps: 1 },
              { interval: 2, durationSteps: 2 }
            ],
            [
              { interval: 3, durationSteps: 1 },
              { interval: 0, durationSteps: 1 },
              { interval: -2, durationSteps: 2 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: 1, durationSteps: 1 },
              { interval: 0, durationSteps: 1 }
            ]
          ]
        },
        hiphop: {
          genreGravityOffset: 0.015,
          restBase: 0.15,
          tensionScale: 0.6,
          timingJitter: 20,
          maxNotesPerPhrase: 16,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.1,
          anticipationProb: 0.3,
          targetExtensions: [2, 9, 11],
          deviceProb: 0.3,
          allowedDevices: ["bluesLick", "slide", "quartal"],
          rhythmicDensity: 0.6,
          syncopationLikelihood: 0.7,
          targetAnchoring: 0.8,
          chromaticism: 0.2,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 4 },
              { interval: 1, durationSteps: 2 },
              { interval: 0, durationSteps: 2 }
            ],
            [
              { interval: -1, durationSteps: 2 },
              { interval: 0, durationSteps: 6 }
            ]
          ]
        },
        minimal: {
          genreGravityOffset: 0,
          restBase: 0.3,
          tensionScale: 0.95,
          timingJitter: 35,
          maxNotesPerPhrase: 8,
          minNotesPerPhrase: 1,
          doubleStopProb: 0,
          anticipationProb: 0.25,
          targetExtensions: [2, 9, 11],
          deviceProb: 0.15,
          allowedDevices: ["slide", "enclosure"],
          rhythmicDensity: 0.3,
          syncopationLikelihood: 0.3,
          targetAnchoring: 0.95,
          chromaticism: 0.1,
          contourSkeletons: [
            [{ interval: 0, durationSteps: 8 }],
            [
              { interval: 2, durationSteps: 4 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: -1, durationSteps: 4 },
              { interval: 0, durationSteps: 4 }
            ]
          ]
        },
        bird: {
          genreGravityOffset: 0,
          restBase: 0.05,
          tensionScale: 0.9,
          timingJitter: 12,
          maxNotesPerPhrase: 48,
          minNotesPerPhrase: 4,
          doubleStopProb: 0.15,
          anticipationProb: 0.8,
          targetExtensions: [2, 5, 6, 9],
          deviceProb: 0.4,
          allowedDevices: ["enclosure", "run", "birdFlurry", "guitarDouble", "chromaticFall"],
          rhythmicDensity: 0.95,
          syncopationLikelihood: 0.7,
          targetAnchoring: 0.3,
          chromaticism: 0.9,
          contourSkeletons: [
            [
              { interval: 1, durationSteps: 2 },
              { interval: 3, durationSteps: 2 },
              { interval: 5, durationSteps: 2 },
              { interval: 7, durationSteps: 2 }
            ],
            [
              { interval: 2, durationSteps: 1 },
              { interval: 1, durationSteps: 1 },
              { interval: 0, durationSteps: 1 },
              { interval: -1, durationSteps: 1 }
            ],
            [
              { interval: -2, durationSteps: 2 },
              { interval: 0, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 2 }
            ]
          ]
        },
        disco: {
          genreGravityOffset: 0,
          restBase: 0.1,
          tensionScale: 0.5,
          timingJitter: 8,
          maxNotesPerPhrase: 24,
          minNotesPerPhrase: 3,
          doubleStopProb: 0.05,
          anticipationProb: 0.2,
          targetExtensions: [2, 9],
          deviceProb: 0.1,
          allowedDevices: ["run"],
          rhythmicDensity: 0.7,
          syncopationLikelihood: 0.6,
          targetAnchoring: 0.8,
          chromaticism: 0.2,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 2 },
              { interval: 2, durationSteps: 4 }
            ],
            [
              { interval: 4, durationSteps: 4 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 2 }
            ]
          ]
        },
        bossa: {
          genreGravityOffset: 0,
          restBase: 0.12,
          tensionScale: 0.7,
          timingJitter: 15,
          maxNotesPerPhrase: 24,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.08,
          anticipationProb: 0.35,
          targetExtensions: [2, 6, 9],
          deviceProb: 0.2,
          allowedDevices: ["enclosure", "slide", "guitarDouble"],
          rhythmicDensity: 0.6,
          syncopationLikelihood: 0.8,
          targetAnchoring: 0.7,
          chromaticism: 0.5,
          contourSkeletons: [
            [
              { interval: 2, durationSteps: 3 },
              { interval: 0, durationSteps: 3 },
              { interval: -1, durationSteps: 2 }
            ],
            [
              { interval: 1, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 4 }
            ],
            [
              { interval: 4, durationSteps: 4 },
              { interval: 2, durationSteps: 2 },
              { interval: 1, durationSteps: 2 }
            ]
          ]
        },
        country: {
          genreGravityOffset: 0,
          restBase: 0.08,
          tensionScale: 0.5,
          timingJitter: 4,
          maxNotesPerPhrase: 32,
          minNotesPerPhrase: 3,
          doubleStopProb: 0.5,
          anticipationProb: 0.2,
          targetExtensions: [2, 4, 9],
          deviceProb: 0.45,
          allowedDevices: [
            "guitarDouble",
            "slide",
            "countryBend",
            "chickenPick",
            "banjoRoll",
            "graceSlide"
          ],
          rhythmicDensity: 0.7,
          syncopationLikelihood: 0.4,
          targetAnchoring: 0.9,
          chromaticism: 0.3,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 2 },
              { interval: 1, durationSteps: 2 },
              { interval: 2, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: -1, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: -2, durationSteps: 2 },
              { interval: -1, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ]
          ]
        },
        metal: {
          genreGravityOffset: 0,
          restBase: 0.1,
          tensionScale: 0.4,
          timingJitter: 2,
          maxNotesPerPhrase: 32,
          minNotesPerPhrase: 6,
          doubleStopProb: 0.05,
          anticipationProb: 0.05,
          targetExtensions: [2, 7],
          deviceProb: 0.5,
          allowedDevices: ["run"],
          rhythmicDensity: 0.9,
          syncopationLikelihood: 0.3,
          targetAnchoring: 0.5,
          chromaticism: 0.6,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 1 },
              { interval: 1, durationSteps: 1 },
              { interval: 2, durationSteps: 1 },
              { interval: 3, durationSteps: 1 }
            ],
            [
              { interval: 4, durationSteps: 2 },
              { interval: 3, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 2 }
            ],
            [
              { interval: 0, durationSteps: 2 },
              { interval: -1, durationSteps: 2 },
              { interval: -2, durationSteps: 4 }
            ]
          ]
        },
        reggae: {
          genreGravityOffset: 0,
          restBase: 0.12,
          tensionScale: 0.6,
          timingJitter: 20,
          maxNotesPerPhrase: 16,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.2,
          anticipationProb: 0.1,
          targetExtensions: [2, 6, 9],
          deviceProb: 0.15,
          allowedDevices: ["guitarDouble"],
          rhythmicDensity: 0.5,
          syncopationLikelihood: 0.9,
          targetAnchoring: 0.8,
          chromaticism: 0.2,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 3 },
              { interval: 2, durationSteps: 1 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 2 },
              { interval: 2, durationSteps: 4 }
            ],
            [
              { interval: 4, durationSteps: 4 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 2 }
            ]
          ]
        },
        acoustic: {
          genreGravityOffset: 0,
          restBase: 0.15,
          tensionScale: 0.4,
          timingJitter: 15,
          maxNotesPerPhrase: 12,
          minNotesPerPhrase: 2,
          doubleStopProb: 0.1,
          anticipationProb: 0.15,
          targetExtensions: [2, 9],
          deviceProb: 0.1,
          allowedDevices: ["slide", "run"],
          rhythmicDensity: 0.6,
          syncopationLikelihood: 0.4,
          targetAnchoring: 0.8,
          chromaticism: 0.2,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 4 },
              { interval: 1, durationSteps: 2 },
              { interval: 2, durationSteps: 2 }
            ],
            [
              { interval: 2, durationSteps: 4 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: -1, durationSteps: 2 },
              { interval: 0, durationSteps: 6 }
            ]
          ]
        },
        ska: {
          genreGravityOffset: -5e-3,
          restBase: 0.1,
          tensionScale: 0.5,
          timingJitter: 5,
          maxNotesPerPhrase: 32,
          minNotesPerPhrase: 4,
          doubleStopProb: 0.2,
          anticipationProb: 0.3,
          targetExtensions: [2, 4, 9],
          deviceProb: 0.35,
          allowedDevices: ["run", "slide", "guitarDouble", "enclosure", "chromaticFall"],
          rhythmicDensity: 0.8,
          syncopationLikelihood: 0.8,
          targetAnchoring: 0.7,
          chromaticism: 0.4,
          contourSkeletons: [
            [
              { interval: 0, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 4, durationSteps: 2 },
              { interval: 2, durationSteps: 2 }
            ],
            [
              { interval: 4, durationSteps: 2 },
              { interval: 2, durationSteps: 2 },
              { interval: 0, durationSteps: 4 }
            ],
            [
              { interval: 2, durationSteps: 2 },
              { interval: 3, durationSteps: 2 },
              { interval: 4, durationSteps: 4 }
            ]
          ]
        }
      };
      STYLE_EMPHASIS = {
        scalar: [1, 0.3, 0.5, 0.3, 0.8, 0.3, 0.5, 0.3, 1, 0.3, 0.5, 0.3, 0.8, 0.3, 0.5, 0.3],
        bird: [0.7, 0.5, 0.8, 1, 0.7, 0.5, 0.8, 1, 0.7, 0.5, 0.8, 1, 0.7, 0.5, 0.8, 1],
        shred: [1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9, 1, 0.9],
        funk: [1, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4, 1, 0.4, 0.7, 0.4, 0.9, 0.4, 0.7, 0.4],
        blues: [1, 0.2, 0.6, 0.9, 0.8, 0.2, 0.6, 0.9, 1, 0.2, 0.6, 0.9, 0.8, 0.2, 0.6, 0.9],
        neo: [1, 0.1, 0.3, 0.8, 0.8, 0.1, 0.3, 0.8, 1, 0.1, 0.3, 0.8, 0.8, 0.1, 0.3, 0.8],
        minimal: [1, 0, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, 0.5, 0, 0, 0],
        disco: [1, 0.2, 0.9, 0.2, 1, 0.2, 0.9, 0.2, 1, 0.2, 0.9, 0.2, 1, 0.2, 0.9, 0.2],
        bossa: [1, 0.1, 0.5, 0.1, 0.8, 0.1, 0.5, 0.1, 1, 0.1, 0.5, 0.1, 0.8, 0.1, 0.5, 0.1],
        country: [1, 0.2, 0.5, 0.2, 0.8, 0.2, 0.5, 0.2, 1, 0.2, 0.5, 0.2, 0.8, 0.2, 0.5, 0.2],
        metal: [1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8, 1, 0.8],
        ska: [0.3, 0.1, 1, 0.1, 0.3, 0.1, 1, 0.1, 0.3, 0.1, 1, 0.1, 0.3, 0.1, 1, 0.1]
      };
      GENRE_STYLE_MAPPING = {
        Rock: "scalar",
        Jazz: "bird",
        Funk: "funk",
        Blues: "blues",
        "Neo-Soul": "neo",
        "Hip Hop": "hiphop",
        Disco: "disco",
        Bossa: "bossa",
        "Bossa Nova": "bossa",
        Afrobeat: "funk",
        Acoustic: "acoustic",
        Reggae: "reggae",
        Country: "country",
        "Ska-Punk": "ska",
        Ska: "ska"
      };
    }
  });

  // public/theory-scales.js
  function getScaleForChord(chord, nextChord = null, style = "smart") {
    const { arranger: arranger6, groove: groove2, soloist: soloist2 } = getState();
    if (!chord) {
      return SCALE_INTERVALS.MAJOR;
    }
    if (style === "smart") {
      const mapping = {
        Rock: "scalar",
        Jazz: "bird",
        Funk: "funk",
        Blues: "blues",
        "Neo-Soul": "neo",
        Disco: "disco",
        Bossa: "bossa",
        "Bossa Nova": "bossa",
        Afrobeat: "funk",
        Acoustic: "minimal",
        Reggae: "minimal",
        Country: "country",
        Metal: "metal",
        "Rock/Metal": "metal",
        "Ska-Punk": "scalar",
        Ska: "scalar"
      };
      style = mapping[groove2.genreFeel] || "scalar";
    }
    if (style === "country") {
      const quality2 = chord.quality || "major";
      if (quality2.startsWith("m") && !quality2.startsWith("maj")) {
        return SCALE_INTERVALS.MINOR_PENTATONIC;
      }
      if (soloist2.tension > 0.7) {
        return [0, 2, 3, 4, 7, 9].sort((a3, b2) => a3 - b2);
      }
      return SCALE_INTERVALS.MAJOR_PENTATONIC;
    }
    const quality = chord.quality || "major";
    const isMinor = quality.startsWith("m") && !quality.startsWith("maj");
    const isDominant = !isMinor && !quality.startsWith("maj") && !["dim", "halfdim"].includes(quality) && (chord.is7th || ["9", "11", "13", "7alt", "7b9", "7#9", "7#11", "7b13"].includes(quality) || quality.startsWith("7"));
    if (quality === "dim" || quality === "dim7") {
      return SCALE_INTERVALS.WHOLE_HALF_DIMINISHED;
    }
    if (quality === "halfdim") {
      return SCALE_INTERVALS.LOCRIAN;
    }
    if (quality === "aug") {
      return SCALE_INTERVALS.WHOLE_TONE;
    }
    if (quality === "augmaj7") {
      return [0, 2, 4, 6, 8, 9, 11];
    }
    if (isDominant) {
      if (quality === "7alt" || quality === "7#9" || soloist2.tension > 0.7 && style !== "rock" && style !== "country") {
        if (style === "funk" || style === "blues") {
          return SCALE_INTERVALS.BLUES;
        }
        return SCALE_INTERVALS.ALTERED;
      }
      if (quality === "7#11") {
        return SCALE_INTERVALS.LYDIAN_DOMINANT;
      }
      if (arranger6.key && (style === "bird" || style === "bossa")) {
        const keyRootIdx = KEY_ORDER.indexOf(arranger6.key);
        const intervalFromKey = (chord.rootMidi - keyRootIdx + 120) % 12;
        if (intervalFromKey === 10 || intervalFromKey === 2) {
          return SCALE_INTERVALS.LYDIAN_DOMINANT;
        }
      }
      if (quality === "7b9" || quality === "7b13") {
        return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
      }
      if (nextChord) {
        const isNextMinor = nextChord.quality.startsWith("m") && !nextChord.quality.startsWith("maj");
        if (isNextMinor) {
          const interval = (nextChord.rootMidi - chord.rootMidi + 120) % 12;
          if (interval === 5) {
            return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
          }
        }
      }
      if (style === "blues" || style === "rock") {
        return [0, 2, 3, 4, 5, 7, 9, 10].sort((a3, b2) => a3 - b2);
      }
      return SCALE_INTERVALS.MIXOLYDIAN;
    }
    if (isMinor) {
      const favorDorian = ["neo", "bird", "funk", "bossa"].includes(style) || groove2.genreFeel === "Jazz" || groove2.genreFeel === "Neo-Soul";
      if (favorDorian) {
        return SCALE_INTERVALS.DORIAN;
      }
    }
    if (quality === "major" || quality.startsWith("maj")) {
      if ((style === "blues" || style === "funk") && !quality.includes("maj7")) {
        return SCALE_INTERVALS.MAJOR_BLUES;
      }
      if (arranger6.isMinor && arranger6.key) {
        const keyRootIdx = KEY_ORDER.indexOf(arranger6.key);
        const intervalFromKey = (chord.rootMidi - keyRootIdx + 120) % 12;
        if (intervalFromKey === 7) {
          return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
        }
      }
    }
    if (arranger6.key) {
      const keyRootIdx = KEY_ORDER.indexOf(arranger6.key);
      const keyIntervals = arranger6.isMinor ? SCALE_INTERVALS.NATURAL_MINOR : SCALE_INTERVALS.MAJOR;
      const keyNotes = keyIntervals.map((i3) => (keyRootIdx + i3) % 12);
      const chordRootPC = chord.rootMidi % 12;
      const chordTones = chord.intervals.map((i3) => (chordRootPC + i3) % 12);
      const isDiatonic = chordTones.every((note) => keyNotes.includes(note));
      if (isDiatonic) {
        const mode = keyNotes.map((note) => (note - chordRootPC + 12) % 12).sort((a3, b2) => a3 - b2);
        return mode;
      }
    }
    if (style === "metal" && isDominant) {
      return SCALE_INTERVALS.PHRYGIAN_DOMINANT;
    }
    if (isMinor) {
      return SCALE_INTERVALS.NATURAL_MINOR;
    }
    if (style === "bird" || style === "bossa") {
      return SCALE_INTERVALS.LYDIAN;
    }
    if (style === "scalar") {
      return SCALE_INTERVALS.MAJOR;
    }
    return SCALE_INTERVALS.MAJOR;
  }
  var SCALE_INTERVALS;
  var init_theory_scales = __esm({
    "public/theory-scales.js"() {
      init_config();
      init_state();
      SCALE_INTERVALS = {
        // Diatonic
        MAJOR: [0, 2, 4, 5, 7, 9, 11],
        NATURAL_MINOR: [0, 2, 3, 5, 7, 8, 10],
        HARMONIC_MINOR: [0, 2, 3, 5, 7, 8, 11],
        MELODIC_MINOR: [0, 2, 3, 5, 7, 9, 11],
        // Modes
        DORIAN: [0, 2, 3, 5, 7, 9, 10],
        PHRYGIAN: [0, 1, 3, 5, 7, 8, 10],
        LYDIAN: [0, 2, 4, 6, 7, 9, 11],
        MIXOLYDIAN: [0, 2, 4, 5, 7, 9, 10],
        LOCRIAN: [0, 1, 3, 5, 6, 8, 10],
        // Pentatonics / Blues
        MAJOR_PENTATONIC: [0, 2, 4, 7, 9],
        MINOR_PENTATONIC: [0, 3, 5, 7, 10],
        BLUES: [0, 3, 5, 6, 7, 10],
        // Minor pentatonic + b5
        MAJOR_BLUES: [0, 2, 3, 4, 7, 9],
        // Major pentatonic + b3
        // Jazz / Exotic
        LYDIAN_DOMINANT: [0, 2, 4, 6, 7, 9, 10],
        // 4th mode of melodic minor
        ALTERED: [0, 1, 3, 4, 6, 8, 10],
        // 7th mode of melodic minor (Super Locrian)
        HALF_WHOLE_DIMINISHED: [0, 1, 3, 4, 6, 7, 9, 10],
        // Dominant function
        WHOLE_HALF_DIMINISHED: [0, 2, 3, 5, 6, 8, 9, 11],
        // Diminished chord function
        WHOLE_TONE: [0, 2, 4, 6, 8, 10],
        PHRYGIAN_DOMINANT: [0, 1, 4, 5, 7, 8, 10]
        // 5th mode of harmonic minor
      };
    }
  });

  // public/soloist-devices.js
  function generateMelodicDevice(deviceType, ctx) {
    const {
      selectedMidi,
      targetChord,
      activeStyle,
      effectiveIntensity,
      minMidi,
      maxMidi,
      lastMidi,
      playback: playback6,
      soloist: soloist2,
      isPolyphonic,
      isPiano,
      dynamicCenter,
      scaleMask
    } = ctx;
    const devBaseVel = 0.5 + effectiveIntensity * 0.6;
    let deviceBuffer = [];
    if (deviceType === "bluesLick") {
      const root = targetChord.rootMidi;
      const relInt = (selectedMidi - root + 120) % 12;
      let lick = [];
      const duration = 2;
      if (relInt === 0) {
        if (Math.random() < 0.5) {
          lick = [
            { midi: selectedMidi, durationSteps: duration },
            { midi: selectedMidi + 3, durationSteps: duration },
            { midi: selectedMidi + 5, durationSteps: duration },
            { midi: selectedMidi + 6, durationSteps: duration },
            { midi: selectedMidi + 7, durationSteps: duration * 2 }
          ];
        } else {
          lick = [
            { midi: selectedMidi, durationSteps: duration },
            { midi: selectedMidi - 2, durationSteps: duration },
            { midi: selectedMidi - 5, durationSteps: duration * 2 }
          ];
        }
      } else if (relInt === 3) {
        if (Math.random() < 0.5) {
          lick = [
            { midi: selectedMidi + 1, durationSteps: duration, bendStartInterval: 1 },
            { midi: selectedMidi + 4, durationSteps: duration },
            { midi: selectedMidi + 7, durationSteps: duration },
            { midi: selectedMidi + 9, durationSteps: duration * 2 }
          ];
        } else {
          lick = [
            { midi: selectedMidi, durationSteps: duration },
            { midi: selectedMidi - 3, durationSteps: duration },
            { midi: selectedMidi - 5, durationSteps: duration },
            { midi: selectedMidi - 8, durationSteps: duration * 2 }
          ];
        }
      } else if (relInt === 5) {
        lick = [
          { midi: selectedMidi, durationSteps: duration },
          { midi: selectedMidi + 1, durationSteps: duration },
          { midi: selectedMidi + 2, durationSteps: duration },
          { midi: selectedMidi + 5, durationSteps: duration * 2 }
        ];
      } else if (relInt === 7) {
        lick = [
          { midi: selectedMidi, durationSteps: duration },
          { midi: selectedMidi - 2, durationSteps: duration },
          { midi: selectedMidi - 4, durationSteps: duration },
          { midi: selectedMidi - 7, durationSteps: duration * 2 }
        ];
      } else if (relInt === 10) {
        lick = [
          { midi: selectedMidi, durationSteps: duration },
          { midi: selectedMidi - 3, durationSteps: duration },
          { midi: selectedMidi - 5, durationSteps: duration },
          { midi: selectedMidi - 7, durationSteps: duration },
          { midi: selectedMidi - 10, durationSteps: duration * 2 }
        ];
      }
      if (lick.length > 0) {
        const lickStart = lick[0].midi;
        const octaveShift = Math.round((lastMidi - lickStart) / 12) * 12;
        deviceBuffer = lick.map((n2, idx) => ({
          ...n2,
          midi: Math.max(minMidi, Math.min(maxMidi, n2.midi + octaveShift)),
          velocity: devBaseVel * (idx === 0 ? 1.15 : 0.9 + Math.random() * 0.15),
          style: activeStyle
        }));
      }
    } else if (deviceType === "chromaticFall") {
      const steps = Math.floor(Math.random() * 3) + 3;
      const duration = 1;
      for (let i3 = 0; i3 < steps; i3++) {
        deviceBuffer.push({
          midi: Math.max(minMidi, selectedMidi - i3),
          durationSteps: duration,
          velocity: devBaseVel * (1.1 - i3 * 0.1),
          style: activeStyle
        });
      }
    } else if (deviceType === "graceNote") {
      deviceBuffer = [
        {
          midi: selectedMidi - 1,
          velocity: devBaseVel * 0.8,
          durationSteps: 1,
          style: activeStyle
        },
        {
          midi: selectedMidi,
          velocity: devBaseVel * 1.1,
          durationSteps: 2,
          style: activeStyle
        }
      ];
    } else if (deviceType === "banjoRoll") {
      const root = targetChord.rootMidi;
      const rollPitches = [0, 4, 7, 9].map((i3) => root + i3);
      for (let i3 = 0; i3 < 4; i3++) {
        deviceBuffer.push({
          midi: rollPitches[i3 % rollPitches.length],
          velocity: devBaseVel * (i3 === 0 ? 1.1 : 0.9),
          durationSteps: 1,
          style: activeStyle
        });
      }
    } else if (deviceType === "graceSlide") {
      deviceBuffer = [
        {
          midi: selectedMidi,
          velocity: devBaseVel * 1.2,
          durationSteps: 2,
          style: activeStyle,
          bendStartInterval: 1
        }
      ];
    } else if (deviceType === "countryBend" && isPolyphonic && !isPiano) {
      const rootMidi = targetChord.rootMidi;
      const topNote = selectedMidi + ([3, 4, 7].includes((selectedMidi - rootMidi + 12) % 12) ? 0 : 2);
      const bottomNote = selectedMidi - 5;
      deviceBuffer = [
        [
          {
            midi: topNote,
            velocity: devBaseVel * 1.2,
            durationSteps: 4,
            style: activeStyle,
            bendStartInterval: -1,
            isDoubleStop: true
          },
          {
            midi: bottomNote,
            velocity: devBaseVel * 0.9,
            durationSteps: 4,
            style: activeStyle,
            isDoubleStop: false
          }
        ]
      ];
    } else if (deviceType === "chickenPick") {
      const dsInt = Math.random() < 0.5 ? 3 : 4;
      deviceBuffer = [
        [
          {
            midi: selectedMidi + dsInt,
            velocity: 1.25,
            durationSteps: 1,
            style: activeStyle,
            isDoubleStop: true
          },
          {
            midi: selectedMidi,
            velocity: 1.2,
            durationSteps: 1,
            style: activeStyle,
            isDoubleStop: false
          }
        ]
      ];
    } else if (deviceType === "birdFlurry") {
      if (playback6.bpm > 180 && Math.random() < 0.8) {
        return null;
      }
      const rootMidi = targetChord.rootMidi;
      let curr = selectedMidi + 3;
      for (let i3 = 0; i3 < 4; i3++) {
        let n2 = curr - 1;
        while (!(scaleMask >> (n2 - rootMidi + 120) % 12 & 1) && n2 > curr - 5) {
          n2--;
        }
        deviceBuffer.push({
          midi: n2,
          velocity: devBaseVel * 1.05,
          durationSteps: 1,
          style: activeStyle
        });
        curr = n2;
      }
    } else if (deviceType === "run" || deviceType === "enclosure") {
      deviceBuffer = [
        {
          midi: selectedMidi + (deviceType === "run" ? -2 : 1),
          velocity: devBaseVel * 0.9,
          durationSteps: 1,
          style: activeStyle
        },
        {
          midi: selectedMidi - 1,
          velocity: devBaseVel * 1.1,
          durationSteps: 1,
          style: activeStyle
        },
        {
          midi: selectedMidi,
          velocity: devBaseVel * 1.2,
          durationSteps: 1,
          style: activeStyle
        }
      ];
    } else if (deviceType === "slide") {
      const dir = (soloist2.mode === "guitar" || activeStyle === "bird") && Math.random() < 0.3 ? 1 : -1;
      deviceBuffer = [
        {
          midi: selectedMidi,
          velocity: devBaseVel * 1.15,
          durationSteps: 2,
          style: activeStyle,
          bendStartInterval: -dir
        }
      ];
    } else if ((deviceType === "quartal" || deviceType === "guitarDouble") && isPolyphonic) {
      const dsInt = activeStyle === "blues" || activeStyle === "scalar" ? 5 : 4;
      deviceBuffer = [
        [
          {
            midi: selectedMidi + dsInt,
            velocity: devBaseVel * 1.05,
            durationSteps: 1,
            style: activeStyle,
            isDoubleStop: true
          },
          {
            midi: selectedMidi,
            velocity: devBaseVel * 1.2,
            durationSteps: 1,
            style: activeStyle,
            isDoubleStop: false
          }
        ]
      ];
    }
    if (deviceBuffer.length > 0) {
      const firstNote = Array.isArray(deviceBuffer[0]) ? deviceBuffer[0][0] : deviceBuffer[0];
      const startMidi = firstNote.midi;
      const targetMidi = soloist2.isResting ? dynamicCenter : lastMidi;
      const octaveShift = Math.round((targetMidi - startMidi) / 12) * 12;
      return deviceBuffer.map((n2) => {
        const notes = Array.isArray(n2) ? n2 : [n2];
        const shifted = notes.map((note) => ({
          ...note,
          midi: Math.max(minMidi, Math.min(maxMidi, note.midi + octaveShift))
        }));
        return shifted.length === 1 ? shifted[0] : shifted;
      });
    }
    return null;
  }
  function generateExtraNotes(ctx) {
    const { soloist: soloist2, currentChord, activeStyle, effectiveIntensity, selectedMidi } = ctx;
    const extraNotes = [];
    if (soloist2.mode === "piano") {
      const currentRoot = currentChord.rootMidi;
      if ((activeStyle === "neo" || activeStyle === "bird") && Math.random() < 0.6) {
        extraNotes.push({
          midi: selectedMidi - 5,
          velocity: (0.4 + effectiveIntensity * 0.5) * 0.8,
          isDoubleStop: true
        });
        if (Math.random() < 0.4) {
          extraNotes.push({
            midi: selectedMidi - 10,
            velocity: (0.3 + effectiveIntensity * 0.5) * 0.7,
            isDoubleStop: true
          });
        }
      } else {
        let count = 0;
        for (let m3 = selectedMidi - 1; m3 > selectedMidi - 13 && count < 2; m3--) {
          const pc = (m3 % 12 + 12) % 12;
          if (currentChord.intervals.some(
            (i3) => i3 % 12 === (pc - currentRoot % 12 + 12) % 12
          )) {
            extraNotes.push({
              midi: m3,
              velocity: (0.5 + effectiveIntensity * 0.6) * 0.85,
              isDoubleStop: true
            });
            count++;
          }
        }
        if (count === 0) {
          const dsInt = [3, 4, 5, 7][Math.floor(Math.random() * 4)];
          extraNotes.push({
            midi: selectedMidi - dsInt,
            velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
            isDoubleStop: true
          });
        }
      }
    } else if (activeStyle === "country") {
      const dsInt = [8, 9][Math.floor(Math.random() * 2)];
      extraNotes.push({
        midi: selectedMidi + dsInt,
        velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
        isDoubleStop: true
      });
    } else if (soloist2.mode === "guitar") {
      const dsInt = activeStyle === "blues" || activeStyle === "neo" ? [5, 7, 5, 4][Math.floor(Math.random() * 4)] : [3, 4, 5, 8, 9][Math.floor(Math.random() * 5)];
      extraNotes.push({
        midi: selectedMidi + dsInt,
        velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
        isDoubleStop: true
      });
    } else {
      const dsInt = [5, 7, 9, 12][Math.floor(Math.random() * 4)];
      extraNotes.push({
        midi: selectedMidi + dsInt,
        velocity: (0.5 + effectiveIntensity * 0.6) * 0.95,
        isDoubleStop: true
      });
    }
    return extraNotes;
  }
  var init_soloist_devices = __esm({
    "public/soloist-devices.js"() {
      init_theory_scales();
    }
  });

  // public/soloist.js
  function parseContourSkeleton(skeleton, targetChord, style, startMidi) {
    if (!skeleton || skeleton.length === 0) {
      return null;
    }
    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i3 = 0; i3 < scaleIntervals.length; i3++) {
      scaleMask |= 1 << scaleIntervals[i3];
    }
    const rootMidi = targetChord.rootMidi;
    const isMutated = Math.random() < 0.2;
    const directionMult = isMutated && Math.random() < 0.5 ? -1 : 1;
    const durationMult = isMutated && Math.random() < 0.5 ? 2 : 1;
    const buffer = [];
    let currentMidi = startMidi;
    for (const node of skeleton) {
      const targetInterval = node.interval * directionMult;
      const absTarget = Math.abs(targetInterval);
      const dir = targetInterval > 0 ? 1 : -1;
      let stepsMoved = 0;
      let m3 = currentMidi;
      if (targetInterval !== 0) {
        let tries = 0;
        while (stepsMoved < absTarget && tries < 24) {
          m3 += dir;
          const pc = (m3 % 12 + 12) % 12;
          const relativeInterval = (pc - rootMidi % 12 + 12) % 12;
          if (scaleMask >> relativeInterval & 1) {
            stepsMoved++;
          }
          tries++;
        }
      }
      currentMidi = m3;
      buffer.push({
        midi: currentMidi,
        durationSteps: node.durationSteps * durationMult,
        velocity: 0.8,
        // Baseline, dynamically adjusted later
        style
      });
    }
    return buffer;
  }
  function extractDrumSkeleton(step, intensity, style, stepsPerMeasure, tsConfig) {
    const motif = [];
    const stateObj = getState();
    const { groove: groove2 } = stateObj;
    const barIndex = Math.floor(step / stepsPerMeasure);
    const sectionSeed = (barIndex * 137 + (groove2.creativity ? 42 : 0)) % 256 / 256;
    const complexity = groove2.creativity ? 0.8 : 0.3;
    const motifId = getDrumMotif(sectionSeed, groove2.genreFeel, complexity, intensity);
    for (let i3 = 0; i3 < stepsPerMeasure; i3++) {
      const isBeatStart = i3 % tsConfig.stepsPerBeat === 0;
      const beatIndex = Math.floor(i3 / tsConfig.stepsPerBeat);
      let isBackbeat = false;
      if (tsConfig.beats === 4) {
        isBackbeat = beatIndex === 1 || beatIndex === 3;
      } else if (tsConfig.beats === 3) {
        isBackbeat = beatIndex === 2;
      }
      const isOffbeat = i3 % tsConfig.stepsPerBeat === Math.floor(tsConfig.stepsPerBeat / 2);
      const isEOfBeat = i3 % tsConfig.stepsPerBeat === Math.floor(tsConfig.stepsPerBeat / 4);
      const isAOfBeat = i3 % tsConfig.stepsPerBeat === Math.floor(tsConfig.stepsPerBeat * 3 / 4);
      let hit = false;
      if (motifId === 0) {
        if (isBeatStart || isBackbeat) {
          hit = true;
        } else if (isOffbeat && intensity > 0.4) {
          hit = true;
        }
      } else if (motifId === 1) {
        if (isBeatStart || isBackbeat || isOffbeat) {
          hit = true;
        } else if (isEOfBeat && beatIndex === 1 || isAOfBeat && beatIndex === 2) {
          hit = true;
        }
      } else if (motifId === 2) {
        if (isBeatStart && !isBackbeat) {
          hit = true;
        } else if (isBackbeat && beatIndex === 1) {
          hit = true;
        } else if (isOffbeat && beatIndex === 3) {
          hit = true;
        } else if (isAOfBeat && beatIndex === 1 || isEOfBeat && beatIndex === 2) {
          hit = true;
        }
      } else if (motifId >= 3) {
        if (isBeatStart || isBackbeat || isOffbeat) {
          hit = true;
        } else if (isAOfBeat && (beatIndex === 0 || beatIndex === 1 || beatIndex === 3)) {
          hit = true;
        } else if (isEOfBeat && (beatIndex === 2 || beatIndex === 1)) {
          hit = true;
        }
      }
      if (isBackbeat && motifId !== 2) {
        hit = true;
      }
      if (hit) {
        motif.push(i3);
      }
    }
    if (motif.length < 2) {
      return generateRhythmicMotif(intensity, style);
    }
    return motif;
  }
  function generateRhythmicMotif(intensity, style) {
    const motif = [];
    const density = 3 + Math.floor(intensity * 2);
    const weights = STYLE_EMPHASIS[style] || STYLE_EMPHASIS.scalar;
    const candidates = [];
    for (let i3 = 0; i3 < 16; i3++) {
      const strength = weights[i3];
      candidates.push({ step: i3, weight: strength * (0.5 + Math.random() * 0.5) });
    }
    candidates.sort((a3, b2) => b2.weight - a3.weight);
    for (let i3 = 0; i3 < Math.min(density, candidates.length); i3++) {
      motif.push(candidates[i3].step);
    }
    return motif.sort((a3, b2) => a3 - b2);
  }
  function getSoloistNote(currentChord, nextChord, step, _prevFreq, _octave, style, stepInChord, isPriming, coordination = {}, stepInfo) {
    const { playback: playback6, groove: groove2, soloist: soloist2, arranger: arranger6 } = getState();
    if (!currentChord) {
      return null;
    }
    let activeStyle = style;
    if (activeStyle === "smart") {
      activeStyle = GENRE_STYLE_MAPPING[groove2.genreFeel] || "scalar";
    }
    const intensity = playback6.bandIntensity || 0.5;
    const logDebug = (msg) => {
      if (playback6.debugSoloist) {
        console.log(`[Soloist Debug] Step ${step}: ${msg}`);
      }
    };
    let targetChord = currentChord;
    const config11 = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
    const tsConfig = TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"];
    const stepsPerBeat = tsConfig.stepsPerBeat;
    const stepsPerMeasure = tsConfig.beats * stepsPerBeat;
    const measureStep = stepInfo ? stepInfo.mStep : step % stepsPerMeasure;
    const stepInBeat = measureStep % stepsPerBeat;
    const isBeatStart = stepInfo ? stepInfo.isBeatStart : stepInBeat === 0;
    const isDownbeat = stepInfo ? stepInfo.isMeasureStart : measureStep === 0;
    const isBackbeat = stepInfo ? stepInfo.isBackbeat : false;
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    if (nextChord && isLateInChord && Math.random() < (config11.anticipationProb || 0)) {
      targetChord = nextChord;
    }
    const minMidi = 55;
    const maxMidi = 96;
    const lastMidi = soloist2.lastMidiPlayed || 72;
    const finalizeNote = (res) => {
      if (!res) {
        return null;
      }
      const primary = Array.isArray(res) ? res[res.length - 1] : res;
      soloist2.lastMidiPlayed = primary.midi;
      let timingOffset = calculateTimingOffset(
        "soloist",
        groove2.pocket,
        playback6.bandIntensity || 0.5
      );
      const config12 = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.scalar;
      timingOffset += config12.genreGravityOffset || 0;
      const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
      if (isSyncopated) {
        timingOffset += 7e-3;
      }
      if (primary.velocity < 0.7) {
        timingOffset += 5e-3;
      }
      if (config12.timingJitter !== void 0) {
        const tightness = playback6.bandIntensity || 0.5;
        const jitterScale = 1 - tightness;
        const jitterMs = config12.timingJitter * jitterScale;
        timingOffset += (Math.random() - 0.5) * (jitterMs / 1e3);
      }
      primary.timingOffset = (primary.timingOffset || 0) + timingOffset;
      if (!primary.isDoubleStop) {
        soloist2.lastFreq = getFrequency(primary.midi);
      }
      if (activeStyle === "blues") {
        const relativeInterval = (primary.midi % 12 - currentChord.rootMidi % 12 + 12) % 12;
        if ((relativeInterval === 3 || relativeInterval === 6) && primary.bendStartInterval === 0) {
          primary.bendStartInterval = Math.random() < 0.6 ? -0.5 : 0.5;
        }
      }
      return res;
    };
    if (!isPriming) {
      soloist2.sessionSteps = (soloist2.sessionSteps || 0) + 1;
    }
    if (activeStyle === "lead_sheet") {
      if (soloist2.leadSheetMelody && soloist2.leadSheetMelody.length > 0) {
        const totalFormSteps = arranger6.totalSteps > 0 ? arranger6.totalSteps : 999999;
        const stepInForm = step % totalFormSteps;
        const note = soloist2.leadSheetMelody.find((n2) => n2.globalStep === stepInForm);
        if (note) {
          const res = {
            midi: note.midi,
            durationSteps: note.durationSteps,
            velocity: 0.8,
            style: activeStyle
          };
          soloist2.busySteps = Math.max(0, (res.durationSteps || 1) - 1);
          return finalizeNote(res);
        }
        if (soloist2.busySteps > 0) {
          soloist2.busySteps--;
          return null;
        }
      }
    }
    if (soloist2.embellishmentBuffer && soloist2.embellishmentBuffer.length > 0) {
      const embNote = soloist2.embellishmentBuffer.shift();
      const primaryNote = Array.isArray(embNote) ? embNote[0] : embNote;
      soloist2.busySteps = (primaryNote.durationSteps || 1) - 1;
      return finalizeNote(embNote);
    }
    if (soloist2.hookBuffer && soloist2.hookBuffer.length > 0) {
      const hookNote = soloist2.hookBuffer.shift();
      soloist2.busySteps = (hookNote.durationSteps || 1) - 1;
      const baseVelocity2 = 0.6 + intensity * 0.4;
      const finalVelocity = isDownbeat ? baseVelocity2 * 1.25 : isBackbeat ? baseVelocity2 * 1.15 : baseVelocity2;
      hookNote.velocity = Math.min(1.25, finalVelocity * hookNote.velocity);
      return finalizeNote(hookNote);
    }
    if (soloist2.deviceBuffer && soloist2.deviceBuffer.length > 0) {
      const devNote = soloist2.deviceBuffer.shift();
      const primaryNote = Array.isArray(devNote) ? devNote[0] : devNote;
      soloist2.busySteps = (primaryNote.durationSteps || 1) - 1;
      return finalizeNote(devNote);
    }
    if (soloist2.busySteps > 0) {
      soloist2.busySteps--;
      return null;
    }
    if (soloist2.isYielding && soloist2.phrasingState === "rest") {
      if (soloist2.tradeMode === "manual" && soloist2.enabled) {
        soloist2.isYielding = false;
      } else {
        return null;
      }
    }
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const measuresPerBlock = intensity >= 0.5 ? 4 : 8;
    const hyperMeasureLength = stepsPerMeasure * measuresPerBlock;
    const isHyperMeasureStart = step % hyperMeasureLength === 0;
    if (isHyperMeasureStart || isFinalMeasure && isDownbeat) {
      if (soloist2.phrasingState === "rest" || soloist2.phrasingState === "resolution" || soloist2.phrasingState === "motif_lock") {
        soloist2.transitionState = Math.random() < 0.5 ? "rest" : "lead_in";
        if (soloist2.transitionState === "lead_in") {
          soloist2.phrasingState = soloist2.motifTracking ? "motif_lock" : "call";
          const phrasingIntensity = soloist2.phrasingIntensity ?? 0.5;
          if (soloist2.phrasingState === "motif_lock") {
            soloist2.rhythmicMotif = extractDrumSkeleton(
              // @worker-mutation
              step,
              intensity,
              activeStyle,
              stepsPerMeasure,
              tsConfig
            );
            soloist2.activeSteps = stepsPerMeasure * measuresPerBlock;
          } else {
            const useSkeleton = config11.contourSkeletons && Math.random() < 0.6 + phrasingIntensity * 0.1;
            if (useSkeleton && config11.contourSkeletons.length > 0) {
              const skeleton = config11.contourSkeletons[Math.floor(Math.random() * config11.contourSkeletons.length)];
              const startMidi = lastMidi;
              const buffer = parseContourSkeleton(
                skeleton,
                targetChord,
                activeStyle,
                startMidi
              );
              if (buffer && buffer.length > 0) {
                soloist2.hookBuffer = buffer;
              }
            } else {
              soloist2.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle);
            }
            soloist2.phraseStartStep = null;
            soloist2.activeSteps = stepsPerMeasure;
            soloist2.motifCache = [];
          }
        }
        logDebug(
          `Selected transition state: ${soloist2.transitionState} (phrasingState: ${soloist2.phrasingState})`
        );
      }
    } else if (!isFinalMeasure && step !== coordination.sectionStart) {
      soloist2.transitionState = null;
    }
    if (soloist2.phrasingState === void 0 || soloist2.phrasingState === "rest") {
      if (soloist2.phrasingState === void 0) {
        soloist2.phrasingState = "rest";
        soloist2.restSteps = stepsPerBeat * 2;
        soloist2.activeSteps = 0;
      }
      soloist2.restSteps = (soloist2.restSteps || 0) - 1;
      const absoluteMaxRest = Math.floor(stepsPerMeasure * (1 - intensity * 0.5));
      if (soloist2.restSteps < -absoluteMaxRest) {
        soloist2.restSteps = 0;
        soloist2.phrasingState = "call";
        soloist2.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle);
        soloist2.motifCache = [];
        soloist2.notesInPhrase = 0;
        soloist2.activeSteps = stepsPerMeasure;
        soloist2.phraseStartStep = null;
        logDebug(`Watchdog forced state to Call after extended rest`);
      } else {
        if (soloist2.restSteps <= 0 || coordination.bypassRhythm) {
          const isGoodEntry = isBeatStart || measureStep % (stepsPerBeat / 2) === 0 && intensity > 0.6;
          const preventBreakout = isFinalMeasure && soloist2.transitionState === "rest" && Math.floor(measureStep / stepsPerBeat) >= Math.ceil(tsConfig.beats / 2);
          if (!preventBreakout && (isGoodEntry || coordination.bypassRhythm || soloist2.restSteps < -stepsPerMeasure)) {
            soloist2.phrasingState = soloist2.motifTracking ? "motif_lock" : "call";
            if (soloist2.phrasingState === "motif_lock") {
              soloist2.rhythmicMotif = extractDrumSkeleton(
                // @worker-mutation
                step,
                intensity,
                activeStyle,
                stepsPerMeasure,
                tsConfig
              );
              soloist2.activeSteps = stepsPerMeasure * measuresPerBlock;
            } else {
              const phrasingIntensity = soloist2.phrasingIntensity ?? 0.5;
              const useSkeleton = config11.contourSkeletons && Math.random() < 0.6 + phrasingIntensity * 0.1;
              if (useSkeleton && config11.contourSkeletons.length > 0) {
                const skeleton = config11.contourSkeletons[Math.floor(Math.random() * config11.contourSkeletons.length)];
                const startMidi = lastMidi;
                const buffer = parseContourSkeleton(
                  skeleton,
                  targetChord,
                  activeStyle,
                  startMidi
                );
                if (buffer && buffer.length > 0) {
                  soloist2.hookBuffer = buffer;
                }
              } else {
                soloist2.rhythmicMotif = generateRhythmicMotif(intensity, activeStyle);
              }
            }
            soloist2.motifCache = [];
            soloist2.notesInPhrase = 0;
            if (soloist2.phrasingState !== "motif_lock") {
              soloist2.activeSteps = stepsPerMeasure;
            }
            soloist2.phraseStartStep = null;
            logDebug(
              `Waking up for ${soloist2.phrasingState} (~${soloist2.activeSteps} steps)`
            );
          }
        }
        if (soloist2.phrasingState === "rest") {
          return null;
        }
      }
    }
    if (soloist2.phrasingState !== "rest") {
      soloist2.activeSteps = (soloist2.activeSteps || 0) - 1;
      const currentState = soloist2.phrasingState;
      if (currentState === "resolution") {
        if (soloist2.activeSteps < -stepsPerMeasure) {
          soloist2.phrasingState = "rest";
          soloist2.rhythmicMotif = [];
          soloist2.restSteps = stepsPerMeasure;
          return null;
        }
      }
      const isEndOfMeasure = measureStep === stepsPerMeasure - 1;
      const isNearEndOfMeasure = measureStep >= (tsConfig.beats - 1) * stepsPerBeat && intensity > 0.5;
      if (currentState === "motif_lock" && isEndOfMeasure) {
        if (!soloist2.motifTracking) {
          soloist2.phrasingState = "resolution";
          soloist2.activeSteps = stepsPerBeat * 2;
        } else if (soloist2.activeSteps <= 0) {
          soloist2.phrasingState = "resolution";
          soloist2.activeSteps = stepsPerBeat * 2;
        }
      }
      if (soloist2.activeSteps <= 0 && (isEndOfMeasure || isNearEndOfMeasure) && !coordination.bypassRhythm && currentState !== "motif_lock") {
        if (currentState === "call") {
          soloist2.phrasingState = "response";
          soloist2.activeSteps = stepsPerMeasure;
          soloist2.phraseStartStep = step;
          const phrasingIntensity = soloist2.phrasingIntensity ?? 0.5;
          const useSkeleton = config11.contourSkeletons && Math.random() < 0.6 + phrasingIntensity * 0.1;
          if (useSkeleton && config11.contourSkeletons.length > 0) {
            const skeleton = config11.contourSkeletons[Math.floor(Math.random() * config11.contourSkeletons.length)];
            const startMidi = lastMidi;
            const buffer = parseContourSkeleton(
              skeleton,
              targetChord,
              activeStyle,
              startMidi
            );
            if (buffer && buffer.length > 0) {
              soloist2.hookBuffer = buffer;
            }
          }
          logDebug(`Transitioning to Response (~${soloist2.activeSteps} steps)`);
        } else if (currentState === "response") {
          soloist2.phrasingState = Math.random() < 0.6 ? "development" : "resolution";
          soloist2.rhythmicMotif = [];
          const baseLength = config11.maxNotesPerPhrase * (0.2 + intensity * 0.5);
          const activeVal = baseLength * stepsPerBeat * (0.5 + Math.random() * 0.5);
          soloist2.activeSteps = Math.min(64, Math.floor(activeVal));
          logDebug(`Transitioning to ${soloist2.phrasingState}`);
        } else if (currentState === "development") {
          soloist2.phrasingState = "resolution";
          soloist2.rhythmicMotif = [];
          soloist2.activeSteps = stepsPerBeat * 2;
          logDebug(`Transitioning to Resolution`);
        }
      }
    }
    if (soloist2.phrasingState === "rest") {
      return null;
    }
    const isSectionDownbeat = step === coordination.sectionStart && soloist2.transitionState === "lead_in";
    const emphasisMap = STYLE_EMPHASIS[activeStyle] || STYLE_EMPHASIS.scalar;
    const bIdx = stepInfo ? stepInfo.beatIndex : Math.floor(measureStep / 4);
    const sInB = stepInfo ? stepInfo.stepInBeat : measureStep % 4;
    const emphasisIdx = bIdx % 4 * 4 + sInB % 4;
    const baseAttackProb = emphasisMap[emphasisIdx];
    const baseRhythmicDensity = config11.rhythmicDensity ?? 0.5;
    const baseSyncopationLikelihood = config11.syncopationLikelihood ?? 0.5;
    const phraseRelativeStep = step - (soloist2.phraseStartStep || step);
    let motifForcedAttack = false;
    let expectedMotifInterval = null;
    if (soloist2.phrasingState === "response" && soloist2.motifCache && soloist2.motifCache.length > 0) {
      const matchingMotifNote = soloist2.motifCache.find(
        (m3) => m3.relativeStep === phraseRelativeStep
      );
      if (matchingMotifNote) {
        if (baseAttackProb > 0.1 || coordination.bypassRhythm) {
          motifForcedAttack = true;
          expectedMotifInterval = matchingMotifNote.interval;
          logDebug(`Motif Mask Match at relative step ${phraseRelativeStep}`);
        }
      }
    }
    const warmUpScale = Math.min(1, 0.5 + (soloist2.sessionSteps || 0) / 64 * 0.5);
    const densityScale = 0.5 + baseRhythmicDensity;
    const intensityScale = 0.3 + intensity * 1.2;
    let attackProb = baseAttackProb * intensityScale * warmUpScale * densityScale;
    if (soloist2.phrasingState === "resolution") {
      attackProb *= 0.4;
    } else if (soloist2.phrasingState === "development") {
      attackProb *= 0.8 + baseRhythmicDensity * 0.4;
    }
    const sinePeriod = stepsPerMeasure * 8;
    const breathingPhase = step % sinePeriod / sinePeriod;
    const breathingOffset = Math.sin(breathingPhase * Math.PI * 2) * 0.25;
    attackProb += breathingOffset;
    if (intensity < 0.4 || Math.random() > baseSyncopationLikelihood) {
      const isSixteenthNote = sInB % 2 !== 0;
      const isOffbeatEighth = sInB === 2;
      if (isSixteenthNote) {
        attackProb *= intensity * 1.5;
      } else if (isOffbeatEighth) {
        attackProb *= 0.4 + intensity;
      }
    }
    if (isFinalMeasure && soloist2.transitionState === "lead_in") {
      attackProb *= 1.5;
    }
    const stepCoord = coordination.stepCoordination || {};
    if (stepCoord.kickHit) {
      attackProb += 0.2;
    }
    if (stepCoord.snareHit) {
      attackProb += 0.2;
    }
    if (coordination.bypassRhythm) {
      attackProb = 1;
    }
    if (isSectionDownbeat) {
      attackProb = 1;
      soloist2.transitionState = null;
    }
    let shouldAttack = false;
    let isForcedFallbackResolution = false;
    if (soloist2.phrasingState === "resolution" && soloist2.activeSteps <= 0 && isBeatStart && soloist2.lastAttackStep !== step) {
      shouldAttack = true;
      isForcedFallbackResolution = true;
      attackProb = 1;
    }
    if (isForcedFallbackResolution || isSectionDownbeat) {
      shouldAttack = true;
    } else if (soloist2.phrasingState === "motif_lock") {
      shouldAttack = soloist2.rhythmicMotif?.includes(measureStep);
    } else if (!coordination.bypassRhythm && (soloist2.phrasingState === "call" || soloist2.phrasingState === "response") && soloist2.rhythmicMotif && soloist2.rhythmicMotif.length > 0) {
      shouldAttack = soloist2.rhythmicMotif.includes(measureStep);
    } else if (soloist2.phrasingState === "response" && soloist2.motifCache && soloist2.motifCache.length > 0) {
      if (motifForcedAttack) {
        shouldAttack = true;
      } else if (phraseRelativeStep < soloist2.motifCache[soloist2.motifCache.length - 1].relativeStep) {
        shouldAttack = false;
      } else {
        shouldAttack = Math.random() < attackProb;
      }
    } else {
      shouldAttack = Math.random() < attackProb;
    }
    if (!shouldAttack) {
      return null;
    }
    soloist2.notesInPhrase = (soloist2.notesInPhrase || 0) + 1;
    soloist2.lastAttackStep = step;
    if (soloist2.phrasingState === "call" && soloist2.phraseStartStep === null) {
      soloist2.phraseStartStep = step;
      logDebug(`Call phrase actual start at step ${step}`);
    }
    CANDIDATE_WEIGHTS.fill(0);
    let structuralTargetChord = null;
    let distanceToStructuralDownbeat = stepsPerMeasure;
    if (isFinalMeasure && coordination.stepCoordination?.upcomingSectionFirstChord) {
      structuralTargetChord = coordination.stepCoordination.upcomingSectionFirstChord;
      distanceToStructuralDownbeat = remainingSteps;
    } else if (!isFinalMeasure && coordination.stepCoordination?.upcomingMeasureChord) {
      structuralTargetChord = coordination.stepCoordination.upcomingMeasureChord;
      distanceToStructuralDownbeat = stepsPerMeasure - step % stepsPerMeasure;
    }
    if (isFinalMeasure && soloist2.transitionState === "lead_in" && remainingSteps <= 2 && structuralTargetChord) {
      targetChord = structuralTargetChord;
    }
    const scaleIntervals = getScaleForChord(targetChord, null, style);
    let scaleMask = 0;
    for (let i3 = 0; i3 < scaleIntervals.length; i3++) {
      scaleMask |= 1 << scaleIntervals[i3];
    }
    const rootMidi = targetChord.rootMidi;
    let totalWeight = 0;
    const baseCenter = 64;
    const dynamicCenter = baseCenter + intensity * 12;
    const searchMin = Math.max(minMidi, lastMidi - 14);
    const searchMax = Math.min(maxMidi, lastMidi + 14);
    for (let m3 = searchMin; m3 <= searchMax; m3++) {
      const pc = (m3 % 12 + 12) % 12;
      const interval = (pc - rootMidi % 12 + 12) % 12;
      let weight = 1;
      const isScaleTone = scaleMask >> interval & 1;
      const dist = Math.abs(m3 - lastMidi);
      const chromaticism = config11.chromaticism ?? 0.2;
      if (!isScaleTone) {
        if (chromaticism > 0.5 && dist <= 2) {
          weight += 20 * chromaticism;
        } else {
          continue;
        }
      }
      if (dist === 0) {
        if (["funk", "ska"].includes(activeStyle)) {
          weight *= 0.5;
        } else {
          continue;
        }
      }
      if (dist <= 2) {
        weight += 100;
      }
      if (dist <= 4) {
        weight += 50;
      }
      if (targetChord.intervals.some((i3) => (i3 % 12 + 12) % 12 === interval)) {
        weight += 150;
      }
      if (soloist2.phrasingState === "response" && expectedMotifInterval !== null) {
        if (interval === expectedMotifInterval) {
          weight += 200;
        }
      }
      let matchedLickNote = null;
      if (soloist2.lickDictionary && soloist2.lickDictionary.length > 0 && soloist2.recentNotes && soloist2.recentNotes.length >= 2) {
        const lastTwoNotes = soloist2.recentNotes.slice(-2).map((n2) => n2.midi);
        for (const lick of soloist2.lickDictionary) {
          if (lick.sequence.length > 2 && lastTwoNotes[0] === lick.sequence[0] && lastTwoNotes[1] === lick.sequence[1]) {
            matchedLickNote = lick.sequence[2];
            break;
          }
        }
      }
      if (matchedLickNote !== null && m3 === matchedLickNote) {
        weight += 800;
      }
      const resolutionChord = isSectionDownbeat ? targetChord : structuralTargetChord;
      if (resolutionChord) {
        const upcomingRoot = resolutionChord.rootMidi;
        const upcoming3rd = resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
        const upcomingInterval = (pc - upcomingRoot % 12 + 12) % 12;
        const targetAnchoring = config11.targetAnchoring ?? 0.8;
        if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
          if (isSectionDownbeat || isForcedFallbackResolution) {
            weight += 500 * targetAnchoring;
          } else if (soloist2.phrasingState === "resolution" && distanceToStructuralDownbeat <= stepsPerMeasure) {
            const distanceFactor = 1 - distanceToStructuralDownbeat / stepsPerMeasure;
            const exponentialPull = distanceFactor ** 2 * 200 * targetAnchoring;
            weight += 50 * targetAnchoring + exponentialPull;
          } else if (soloist2.transitionState === "lead_in" && distanceToStructuralDownbeat <= 8) {
            weight += (100 + (8 - distanceToStructuralDownbeat) * 15) * targetAnchoring;
          }
        }
      }
      if (dist > 7) {
        weight *= 0.4;
      }
      const distFromCenter = Math.abs(m3 - dynamicCenter);
      if (distFromCenter <= 7) {
        weight += 100;
      } else if (distFromCenter <= 14) {
        weight += 40;
      }
      if (m3 >= 84 && intensity < 0.75) {
        weight *= 0.05;
      } else if (m3 >= 72 && intensity < 0.35) {
        weight *= 0.2;
      }
      CANDIDATE_WEIGHTS[m3] = weight;
      totalWeight += weight;
    }
    let selectedMidi = -1;
    if (totalWeight > 0) {
      let randomVal = Math.random() * totalWeight;
      for (let m3 = searchMin; m3 <= searchMax; m3++) {
        const w3 = CANDIDATE_WEIGHTS[m3];
        if (w3 > 0) {
          randomVal -= w3;
          if (randomVal <= 0) {
            selectedMidi = m3;
            break;
          }
        }
      }
    }
    if (selectedMidi === -1) {
      selectedMidi = lastMidi;
    }
    const deviceBaseProb = config11.deviceProb * (0.5 + intensity);
    const isPiano = soloist2.mode === "piano";
    const isPolyphonic = soloist2.mode !== "monophonic" && (soloist2.doubleStopProb ?? 1) > 0 && config11.doubleStopProb > 0;
    if (isBeatStart && Math.random() < deviceBaseProb) {
      let allowed = [...config11.allowedDevices || []];
      if (isPiano) {
        allowed = allowed.filter(
          (d3) => !["slide", "countryBend", "graceSlide", "chickenPick"].includes(d3)
        );
        if (!allowed.includes("graceNote")) {
          allowed.push("graceNote");
        }
      }
      const deviceType = allowed.length > 0 ? allowed[Math.floor(Math.random() * allowed.length)] : null;
      if (deviceType) {
        const deviceBuffer = generateMelodicDevice(deviceType, {
          selectedMidi,
          targetChord,
          activeStyle,
          effectiveIntensity: intensity,
          minMidi,
          maxMidi,
          lastMidi,
          playback: playback6,
          soloist: soloist2,
          isPolyphonic,
          isPiano,
          dynamicCenter: 72,
          scaleMask
        });
        if (deviceBuffer && deviceBuffer.length > 0) {
          soloist2.deviceBuffer = deviceBuffer.slice(1);
          const first = deviceBuffer[0];
          soloist2.busySteps = (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1;
          return finalizeNote(first);
        }
      }
    }
    const extraNotes = [];
    const dsChance = config11.doubleStopProb * intensity * (soloist2.doubleStopProb ?? 1);
    if (isPolyphonic && Math.random() < dsChance) {
      const generatedExtra = generateExtraNotes({
        soloist: soloist2,
        currentChord,
        activeStyle,
        effectiveIntensity: intensity,
        selectedMidi
      });
      extraNotes.push(...generatedExtra);
    }
    let durationSteps = activeStyle === "bird" ? 2 : Math.random() < 0.6 ? 2 : 4;
    if (activeStyle === "neo") {
      durationSteps = 4;
    }
    if (["funk", "disco", "ska"].includes(activeStyle)) {
      durationSteps = 1;
    }
    let gapToNextNote = 4;
    if (soloist2.phrasingState === "response" && soloist2.motifCache) {
      const nextMotifNote = soloist2.motifCache.find((m3) => m3.relativeStep > phraseRelativeStep);
      if (nextMotifNote) {
        gapToNextNote = nextMotifNote.relativeStep - phraseRelativeStep;
      } else {
        gapToNextNote = stepsPerMeasure - step % stepsPerMeasure;
      }
    } else {
      for (let nextOffset = 1; nextOffset <= 8; nextOffset++) {
        const lookaheadStep = step + nextOffset;
        const lbIdx = Math.floor(lookaheadStep % stepsPerMeasure / 4);
        const lsInB = lookaheadStep % stepsPerMeasure % 4;
        const lEmphasisIdx = lbIdx % 4 * 4 + lsInB % 4;
        const lookaheadThreshold = activeStyle === "neo" ? 0.85 : 0.4;
        if (emphasisMap[lEmphasisIdx] > lookaheadThreshold) {
          gapToNextNote = nextOffset;
          break;
        }
      }
    }
    const isLegato = Math.random() < (intensity < 0.5 ? 0.7 : 0.3);
    if (soloist2.phrasingState === "motif_lock") {
      durationSteps = gapToNextNote;
      if (soloist2.rhythmicMotif && soloist2.rhythmicMotif.length > 0) {
        let foundNext = false;
        for (let i3 = measureStep + 1; i3 < stepsPerMeasure; i3++) {
          if (soloist2.rhythmicMotif.includes(i3)) {
            durationSteps = i3 - measureStep;
            foundNext = true;
            break;
          }
        }
        if (!foundNext) {
          const firstNote = soloist2.rhythmicMotif[0] || 0;
          durationSteps = stepsPerMeasure - measureStep + firstNote;
        }
      }
    } else if (isLegato) {
      durationSteps = Math.min(8, gapToNextNote);
    } else {
      durationSteps = Math.max(1, Math.floor(gapToNextNote / 2));
    }
    if (["funk", "disco", "ska"].includes(activeStyle) && soloist2.phrasingState !== "motif_lock") {
      durationSteps = 1;
    }
    if (intensity < 0.5 && !isPolyphonic && soloist2.phrasingState !== "motif_lock") {
      const longNoteChance = 1 - intensity * 2;
      if (Math.random() < longNoteChance) {
        durationSteps = Math.max(durationSteps, Math.random() < 0.5 ? 4 : 8);
      }
    }
    if (soloist2.phrasingState === "resolution") {
      const remainingToDownbeat = stepsPerMeasure - step % stepsPerMeasure;
      if (remainingToDownbeat > 0) {
        durationSteps = Math.min(durationSteps, remainingToDownbeat + 4);
      }
    }
    durationSteps = Math.min(8, durationSteps);
    const baseVelocity = 0.6 + intensity * 0.4;
    const isImportantStep = stepInBeat === 0 || stepInBeat === Math.floor(stepsPerBeat / 2);
    let stepVelocity = baseVelocity;
    if (isDownbeat) {
      stepVelocity = baseVelocity * 1.25;
    } else if (isBackbeat) {
      stepVelocity = baseVelocity * 1.15;
    } else if (isImportantStep) {
      stepVelocity = baseVelocity * 1.05;
    }
    if (coordination.bassHit && selectedMidi < 60) {
      stepVelocity *= 0.85;
    }
    let bendStartInterval = 0;
    if (soloist2.mode === "guitar" && durationSteps >= 4 && Math.random() < 0.3) {
      bendStartInterval = Math.random() < 0.5 ? -1 : 1;
    }
    if (isPiano) {
      bendStartInterval = 0;
    }
    const result = {
      midi: selectedMidi,
      velocity: Math.min(1.25, stepVelocity),
      durationSteps,
      bendStartInterval,
      ccEvents: [],
      timingOffset: 0,
      style: activeStyle,
      isDoubleStop: false,
      isLegato: false
    };
    if (result.durationSteps > 1) {
      soloist2.busySteps = result.durationSteps - 1;
    }
    if (!soloist2.recentNotes) {
      soloist2.recentNotes = [];
    }
    soloist2.recentNotes.push({
      // @worker-mutation
      midi: selectedMidi,
      step,
      isDownbeat: isDownbeat || isBackbeat
    });
    if (soloist2.recentNotes.length > 4) {
      soloist2.recentNotes.shift();
    }
    if (soloist2.recentNotes.length === 4) {
      const notes = soloist2.recentNotes;
      const strongStart = notes[0].isDownbeat;
      const resolveNote = notes[3].midi;
      const relativeInterval = (resolveNote % 12 - targetChord.rootMidi % 12 + 12) % 12;
      const targetChord3rd = targetChord.intervals.length > 1 ? targetChord.intervals[1] : 4;
      const strongResolution = relativeInterval === 0 || relativeInterval === targetChord3rd % 12 || relativeInterval === 7;
      let stepwiseCount = 0;
      for (let i3 = 1; i3 < 4; i3++) {
        const dist = Math.abs(notes[i3].midi - notes[i3 - 1].midi);
        if (dist > 0 && dist <= 4) {
          stepwiseCount++;
        }
      }
      if (strongStart && strongResolution && stepwiseCount >= 2) {
        if (!soloist2.lickDictionary) {
          soloist2.lickDictionary = [];
        }
        const lickSequence = notes.map((n2) => n2.midi);
        const exists = soloist2.lickDictionary.some(
          (l3) => l3.sequence.join(",") === lickSequence.join(",")
        );
        if (!exists) {
          soloist2.lickDictionary.push({ sequence: lickSequence, score: stepwiseCount + 2 });
          if (soloist2.lickDictionary.length > 3) {
            soloist2.lickDictionary.shift();
          }
          logDebug(`Cached strong transient lick!`);
        }
      }
    }
    if (soloist2.phrasingState === "call" && soloist2.motifCache) {
      if (soloist2.motifCache.length < 16) {
        const relativeInterval = (result.midi % 12 - targetChord.rootMidi % 12 + 12) % 12;
        soloist2.motifCache.push({
          // @worker-mutation
          relativeStep: phraseRelativeStep,
          interval: relativeInterval,
          durationSteps: result.durationSteps
        });
        logDebug(`Motif recorded: step ${phraseRelativeStep}, int ${relativeInterval}`);
      }
    }
    const finalResult = extraNotes.length > 0 && isPolyphonic ? [
      ...extraNotes.map((n2) => ({
        ...result,
        ...n2,
        midi: Math.max(minMidi, Math.min(maxMidi, n2.midi))
      })),
      { ...result, midi: Math.max(minMidi, Math.min(maxMidi, result.midi)) }
    ] : { ...result, midi: Math.max(minMidi, Math.min(maxMidi, result.midi)) };
    if (soloist2.phrasingState === "resolution" && soloist2.lastAttackStep === step) {
      soloist2.phrasingState = "rest";
      soloist2.rhythmicMotif = [];
      const restMultiplier = config11.restBase * (2 - intensity * 1.5);
      const fatigueMultiplier = 1 + (soloist2.notesInPhrase || 0) * 0.02;
      const restVal = stepsPerMeasure * restMultiplier * fatigueMultiplier * (0.5 + Math.random() * 1.5);
      let finalRestSteps = Math.floor(restVal);
      const maxRestSteps = Math.floor(stepsPerMeasure * (0.75 - intensity * 0.25));
      if (finalRestSteps > maxRestSteps) {
        finalRestSteps = maxRestSteps;
      }
      soloist2.restSteps = finalRestSteps;
      if (soloist2.restSteps < 4) {
        soloist2.restSteps = 4;
      }
      logDebug(`Resolution hit. Transitioning to Rest for ~${soloist2.restSteps} steps`);
    }
    return finalizeNote(finalResult);
  }
  var CANDIDATE_WEIGHTS;
  var init_soloist = __esm({
    "public/soloist.js"() {
      init_config();
      init_groove_engine();
      init_soloist_config();
      init_soloist_devices();
      init_state();
      init_theory_scales();
      init_utils();
      CANDIDATE_WEIGHTS = new Float32Array(128);
    }
  });

  // public/engine/scheduler-core.js
  var scheduler_core_exports = {};
  __export(scheduler_core_exports, {
    scheduleChordVisuals: () => scheduleChordVisuals,
    scheduleGlobalEvent: () => scheduleGlobalEvent,
    scheduler: () => scheduler,
    togglePlay: () => togglePlay
  });
  function togglePlay(viz2, fromDispatch = false) {
    const { playback: playback6, arranger: arranger6, chords: chords2 } = getState();
    const activeViz = viz2 || playback6.viz;
    const isStopping = fromDispatch ? !playback6.isPlaying : playback6.isPlaying;
    if (isStopping) {
      if (!fromDispatch) {
        playback6.isPlaying = false;
      }
      if (playback6.autoIntensity) {
        conductorState.target = 0.35;
      }
      stopWorker();
      lockAudio();
      deactivateWakeLock();
      playback6.drawQueue = [];
      playback6.lastActiveDrumElements = null;
      chords2.lastActiveChordIndex = null;
      chords2.scheduledChordIndex = null;
      playback6.resolutionTriggered = false;
      playback6.isScheduling = false;
      dispatch(ACTIONS.SET_ENDING_PENDING, false);
      dispatch(ACTIONS.SET_STOP_AT_END, false);
      if (activeViz) {
        activeViz.clear();
      }
      dispatch("VIS_RESET");
      killAllNotes();
      panic(true);
      sendMIDITransport("stop", playback6.audio?.currentTime || 0);
      flushBuffers();
      if (playback6.audio) {
        if (playback6.suspendTimeout) {
          clearTimeout(playback6.suspendTimeout);
        }
        playback6.suspendTimeout = setTimeout(() => {
          if (!playback6.isPlaying && playback6.audio.state === "running") {
            playback6.audio.suspend();
          }
        }, 3e3);
      }
    } else {
      if (playback6.suspendTimeout) {
        clearTimeout(playback6.suspendTimeout);
      }
      initAudio();
      if (playback6.audio && playback6.audio.state === "suspended") {
        playback6.audio.resume();
      }
      if (!fromDispatch) {
        playback6.isPlaying = true;
        playback6.sessionStartTime = performance.now();
      }
      if (playback6.autoIntensity) {
        conductorState.target = 0.35;
      }
      playback6.step = 0;
      playback6.resolutionTriggered = false;
      playback6.isScheduling = false;
      chords2.scheduledChordIndex = 0;
      dispatch(ACTIONS.RESET_SESSION);
      dispatch(ACTIONS.SET_ENDING_PENDING, false);
      syncWorker();
      const primeSteps = arranger6.totalSteps > 0 ? arranger6.totalSteps * 2 : 0;
      flushBuffers(primeSteps);
      unlockAudio();
      restoreGains();
      const startTime = playback6.audio.currentTime + 0.1;
      playback6.nextNoteTime = startTime;
      playback6.unswungNextNoteTime = startTime;
      playback6.isCountingIn = playback6.countIn;
      playback6.countInBeat = 0;
      activateWakeLock();
      if (activeViz) {
        activeViz.setBeatReference(playback6.nextNoteTime);
      }
      if (!playback6.isDrawing) {
        playback6.isDrawing = true;
        requestAnimationFrame(() => draw(activeViz));
      }
      panic(true);
      sendMIDITransport("start", startTime);
      startWorker();
      scheduler();
    }
  }
  function triggerResolution(time) {
    const { playback: playback6, bass: bass2, soloist: soloist2, chords: chords2, harmony: harmony2, groove: groove2 } = getState();
    bass2.buffer.clear();
    soloist2.buffer.clear();
    chords2.buffer.clear();
    harmony2.buffer.clear();
    groove2.buffer.clear();
    requestResolution(playback6.step);
    setTimeout(() => {
      scheduleResolution(time);
    }, 50);
  }
  function scheduleResolution(time) {
    const { playback: playback6, bass: bass2, soloist: soloist2, chords: chords2, harmony: harmony2, groove: groove2 } = getState();
    const effectiveBpm = playback6.bpm + (conductorState.larsBpmOffset || 0);
    const spb = 60 / effectiveBpm;
    const measureDuration = 8 * spb;
    const dummyChordData = { chord: { freqs: [] } };
    if (bass2.enabled) {
      scheduleBass(dummyChordData, playback6.step, time);
    }
    if (soloist2.enabled) {
      scheduleSoloist(dummyChordData, playback6.step, time, time);
    }
    if (chords2.enabled) {
      scheduleChords(dummyChordData, playback6.step, time);
    }
    if (harmony2.enabled) {
      scheduleHarmonies(dummyChordData, playback6.step, time);
    }
    if (groove2.enabled) {
      scheduleDrumsFromBuffer(playback6.step, time);
    }
    if (playback6.visualFlash) {
      triggerFlash(0.4);
    }
    setTimeout(
      () => {
        if (playback6.isPlaying) {
          updateSustain(false);
        }
      },
      6 * spb * 1e3
    );
    setTimeout(() => {
      if (playback6.isPlaying) {
        dispatch(ACTIONS.TOGGLE_PLAY);
      }
    }, measureDuration * 1e3);
  }
  function scheduler() {
    const { playback: playback6, groove: groove2, arranger: arranger6 } = getState();
    if (playback6.isScheduling || !playback6.isPlaying) {
      return;
    }
    playback6.isScheduling = true;
    try {
      requestBuffer(playback6.step);
      if (groove2.pendingGenreFeel) {
        const stepsPerMeasure = getStepsPerMeasure(arranger6.timeSignature);
        const stepsRemaining = stepsPerMeasure - playback6.step % stepsPerMeasure;
        const beatsRemaining = Math.ceil(stepsRemaining / 4);
        if (groove2.genreSwitchCountdown !== beatsRemaining) {
          dispatch(ACTIONS.SET_GENRE_COUNTDOWN, beatsRemaining);
        }
      } else if (groove2.genreSwitchCountdown !== null) {
        dispatch(ACTIONS.SET_GENRE_COUNTDOWN, null);
      }
      while (playback6.nextNoteTime < playback6.audio.currentTime + playback6.scheduleAheadTime) {
        if (playback6.isCountingIn) {
          scheduleCountIn(playback6.countInBeat, playback6.nextNoteTime);
          advanceCountIn();
        } else {
          const spm = getStepsPerMeasure(arranger6.timeSignature);
          if (playback6.songMode && playback6.sessionTimer > 0 && !playback6.isEndingPending) {
            const elapsedMins = (performance.now() - playback6.sessionStartTime) / 6e4;
            if (elapsedMins >= playback6.sessionTimer) {
              dispatch(ACTIONS.SET_ENDING_PENDING, true);
            }
          }
          if (playback6.step > 0 && playback6.step % arranger6.totalSteps === 0) {
            playback6.currentLoopCount++;
            if (playback6.songMode && playback6.loopLimit > 0 && !playback6.isEndingPending) {
              if (playback6.currentLoopCount >= playback6.loopLimit) {
                dispatch(ACTIONS.SET_ENDING_PENDING, true);
              }
            }
            if (playback6.isEndingPending || playback6.stopAtEnd || playback6.resolutionTriggered) {
              if (!playback6.resolutionTriggered) {
                playback6.resolutionTriggered = true;
                playback6.stopAtEnd = false;
                triggerResolution(playback6.nextNoteTime);
              }
              return;
            }
          }
          if (playback6.step % spm === 0 && groove2.pendingGenreFeel) {
            applyPendingGenre();
          }
          scheduleGlobalEvent(playback6.step, playback6.nextNoteTime);
          advanceGlobalStep();
        }
      }
    } finally {
      const { playback: pb } = getState();
      pb.isScheduling = false;
    }
  }
  function applyPendingGenre() {
    const { groove: groove2, playback: playback6 } = getState();
    const payload = groove2.pendingGenreFeel;
    if (!payload) {
      return;
    }
    groove2.genreFeel = payload.feel;
    if (payload.swing !== void 0) {
      groove2.swing = payload.swing;
    }
    if (payload.sub !== void 0) {
      groove2.swingSub = payload.sub;
    }
    if (payload.genreName) {
      groove2.lastSmartGenre = payload.genreName;
    }
    if (payload.drum) {
      loadDrumPreset(payload.drum);
    }
    groove2.pendingGenreFeel = null;
    playback6.nextNoteTime = playback6.unswungNextNoteTime;
    syncAndFlushWorker(playback6.step);
    triggerFlash(0.15);
  }
  function advanceCountIn() {
    const { playback: playback6, arranger: arranger6 } = getState();
    const effectiveBpm = playback6.bpm + (conductorState.larsBpmOffset || 0);
    const beatDuration = 60 / effectiveBpm;
    playback6.nextNoteTime += beatDuration;
    playback6.unswungNextNoteTime += beatDuration;
    playback6.countInBeat++;
    const ts = TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"];
    if (playback6.countInBeat >= ts.beats) {
      playback6.isCountingIn = false;
      playback6.step = 0;
    }
  }
  function scheduleCountIn(beat, time) {
    const { playback: playback6, arranger: arranger6 } = getState();
    if (playback6.visualFlash) {
      playback6.drawQueue.push({ type: "flash", time, intensity: 0.3, beat: 1 });
    }
    const osc = playback6.audio.createOscillator();
    const gain = playback6.audio.createGain();
    osc.connect(gain);
    gain.connect(playback6.masterGain);
    const ts = TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"];
    let freq = 440;
    if (beat === 0) {
      freq = 1e3;
    } else if (ts.grouping && ts.grouping.length > 1) {
      let accumulated = 0;
      for (const g4 of ts.grouping) {
        if (beat === accumulated && beat !== 0) {
          freq = 800;
          break;
        }
        accumulated += g4;
      }
    } else {
      if (beat === 0) {
        freq = 1e3;
      } else if (ts.beats % 2 === 0 && beat === ts.beats / 2) {
        freq = 800;
      } else if (ts.stepsPerBeat === 3 && beat % 3 === 0 && beat !== 0) {
        freq = 800;
      }
    }
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(1e-3, time + 0.1);
    osc.onended = () => {
      gain.disconnect();
      osc.disconnect();
    };
    osc.start(time);
    osc.stop(time + 0.1);
    const pickupStep = (beat - ts.beats) * ts.stepsPerBeat;
    const soloistNote = getSoloistNote(
      { rootMidi: 60, scale: [0, 2, 4, 5, 7, 9, 11], intervals: [0, 4, 7] },
      // C Major dummy
      { rootMidi: 60, scale: [0, 2, 4, 5, 7, 9, 11], intervals: [0, 4, 7] },
      pickupStep,
      0,
      64,
      "lead_sheet",
      0,
      false
    );
    if (soloistNote) {
      sendMIDINote(
        "Soloist",
        soloistNote.midi,
        soloistNote.velocity,
        time,
        soloistNote.duration || 0.25
      );
      playback6.drawQueue.push({
        type: "note",
        track: "soloist",
        midi: soloistNote.midi,
        time,
        velocity: soloistNote.velocity
      });
    }
  }
  function advanceGlobalStep() {
    const { playback: playback6, groove: groove2, arranger: arranger6 } = getState();
    updateLarsTempo(playback6.step);
    const effectiveBpm = playback6.bpm + (conductorState.larsBpmOffset || 0);
    const sixteenth = 0.25 * (60 / effectiveBpm);
    let duration = sixteenth;
    if (groove2.swing > 0) {
      const sInfo = getStepInfo(
        playback6.step,
        TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"],
        arranger6.measureMap,
        TIME_SIGNATURES
      );
      const ts = TIME_SIGNATURES[sInfo.tsName] || TIME_SIGNATURES["4/4"];
      if (ts.stepsPerBeat === 4) {
        const shift = sixteenth / 3 * (groove2.swing / 100);
        duration += groove2.swingSub === "16th" ? playback6.step % 2 === 0 ? shift : -shift : playback6.step % (ts.stepsPerBeat * 1) < ts.stepsPerBeat / 2 ? shift : -shift;
      } else if (ts.stepsPerBeat === 3) {
        const shift = sixteenth / 3 * (groove2.swing / 100);
        duration += groove2.swingSub === "16th" ? playback6.step % 2 === 0 ? shift : -shift : playback6.step % ts.stepsPerBeat === 0 ? shift : playback6.step % ts.stepsPerBeat === 2 ? -shift : 0;
      }
    }
    playback6.nextNoteTime += duration;
    playback6.unswungNextNoteTime += sixteenth;
    playback6.step++;
  }
  function getChordAtStep(step) {
    const { arranger: arranger6, chords: chords2 } = getState();
    if (arranger6.totalSteps === 0) {
      return null;
    }
    const targetStep = step % arranger6.totalSteps;
    const lastStep = arranger6.stepMap[chords2.scheduledChordIndex || 0]?.start || 0;
    if (targetStep < lastStep) {
      chords2.scheduledChordIndex = 0;
    }
    const startI = chords2.scheduledChordIndex || 0;
    for (let i3 = startI; i3 < arranger6.stepMap.length; i3++) {
      const entry = arranger6.stepMap[i3];
      if (targetStep >= entry.start && targetStep < entry.end) {
        chords2.scheduledChordIndex = i3;
        return { chord: entry.chord, stepInChord: targetStep - entry.start, chordIndex: i3 };
      }
    }
    return null;
  }
  function scheduleDrums(params) {
    const {
      step,
      time,
      isDownbeat,
      isBeatStart,
      isBackbeat,
      absoluteStep,
      isGroupStart,
      sectionId,
      beatIndex,
      isOffbeat,
      isEOfBeat,
      isAOfBeat,
      tsConfig,
      isTurnaround
    } = params;
    const { playback: playback6, groove: groove2, vizState: vizState2, midi: midi2, arranger: arranger6 } = getState();
    const conductorVel = playback6.conductorVelocity || 1;
    const finalTime = time + calculatePocketOffset(playback6, groove2);
    const stepsPerBar = getStepsPerMeasure(arranger6.timeSignature);
    if (groove2.fillActive) {
      const fillStep = absoluteStep - groove2.fillStartStep;
      if (fillStep >= groove2.fillLength) {
        dispatch(ACTIONS.SET_PARAM, { module: "groove", param: "fillActive", value: false });
        if (groove2.pendingCrash) {
          playDrumSound("Crash", finalTime, 1.1 * conductorVel);
          groove2.pendingCrash = false;
        }
      }
    }
    if (groove2.fillActive) {
      const fillStep = absoluteStep - groove2.fillStartStep;
      if (fillStep >= 0 && fillStep < groove2.fillLength) {
        if (playback6.bandIntensity >= 0.5 || fillStep >= groove2.fillLength / 2) {
          const notes = groove2.fillSteps[fillStep];
          if (notes && notes.length > 0) {
            if (vizState2.enabled && playback6.viz) {
              playback6.drawQueue.push({
                type: "fill_active",
                time: finalTime,
                active: true
              });
            }
            notes.forEach((note) => {
              playDrumSound(note.name, finalTime, note.vel * conductorVel);
              if (vizState2.enabled && playback6.viz) {
                const midiNum = DRUM_VIS_PITCHES[note.name] || 36;
                playback6.drawQueue.push({
                  type: "drums_vis",
                  midi: midiNum,
                  time: finalTime,
                  velocity: note.vel * conductorVel,
                  duration: 0.1
                });
              }
            });
            return;
          }
        }
      }
    } else if (vizState2.enabled && playback6.viz) {
      playback6.drawQueue.push({ type: "fill_active", time: finalTime, active: false });
    }
    const seedIdx = groove2.sectionSeedMap && sectionId ? groove2.sectionSeedMap[sectionId] || 0 : 0;
    const preset = DRUM_PRESETS[groove2.lastDrumPreset];
    groove2.instruments.forEach((inst) => {
      let stepVal = inst.steps[step];
      if (groove2.creativity && preset && preset.variations && preset.variations[seedIdx]) {
        const varInst = preset.variations[seedIdx][inst.name];
        if (varInst) {
          stepVal = varInst[step];
        }
      }
      const { shouldPlay, velocity, soundName, instTimeOffset } = applyGrooveOverrides({
        step: absoluteStep,
        inst,
        stepVal,
        playback: playback6,
        groove: groove2,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        isGroupStart,
        beatIndex,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        tsConfig,
        isTurnaround,
        stepsPerBar,
        loopStep: step
        // scheduleDrums 'step' is the local drum loop step
      });
      if (shouldPlay && !inst.muted) {
        const playTime = finalTime + instTimeOffset;
        playDrumSound(soundName, playTime, velocity * conductorVel);
        if (vizState2.enabled && playback6.viz) {
          const midiNum = DRUM_VIS_PITCHES[soundName] || 36;
          playback6.drawQueue.push({
            type: "drums_vis",
            midi: midiNum,
            time: playTime,
            velocity: velocity * conductorVel,
            duration: 0.1
          });
        }
        sendMIDIDrum(
          soundName,
          playTime,
          Math.min(1, velocity * conductorVel),
          midi2.drumsOctave
        );
      }
    });
  }
  function scheduleDrumsFromBuffer(step, time) {
    const { groove: groove2, playback: playback6, vizState: vizState2, midi: midi2 } = getState();
    const notes = groove2.buffer.get(step);
    groove2.buffer.delete(step);
    if (notes && notes.length > 0) {
      const conductorVel = playback6.conductorVelocity || 1;
      notes.forEach((n2) => {
        const { name, velocity, timingOffset } = n2;
        const playTime = time + (timingOffset || 0);
        playDrumSound(name, playTime, velocity * conductorVel);
        if (vizState2.enabled && playback6.viz) {
          const midiNum = DRUM_VIS_PITCHES[name] || 36;
          playback6.drawQueue.push({
            type: "drums_vis",
            midi: midiNum,
            time: playTime,
            velocity: velocity * conductorVel,
            duration: 0.1
          });
        }
        sendMIDIDrum(name, playTime, Math.min(1, velocity * conductorVel), midi2.drumsOctave);
      });
    }
  }
  function scheduleBass(chordData, step, time) {
    const { bass: bass2, playback: playback6, vizState: vizState2, midi: midi2 } = getState();
    const notes = bass2.buffer.get(step);
    bass2.buffer.delete(step);
    if (notes && notes.length > 0) {
      notes.forEach((noteEntry) => {
        if (noteEntry?.freq) {
          const { freq, durationSteps, velocity, timingOffset, muted } = noteEntry;
          const { chord } = chordData;
          const adjustedTime = time + (timingOffset || 0);
          bass2.lastPlayedFreq = freq;
          const midiNum = getMidi(freq);
          const { name, octave } = midiToNote(midiNum);
          const spb = 60 / playback6.bpm;
          const duration = (durationSteps || 4) * 0.25 * spb;
          const finalVel = (velocity || 1) * (playback6.conductorVelocity || 1);
          if (vizState2.enabled && playback6.viz) {
            playback6.viz.truncateNotes("bass", adjustedTime);
            playback6.drawQueue.push({
              type: "bass_vis",
              name,
              octave,
              midi: midiNum,
              time: adjustedTime,
              chordNotes: chord.freqs.map((f3) => getMidi(f3)),
              duration
            });
          }
          playBassNote(freq, adjustedTime, duration, finalVel, muted);
          if (!muted) {
            sendMIDINote(
              midi2.bassChannel,
              midiNum + midi2.bassOctave * 12,
              normalizeMidiVelocity(finalVel),
              adjustedTime,
              duration,
              true
            );
          }
        }
      });
    }
  }
  function scheduleSoloist(chordData, step, _time, unswungTime) {
    const { soloist: soloist2, playback: playback6, vizState: vizState2, midi: midi2 } = getState();
    const notes = soloist2.buffer.get(step);
    soloist2.buffer.delete(step);
    if (notes && notes.length > 0) {
      if (playback6.debugSoloist) {
        console.log(
          `[Soloist Debug] Step ${step}: Scheduling ${notes.length} notes from buffer`
        );
      }
      let notesToPlay = notes;
      if (soloist2.mode === "monophonic" && notes.length > 1) {
        notesToPlay = [notes[0]];
      }
      let numVoices = 0;
      for (let i3 = 0; i3 < notesToPlay.length; i3++) {
        if (notesToPlay[i3].freq) {
          numVoices++;
        }
      }
      const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
      notesToPlay.forEach((noteEntry) => {
        if (noteEntry?.freq) {
          const {
            freq,
            durationSteps,
            velocity,
            bendStartInterval,
            style,
            timingOffset,
            noteType
          } = noteEntry;
          const { chord } = chordData;
          const offsetS = timingOffset || 0;
          if (!noteEntry.isDoubleStop) {
            soloist2.lastPlayedFreq = freq;
          }
          const midiNum = noteEntry.midi || getMidi(freq);
          const { name, octave } = midiToNote(midiNum);
          const spb = 60 / playback6.bpm;
          const duration = (durationSteps || 4) * 0.25 * spb;
          const baseVel = (velocity || 1) * (playback6.conductorVelocity || 1);
          const vel = baseVel * polyphonyComp;
          const playTime = unswungTime + offsetS;
          playSoloNote(freq, playTime, duration, vel, bendStartInterval || 0, style);
          const isMono = soloist2.mode === "monophonic";
          let bend = 0;
          if (bendStartInterval !== 0) {
            bend = Math.round(-(bendStartInterval / 2) * 8192);
          }
          sendMIDINote(
            midi2.soloistChannel,
            midiNum + midi2.soloistOctave * 12,
            normalizeMidiVelocity(vel),
            playTime,
            duration,
            { isMono, bend }
          );
          if (vizState2.enabled && playback6.viz) {
            if (isMono) {
              playback6.viz.truncateNotes("soloist", playTime);
            }
            playback6.drawQueue.push({
              type: "soloist_vis",
              name,
              octave,
              midi: midiNum,
              time: playTime,
              chordNotes: chord.freqs.map((f3) => getMidi(f3)),
              duration,
              noteType
            });
          }
          soloist2.lastNoteEnd = playTime + duration;
        }
      });
    }
  }
  function scheduleChordVisuals(chordData, t3) {
    const { playback: playback6 } = getState();
    if (chordData.stepInChord === 0) {
      playback6.drawQueue.push({
        type: "chord_vis",
        time: t3,
        index: chordData.chordIndex,
        chordNotes: chordData.chord.freqs.map((f3) => getMidi(f3)),
        rootMidi: chordData.chord.rootMidi,
        intervals: chordData.chord.intervals,
        duration: chordData.chord.beats * (60 / playback6.bpm)
      });
      if (playback6.visualFlash) {
        triggerFlash(0.1);
      }
    }
  }
  function scheduleChords(_chordData, step, time) {
    const { chords: chords2, playback: playback6, midi: midi2 } = getState();
    const notes = chords2.buffer.get(step);
    chords2.buffer.delete(step);
    if (notes && notes.length > 0) {
      const spb = 60 / playback6.bpm;
      let numVoices = 0;
      for (let i3 = 0; i3 < notes.length; i3++) {
        if (!notes[i3].muted && notes[i3].freq) {
          numVoices++;
        }
      }
      notes.forEach((n2) => {
        const {
          freq,
          velocity,
          timingOffset,
          durationSteps,
          muted,
          instrument,
          dry,
          ccEvents
        } = n2;
        const playTime = time + (timingOffset || 0);
        if (ccEvents && ccEvents.length > 0) {
          ccEvents.forEach((cc) => {
            if (cc.controller === 64) {
              const isSustain = cc.value >= 64;
              const ccTime = playTime + (cc.timingOffset || 0);
              updateSustain(isSustain, ccTime);
              sendMIDICC(midi2.chordsChannel, 64, cc.value, ccTime);
            }
          });
        }
        if (!muted && freq) {
          const duration = (durationSteps || 1) * 0.25 * spb;
          playNote(freq, playTime, duration, {
            vol: velocity,
            index: 0,
            instrument: instrument || "Piano",
            dry,
            numVoices
          });
          sendMIDINote(
            midi2.chordsChannel,
            getMidi(freq) + midi2.chordsOctave * 12,
            normalizeMidiVelocity(velocity),
            playTime,
            duration
          );
        }
      });
    }
  }
  function scheduleHarmonies(_chordData, step, time) {
    const { harmony: harmony2, playback: playback6, vizState: vizState2, midi: midi2 } = getState();
    const notes = harmony2.buffer.get(step);
    harmony2.buffer.delete(step);
    if (notes && notes.length > 0) {
      const spb = 60 / playback6.bpm;
      const starter = notes.find((n2) => n2.isChordStart);
      if (starter) {
        killHarmonyNote(starter.killFade || 0.05);
      }
      let numVoices = 0;
      for (let i3 = 0; i3 < notes.length; i3++) {
        if (notes[i3].freq || notes[i3].midi) {
          numVoices++;
        }
      }
      const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));
      notes.forEach((n2) => {
        const {
          freq,
          velocity,
          timingOffset,
          durationSteps,
          midi: noteMidi,
          style,
          slideInterval,
          slideDuration,
          vibrato
        } = n2;
        const playTime = time + (timingOffset || 0);
        const m3 = noteMidi || getMidi(freq);
        if (freq || m3) {
          const duration = (durationSteps || 1) * 0.25 * spb;
          const baseVel = velocity * (playback6.conductorVelocity || 1);
          const finalVel = baseVel * polyphonyComp;
          playHarmonyNote(
            freq || 440,
            playTime,
            duration,
            finalVel,
            style,
            m3,
            slideInterval,
            slideDuration,
            vibrato
          );
          sendMIDINote(
            midi2.harmonyChannel,
            m3 + midi2.harmonyOctave * 12,
            normalizeMidiVelocity(finalVel),
            playTime,
            duration
          );
          if (vizState2.enabled && playback6.viz) {
            const { name, octave } = midiToNote(m3);
            playback6.drawQueue.push({
              type: "harmony_vis",
              name,
              octave,
              midi: m3,
              time: playTime,
              duration
            });
          }
        }
      });
    }
  }
  function scheduleGlobalEvent(step, swungTime) {
    const { arranger: arranger6, playback: playback6, groove: groove2, soloist: soloist2, midi: midi2, chords: chords2, bass: bass2, harmony: harmony2 } = getState();
    const globalTS = TIME_SIGNATURES[arranger6.timeSignature] || TIME_SIGNATURES["4/4"];
    const stepInfo = getStepInfo(step, globalTS, arranger6.measureMap, TIME_SIGNATURES);
    const ts = TIME_SIGNATURES[stepInfo.tsName] || globalTS;
    updateAutoConductor();
    const spm = getStepsPerMeasure(stepInfo.tsName);
    if (step % spm === 0) {
      let snareMask = 0;
      const snare = groove2.instruments.find((i3) => i3.name === "Snare");
      if (snare) {
        for (let i3 = 0; i3 < spm; i3++) {
          if (snare.steps[i3] > 0) {
            snareMask |= 1 << i3;
          }
        }
      }
      if (groove2.snareMask !== snareMask) {
        groove2.snareMask = snareMask;
        syncWorker(ACTIONS.SET_PARAM, {
          module: "groove",
          param: "snareMask",
          value: snareMask
        });
      }
    }
    checkSectionTransition(step, spm);
    if (midi2.enabled && midi2.selectedOutputId && stepInfo.isBeatStart) {
      const intensityCC = Math.floor(playback6.bandIntensity * 127);
      const soloistTensionCC = Math.floor(soloist2.tension * 127);
      sendMIDICC(midi2.soloistChannel, 1, soloistTensionCC, swungTime);
      sendMIDICC(midi2.soloistChannel, 11, intensityCC, swungTime);
      sendMIDICC(midi2.chordsChannel, 11, intensityCC, swungTime);
      sendMIDICC(midi2.bassChannel, 11, intensityCC, swungTime);
    }
    const drumStep = step % (groove2.measures * spm);
    const t3 = swungTime + (Math.random() - 0.5) * (groove2.humanize / 100) * 0.025;
    if (playback6.metronome && stepInfo.isBeatStart) {
      let freq = stepInfo.isMeasureStart ? 1e3 : stepInfo.isGroupStart ? 800 : 600;
      if (ts.beats % 2 === 0 && stepInfo.beatIndex === ts.beats / 2 && !stepInfo.isGroupStart) {
        freq = 800;
      }
      const osc = playback6.audio.createOscillator();
      const g4 = playback6.audio.createGain();
      osc.connect(g4);
      g4.connect(playback6.masterGain);
      osc.frequency.setValueAtTime(freq, swungTime);
      g4.gain.setValueAtTime(0.15, swungTime);
      g4.gain.exponentialRampToValueAtTime(1e-3, swungTime + 0.05);
      osc.start(swungTime);
      osc.stop(swungTime + 0.05);
      osc.onended = () => {
        g4.disconnect();
        osc.disconnect();
      };
    }
    const feel = groove2.genreFeel;
    const straightness = feel === "Reggae" ? 0.5 : soloist2.style === "neo" ? 0.65 : soloist2.style === "blues" ? 0.55 : soloist2.style === "bossa" ? 0.75 : 0.65;
    const soloistTime = playback6.unswungNextNoteTime * straightness + swungTime * (1 - straightness) + (Math.random() - 0.5) * (groove2.humanize / 100) * 0.025;
    if (groove2.enabled) {
      if (stepInfo.isBeatStart && playback6.visualFlash) {
        playback6.drawQueue.push({
          type: "flash",
          time: swungTime,
          intensity: stepInfo.isMeasureStart ? 0.2 : stepInfo.isGroupStart ? 0.15 : 0.1,
          beat: stepInfo.isMeasureStart ? 1 : 0
        });
      }
      playback6.drawQueue.push({ type: "drum_vis", step: drumStep, time: swungTime });
      const chordDataForDrums = getChordAtStep(step);
      const sectionId = chordDataForDrums?.chord?.sectionId || null;
      const stepsPerBar = spm;
      const entry = arranger6.sectionMap?.find((e3) => step >= e3.start && step < e3.end);
      let isTurnaround = false;
      if (groove2.creativity) {
        let measuresInSection = 4;
        let startStep = 0;
        if (entry) {
          measuresInSection = Math.max(1, (entry.end - entry.start) / stepsPerBar);
          startStep = entry.start;
        }
        const barInSection = Math.floor((step - startStep) / stepsPerBar);
        isTurnaround = measuresInSection > 1 && barInSection % measuresInSection === measuresInSection - 1;
      }
      scheduleDrums({
        step: drumStep,
        time: t3,
        isDownbeat: stepInfo.isMeasureStart,
        isBeatStart: stepInfo.isBeatStart,
        isBackbeat: stepInfo.isBackbeat,
        absoluteStep: step,
        isGroupStart: stepInfo.isGroupStart,
        sectionId,
        beatIndex: stepInfo.beatIndex,
        isOffbeat: stepInfo.isOffbeat,
        isEOfBeat: stepInfo.isEOfBeat,
        isAOfBeat: stepInfo.isAOfBeat,
        tsConfig: stepInfo.tsConfig,
        isTurnaround
      });
    }
    const chordData = getChordAtStep(step);
    if (chordData) {
      if (chordData.chord.key && chordData.chord.key !== playback6.currentKey) {
        playback6.currentKey = chordData.chord.key;
        window.dispatchEvent(
          new CustomEvent("key-change", { detail: { key: playback6.currentKey } })
        );
      }
      scheduleChordVisuals(chordData, t3);
      if (bass2.enabled) {
        scheduleBass(chordData, step, t3);
      }
      if (soloist2.enabled) {
        scheduleSoloist(chordData, step, t3, soloistTime);
      }
      if (chords2.enabled) {
        scheduleChords(chordData, step, t3);
      }
      if (harmony2.enabled) {
        scheduleHarmonies(chordData, step, t3);
      }
    }
  }
  function syncAndFlushWorker(step) {
    const { arranger: arranger6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, groove: groove2, playback: playback6 } = getState();
    const syncData = {
      arranger: {
        progression: arranger6.progression,
        stepMap: arranger6.stepMap,
        sectionMap: arranger6.sectionMap,
        totalSteps: arranger6.totalSteps,
        key: arranger6.key,
        isMinor: arranger6.isMinor,
        timeSignature: arranger6.timeSignature,
        grouping: arranger6.grouping
      },
      chords: {
        style: chords2.style,
        octave: chords2.octave,
        density: chords2.density,
        enabled: chords2.enabled,
        volume: chords2.volume
      },
      bass: {
        style: bass2.style,
        octave: bass2.octave,
        enabled: bass2.enabled,
        lastFreq: bass2.lastFreq,
        volume: bass2.volume
      },
      soloist: {
        style: soloist2.style,
        octave: soloist2.octave,
        enabled: soloist2.enabled,
        lastFreq: soloist2.lastFreq,
        volume: soloist2.volume,
        mode: soloist2.mode
      },
      harmony: {
        style: harmony2.style,
        octave: harmony2.octave,
        enabled: harmony2.enabled,
        volume: harmony2.volume,
        complexity: harmony2.complexity
      },
      groove: {
        genreFeel: groove2.genreFeel,
        lastDrumPreset: groove2.lastDrumPreset,
        enabled: groove2.enabled,
        volume: groove2.volume,
        measures: groove2.measures,
        swing: groove2.swing,
        swingSub: groove2.swingSub,
        instruments: groove2.instruments.map((i3) => ({
          name: i3.name,
          steps: [...i3.steps],
          muted: i3.muted
        }))
      },
      playback: {
        bpm: playback6.bpm,
        bandIntensity: playback6.bandIntensity,
        complexity: playback6.complexity,
        autoIntensity: playback6.autoIntensity,
        songMode: playback6.songMode,
        sessionTimer: playback6.sessionTimer,
        sessionStartTime: playback6.sessionStartTime,
        isEndingPending: playback6.isEndingPending
      }
    };
    chords2.buffer.clear();
    bass2.buffer.clear();
    soloist2.buffer.clear();
    harmony2.buffer.clear();
    dispatch(ACTIONS.SET_PARAM, { module: "groove", param: "fillActive", value: false });
    killAllNotes();
    flushWorker(step, syncData);
    restoreGains();
  }
  var DRUM_VIS_PITCHES;
  var init_scheduler_core = __esm({
    "public/engine/scheduler-core.js"() {
      init_animation_loop();
      init_conductor();
      init_config();
      init_instrument_controller();
      init_midi_controller();
      init_platform();
      init_presets();
      init_soloist();
      init_state();
      init_types();
      init_ui();
      init_utils();
      init_worker_client();
      init_engine();
      init_groove_engine();
      DRUM_VIS_PITCHES = {
        Kick: 36,
        Snare: 38,
        HiHat: 42,
        ClosedHat: 42,
        Open: 46,
        OpenHat: 46,
        Ride: 51,
        Crash: 49,
        TomHi: 50,
        TomMid: 47,
        TomLow: 45,
        Rimshot: 37,
        Clap: 39,
        Shaker: 70,
        Cowbell: 56
      };
      initPlatform();
    }
  });

  // public/app-controller.js
  var app_controller_exports = {};
  __export(app_controller_exports, {
    applyTheme: () => applyTheme,
    setBpm: () => setBpm
  });
  function applyTheme(theme) {
    const { playback: playback6 } = getState();
    playback6.theme = theme;
    if (theme === "auto") {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    } else {
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.style.colorScheme = theme;
    }
  }
  function setBpm(val, viz2, fromDispatch = false, oldBpmParam = null) {
    const { playback: playback6, arranger: arranger6 } = getState();
    const newBpm = Math.max(40, Math.min(240, parseInt(val, 10)));
    const currentBpm = fromDispatch ? oldBpmParam || playback6.bpm : playback6.bpm;
    if (!fromDispatch && newBpm === currentBpm) {
      return;
    }
    if (playback6.isPlaying && playback6.audio) {
      const now = playback6.audio.currentTime;
      const ratio = currentBpm / newBpm;
      const noteTimeRemaining = playback6.nextNoteTime - now;
      if (noteTimeRemaining > 0) {
        playback6.nextNoteTime = now + noteTimeRemaining * ratio;
      }
      const unswungNextNoteTimeRemaining = playback6.unswungNextNoteTime - now;
      if (unswungNextNoteTimeRemaining > 0) {
        playback6.unswungNextNoteTime = now + unswungNextNoteTimeRemaining * ratio;
      }
    }
    if (!fromDispatch) {
      playback6.bpm = newBpm;
    }
    syncWorker();
    saveCurrentState();
    if (!fromDispatch) {
      dispatch("BPM_CHANGE");
    }
    if (viz2 && playback6.isPlaying && playback6.audio) {
      const secondsPerBeat = 60 / playback6.bpm;
      const sixteenth = 0.25 * secondsPerBeat;
      const stepsPerMeasure = getStepsPerMeasure(arranger6.timeSignature);
      const measureTime = playback6.unswungNextNoteTime - playback6.step % stepsPerMeasure * sixteenth;
      viz2.setBeatReference(measureTime);
    }
  }
  var init_app_controller = __esm({
    "public/app-controller.js"() {
      init_persistence();
      init_state();
      init_utils();
      init_worker_client();
    }
  });

  // public/state.js
  var state_exports = {};
  __export(state_exports, {
    arranger: () => arranger,
    arrangerReducer: () => arrangerReducer,
    bass: () => bass,
    chords: () => chords,
    dispatch: () => dispatch,
    getState: () => getState,
    groove: () => groove,
    grooveReducer: () => grooveReducer,
    harmony: () => harmony,
    instrumentReducer: () => instrumentReducer,
    midi: () => midi,
    midiReducer: () => midiReducer,
    playback: () => playback,
    playbackReducer: () => playbackReducer,
    soloist: () => soloist,
    storage: () => storage,
    subscribe: () => subscribe,
    vizReducer: () => vizReducer,
    vizState: () => vizState
  });
  function getState() {
    return stateMap;
  }
  function dispatch(action, payload) {
    let handled = false;
    const oldBpm = playback.bpm;
    if (action === ACTIONS.SET_PARAM) {
      switch (payload.module) {
        case MODULES.PLAYBACK:
          setPlaybackParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.CHORDS:
          setChordsParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.BASS:
          setBassParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.SOLOIST:
          setSoloistParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.GROOVE:
        case "drum":
        case "drums":
          setGrooveParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.HARMONIES:
        case "harmony":
          setHarmonyParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.ARRANGER:
          setArrangerParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.VIZ:
          setVizParam(payload.param, payload.value);
          handled = true;
          break;
        case MODULES.MIDI:
          setMidiParam(payload.param, payload.value);
          handled = true;
          break;
        default:
          console.warn(`[State] SET_PARAM failed: Unknown module ${payload.module}`);
          break;
      }
    }
    if (!handled) {
      if (playbackReducer(action, payload)) {
        handled = true;
      }
      if (arrangerReducer(action, payload)) {
        handled = true;
      }
      if (instrumentReducer(action, payload)) {
        handled = true;
      }
      if (grooveReducer(action, payload, playback)) {
        handled = true;
      }
      if (midiReducer(action, payload)) {
        handled = true;
      }
      if (vizReducer(action, payload)) {
        handled = true;
      }
    }
    playback.stateVersion++;
    listeners.forEach((listener) => listener(action, payload, stateMap));
    handleEffects(action, payload, { oldBpm });
  }
  async function handleEffects(action, payload, context = {}) {
    switch (action) {
      case ACTIONS.TOGGLE_PLAY: {
        const { togglePlay: togglePlay2 } = await Promise.resolve().then(() => (init_scheduler_core(), scheduler_core_exports));
        togglePlay2(payload?.viz, true);
        break;
      }
      case ACTIONS.SET_BPM: {
        const { setBpm: setBpm2 } = await Promise.resolve().then(() => (init_app_controller(), app_controller_exports));
        setBpm2(payload, payload?.viz, true, context.oldBpm);
        break;
      }
      case ACTIONS.SET_GENRE_FEEL: {
        if (payload.drum && !playback.isPlaying) {
          const { loadDrumPreset: loadDrumPreset2 } = await Promise.resolve().then(() => (init_instrument_controller(), instrument_controller_exports));
          loadDrumPreset2(payload.drum);
        }
        break;
      }
    }
  }
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  var stateMap, storage, listeners;
  var init_state = __esm({
    "public/state.js"() {
      init_constants();
      init_arranger();
      init_groove();
      init_instruments();
      init_midi();
      init_playback();
      init_visualizer();
      init_types();
      stateMap = {
        playback,
        chords,
        bass,
        soloist,
        groove,
        harmony,
        arranger,
        vizState,
        midi
      };
      storage = {
        get: (key) => {
          if (typeof localStorage === "undefined") {
            return [];
          }
          try {
            return JSON.parse(localStorage.getItem(`ensemble_${key}`) || "[]");
          } catch (e3) {
            console.error(`[State] Failed to load ${key} from storage:`, e3);
            return [];
          }
        },
        save: (key, val) => {
          if (typeof localStorage === "undefined") {
            return;
          }
          localStorage.setItem(`ensemble_${key}`, JSON.stringify(val));
        }
      };
      listeners = /* @__PURE__ */ new Set();
    }
  });

  // public/chords.js
  var chords_exports = {};
  __export(chords_exports, {
    getBestInversion: () => getBestInversion,
    getChordDetails: () => getChordDetails,
    getFormattedChordNames: () => getFormattedChordNames,
    getIntervals: () => getIntervals,
    mutateProgression: () => mutateProgression,
    transformRelativeProgression: () => transformRelativeProgression,
    validateProgression: () => validateProgression
  });
  function getChordDetails(symbol) {
    let quality = "major", is7th = symbol.includes("7") || symbol.includes("9") || symbol.includes("11") || symbol.includes("13") || symbol.includes("alt");
    const suffixMatch = symbol.match(
      /(maj7#11|maj7#5|maj7\+|maj7|maj9|maj11|maj13|maj|M7#5|M7\+|M7|m13|m11|m9|m7b5|m7|m6|min|m|dim7|dim|o7|o|°7|°|7#5|7\+|7aug|aug7|aug|\+7|\+|-|ø7|ø|h7|7b5|sus4|sus2|add9|7alt|7b13|7#11|7b9|7#9|7|alt|13|11|9|6|5)/
    );
    const suffix = suffixMatch ? suffixMatch[1] : "";
    if (suffix === "maj13") {
      quality = "maj13";
    } else if (suffix === "maj11") {
      quality = "maj11";
    } else if (suffix === "maj9") {
      quality = "maj9";
    } else if (suffix === "maj7#11") {
      quality = "maj7#11";
    } else if (suffix === "maj7#5" || suffix === "maj7+" || suffix === "M7#5" || suffix === "M7+") {
      quality = "augmaj7";
      is7th = true;
    } else if (suffix.includes("maj") || suffix === "M7") {
      quality = "maj7";
    } else if (suffix === "m13") {
      quality = "m13";
    } else if (suffix === "m11") {
      quality = "m11";
    } else if (suffix === "m9") {
      quality = "m9";
    } else if (suffix === "m7b5" || suffix === "\xF87" || suffix === "\xF8" || suffix === "h7" || symbol.includes("7b5")) {
      quality = "halfdim";
    } else if (suffix === "m6") {
      quality = "m6";
    } else if (suffix === "m7" || suffix === "min" || suffix === "m" || suffix === "-") {
      quality = "minor";
    } else if (suffix === "o7" || suffix === "o" && is7th || suffix === "dim7" || suffix === "\xB07" || suffix === "\xB0" && is7th) {
      quality = "dim";
      is7th = true;
    } else if (suffix === "o" || suffix === "dim" || suffix === "\xB0") {
      quality = "dim";
    } else if (suffix === "7#5" || suffix === "7+" || suffix === "7aug" || suffix === "aug7" || suffix === "+7") {
      quality = "aug";
      is7th = true;
    } else if (suffix.includes("aug") || suffix === "+") {
      quality = "aug";
    } else if (suffix === "sus4") {
      quality = "sus4";
    } else if (suffix === "sus2") {
      quality = "sus2";
    } else if (suffix === "add9") {
      quality = "add9";
    } else if (suffix === "7alt" || suffix === "alt") {
      quality = "7alt";
    } else if (suffix === "7b13") {
      quality = "7b13";
    } else if (suffix === "7#11") {
      quality = "7#11";
    } else if (suffix === "7b9") {
      quality = "7b9";
    } else if (suffix === "7#9") {
      quality = "7#9";
    } else if (suffix === "13") {
      quality = "13";
    } else if (suffix === "11") {
      quality = "11";
    } else if (suffix === "9") {
      quality = "9";
    } else if (suffix === "7") {
      quality = "7";
    } else if (suffix === "6") {
      quality = "6";
    } else if (suffix === "5") {
      quality = "5";
    }
    return { quality, is7th, suffix };
  }
  function getBestInversion(rootMidi, intervals, previousMidis, isPivot = false, anchor = null, min3 = 40, max3 = 80, style = "stabs") {
    const { chords: chords2 } = getState();
    const homeAnchor = anchor || chords2.octave || 60;
    const registerPullWeight = style === "organ" ? 0.8 : 0.6;
    const RANGE_MIN = min3;
    const RANGE_MAX = max3;
    let targetCenter = homeAnchor;
    if (previousMidis && previousMidis.length > 0) {
      let sum = 0;
      for (let i3 = 0; i3 < previousMidis.length; i3++) {
        sum += previousMidis[i3];
      }
      const prevAvg = sum / previousMidis.length;
      const drift = prevAvg - homeAnchor;
      const driftLimit = style === "organ" || isPivot ? 3 : 5;
      targetCenter = Math.abs(drift) > driftLimit ? prevAvg - drift * registerPullWeight : prevAvg;
    }
    const isSpread = Math.max(...intervals) > 12;
    if (isSpread) {
      let bestShift = 0;
      let minDistance = Infinity;
      for (let shift = -24; shift <= 24; shift += 12) {
        let sum = 0;
        for (let i3 = 0; i3 < intervals.length; i3++) {
          sum += intervals[i3] + rootMidi + shift;
        }
        const currentAvg = sum / intervals.length;
        const dist = Math.abs(currentAvg - targetCenter);
        if (dist < minDistance) {
          minDistance = dist;
          bestShift = shift;
        }
      }
      return intervals.map((i3) => rootMidi + i3 + bestShift).sort((a3, b2) => a3 - b2);
    }
    const result = [];
    intervals.forEach((inter, i3) => {
      const note = rootMidi + inter;
      const pc = note % 12;
      const octaves = [-24, -12, 0, 12, 24];
      const candidates = octaves.map((o3) => Math.floor(targetCenter / 12) * 12 + o3 + pc);
      candidates.sort((a3, b2) => Math.abs(a3 - targetCenter) - Math.abs(b2 - targetCenter));
      let best = candidates[0];
      if (i3 > 0 && best < 48) {
        while (best - result[i3 - 1] < 7) {
          best += 12;
        }
      }
      result.push(best);
    });
    let finalResult = result;
    const minNote = Math.min(...finalResult);
    if (minNote < RANGE_MIN) {
      finalResult = finalResult.map((n2) => n2 + 12);
    }
    const maxNote = Math.max(...finalResult);
    if (maxNote > RANGE_MAX) {
      finalResult = finalResult.map((n2) => n2 - 12);
    }
    return finalResult.sort((a3, b2) => a3 - b2);
  }
  function mutateProgression(progressionStr) {
    if (!progressionStr || !progressionStr.trim()) {
      return { value: progressionStr, mutatedIndex: -1 };
    }
    const parts = progressionStr.split("|").map((p3) => p3.trim());
    const mutatedParts = [...parts];
    const idx = Math.floor(Math.random() * parts.length);
    const original = parts[idx];
    const substitutions = {
      I: ["vi", "IV", "Imaj7"],
      IV: ["ii", "IVmaj7", "iv"],
      V: ["V7", "viio", "bVII"],
      vi: ["I", "iii", "IV"],
      ii: ["IV", "ii7", "bIImaj7"],
      1: ["6-", "4", "1maj7"],
      4: ["2-", "4maj7", "4m"],
      5: ["57", "7o", "b7"],
      "6-": ["1", "3-", "4"]
    };
    const choices = substitutions[original] || [];
    if (choices.length > 0) {
      mutatedParts[idx] = choices[Math.floor(Math.random() * choices.length)];
    } else {
      if (!original.includes("7") && !original.includes("maj")) {
        mutatedParts[idx] = original + (Math.random() > 0.5 ? "maj7" : "7");
      } else {
        const pool = ["I", "ii", "iii", "IV", "V", "vi"];
        mutatedParts[idx] = pool[Math.floor(Math.random() * pool.length)];
      }
    }
    return { value: mutatedParts.join(" | "), mutatedIndex: idx };
  }
  function transformRelativeProgression(input, semitoneShift) {
    const parts = input.split(/([\s,|,-]+|\/)/);
    const transformed = parts.map((part) => {
      if (!part.trim() || part === "|" || part === "/" || part === "," || part === "-") {
        return part;
      }
      const romanMatch = part.match(ROMAN_REGEX);
      const nnsMatch = part.match(NNS_REGEX);
      const noteMatch = part.match(NOTE_REGEX);
      if (romanMatch) {
        const accidental = romanMatch[1] || "";
        const numeral = romanMatch[2];
        const suffix = part.slice(romanMatch[0].length);
        let originalOffset = ROMAN_VALS[numeral.toUpperCase()];
        if (accidental === "b") {
          originalOffset -= 1;
        }
        if (accidental === "#") {
          originalOffset += 1;
        }
        const newOffset = (originalOffset - semitoneShift + 12) % 12;
        let newRoman = INTERVAL_TO_ROMAN[newOffset];
        const isSourceMinorChord = numeral === numeral.toLowerCase();
        if (isSourceMinorChord) {
          newRoman = newRoman.toLowerCase();
        }
        return newRoman + suffix;
      } else if (nnsMatch) {
        const accidental = nnsMatch[1] || "";
        const number = parseInt(nnsMatch[2], 10);
        const suffix = part.slice(nnsMatch[0].length);
        let originalOffset = NNS_OFFSETS[number - 1];
        if (accidental === "b") {
          originalOffset -= 1;
        }
        if (accidental === "#") {
          originalOffset += 1;
        }
        const newOffset = (originalOffset - semitoneShift + 12) % 12;
        const newNNS = INTERVAL_TO_NNS[newOffset];
        return newNNS + suffix;
      } else if (noteMatch) {
        const root = normalizeKey(
          noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase()
        );
        const suffix = part.slice(noteMatch[0].length);
        const originalIndex = KEY_ORDER.indexOf(root);
        if (originalIndex !== -1) {
          const newIndex = (originalIndex + semitoneShift + 12) % 12;
          return KEY_ORDER[newIndex] + suffix;
        }
      }
      return part;
    });
    return transformed.join("");
  }
  function resolveChordRoot(part, keyRootMidi, baseOctave) {
    const romanMatch = part.match(ROMAN_REGEX);
    const nnsMatch = part.match(NNS_REGEX);
    const noteMatch = part.match(NOTE_REGEX);
    let rootMidi = keyRootMidi;
    let rootPart = "";
    let rootRomanBase = "";
    if (romanMatch) {
      rootPart = romanMatch[0];
      const accidental = romanMatch[1] || "", numeral = romanMatch[2];
      rootRomanBase = numeral;
      let rootOffset = ROMAN_VALS[numeral.toUpperCase()];
      if (accidental === "b") {
        rootOffset -= 1;
      }
      if (accidental === "#") {
        rootOffset += 1;
      }
      rootMidi = keyRootMidi + rootOffset;
    } else if (nnsMatch) {
      rootPart = nnsMatch[0];
      rootRomanBase = "I";
      const accidental = nnsMatch[1] || "", number = parseInt(nnsMatch[2], 10);
      let rootOffset = NNS_OFFSETS[number - 1];
      if (accidental === "b") {
        rootOffset -= 1;
      }
      if (accidental === "#") {
        rootOffset += 1;
      }
      rootMidi = keyRootMidi + rootOffset;
    } else if (noteMatch) {
      rootPart = noteMatch[0];
      rootRomanBase = "I";
      const note = normalizeKey(
        noteMatch[1].charAt(0).toUpperCase() + noteMatch[1].slice(1).toLowerCase()
      );
      rootMidi = baseOctave + KEY_ORDER.indexOf(note);
    }
    return { rootMidi, rootPart, romanMatch, nnsMatch, noteMatch, rootRomanBase };
  }
  function getRootlessVoicing(quality, is7th, isRich) {
    const { groove: groove2, playback: playback6 } = getState();
    const genre = groove2.genreFeel;
    const intensity = playback6.bandIntensity;
    if (genre === "Jazz" && intensity > 0.7) {
      if (quality === "minor") {
        return [3, 10, 12, 19, 24];
      }
      if (quality === "maj7" || quality === "major") {
        return [4, 11, 12, 19, 24];
      }
      if (quality === "7" || quality === "9") {
        return [4, 10, 12, 19, 24];
      }
    }
    const isMinor = quality.startsWith("m") && !quality.startsWith("maj");
    const isDominant = !isMinor && !["dim", "halfdim"].includes(quality) && (is7th || ["9", "11", "13", "7alt", "7b9", "7#9", "7#11", "7b13"].includes(quality) || quality.startsWith("7"));
    const isMajor7 = ["maj7", "maj9", "maj11", "maj13", "maj7#11"].includes(quality);
    if (isMajor7) {
      if (quality === "augmaj7") {
        return isRich ? [4, 8, 11, 14, 18] : [4, 8, 11];
      }
      if (quality === "maj13") {
        return isRich ? [4, 11, 14, 18, 21] : [4, 11, 14, 21];
      }
      if (quality === "maj7#11") {
        return isRich ? [4, 11, 14, 18] : [4, 11, 18];
      }
      if (quality === "maj9") {
        return isRich ? [4, 11, 14, 21] : [4, 11, 14];
      }
      return isRich ? [4, 11, 14] : [4, 7, 11];
    }
    if (isMinor) {
      if (genre === "Neo-Soul" && quality === "minor" && is7th) {
        if (isRich || intensity > 0.6) {
          return [2, 3, 5, 10, 15, 19];
        }
        return [5, 10, 15, 19];
      }
      if (quality === "m13") {
        return isRich ? [3, 10, 14, 17, 21] : [3, 10, 14, 21];
      }
      if (quality === "m11") {
        return isRich ? [3, 10, 14, 17] : [3, 10, 17];
      }
      if (quality === "m9") {
        return isRich ? [3, 10, 14, 17] : [3, 10, 14];
      }
      return isRich ? [3, 10, 14] : [3, 7, 10];
    }
    if (isDominant) {
      if (quality === "aug") {
        return isRich ? [4, 8, 10, 14] : [4, 8, 10];
      }
      if (quality === "7alt") {
        return isRich ? [4, 10, 13, 15, 18, 20] : [4, 10, 15, 20];
      }
      if (quality === "7b9") {
        return isRich ? [4, 10, 13, 16, 20] : [4, 10, 13, 16];
      }
      if (quality === "7#9") {
        return isRich ? [4, 10, 15, 16, 20] : [4, 10, 15, 16];
      }
      if (quality === "7b13") {
        return isRich ? [4, 10, 14, 20, 26] : [4, 10, 14, 20];
      }
      if (quality === "7#11") {
        return isRich ? [4, 10, 14, 18, 21] : [4, 10, 14, 18];
      }
      if (quality === "13" || isRich) {
        return [4, 10, 14, 21];
      }
      if (quality === "11") {
        return [5, 7, 10, 14];
      }
      if (quality === "9") {
        return [4, 10, 14];
      }
      return [4, 7, 10];
    }
    if (quality === "dim") {
      return [3, 6, 9, 14];
    }
    if (quality === "halfdim") {
      return [3, 5, 6, 10];
    }
    return null;
  }
  function getIntervals(quality, is7th, density, genre = "Rock", bassEnabled = true) {
    const { playback: playback6, groove: groove2 } = getState();
    const isRich = density === "rich";
    const intensity = playback6.bandIntensity;
    const isAltered5 = quality.includes("alt") || quality.includes("b5") || quality.includes("#5") || quality.includes("aug");
    const isAug = quality.includes("aug") || quality.includes("+");
    const shouldBeRootless = bassEnabled && (groove2.genreFeel === "Swing" || genre === "Jazz" || genre === "Neo-Soul" || genre === "Funk" || genre === "Blues");
    if (shouldBeRootless) {
      const rootless = getRootlessVoicing(quality, is7th, isRich || intensity > 0.6);
      if (rootless) {
        return rootless;
      }
    }
    let intervals = null;
    if (genre === "Rock" || genre === "Bossa" && !shouldBeRootless) {
      if (quality === "major") {
        intervals = [0, 7, 16, 19];
      } else if (quality === "minor") {
        intervals = [0, 7, 15, 19];
      }
    }
    if (!intervals) {
      const isMinorQuality = quality.startsWith("m") && !quality.startsWith("maj") || quality === "minor";
      if (quality === "halfdim") {
        intervals = [0, 3, 6, 10];
      } else if (isMinorQuality) {
        intervals = [0, 3, 7];
      } else if (quality === "dim") {
        intervals = [0, 3, 6];
      } else if (quality === "aug") {
        intervals = is7th ? [0, 4, 8, 10] : [0, 4, 8];
      } else if (quality === "augmaj7") {
        intervals = [0, 4, 8, 11];
      } else if (quality === "maj7") {
        intervals = [0, 4, 7, 11];
      } else if (quality === "sus4") {
        intervals = [0, 5, 7];
      } else if (quality === "sus2") {
        intervals = [0, 2, 7];
      } else if (quality === "add9") {
        intervals = [0, 4, 7, 14];
      } else if (quality === "6") {
        intervals = [0, 4, 7, 9];
      } else if (quality === "m6") {
        intervals = [0, 3, 7, 9];
      } else if (quality === "9") {
        intervals = [0, 4, 7, 10, 14];
      } else if (quality === "maj9") {
        intervals = [0, 4, 7, 11, 14];
      } else if (quality === "m9") {
        intervals = [0, 3, 7, 10, 14];
      } else if (quality === "11") {
        intervals = [0, 5, 7, 10, 14, 17];
      } else if (quality === "m11") {
        intervals = [0, 3, 7, 10, 14, 17];
      } else if (quality === "maj11") {
        intervals = [0, 4, 7, 11, 14, 17];
      } else if (quality === "maj7#11") {
        intervals = [0, 4, 7, 11, 14, 18];
      } else if (quality === "13") {
        intervals = [0, 4, 7, 10, 14, 21];
      } else if (quality === "m13") {
        intervals = [0, 3, 7, 10, 14, 21];
      } else if (quality === "maj13") {
        intervals = [0, 4, 7, 11, 14, 21];
      } else if (quality === "7alt") {
        intervals = [0, 4, 10, 13, 15, 18, 20];
      } else if (quality === "7b13") {
        intervals = [0, 4, 7, 10, 14, 20];
      } else if (quality === "7#11") {
        intervals = [0, 4, 7, 10, 14, 18];
      } else if (quality === "7b9") {
        intervals = [0, 4, 7, 10, 13];
      } else if (quality === "7#9") {
        intervals = [0, 4, 7, 10, 15];
      } else if (quality === "7b5") {
        intervals = [0, 4, 6, 10];
      } else if (quality === "5") {
        intervals = [0, 7];
      } else {
        intervals = [0, 4, 7];
      }
    }
    if (intensity >= 0.6 && quality !== "5" && !["Rock", "Jazz", "Funk"].includes(genre) && !isAltered5) {
      if (!is7th && quality !== "6" && quality !== "m6") {
        const isMajor7th = ["maj7", "maj9", "maj11", "maj13", "maj7#11"].includes(quality);
        const seven = isMajor7th ? 11 : 10;
        if (quality === "major" && !["Blues", "Funk"].includes(genre)) {
        } else {
          if (!intervals.includes(seven)) {
            intervals.push(seven);
          }
        }
      }
      if (!intervals.includes(14)) {
        intervals.push(14);
      }
    }
    if (intensity >= 0.8) {
      if (!intervals.includes(12)) {
        intervals.push(12);
      }
      if (!isAltered5 && !isAug && !intervals.includes(7)) {
        intervals.push(7);
      }
      if (genre === "Rock" && !intervals.includes(10) && quality !== "maj7") {
        if (!intervals.includes(10)) {
          intervals.push(10);
        }
      }
    }
    if (density === "thin" && intervals.length >= 4) {
      if (intervals.includes(7)) {
        intervals = intervals.filter((i3) => i3 !== 7);
      }
    } else if (isRich && intervals.length <= 5 && quality !== "5") {
      const safeExtensions = {
        major: [14],
        // 9
        maj7: [14, 18],
        // 9, #11
        minor: [14, 17],
        // 9, 11
        m7: [14, 17],
        // 9, 11
        7: [14, 21],
        // 9, 13
        halfdim: [17],
        // 11
        aug: [14, 22],
        // 9, #11
        augmaj7: [14, 18],
        // 9, #11
        "7alt": [13, 15, 20],
        // b9, #9, b13
        9: [21],
        // 13
        13: [18]
        // #11
      };
      const potential = safeExtensions[quality] || (isAltered5 ? [14, 18] : [14]);
      for (const ext of potential) {
        if (!intervals.includes(ext) && !intervals.includes(ext % 12)) {
          if (ext % 12 === 7 && (isAltered5 || isAug)) {
            continue;
          }
          intervals.push(ext);
          if (intervals.length >= 5) {
            break;
          }
        }
      }
    }
    if (is7th && ![
      "maj7",
      "maj9",
      "maj11",
      "maj13",
      "maj7#11",
      "aug",
      "augmaj7",
      "halfdim",
      "7b9",
      "7#9",
      "7alt",
      "9",
      "dim"
    ].includes(quality)) {
      if (!intervals.includes(10)) {
        intervals.push(10);
      }
    }
    if (quality === "dim" && is7th && !intervals.includes(9)) {
      intervals.push(9);
    }
    if (isAltered5 || isAug) {
      intervals = intervals.filter((i3) => i3 % 12 !== 7);
    }
    return intervals;
  }
  function getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th) {
    let absSuffix = "", nnsSuffix = "", romSuffix = "";
    if (quality === "minor") {
      absSuffix = "m";
      nnsSuffix = "-";
    } else if (quality === "dim") {
      absSuffix = "dim";
      nnsSuffix = "\xB0";
      romSuffix = "\xB0";
    } else if (quality === "halfdim") {
      absSuffix = "m7b5";
      nnsSuffix = "\xF8";
      romSuffix = "\xF8";
    } else if (quality === "aug") {
      if (is7th) {
        absSuffix = "7+";
        nnsSuffix = "7+";
        romSuffix = "7+";
      } else {
        absSuffix = "aug";
        nnsSuffix = "+";
        romSuffix = "+";
      }
    } else if (quality === "augmaj7") {
      absSuffix = "maj7#5";
      nnsSuffix = "maj7+";
      romSuffix = "maj7+";
    } else if (quality === "maj7") {
      absSuffix = "maj7";
      nnsSuffix = "maj7";
      romSuffix = "maj7";
    } else if (quality === "maj9") {
      absSuffix = "maj9";
      nnsSuffix = "maj9";
      romSuffix = "maj9";
    } else if (quality === "maj13") {
      absSuffix = "maj13";
      nnsSuffix = "maj13";
      romSuffix = "maj13";
    } else if (quality === "m9") {
      absSuffix = "m9";
      nnsSuffix = "-9";
      romSuffix = "9";
    } else if (quality === "m11") {
      absSuffix = "m11";
      nnsSuffix = "-11";
      romSuffix = "11";
    } else if (quality === "m13") {
      absSuffix = "m13";
      nnsSuffix = "-13";
      romSuffix = "13";
    } else if (quality === "maj11") {
      absSuffix = "maj11";
      nnsSuffix = "maj11";
      romSuffix = "maj11";
    } else if (quality === "maj7#11") {
      absSuffix = "maj7#11";
      nnsSuffix = "maj7#11";
      romSuffix = "maj7#11";
    } else if (quality === "sus4") {
      absSuffix = "sus4";
      nnsSuffix = "sus4";
      romSuffix = "sus4";
    } else if (quality === "sus2") {
      absSuffix = "sus2";
      nnsSuffix = "sus2";
      romSuffix = "sus2";
    } else if (quality === "add9") {
      absSuffix = "add9";
      nnsSuffix = "add9";
      romSuffix = "add9";
    } else if (quality === "6") {
      absSuffix = "6";
      nnsSuffix = "6";
      romSuffix = "6";
    } else if (quality === "m6") {
      absSuffix = "m6";
      nnsSuffix = "-6";
      romSuffix = "6";
    } else if (quality === "9") {
      absSuffix = "9";
      nnsSuffix = "9";
      romSuffix = "9";
    } else if (quality === "11") {
      absSuffix = "11";
      nnsSuffix = "11";
      romSuffix = "11";
    } else if (quality === "13") {
      absSuffix = "13";
      nnsSuffix = "13";
      romSuffix = "13";
    } else if (quality === "7alt") {
      absSuffix = "7alt";
      nnsSuffix = "7alt";
      romSuffix = "7alt";
    } else if (quality === "7b9") {
      absSuffix = "7b9";
      nnsSuffix = "7b9";
      romSuffix = "7b9";
    } else if (quality === "7#9") {
      absSuffix = "7#9";
      nnsSuffix = "7#9";
      romSuffix = "7#9";
    } else if (quality === "7#11") {
      absSuffix = "7#11";
      nnsSuffix = "7#11";
      romSuffix = "7#11";
    } else if (quality === "7b13") {
      absSuffix = "7b13";
      nnsSuffix = "7b13";
      romSuffix = "7b13";
    } else if (quality === "5") {
      absSuffix = "5";
      nnsSuffix = "5";
      romSuffix = "5";
    }
    if (is7th && ![
      "maj7",
      "maj9",
      "maj11",
      "maj13",
      "maj7#11",
      "aug",
      "augmaj7",
      "halfdim",
      "7b9",
      "7#9",
      "7alt",
      "7#11",
      "7b13",
      "9",
      "11",
      "13",
      "m9",
      "m11",
      "m13"
    ].includes(quality)) {
      absSuffix += "7";
      nnsSuffix += "7";
      romSuffix += "7";
    }
    let romanName;
    if (quality === "minor" || quality === "dim" || quality === "halfdim" || quality === "m9" || quality === "m11" || quality === "m13" || quality === "m6") {
      romanName = rootRomanBase.toLowerCase();
    } else {
      romanName = rootRomanBase;
    }
    return {
      name: { root: rootName, suffix: absSuffix },
      nns: { root: rootNNS, suffix: nnsSuffix },
      roman: { root: romanName, suffix: romSuffix }
    };
  }
  function parseProgressionPart(input, key, timeSignature, initialMidis) {
    const { chords: chords2, groove: groove2, bass: bass2 } = getState();
    const parsed = [];
    const baseOctave = Math.floor(chords2.octave / 12) * 12;
    const keyRootMidi = baseOctave + KEY_ORDER.indexOf(normalizeKey(key));
    const barParts = input.split(/(\|)/);
    let lastMidis = initialMidis || [];
    let charOffset = 0;
    barParts.forEach((barOrPipe) => {
      if (barOrPipe === "|") {
        charOffset += 1;
        return;
      }
      const barText = barOrPipe;
      const chordTokens = barText.split(/(\s+)/);
      const actualChordParts = chordTokens.filter((t3) => t3.trim() && t3 !== "|");
      const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES["4/4"];
      const beatsPerChord = actualChordParts.length > 0 ? ts.beats / actualChordParts.length : 0;
      let barInternalOffset = 0;
      chordTokens.forEach((token) => {
        if (token.trim().length > 0) {
          const part = token.trim();
          const [chordPart, bassPart] = part.split("/");
          const { rootMidi, rootPart, romanMatch } = resolveChordRoot(
            chordPart,
            keyRootMidi,
            baseOctave
          );
          let bassMidi = null;
          let bassNameAbs = null, bassNameNNS = null, bassNameRom = null;
          if (bassPart) {
            const resolvedBass = resolveChordRoot(bassPart, keyRootMidi, baseOctave);
            bassMidi = resolvedBass.rootMidi;
            const bassInterval = (bassMidi - keyRootMidi + 24) % 12;
            bassNameAbs = KEY_ORDER[bassMidi % 12];
            bassNameNNS = INTERVAL_TO_NNS[bassInterval];
            bassNameRom = INTERVAL_TO_ROMAN[bassInterval];
          }
          const suffixPart = chordPart.slice(rootPart.length);
          let { quality, is7th } = getChordDetails(suffixPart);
          if (romanMatch) {
            const accidental = romanMatch[1] || "";
            const numeral = romanMatch[2];
            const isLowercase = numeral === numeral.toLowerCase();
            if (isLowercase) {
              if (quality === "major" || quality === "7") {
                quality = "minor";
              } else if (quality === "9") {
                quality = "m9";
              } else if (quality === "11") {
                quality = "m11";
              } else if (quality === "13") {
                quality = "m13";
              }
            }
            if (numeral.toLowerCase() === "vii" && !accidental && !suffixPart.match(/(maj|min|m|dim|o|°|aug|\+|ø|h|7b5)/)) {
              quality = "halfdim";
              is7th = true;
            }
          }
          const intervals = getIntervals(
            quality,
            is7th,
            chords2.density,
            groove2.genreFeel,
            bass2.enabled || chords2.pianoRoots
          );
          const pianoMin = bass2.enabled || chords2.pianoRoots ? 52 : 43;
          const isPivot = parsed.length === 0;
          let currentMidis = getBestInversion(
            rootMidi,
            intervals,
            lastMidis,
            isPivot,
            chords2.octave,
            pianoMin,
            84
          );
          if (bassMidi !== null) {
            const bassPC = bassMidi % 12;
            const filtered = currentMidis.filter((m3) => m3 % 12 !== bassPC);
            if (filtered.length > 0) {
              currentMidis = filtered;
            }
            currentMidis.unshift(bassMidi);
            currentMidis.sort((a3, b2) => a3 - b2);
          }
          lastMidis = currentMidis;
          const interval = (rootMidi - keyRootMidi + 24) % 12;
          const rootNNS = INTERVAL_TO_NNS[interval];
          const displayRomanBase = INTERVAL_TO_ROMAN[interval];
          const rootName = KEY_ORDER[rootMidi % 12];
          const formatted = getFormattedChordNames(
            rootName,
            rootNNS,
            displayRomanBase,
            quality,
            is7th
          );
          let finalAbsName = formatted.name.root + formatted.name.suffix;
          let finalNNSName = formatted.nns.root + formatted.nns.suffix;
          let finalRomName = formatted.roman.root + formatted.roman.suffix;
          if (bassPart && bassNameAbs) {
            finalAbsName += `/${bassNameAbs}`;
            finalNNSName += `/${bassNameNNS}`;
            finalRomName += `/${bassNameRom}`;
            formatted.name.bass = bassNameAbs;
            formatted.nns.bass = bassNameNNS;
            formatted.roman.bass = bassNameRom;
          }
          const isMinor = quality === "minor" || quality === "dim" || quality === "halfdim" || quality === "m9" || quality === "m11" || quality === "m13" || quality === "m6";
          parsed.push({
            romanName: finalRomName,
            absName: finalAbsName,
            nnsName: finalNNSName,
            display: formatted,
            isMinor,
            beats: beatsPerChord,
            freqs: currentMidis.map(getFrequency),
            rootMidi,
            bassMidi,
            intervals,
            quality,
            is7th,
            charStart: charOffset + barInternalOffset,
            charEnd: charOffset + barInternalOffset + token.length,
            timeSignature,
            key
          });
        }
        barInternalOffset += token.length;
      });
      charOffset += barText.length;
    });
    return { chords: parsed, finalMidis: lastMidis };
  }
  function validateProgression(renderCallback) {
    const { arranger: arranger6 } = getState();
    let allChords = [];
    let lastMidis = [];
    arranger6.sections.forEach((section) => {
      try {
        const repeats = section.repeat || 1;
        const sectionKey = section.key || arranger6.key;
        const sectionTS = section.timeSignature || arranger6.timeSignature;
        for (let r3 = 0; r3 < repeats; r3++) {
          const { chords: chords2, finalMidis } = parseProgressionPart(
            section.value,
            sectionKey,
            sectionTS,
            lastMidis
          );
          const taggedChords = chords2.map((c3, idx) => ({
            ...c3,
            sectionId: section.id,
            sectionLabel: section.label,
            localIndex: idx,
            repeatIndex: r3
          }));
          allChords = allChords.concat(taggedChords);
          lastMidis = finalMidis;
        }
      } catch (e3) {
        console.error(`[Arranger] Error parsing section "${section.label}":`, e3);
      }
    });
    arranger6.progression = allChords;
    Object.assign(arranger6, { progression: allChords });
    updateProgressionCache();
    dispatch("PROG_VALIDATED");
    if (renderCallback) {
      renderCallback();
    }
  }
  function updateProgressionCache() {
    const { arranger: arranger6 } = getState();
    if (!arranger6.progression.length) {
      Object.assign(arranger6, {
        totalSteps: 0,
        stepMap: [],
        measureMap: [],
        sectionMap: []
      });
      return;
    }
    let current = 0;
    const newStepMap = arranger6.progression.map((chord) => {
      const tsName = chord.timeSignature || arranger6.timeSignature;
      const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES["4/4"];
      const steps = Math.round(chord.beats * ts.stepsPerBeat);
      const entry = { start: current, end: current + steps, chord };
      current += steps;
      return entry;
    });
    const newSectionMap = [];
    const newMeasureMap = [];
    let mapIndex = 0;
    let sectionAcc = 0;
    arranger6.sections.forEach((section) => {
      const sectionStart = sectionAcc;
      let iterationSteps = 0;
      const startMapIndex = mapIndex;
      while (mapIndex < newStepMap.length) {
        const entry = newStepMap[mapIndex];
        if (entry.chord.sectionId !== section.id) {
          break;
        }
        if (mapIndex > startMapIndex) {
          const prevEntry = newStepMap[mapIndex - 1];
          if (entry.chord.localIndex <= prevEntry.chord.localIndex) {
            if (entry.chord.repeatIndex !== prevEntry.chord.repeatIndex + 1) {
              break;
            }
          }
        }
        if (entry.chord.repeatIndex === 0) {
          iterationSteps += entry.end - entry.start;
        }
        mapIndex++;
      }
      const totalSectionSteps = mapIndex > startMapIndex ? newStepMap[mapIndex - 1].end - newStepMap[startMapIndex].start : 0;
      newSectionMap.push({
        id: section.id,
        start: sectionStart,
        end: sectionStart + totalSectionSteps,
        label: section.label,
        syllables: section.syllables
      });
      sectionAcc += totalSectionSteps;
      if (iterationSteps > 0) {
        const repeats = section.repeat || 1;
        const tsName = section.timeSignature || arranger6.timeSignature;
        const ts = TIME_SIGNATURES[tsName] || TIME_SIGNATURES["4/4"];
        const stepsPerMeasure = Math.round(ts.beats * ts.stepsPerBeat);
        let stepAccLocal = sectionStart;
        for (let r3 = 0; r3 < repeats; r3++) {
          let sectionStep = 0;
          while (sectionStep < iterationSteps) {
            const measureEnd = Math.min(sectionStep + stepsPerMeasure, iterationSteps);
            newMeasureMap.push({
              start: stepAccLocal + sectionStep,
              end: stepAccLocal + measureEnd,
              ts: tsName
            });
            sectionStep += stepsPerMeasure;
          }
          stepAccLocal += iterationSteps;
        }
      }
    });
    Object.assign(arranger6, {
      totalSteps: current,
      stepMap: newStepMap,
      sectionMap: newSectionMap,
      measureMap: newMeasureMap
    });
  }
  var ROMAN_REGEX, NNS_REGEX, NOTE_REGEX;
  var init_chords = __esm({
    "public/chords.js"() {
      init_config();
      init_state();
      init_utils();
      ROMAN_REGEX = /^([#b])?(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v)/;
      NNS_REGEX = /^([#b])?([1-7])/;
      NOTE_REGEX = /^([A-G][#b]?)/i;
    }
  });

  // public/history.js
  function pushHistory() {
    const { arranger: arranger6 } = getState();
    arranger6.history.push(JSON.stringify(arranger6.sections));
    if (arranger6.history.length > 20) {
      arranger6.history.shift();
    }
  }
  function undo(refreshArrangerUI2) {
    const { arranger: arranger6 } = getState();
    if (arranger6.history.length === 0) {
      return;
    }
    const last = arranger6.history.pop();
    arranger6.sections = JSON.parse(last);
    if (refreshArrangerUI2) {
      refreshArrangerUI2();
    }
    showToast("Undo successful");
  }
  var init_history = __esm({
    "public/history.js"() {
      init_state();
      init_ui();
    }
  });

  // public/arranger-controller.js
  function analyzeFormUI() {
    const form = analyzeForm();
    if (form) {
      conductorState.form = form;
    }
  }
  function saveProgression() {
    const { arranger: arranger6 } = getState();
    const name = prompt(
      "Name your chord progression:",
      arranger6.lastChordPreset || "My Progression"
    );
    if (!name) {
      return;
    }
    const userPresets = JSON.parse(localStorage.getItem("ensemble_userPresets") || "[]");
    const newPreset = {
      name: name.substring(0, 32),
      sections: compressSections(arranger6.sections),
      isMinor: arranger6.isMinor,
      timestamp: Date.now()
    };
    userPresets.push(newPreset);
    localStorage.setItem("ensemble_userPresets", JSON.stringify(userPresets));
    window.dispatchEvent(new Event("storage_sync"));
    showToast(`Saved "${name}" to library`);
  }
  function validateAndAnalyze() {
    validateProgression(() => {
      analyzeFormUI();
    });
  }
  function clearChordPresetHighlight() {
  }
  function refreshArrangerUI() {
    validateAndAnalyze();
    syncWorker();
    flushBuffers();
    restoreGains();
    saveCurrentState();
  }
  function onSectionUpdate(id, field, value) {
    const { arranger: arranger6 } = getState();
    if (field === "reorder") {
      const sectionMap = new Map(arranger6.sections.map((s3) => [s3.id, s3]));
      const newSections = value.map((sid) => sectionMap.get(sid));
      const currentIds = arranger6.sections.map((s3) => s3.id);
      const hasChanged = value.length !== currentIds.length || value.some((id2, index) => id2 !== currentIds[index]);
      if (hasChanged) {
        pushHistory();
        arranger6.sections = newSections;
      } else {
        return;
      }
    } else {
      const index = arranger6.sections.findIndex((s3) => s3.id === id);
      if (index === -1) {
        return;
      }
      const section = arranger6.sections[index];
      if (field === "move") {
        const newIndex = index + value;
        if (newIndex >= 0 && newIndex < arranger6.sections.length) {
          pushHistory();
          const newSections = [...arranger6.sections];
          const temp = newSections[index];
          newSections[index] = newSections[newIndex];
          newSections[newIndex] = temp;
          arranger6.sections = newSections;
        } else {
          return;
        }
      } else {
        const newSections = [...arranger6.sections];
        newSections[index] = { ...section, [field]: value };
        arranger6.sections = newSections;
      }
    }
    arranger6.isDirty = true;
    if (field === "reorder" || field === "move" || field === "value") {
      clearChordPresetHighlight();
    }
    validateAndAnalyze();
    flushBuffers();
    saveCurrentState();
  }
  function onSectionDelete(id) {
    const { arranger: arranger6 } = getState();
    if (arranger6.sections.length <= 1) {
      return;
    }
    const section = arranger6.sections.find((s3) => s3.id === id);
    if (section?.value && section.value.trim() !== "" && section.value.trim() !== "I") {
      if (!confirm(`Delete section "${section.label || "Untitled"}" and its chords?`)) {
        return;
      }
    }
    arranger6.sections = arranger6.sections.filter((s3) => s3.id !== id);
    arranger6.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
  }
  function onSectionDuplicate(id) {
    const { arranger: arranger6 } = getState();
    const section = arranger6.sections.find((s3) => s3.id === id);
    if (!section) {
      return;
    }
    pushHistory();
    const newSection = { ...section, id: generateId(), label: `${section.label} (Copy)` };
    const index = arranger6.sections.findIndex((s3) => s3.id === id);
    const newSections = [...arranger6.sections];
    newSections.splice(index + 1, 0, newSection);
    arranger6.sections = newSections;
    arranger6.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
  }
  function addSection() {
    const { arranger: arranger6 } = getState();
    arranger6.sections = [
      ...arranger6.sections,
      {
        id: generateId(),
        label: `Section ${arranger6.sections.length + 1}`,
        value: "I",
        repeat: 1
      }
    ];
    arranger6.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
  }
  function transposeKey(delta) {
    const { arranger: arranger6 } = getState();
    const currentKeyName = arranger6.key || "C";
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(currentKeyName));
    const newKey = KEY_ORDER[(currentIndex + delta + 12) % 12];
    arranger6.key = newKey;
    const isMusicalNotation = (part) => {
      return part.match(/^(III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i) || part.match(/^[#b\u266F\u266D](III|II|IV|I|VII|VI|V|iii|ii|iv|i|vii|vi|v|[1-7])/i);
    };
    arranger6.sections.forEach((section) => {
      const parts = section.value.split(/([\s,|,-]+)/);
      const transposed = parts.map((part) => {
        const noteMatch = part.match(NOTE_MATCH_PATTERN);
        if (noteMatch && !isMusicalNotation(part)) {
          let rootStr = noteMatch[1];
          rootStr = rootStr.replace("\u266F", "#").replace("\u266D", "b");
          const root = normalizeKey(
            rootStr.charAt(0).toUpperCase() + rootStr.slice(1).toLowerCase()
          );
          const rootIndex = KEY_ORDER.indexOf(root);
          if (rootIndex !== -1) {
            const newRoot = KEY_ORDER[(rootIndex + delta + 12) % 12];
            return newRoot + noteMatch[2];
          }
        }
        return part;
      });
      section.value = transposed.join("");
      if (section.key) {
        const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
        if (secKeyIndex !== -1) {
          section.key = KEY_ORDER[(secKeyIndex + delta + 12) % 12];
        }
      }
    });
    arranger6.isDirty = true;
    clearChordPresetHighlight();
    refreshArrangerUI();
  }
  function switchToRelativeKey() {
    const { arranger: arranger6 } = getState();
    const wasMinor = !!arranger6.isMinor;
    const currentIndex = KEY_ORDER.indexOf(normalizeKey(arranger6.key));
    const shift = wasMinor ? 3 : -3;
    const newKey = KEY_ORDER[(currentIndex + shift + 12) % 12];
    arranger6.key = newKey;
    arranger6.isMinor = !wasMinor;
    pushHistory();
    arranger6.sections.forEach((section) => {
      section.value = transformRelativeProgression(section.value, shift);
      if (section.key) {
        const secKeyIndex = KEY_ORDER.indexOf(normalizeKey(section.key));
        if (secKeyIndex !== -1) {
          section.key = KEY_ORDER[(secKeyIndex + shift + 12) % 12];
        }
      }
    });
    arranger6.isDirty = true;
    refreshArrangerUI();
    showToast(
      `Switched to Relative ${arranger6.isMinor ? "Minor" : "Major"}: ${newKey}${arranger6.isMinor ? "m" : ""}`
    );
  }
  var NOTE_MATCH_PATTERN;
  var init_arranger_controller = __esm({
    "public/arranger-controller.js"() {
      init_chords();
      init_conductor();
      init_config();
      init_engine();
      init_form_analysis();
      init_history();
      init_instrument_controller();
      init_persistence();
      init_state();
      init_ui();
      init_utils();
      init_worker_client();
      NOTE_MATCH_PATTERN = /^([A-G](?:[#b\u266F\u266D])?)(.*)/i;
    }
  });

  // public/pwa.js
  function initPWA() {
    window.addEventListener("beforeinstallprompt", (e3) => {
      e3.preventDefault();
      deferredPrompt = e3;
      const installBtn = document.getElementById("installAppBtn");
      if (installBtn) {
        installBtn.style.display = "flex";
      }
    });
    window.addEventListener("appinstalled", () => {
      deferredPrompt = null;
      const installBtn = document.getElementById("installAppBtn");
      if (installBtn) {
        installBtn.style.display = "none";
      }
      dispatch(ACTIONS.SHOW_TOAST, "App installed successfully!");
    });
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        console.log("SW registered");
        setInterval(
          () => {
            reg.update();
          },
          60 * 60 * 1e3
        );
        reg.addEventListener("updatefound", () => {
          newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              dispatch(ACTIONS.SET_UPDATE_AVAILABLE, true);
            }
          });
        });
      }).catch((err) => console.log("SW failed", err));
      let refreshing;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) {
          return;
        }
        window.location.reload();
        refreshing = true;
      });
    }
  }
  function skipWaiting() {
    if (newWorker) {
      newWorker.postMessage({ type: "SKIP_WAITING" });
    }
  }
  async function triggerInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      return outcome === "accepted";
    }
    return false;
  }
  var deferredPrompt, newWorker;
  var init_pwa = __esm({
    "public/pwa.js"() {
      init_state();
      init_types();
    }
  });

  // node_modules/preact/dist/preact.module.js
  function w(n2, l3) {
    for (var u3 in l3) n2[u3] = l3[u3];
    return n2;
  }
  function g(n2) {
    n2 && n2.parentNode && n2.parentNode.removeChild(n2);
  }
  function _(l3, u3, t3) {
    var i3, r3, o3, e3 = {};
    for (o3 in u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : e3[o3] = u3[o3];
    if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t3), "function" == typeof l3 && null != l3.defaultProps) for (o3 in l3.defaultProps) void 0 === e3[o3] && (e3[o3] = l3.defaultProps[o3]);
    return m(l3, e3, i3, r3, null);
  }
  function m(n2, t3, i3, r3, o3) {
    var e3 = { type: n2, props: t3, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
    return null == o3 && null != l.vnode && l.vnode(e3), e3;
  }
  function k(n2) {
    return n2.children;
  }
  function x(n2, l3) {
    this.props = n2, this.context = l3;
  }
  function S(n2, l3) {
    if (null == l3) return n2.__ ? S(n2.__, n2.__i + 1) : null;
    for (var u3; l3 < n2.__k.length; l3++) if (null != (u3 = n2.__k[l3]) && null != u3.__e) return u3.__e;
    return "function" == typeof n2.type ? S(n2) : null;
  }
  function C(n2) {
    if (n2.__P && n2.__d) {
      var u3 = n2.__v, t3 = u3.__e, i3 = [], r3 = [], o3 = w({}, u3);
      o3.__v = u3.__v + 1, l.vnode && l.vnode(o3), z(n2.__P, o3, u3, n2.__n, n2.__P.namespaceURI, 32 & u3.__u ? [t3] : null, i3, null == t3 ? S(u3) : t3, !!(32 & u3.__u), r3), o3.__v = u3.__v, o3.__.__k[o3.__i] = o3, V(i3, o3, r3), u3.__e = u3.__ = null, o3.__e != t3 && M(o3);
    }
  }
  function M(n2) {
    if (null != (n2 = n2.__) && null != n2.__c) return n2.__e = n2.__c.base = null, n2.__k.some(function(l3) {
      if (null != l3 && null != l3.__e) return n2.__e = n2.__c.base = l3.__e;
    }), M(n2);
  }
  function $(n2) {
    (!n2.__d && (n2.__d = true) && i.push(n2) && !I.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(I);
  }
  function I() {
    for (var n2, l3 = 1; i.length; ) i.length > l3 && i.sort(e), n2 = i.shift(), l3 = i.length, C(n2);
    I.__r = 0;
  }
  function P(n2, l3, u3, t3, i3, r3, o3, e3, f3, c3, s3) {
    var a3, h3, y3, d3, w3, g4, _3, m3 = t3 && t3.__k || v, b2 = l3.length;
    for (f3 = A(u3, l3, m3, f3, b2), a3 = 0; a3 < b2; a3++) null != (y3 = u3.__k[a3]) && (h3 = -1 != y3.__i && m3[y3.__i] || p, y3.__i = a3, g4 = z(n2, y3, h3, i3, r3, o3, e3, f3, c3, s3), d3 = y3.__e, y3.ref && h3.ref != y3.ref && (h3.ref && D(h3.ref, null, y3), s3.push(y3.ref, y3.__c || d3, y3)), null == w3 && null != d3 && (w3 = d3), (_3 = !!(4 & y3.__u)) || h3.__k === y3.__k ? f3 = H(y3, f3, n2, _3) : "function" == typeof y3.type && void 0 !== g4 ? f3 = g4 : d3 && (f3 = d3.nextSibling), y3.__u &= -7);
    return u3.__e = w3, f3;
  }
  function A(n2, l3, u3, t3, i3) {
    var r3, o3, e3, f3, c3, s3 = u3.length, a3 = s3, h3 = 0;
    for (n2.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l3[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n2.__k[r3] = m(null, o3, null, null, null) : d(o3) ? o3 = n2.__k[r3] = m(k, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n2.__k[r3] = m(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n2.__k[r3] = o3, f3 = r3 + h3, o3.__ = n2, o3.__b = n2.__b + 1, e3 = null, -1 != (c3 = o3.__i = T(o3, u3, f3, a3)) && (a3--, (e3 = u3[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > s3 ? h3-- : i3 < s3 && h3++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f3 && (c3 == f3 - 1 ? h3-- : c3 == f3 + 1 ? h3++ : (c3 > f3 ? h3-- : h3++, o3.__u |= 4))) : n2.__k[r3] = null;
    if (a3) for (r3 = 0; r3 < s3; r3++) null != (e3 = u3[r3]) && 0 == (2 & e3.__u) && (e3.__e == t3 && (t3 = S(e3)), E(e3, e3));
    return t3;
  }
  function H(n2, l3, u3, t3) {
    var i3, r3;
    if ("function" == typeof n2.type) {
      for (i3 = n2.__k, r3 = 0; i3 && r3 < i3.length; r3++) i3[r3] && (i3[r3].__ = n2, l3 = H(i3[r3], l3, u3, t3));
      return l3;
    }
    n2.__e != l3 && (t3 && (l3 && n2.type && !l3.parentNode && (l3 = S(n2)), u3.insertBefore(n2.__e, l3 || null)), l3 = n2.__e);
    do {
      l3 = l3 && l3.nextSibling;
    } while (null != l3 && 8 == l3.nodeType);
    return l3;
  }
  function L(n2, l3) {
    return l3 = l3 || [], null == n2 || "boolean" == typeof n2 || (d(n2) ? n2.some(function(n3) {
      L(n3, l3);
    }) : l3.push(n2)), l3;
  }
  function T(n2, l3, u3, t3) {
    var i3, r3, o3, e3 = n2.key, f3 = n2.type, c3 = l3[u3], s3 = null != c3 && 0 == (2 & c3.__u);
    if (null === c3 && null == e3 || s3 && e3 == c3.key && f3 == c3.type) return u3;
    if (t3 > (s3 ? 1 : 0)) {
      for (i3 = u3 - 1, r3 = u3 + 1; i3 >= 0 || r3 < l3.length; ) if (null != (c3 = l3[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f3 == c3.type) return o3;
    }
    return -1;
  }
  function j(n2, l3, u3) {
    "-" == l3[0] ? n2.setProperty(l3, null == u3 ? "" : u3) : n2[l3] = null == u3 ? "" : "number" != typeof u3 || y.test(l3) ? u3 : u3 + "px";
  }
  function F(n2, l3, u3, t3, i3) {
    var r3, o3;
    n: if ("style" == l3) if ("string" == typeof u3) n2.style.cssText = u3;
    else {
      if ("string" == typeof t3 && (n2.style.cssText = t3 = ""), t3) for (l3 in t3) u3 && l3 in u3 || j(n2.style, l3, "");
      if (u3) for (l3 in u3) t3 && u3[l3] == t3[l3] || j(n2.style, l3, u3[l3]);
    }
    else if ("o" == l3[0] && "n" == l3[1]) r3 = l3 != (l3 = l3.replace(f, "$1")), o3 = l3.toLowerCase(), l3 = o3 in n2 || "onFocusOut" == l3 || "onFocusIn" == l3 ? o3.slice(2) : l3.slice(2), n2.l || (n2.l = {}), n2.l[l3 + r3] = u3, u3 ? t3 ? u3.u = t3.u : (u3.u = c, n2.addEventListener(l3, r3 ? a : s, r3)) : n2.removeEventListener(l3, r3 ? a : s, r3);
    else {
      if ("http://www.w3.org/2000/svg" == i3) l3 = l3.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
      else if ("width" != l3 && "height" != l3 && "href" != l3 && "list" != l3 && "form" != l3 && "tabIndex" != l3 && "download" != l3 && "rowSpan" != l3 && "colSpan" != l3 && "role" != l3 && "popover" != l3 && l3 in n2) try {
        n2[l3] = null == u3 ? "" : u3;
        break n;
      } catch (n3) {
      }
      "function" == typeof u3 || (null == u3 || false === u3 && "-" != l3[4] ? n2.removeAttribute(l3) : n2.setAttribute(l3, "popover" == l3 && 1 == u3 ? "" : u3));
    }
  }
  function O(n2) {
    return function(u3) {
      if (this.l) {
        var t3 = this.l[u3.type + n2];
        if (null == u3.t) u3.t = c++;
        else if (u3.t < t3.u) return;
        return t3(l.event ? l.event(u3) : u3);
      }
    };
  }
  function z(n2, u3, t3, i3, r3, o3, e3, f3, c3, s3) {
    var a3, h3, p3, y3, _3, m3, b2, S2, C3, M3, $2, I2, A4, H3, L2, T4 = u3.type;
    if (void 0 !== u3.constructor) return null;
    128 & t3.__u && (c3 = !!(32 & t3.__u), o3 = [f3 = u3.__e = t3.__e]), (a3 = l.__b) && a3(u3);
    n: if ("function" == typeof T4) try {
      if (S2 = u3.props, C3 = "prototype" in T4 && T4.prototype.render, M3 = (a3 = T4.contextType) && i3[a3.__c], $2 = a3 ? M3 ? M3.props.value : a3.__ : i3, t3.__c ? b2 = (h3 = u3.__c = t3.__c).__ = h3.__E : (C3 ? u3.__c = h3 = new T4(S2, $2) : (u3.__c = h3 = new x(S2, $2), h3.constructor = T4, h3.render = G), M3 && M3.sub(h3), h3.state || (h3.state = {}), h3.__n = i3, p3 = h3.__d = true, h3.__h = [], h3._sb = []), C3 && null == h3.__s && (h3.__s = h3.state), C3 && null != T4.getDerivedStateFromProps && (h3.__s == h3.state && (h3.__s = w({}, h3.__s)), w(h3.__s, T4.getDerivedStateFromProps(S2, h3.__s))), y3 = h3.props, _3 = h3.state, h3.__v = u3, p3) C3 && null == T4.getDerivedStateFromProps && null != h3.componentWillMount && h3.componentWillMount(), C3 && null != h3.componentDidMount && h3.__h.push(h3.componentDidMount);
      else {
        if (C3 && null == T4.getDerivedStateFromProps && S2 !== y3 && null != h3.componentWillReceiveProps && h3.componentWillReceiveProps(S2, $2), u3.__v == t3.__v || !h3.__e && null != h3.shouldComponentUpdate && false === h3.shouldComponentUpdate(S2, h3.__s, $2)) {
          u3.__v != t3.__v && (h3.props = S2, h3.state = h3.__s, h3.__d = false), u3.__e = t3.__e, u3.__k = t3.__k, u3.__k.some(function(n3) {
            n3 && (n3.__ = u3);
          }), v.push.apply(h3.__h, h3._sb), h3._sb = [], h3.__h.length && e3.push(h3);
          break n;
        }
        null != h3.componentWillUpdate && h3.componentWillUpdate(S2, h3.__s, $2), C3 && null != h3.componentDidUpdate && h3.__h.push(function() {
          h3.componentDidUpdate(y3, _3, m3);
        });
      }
      if (h3.context = $2, h3.props = S2, h3.__P = n2, h3.__e = false, I2 = l.__r, A4 = 0, C3) h3.state = h3.__s, h3.__d = false, I2 && I2(u3), a3 = h3.render(h3.props, h3.state, h3.context), v.push.apply(h3.__h, h3._sb), h3._sb = [];
      else do {
        h3.__d = false, I2 && I2(u3), a3 = h3.render(h3.props, h3.state, h3.context), h3.state = h3.__s;
      } while (h3.__d && ++A4 < 25);
      h3.state = h3.__s, null != h3.getChildContext && (i3 = w(w({}, i3), h3.getChildContext())), C3 && !p3 && null != h3.getSnapshotBeforeUpdate && (m3 = h3.getSnapshotBeforeUpdate(y3, _3)), H3 = null != a3 && a3.type === k && null == a3.key ? q(a3.props.children) : a3, f3 = P(n2, d(H3) ? H3 : [H3], u3, t3, i3, r3, o3, e3, f3, c3, s3), h3.base = u3.__e, u3.__u &= -161, h3.__h.length && e3.push(h3), b2 && (h3.__E = h3.__ = null);
    } catch (n3) {
      if (u3.__v = null, c3 || null != o3) if (n3.then) {
        for (u3.__u |= c3 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; ) f3 = f3.nextSibling;
        o3[o3.indexOf(f3)] = null, u3.__e = f3;
      } else {
        for (L2 = o3.length; L2--; ) g(o3[L2]);
        N(u3);
      }
      else u3.__e = t3.__e, u3.__k = t3.__k, n3.then || N(u3);
      l.__e(n3, u3, t3);
    }
    else null == o3 && u3.__v == t3.__v ? (u3.__k = t3.__k, u3.__e = t3.__e) : f3 = u3.__e = B(t3.__e, u3, t3, i3, r3, o3, e3, c3, s3);
    return (a3 = l.diffed) && a3(u3), 128 & u3.__u ? void 0 : f3;
  }
  function N(n2) {
    n2 && (n2.__c && (n2.__c.__e = true), n2.__k && n2.__k.some(N));
  }
  function V(n2, u3, t3) {
    for (var i3 = 0; i3 < t3.length; i3++) D(t3[i3], t3[++i3], t3[++i3]);
    l.__c && l.__c(u3, n2), n2.some(function(u4) {
      try {
        n2 = u4.__h, u4.__h = [], n2.some(function(n3) {
          n3.call(u4);
        });
      } catch (n3) {
        l.__e(n3, u4.__v);
      }
    });
  }
  function q(n2) {
    return "object" != typeof n2 || null == n2 || n2.__b > 0 ? n2 : d(n2) ? n2.map(q) : w({}, n2);
  }
  function B(u3, t3, i3, r3, o3, e3, f3, c3, s3) {
    var a3, h3, v3, y3, w3, _3, m3, b2 = i3.props || p, k3 = t3.props, x3 = t3.type;
    if ("svg" == x3 ? o3 = "http://www.w3.org/2000/svg" : "math" == x3 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
      for (a3 = 0; a3 < e3.length; a3++) if ((w3 = e3[a3]) && "setAttribute" in w3 == !!x3 && (x3 ? w3.localName == x3 : 3 == w3.nodeType)) {
        u3 = w3, e3[a3] = null;
        break;
      }
    }
    if (null == u3) {
      if (null == x3) return document.createTextNode(k3);
      u3 = document.createElementNS(o3, x3, k3.is && k3), c3 && (l.__m && l.__m(t3, e3), c3 = false), e3 = null;
    }
    if (null == x3) b2 === k3 || c3 && u3.data == k3 || (u3.data = k3);
    else {
      if (e3 = e3 && n.call(u3.childNodes), !c3 && null != e3) for (b2 = {}, a3 = 0; a3 < u3.attributes.length; a3++) b2[(w3 = u3.attributes[a3]).name] = w3.value;
      for (a3 in b2) w3 = b2[a3], "dangerouslySetInnerHTML" == a3 ? v3 = w3 : "children" == a3 || a3 in k3 || "value" == a3 && "defaultValue" in k3 || "checked" == a3 && "defaultChecked" in k3 || F(u3, a3, null, w3, o3);
      for (a3 in k3) w3 = k3[a3], "children" == a3 ? y3 = w3 : "dangerouslySetInnerHTML" == a3 ? h3 = w3 : "value" == a3 ? _3 = w3 : "checked" == a3 ? m3 = w3 : c3 && "function" != typeof w3 || b2[a3] === w3 || F(u3, a3, w3, b2[a3], o3);
      if (h3) c3 || v3 && (h3.__html == v3.__html || h3.__html == u3.innerHTML) || (u3.innerHTML = h3.__html), t3.__k = [];
      else if (v3 && (u3.innerHTML = ""), P("template" == t3.type ? u3.content : u3, d(y3) ? y3 : [y3], t3, i3, r3, "foreignObject" == x3 ? "http://www.w3.org/1999/xhtml" : o3, e3, f3, e3 ? e3[0] : i3.__k && S(i3, 0), c3, s3), null != e3) for (a3 = e3.length; a3--; ) g(e3[a3]);
      c3 || (a3 = "value", "progress" == x3 && null == _3 ? u3.removeAttribute("value") : null != _3 && (_3 !== u3[a3] || "progress" == x3 && !_3 || "option" == x3 && _3 != b2[a3]) && F(u3, a3, _3, b2[a3], o3), a3 = "checked", null != m3 && m3 != u3[a3] && F(u3, a3, m3, b2[a3], o3));
    }
    return u3;
  }
  function D(n2, u3, t3) {
    try {
      if ("function" == typeof n2) {
        var i3 = "function" == typeof n2.__u;
        i3 && n2.__u(), i3 && null == u3 || (n2.__u = n2(u3));
      } else n2.current = u3;
    } catch (n3) {
      l.__e(n3, t3);
    }
  }
  function E(n2, u3, t3) {
    var i3, r3;
    if (l.unmount && l.unmount(n2), (i3 = n2.ref) && (i3.current && i3.current != n2.__e || D(i3, null, u3)), null != (i3 = n2.__c)) {
      if (i3.componentWillUnmount) try {
        i3.componentWillUnmount();
      } catch (n3) {
        l.__e(n3, u3);
      }
      i3.base = i3.__P = null;
    }
    if (i3 = n2.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && E(i3[r3], u3, t3 || "function" != typeof n2.type);
    t3 || g(n2.__e), n2.__c = n2.__ = n2.__e = void 0;
  }
  function G(n2, l3, u3) {
    return this.constructor(n2, u3);
  }
  function J(u3, t3, i3) {
    var r3, o3, e3, f3;
    t3 == document && (t3 = document.documentElement), l.__ && l.__(u3, t3), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t3.__k, e3 = [], f3 = [], z(t3, u3 = (!r3 && i3 || t3).__k = _(k, null, [u3]), o3 || p, p, t3.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t3.firstChild ? n.call(t3.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t3.firstChild, r3, f3), V(e3, u3, f3);
  }
  var n, l, u, t, i, r, o, e, f, c, s, a, h, p, v, y, d;
  var init_preact_module = __esm({
    "node_modules/preact/dist/preact.module.js"() {
      p = {};
      v = [];
      y = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
      d = Array.isArray;
      n = v.slice, l = { __e: function(n2, l3, u3, t3) {
        for (var i3, r3, o3; l3 = l3.__; ) if ((i3 = l3.__c) && !i3.__) try {
          if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n2)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n2, t3 || {}), o3 = i3.__d), o3) return i3.__E = i3;
        } catch (l4) {
          n2 = l4;
        }
        throw n2;
      } }, u = 0, t = function(n2) {
        return null != n2 && void 0 === n2.constructor;
      }, x.prototype.setState = function(n2, l3) {
        var u3;
        u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = w({}, this.state), "function" == typeof n2 && (n2 = n2(w({}, u3), this.props)), n2 && w(u3, n2), null != n2 && this.__v && (l3 && this._sb.push(l3), $(this));
      }, x.prototype.forceUpdate = function(n2) {
        this.__v && (this.__e = true, n2 && this.__h.push(n2), $(this));
      }, x.prototype.render = k, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n2, l3) {
        return n2.__v.__b - l3.__v.__b;
      }, I.__r = 0, f = /(PointerCapture)$|Capture$/i, c = 0, s = O(false), a = O(true), h = 0;
    }
  });

  // node_modules/preact/hooks/dist/hooks.module.js
  function p2(n2, t3) {
    c2.__h && c2.__h(r2, n2, o2 || t3), o2 = 0;
    var u3 = r2.__H || (r2.__H = { __: [], __h: [] });
    return n2 >= u3.__.length && u3.__.push({}), u3.__[n2];
  }
  function d2(n2) {
    return o2 = 1, h2(D2, n2);
  }
  function h2(n2, u3, i3) {
    var o3 = p2(t2++, 2);
    if (o3.t = n2, !o3.__c && (o3.__ = [i3 ? i3(u3) : D2(void 0, u3), function(n3) {
      var t3 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t3, n3);
      t3 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
    }], o3.__c = r2, !r2.__f)) {
      var f3 = function(n3, t3, r3) {
        if (!o3.__c.__H) return true;
        var u4 = o3.__c.__H.__.filter(function(n4) {
          return n4.__c;
        });
        if (u4.every(function(n4) {
          return !n4.__N;
        })) return !c3 || c3.call(this, n3, t3, r3);
        var i4 = o3.__c.props !== n3;
        return u4.some(function(n4) {
          if (n4.__N) {
            var t4 = n4.__[0];
            n4.__ = n4.__N, n4.__N = void 0, t4 !== n4.__[0] && (i4 = true);
          }
        }), c3 && c3.call(this, n3, t3, r3) || i4;
      };
      r2.__f = true;
      var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
      r2.componentWillUpdate = function(n3, t3, r3) {
        if (this.__e) {
          var u4 = c3;
          c3 = void 0, f3(n3, t3, r3), c3 = u4;
        }
        e3 && e3.call(this, n3, t3, r3);
      }, r2.shouldComponentUpdate = f3;
    }
    return o3.__N || o3.__;
  }
  function y2(n2, u3) {
    var i3 = p2(t2++, 3);
    !c2.__s && C2(i3.__H, u3) && (i3.__ = n2, i3.u = u3, r2.__H.__h.push(i3));
  }
  function _2(n2, u3) {
    var i3 = p2(t2++, 4);
    !c2.__s && C2(i3.__H, u3) && (i3.__ = n2, i3.u = u3, r2.__h.push(i3));
  }
  function A2(n2) {
    return o2 = 5, T2(function() {
      return { current: n2 };
    }, []);
  }
  function F2(n2, t3, r3) {
    o2 = 6, _2(function() {
      if ("function" == typeof n2) {
        var r4 = n2(t3());
        return function() {
          n2(null), r4 && "function" == typeof r4 && r4();
        };
      }
      if (n2) return n2.current = t3(), function() {
        return n2.current = null;
      };
    }, null == r3 ? r3 : r3.concat(n2));
  }
  function T2(n2, r3) {
    var u3 = p2(t2++, 7);
    return C2(u3.__H, r3) && (u3.__ = n2(), u3.__H = r3, u3.__h = n2), u3.__;
  }
  function q2(n2, t3) {
    return o2 = 8, T2(function() {
      return n2;
    }, t3);
  }
  function j2() {
    for (var n2; n2 = f2.shift(); ) {
      var t3 = n2.__H;
      if (n2.__P && t3) try {
        t3.__h.some(z2), t3.__h.some(B2), t3.__h = [];
      } catch (r3) {
        t3.__h = [], c2.__e(r3, n2.__v);
      }
    }
  }
  function w2(n2) {
    var t3, r3 = function() {
      clearTimeout(u3), k2 && cancelAnimationFrame(t3), setTimeout(n2);
    }, u3 = setTimeout(r3, 35);
    k2 && (t3 = requestAnimationFrame(r3));
  }
  function z2(n2) {
    var t3 = r2, u3 = n2.__c;
    "function" == typeof u3 && (n2.__c = void 0, u3()), r2 = t3;
  }
  function B2(n2) {
    var t3 = r2;
    n2.__c = n2.__(), r2 = t3;
  }
  function C2(n2, t3) {
    return !n2 || n2.length !== t3.length || t3.some(function(t4, r3) {
      return t4 !== n2[r3];
    });
  }
  function D2(n2, t3) {
    return "function" == typeof t3 ? t3(n2) : t3;
  }
  var t2, r2, u2, i2, o2, f2, c2, e2, a2, v2, l2, m2, s2, k2;
  var init_hooks_module = __esm({
    "node_modules/preact/hooks/dist/hooks.module.js"() {
      init_preact_module();
      o2 = 0;
      f2 = [];
      c2 = l;
      e2 = c2.__b;
      a2 = c2.__r;
      v2 = c2.diffed;
      l2 = c2.__c;
      m2 = c2.unmount;
      s2 = c2.__;
      c2.__b = function(n2) {
        r2 = null, e2 && e2(n2);
      }, c2.__ = function(n2, t3) {
        n2 && t3.__k && t3.__k.__m && (n2.__m = t3.__k.__m), s2 && s2(n2, t3);
      }, c2.__r = function(n2) {
        a2 && a2(n2), t2 = 0;
        var i3 = (r2 = n2.__c).__H;
        i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n3) {
          n3.__N && (n3.__ = n3.__N), n3.u = n3.__N = void 0;
        })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
      }, c2.diffed = function(n2) {
        v2 && v2(n2);
        var t3 = n2.__c;
        t3 && t3.__H && (t3.__H.__h.length && (1 !== f2.push(t3) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t3.__H.__.some(function(n3) {
          n3.u && (n3.__H = n3.u), n3.u = void 0;
        })), u2 = r2 = null;
      }, c2.__c = function(n2, t3) {
        t3.some(function(n3) {
          try {
            n3.__h.some(z2), n3.__h = n3.__h.filter(function(n4) {
              return !n4.__ || B2(n4);
            });
          } catch (r3) {
            t3.some(function(n4) {
              n4.__h && (n4.__h = []);
            }), t3 = [], c2.__e(r3, n3.__v);
          }
        }), l2 && l2(n2, t3);
      }, c2.unmount = function(n2) {
        m2 && m2(n2);
        var t3, r3 = n2.__c;
        r3 && r3.__H && (r3.__H.__.some(function(n3) {
          try {
            z2(n3);
          } catch (n4) {
            t3 = n4;
          }
        }), r3.__H = void 0, t3 && c2.__e(t3, r3.__v));
      };
      k2 = "function" == typeof requestAnimationFrame;
    }
  });

  // node_modules/preact/compat/dist/compat.module.js
  function g3(n2, t3) {
    for (var e3 in t3) n2[e3] = t3[e3];
    return n2;
  }
  function E2(n2, t3) {
    for (var e3 in n2) if ("__source" !== e3 && !(e3 in t3)) return true;
    for (var r3 in t3) if ("__source" !== r3 && n2[r3] !== t3[r3]) return true;
    return false;
  }
  function N2(n2, t3) {
    this.props = n2, this.context = t3;
  }
  function M2(n2, e3) {
    function r3(n3) {
      var t3 = this.props.ref, r4 = t3 == n3.ref;
      return !r4 && t3 && (t3.call ? t3(null) : t3.current = null), e3 ? !e3(this.props, n3) || !r4 : E2(this.props, n3);
    }
    function u3(e4) {
      return this.shouldComponentUpdate = r3, _(n2, e4);
    }
    return u3.displayName = "Memo(" + (n2.displayName || n2.name) + ")", u3.prototype.isReactComponent = true, u3.__f = true, u3.type = n2, u3;
  }
  function D3(n2) {
    function t3(t4) {
      var e3 = g3({}, t4);
      return delete e3.ref, n2(e3, t4.ref || null);
    }
    return t3.$$typeof = A3, t3.render = n2, t3.prototype.isReactComponent = t3.__f = true, t3.displayName = "ForwardRef(" + (n2.displayName || n2.name) + ")", t3;
  }
  function V2(n2, t3, e3) {
    return n2 && (n2.__c && n2.__c.__H && (n2.__c.__H.__.forEach(function(n3) {
      "function" == typeof n3.__c && n3.__c();
    }), n2.__c.__H = null), null != (n2 = g3({}, n2)).__c && (n2.__c.__P === e3 && (n2.__c.__P = t3), n2.__c.__e = true, n2.__c = null), n2.__k = n2.__k && n2.__k.map(function(n3) {
      return V2(n3, t3, e3);
    })), n2;
  }
  function W(n2, t3, e3) {
    return n2 && e3 && (n2.__v = null, n2.__k = n2.__k && n2.__k.map(function(n3) {
      return W(n3, t3, e3);
    }), n2.__c && n2.__c.__P === t3 && (n2.__e && e3.appendChild(n2.__e), n2.__c.__e = true, n2.__c.__P = e3)), n2;
  }
  function P3() {
    this.__u = 0, this.o = null, this.__b = null;
  }
  function j3(n2) {
    if (!n2.__) return null;
    var t3 = n2.__.__c;
    return t3 && t3.__a && t3.__a(n2);
  }
  function z3(n2) {
    var e3, r3, u3, o3 = null;
    function i3(i4) {
      if (e3 || (e3 = n2()).then(function(n3) {
        n3 && (o3 = n3.default || n3), u3 = true;
      }, function(n3) {
        r3 = n3, u3 = true;
      }), r3) throw r3;
      if (!u3) throw e3;
      return o3 ? _(o3, i4) : null;
    }
    return i3.displayName = "Lazy", i3.__f = true, i3;
  }
  function B3() {
    this.i = null, this.l = null;
  }
  function rn() {
  }
  function un() {
    return this.cancelBubble;
  }
  function on() {
    return this.defaultPrevented;
  }
  var T3, A3, U, F3, H2, q3, G2, J2, K2, Q2, X, en, ln, cn, fn, an, sn;
  var init_compat_module = __esm({
    "node_modules/preact/compat/dist/compat.module.js"() {
      init_preact_module();
      init_preact_module();
      init_hooks_module();
      init_hooks_module();
      (N2.prototype = new x()).isPureReactComponent = true, N2.prototype.shouldComponentUpdate = function(n2, t3) {
        return E2(this.props, n2) || E2(this.state, t3);
      };
      T3 = l.__b;
      l.__b = function(n2) {
        n2.type && n2.type.__f && n2.ref && (n2.props.ref = n2.ref, n2.ref = null), T3 && T3(n2);
      };
      A3 = "undefined" != typeof Symbol && Symbol.for && /* @__PURE__ */ Symbol.for("react.forward_ref") || 3911;
      U = l.__e;
      l.__e = function(n2, t3, e3, r3) {
        if (n2.then) {
          for (var u3, o3 = t3; o3 = o3.__; ) if ((u3 = o3.__c) && u3.__c) return null == t3.__e && (t3.__e = e3.__e, t3.__k = e3.__k), u3.__c(n2, t3);
        }
        U(n2, t3, e3, r3);
      };
      F3 = l.unmount;
      l.unmount = function(n2) {
        var t3 = n2.__c;
        t3 && (t3.__z = true), t3 && t3.__R && t3.__R(), t3 && 32 & n2.__u && (n2.type = null), F3 && F3(n2);
      }, (P3.prototype = new x()).__c = function(n2, t3) {
        var e3 = t3.__c, r3 = this;
        null == r3.o && (r3.o = []), r3.o.push(e3);
        var u3 = j3(r3.__v), o3 = false, i3 = function() {
          o3 || r3.__z || (o3 = true, e3.__R = null, u3 ? u3(c3) : c3());
        };
        e3.__R = i3;
        var l3 = e3.__P;
        e3.__P = null;
        var c3 = function() {
          if (!--r3.__u) {
            if (r3.state.__a) {
              var n3 = r3.state.__a;
              r3.__v.__k[0] = W(n3, n3.__c.__P, n3.__c.__O);
            }
            var t4;
            for (r3.setState({ __a: r3.__b = null }); t4 = r3.o.pop(); ) t4.__P = l3, t4.forceUpdate();
          }
        };
        r3.__u++ || 32 & t3.__u || r3.setState({ __a: r3.__b = r3.__v.__k[0] }), n2.then(i3, i3);
      }, P3.prototype.componentWillUnmount = function() {
        this.o = [];
      }, P3.prototype.render = function(n2, e3) {
        if (this.__b) {
          if (this.__v.__k) {
            var r3 = document.createElement("div"), o3 = this.__v.__k[0].__c;
            this.__v.__k[0] = V2(this.__b, r3, o3.__O = o3.__P);
          }
          this.__b = null;
        }
        var i3 = e3.__a && _(k, null, n2.fallback);
        return i3 && (i3.__u &= -33), [_(k, null, e3.__a ? null : n2.children), i3];
      };
      H2 = function(n2, t3, e3) {
        if (++e3[1] === e3[0] && n2.l.delete(t3), n2.props.revealOrder && ("t" !== n2.props.revealOrder[0] || !n2.l.size)) for (e3 = n2.i; e3; ) {
          for (; e3.length > 3; ) e3.pop()();
          if (e3[1] < e3[0]) break;
          n2.i = e3 = e3[2];
        }
      };
      (B3.prototype = new x()).__a = function(n2) {
        var t3 = this, e3 = j3(t3.__v), r3 = t3.l.get(n2);
        return r3[0]++, function(u3) {
          var o3 = function() {
            t3.props.revealOrder ? (r3.push(u3), H2(t3, n2, r3)) : u3();
          };
          e3 ? e3(o3) : o3();
        };
      }, B3.prototype.render = function(n2) {
        this.i = null, this.l = /* @__PURE__ */ new Map();
        var t3 = L(n2.children);
        n2.revealOrder && "b" === n2.revealOrder[0] && t3.reverse();
        for (var e3 = t3.length; e3--; ) this.l.set(t3[e3], this.i = [1, 0, this.i]);
        return n2.children;
      }, B3.prototype.componentDidUpdate = B3.prototype.componentDidMount = function() {
        var n2 = this;
        this.l.forEach(function(t3, e3) {
          H2(n2, e3, t3);
        });
      };
      q3 = "undefined" != typeof Symbol && Symbol.for && /* @__PURE__ */ Symbol.for("react.element") || 60103;
      G2 = /^(?:accent|alignment|arabic|baseline|cap|clip(?!PathU)|color|dominant|fill|flood|font|glyph(?!R)|horiz|image(!S)|letter|lighting|marker(?!H|W|U)|overline|paint|pointer|shape|stop|strikethrough|stroke|text(?!L)|transform|underline|unicode|units|v|vector|vert|word|writing|x(?!C))[A-Z]/;
      J2 = /^on(Ani|Tra|Tou|BeforeInp|Compo)/;
      K2 = /[A-Z0-9]/g;
      Q2 = "undefined" != typeof document;
      X = function(n2) {
        return ("undefined" != typeof Symbol && "symbol" == typeof /* @__PURE__ */ Symbol() ? /fil|che|rad/ : /fil|che|ra/).test(n2);
      };
      x.prototype.isReactComponent = {}, ["componentWillMount", "componentWillReceiveProps", "componentWillUpdate"].forEach(function(t3) {
        Object.defineProperty(x.prototype, t3, { configurable: true, get: function() {
          return this["UNSAFE_" + t3];
        }, set: function(n2) {
          Object.defineProperty(this, t3, { configurable: true, writable: true, value: n2 });
        } });
      });
      en = l.event;
      l.event = function(n2) {
        return en && (n2 = en(n2)), n2.persist = rn, n2.isPropagationStopped = un, n2.isDefaultPrevented = on, n2.nativeEvent = n2;
      };
      cn = { enumerable: false, configurable: true, get: function() {
        return this.class;
      } };
      fn = l.vnode;
      l.vnode = function(n2) {
        "string" == typeof n2.type && (function(n3) {
          var t3 = n3.props, e3 = n3.type, u3 = {}, o3 = -1 === e3.indexOf("-");
          for (var i3 in t3) {
            var l3 = t3[i3];
            if (!("value" === i3 && "defaultValue" in t3 && null == l3 || Q2 && "children" === i3 && "noscript" === e3 || "class" === i3 || "className" === i3)) {
              var c3 = i3.toLowerCase();
              "defaultValue" === i3 && "value" in t3 && null == t3.value ? i3 = "value" : "download" === i3 && true === l3 ? l3 = "" : "translate" === c3 && "no" === l3 ? l3 = false : "o" === c3[0] && "n" === c3[1] ? "ondoubleclick" === c3 ? i3 = "ondblclick" : "onchange" !== c3 || "input" !== e3 && "textarea" !== e3 || X(t3.type) ? "onfocus" === c3 ? i3 = "onfocusin" : "onblur" === c3 ? i3 = "onfocusout" : J2.test(i3) && (i3 = c3) : c3 = i3 = "oninput" : o3 && G2.test(i3) ? i3 = i3.replace(K2, "-$&").toLowerCase() : null === l3 && (l3 = void 0), "oninput" === c3 && u3[i3 = c3] && (i3 = "oninputCapture"), u3[i3] = l3;
            }
          }
          "select" == e3 && u3.multiple && Array.isArray(u3.value) && (u3.value = L(t3.children).forEach(function(n4) {
            n4.props.selected = -1 != u3.value.indexOf(n4.props.value);
          })), "select" == e3 && null != u3.defaultValue && (u3.value = L(t3.children).forEach(function(n4) {
            n4.props.selected = u3.multiple ? -1 != u3.defaultValue.indexOf(n4.props.value) : u3.defaultValue == n4.props.value;
          })), t3.class && !t3.className ? (u3.class = t3.class, Object.defineProperty(u3, "className", cn)) : t3.className && (u3.class = u3.className = t3.className), n3.props = u3;
        })(n2), n2.$$typeof = q3, fn && fn(n2);
      };
      an = l.__r;
      l.__r = function(n2) {
        an && an(n2), ln = n2.__c;
      };
      sn = l.diffed;
      l.diffed = function(n2) {
        sn && sn(n2);
        var t3 = n2.props, e3 = n2.__e;
        null != e3 && "textarea" === n2.type && "value" in t3 && t3.value !== e3.value && (e3.value = null == t3.value ? "" : t3.value), ln = null;
      };
    }
  });

  // public/ui-bridge.js
  function shallowEqual(objA, objB) {
    if (Object.is(objA, objB)) {
      return true;
    }
    if (typeof objA !== "object" || objA === null || typeof objB !== "object" || objB === null) {
      return false;
    }
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (let i3 = 0; i3 < keysA.length; i3++) {
      if (!Object.hasOwn(objB, keysA[i3]) || !Object.is(objA[keysA[i3]], objB[keysA[i3]])) {
        return false;
      }
    }
    return true;
  }
  function useEnsembleState(selector) {
    const selectorRef = A2(selector);
    selectorRef.current = selector;
    const [slice, setSlice] = d2(() => selector(getState()));
    const [, forceUpdate] = d2(0);
    y2(() => {
      const update = (_action, _payload, updatedStateMap) => {
        const newSlice = selectorRef.current(updatedStateMap);
        const stateVersion = updatedStateMap.playback.stateVersion;
        setSlice((prevSlice) => {
          if (!shallowEqual(prevSlice, newSlice)) {
            return newSlice;
          }
          forceUpdate(stateVersion);
          return prevSlice;
        });
      };
      const unsubscribe = subscribe(update);
      return unsubscribe;
    }, []);
    return slice;
  }
  function useDispatch() {
    return q2((action, payload) => {
      dispatch(action, payload);
    }, []);
  }
  var init_ui_bridge = __esm({
    "public/ui-bridge.js"() {
      init_hooks_module();
      init_state();
      useEnsembleState.getState = getState;
    }
  });

  // public/components/SymbolMenu.jsx
  function SymbolMenu({ onSelect, onClose }) {
    const symbols = [
      "|",
      "maj7",
      "m7",
      "7",
      "\xF8",
      "o",
      "aug",
      "aug7",
      "sus4",
      "sus2",
      "#",
      "b",
      ",",
      "-"
    ];
    const SYMBOL_LABELS = {
      "|": "Bar Line",
      maj7: "Major 7th",
      m7: "Minor 7th",
      7: "Dominant 7th",
      \u00F8: "Half-Diminished 7th",
      o: "Diminished",
      aug: "Augmented",
      aug7: "Augmented 7th",
      sus4: "Suspended 4th",
      sus2: "Suspended 2nd",
      "#": "Sharp",
      b: "Flat",
      ",": "Comma Separator",
      "-": "Minor"
    };
    return /* @__PURE__ */ _("div", { class: "symbol-dropdown", onClick: (e3) => e3.stopPropagation() }, symbols.map((sym) => /* @__PURE__ */ _(
      "button",
      {
        key: sym,
        class: "symbol-btn",
        title: SYMBOL_LABELS[sym] || sym,
        "aria-label": SYMBOL_LABELS[sym] || sym,
        onClick: () => {
          onSelect(sym);
          onClose();
        }
      },
      sym
    )));
  }
  var init_SymbolMenu = __esm({
    "public/components/SymbolMenu.jsx"() {
      init_preact_module();
      init_compat_module();
    }
  });

  // public/components/SectionCard.jsx
  var arranger2, SectionCard;
  var init_SectionCard = __esm({
    "public/components/SectionCard.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_arranger_controller();
      init_config();
      init_state();
      init_ui_bridge();
      init_utils();
      init_SymbolMenu();
      ({ arranger: arranger2 } = getState());
      SectionCard = D3(({ section, index, totalSections }, ref) => {
        const [isMenuOpen, setIsMenuOpen] = d2(false);
        const textareaRef = A2(null);
        const rootRef = A2(null);
        const menuRef = A2(null);
        y2(() => {
          if (!isMenuOpen) {
            return;
          }
          const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
              setIsMenuOpen(false);
            }
          };
          document.addEventListener("mousedown", handleClickOutside);
          return () => {
            document.removeEventListener("mousedown", handleClickOutside);
          };
        }, [isMenuOpen]);
        F2(ref, () => ({
          scrollIntoView: (options) => {
            if (rootRef.current) {
              rootRef.current.scrollIntoView(options);
            }
          },
          focusInput: () => {
            if (textareaRef.current) {
              textareaRef.current.focus();
            }
          }
        }));
        const { isMinor, mutatedSectionId } = useEnsembleState((s3) => ({
          isMinor: s3.arranger.isMinor,
          mutatedSectionId: s3.arranger.mutatedSectionId
        }));
        const isMutated = mutatedSectionId === section.id;
        const handleDragStart = (e3) => {
          e3.dataTransfer.setData("text/plain", section.id);
          e3.currentTarget.classList.add("dragging");
        };
        const handleDragEnd = (e3) => {
          e3.currentTarget.classList.remove("dragging");
          document.querySelectorAll(".section-card").forEach((el) => el.classList.remove("drag-over"));
        };
        const handleDragEnter = (e3) => {
          e3.preventDefault();
          const draggedId = e3.dataTransfer.getData("text/plain");
          if (draggedId !== section.id) {
            e3.currentTarget.classList.add("drag-over");
          }
        };
        const handleDragLeave = (e3) => {
          e3.currentTarget.classList.remove("drag-over");
        };
        const handleDrop = (e3) => {
          e3.preventDefault();
          e3.currentTarget.classList.remove("drag-over");
          const draggedId = e3.dataTransfer.getData("text/plain");
          if (draggedId && draggedId !== section.id) {
            const event = new CustomEvent("reorder-sections", {
              detail: { draggedId, targetId: section.id }
            });
            window.dispatchEvent(event);
          }
        };
        const insertSymbol = (sym) => {
          const input = textareaRef.current;
          if (!input) {
            return;
          }
          const start = input.selectionStart;
          const end = input.selectionEnd;
          const text = input.value;
          const before = text.substring(0, start);
          const after = text.substring(end);
          const newValue = before + sym + after;
          onSectionUpdate(section.id, "value", newValue);
          setTimeout(() => {
            input.focus();
            input.selectionStart = input.selectionEnd = start + sym.length;
          }, 0);
        };
        const handleViewTransition = (fn2) => {
          if (!document.startViewTransition) {
            fn2();
            return;
          }
          document.startViewTransition(async () => {
            fn2();
            await new Promise((r3) => setTimeout(r3, 0));
          });
        };
        return /* @__PURE__ */ _(
          "div",
          {
            ref: rootRef,
            class: `section-card ${section.seamless ? "linked" : ""} ${isMenuOpen ? "menu-active" : ""}`,
            "data-id": section.id,
            style: { viewTransitionName: `editor-card-${section.id}` },
            draggable: true,
            onDragStart: handleDragStart,
            onDragEnd: handleDragEnd,
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDragOver: (e3) => e3.preventDefault(),
            onDrop: handleDrop
          },
          /* @__PURE__ */ _("div", { class: "section-header" }, /* @__PURE__ */ _("div", { class: "section-title-row" }, /* @__PURE__ */ _(
            "input",
            {
              class: "section-label-input",
              value: section.label,
              "aria-label": "Section Name",
              maxLength: 100,
              onChange: (e3) => onSectionUpdate(section.id, "label", e3.target.value)
            }
          )), /* @__PURE__ */ _("div", { class: "section-controls-row" }, /* @__PURE__ */ _("div", { class: "section-settings-row" }, /* @__PURE__ */ _("div", { class: "section-setting-item" }, /* @__PURE__ */ _("span", { class: "setting-label" }, "x"), /* @__PURE__ */ _(
            "input",
            {
              type: "number",
              class: "section-repeat-input",
              value: section.repeat || 1,
              min: "1",
              max: "8",
              "aria-label": "Repeat Count",
              onChange: (e3) => onSectionUpdate(
                section.id,
                "repeat",
                parseInt(e3.target.value, 10)
              )
            }
          )), /* @__PURE__ */ _(
            "select",
            {
              class: "section-key-select",
              value: section.key || "",
              "aria-label": "Section Key",
              onChange: (e3) => onSectionUpdate(section.id, "key", e3.target.value)
            },
            /* @__PURE__ */ _("option", { value: "" }, "Key: Auto"),
            KEY_ORDER.map((k3) => /* @__PURE__ */ _("option", { key: k3, value: k3 }, "Key: ", formatUnicodeSymbols(k3), isMinor ? "m" : ""))
          ), /* @__PURE__ */ _(
            "select",
            {
              class: "section-ts-select",
              value: section.timeSignature || "",
              "aria-label": "Time Signature",
              onChange: (e3) => onSectionUpdate(section.id, "timeSignature", e3.target.value)
            },
            /* @__PURE__ */ _("option", { value: "" }, "TS: Auto"),
            Object.keys(TIME_SIGNATURES).map((ts) => /* @__PURE__ */ _("option", { key: ts, value: ts }, "TS: ", ts))
          )), /* @__PURE__ */ _("div", { class: "section-actions" }, /* @__PURE__ */ _(
            "button",
            {
              class: `section-link-btn ${section.seamless ? "active" : ""}`,
              title: section.seamless ? "Unlink from previous (Enable Fills)" : "Link to previous (Seamless Transition)",
              "aria-label": section.seamless ? "Disable seamless transition" : "Enable seamless transition",
              onClick: () => handleViewTransition(
                () => onSectionUpdate(section.id, "seamless", !section.seamless)
              )
            },
            "\u{1F517}"
          ), /* @__PURE__ */ _(
            "button",
            {
              class: "section-move-btn",
              title: "Move Up",
              "aria-label": "Move Section Up",
              onClick: () => handleViewTransition(() => onSectionUpdate(section.id, "move", -1)),
              disabled: index === 0
            },
            "\u25B4"
          ), /* @__PURE__ */ _(
            "button",
            {
              class: "section-move-btn",
              title: "Move Down",
              "aria-label": "Move Section Down",
              onClick: () => handleViewTransition(() => onSectionUpdate(section.id, "move", 1)),
              disabled: index === totalSections - 1
            },
            "\u25BE"
          ), /* @__PURE__ */ _(
            "button",
            {
              class: "section-duplicate-btn",
              title: "Duplicate",
              "aria-label": "Duplicate Section",
              onClick: () => onSectionDuplicate(section.id)
            },
            "\u2398"
          ), /* @__PURE__ */ _("div", { style: "position: relative; display: inline-block;", ref: menuRef }, /* @__PURE__ */ _(
            "button",
            {
              class: "section-kebab-btn",
              title: "Insert Symbol",
              "aria-label": `Actions for ${section.label || "Section"}`,
              "aria-expanded": isMenuOpen,
              "aria-haspopup": "true",
              onClick: (e3) => {
                e3.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }
            },
            "\u22EE"
          ), isMenuOpen && /* @__PURE__ */ _(
            SymbolMenu,
            {
              onSelect: insertSymbol,
              onClose: () => setIsMenuOpen(false)
            }
          )), /* @__PURE__ */ _(
            "button",
            {
              class: "section-delete-btn",
              title: "Delete",
              "aria-label": "Delete Section",
              onClick: () => onSectionDelete(section.id)
            },
            "\u2715"
          )))),
          /* @__PURE__ */ _(
            "textarea",
            {
              ref: textareaRef,
              class: `section-prog-input ${isMutated ? "mutated" : ""}`,
              value: section.value,
              "aria-label": "Chord Progression",
              maxLength: 1e3,
              placeholder: "Enter chords (e.g. C Am F G)",
              onInput: (e3) => onSectionUpdate(section.id, "value", e3.target.value),
              onFocus: () => {
                arranger2.lastInteractedSectionId = section.id;
              }
            }
          )
        );
      });
    }
  });

  // public/components/Arranger.jsx
  function Arranger() {
    const { sections, lastInteractedSectionId } = useEnsembleState((s3) => ({
      sections: s3.arranger.sections,
      lastInteractedSectionId: s3.arranger.lastInteractedSectionId
    }));
    const sectionRefs = A2({});
    y2(() => {
      if (lastInteractedSectionId) {
        const handle = sectionRefs.current[lastInteractedSectionId];
        if (handle) {
          setTimeout(() => {
            if (handle.scrollIntoView) {
              handle.scrollIntoView({ behavior: "smooth", block: "center" });
            }
            if (handle.focusInput) {
              handle.focusInput();
            }
          }, 150);
        }
      }
    }, [lastInteractedSectionId]);
    y2(() => {
      const handleReorder = (e3) => {
        const { draggedId, targetId } = e3.detail;
        const draggedIdx = sections.findIndex((sec) => sec.id === draggedId);
        const targetIdx = sections.findIndex((sec) => sec.id === targetId);
        if (draggedIdx === -1 || targetIdx === -1) {
          return;
        }
        const newOrder = sections.map((sec) => sec.id);
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedId);
        onSectionUpdate(null, "reorder", newOrder);
      };
      window.addEventListener("reorder-sections", handleReorder);
      return () => window.removeEventListener("reorder-sections", handleReorder);
    }, [sections]);
    if (!sections) {
      return null;
    }
    const groupedSections = [];
    sections.forEach((section) => {
      if (section.seamless && groupedSections.length > 0) {
        groupedSections[groupedSections.length - 1].push(section);
      } else {
        groupedSections.push([section]);
      }
    });
    return /* @__PURE__ */ _(k, null, groupedSections.map((group) => {
      if (group.length === 1) {
        const section = group[0];
        const index = sections.findIndex((s3) => s3.id === section.id);
        return /* @__PURE__ */ _(
          SectionCard,
          {
            key: section.id,
            ref: (el) => sectionRefs.current[section.id] = el,
            section,
            index,
            totalSections: sections.length
          }
        );
      }
      return /* @__PURE__ */ _("div", { className: "section-group", key: `group-${group[0].id}` }, group.map((section) => {
        const index = sections.findIndex((s3) => s3.id === section.id);
        return /* @__PURE__ */ _(
          SectionCard,
          {
            key: section.id,
            ref: (el) => sectionRefs.current[section.id] = el,
            section,
            index,
            totalSections: sections.length
          }
        );
      }));
    }));
  }
  var init_Arranger = __esm({
    "public/components/Arranger.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_arranger_controller();
      init_ui_bridge();
      init_SectionCard();
    }
  });

  // public/components/Settings.jsx
  var Settings_exports = {};
  __export(Settings_exports, {
    Settings: () => Settings
  });
  function Settings() {
    const {
      theme,
      countIn,
      metronome,
      visualFlash,
      haptic,
      sessionTimer,
      loopLimit,
      songMode,
      midiEnabled,
      midiMuteLocal,
      midiSelectedOutputId,
      midiOutputs,
      midiChannels,
      midiOctaves,
      midiLatency,
      midiVelocity
    } = useEnsembleState((state2) => ({
      theme: state2.playback.theme,
      countIn: state2.playback.countIn,
      metronome: state2.playback.metronome,
      visualFlash: state2.playback.visualFlash,
      haptic: state2.playback.haptic,
      sessionTimer: state2.playback.sessionTimer,
      loopLimit: state2.playback.loopLimit,
      songMode: state2.playback.songMode,
      midiEnabled: state2.midi.enabled,
      midiMuteLocal: state2.midi.muteLocal,
      midiSelectedOutputId: state2.midi.selectedOutputId,
      midiOutputs: state2.midi.outputs,
      midiChannels: {
        chords: state2.midi.chordsChannel,
        bass: state2.midi.bassChannel,
        soloist: state2.midi.soloistChannel,
        harmony: state2.midi.harmonyChannel,
        drums: state2.midi.drumsChannel
      },
      midiOctaves: {
        chords: state2.midi.chordsOctave,
        bass: state2.midi.bassOctave,
        soloist: state2.midi.soloistOctave,
        harmony: state2.midi.harmonyOctave,
        drums: state2.midi.drumsOctave
      },
      midiLatency: state2.midi.latency,
      midiVelocity: state2.midi.velocitySensitivity
    }));
    const masterVolume = useEnsembleState((s3) => s3.playback.masterVolume);
    const complexity = useEnsembleState((s3) => s3.playback.complexity);
    let complexityLabel = "Low";
    if (complexity > 0.33) {
      complexityLabel = "Medium";
    }
    if (complexity > 0.66) {
      complexityLabel = "High";
    }
    const closeSettings = () => {
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "settings", open: false });
    };
    const handleMasterVolume = (e3) => {
      const val = parseFloat(e3.target.value);
      dispatch(ACTIONS.SET_PARAM, { module: "playback", param: "masterVolume", value: val });
      if (playback6.masterGain && playback6.audio) {
        const target = Math.max(1e-4, val * MIXER_GAIN_MULTIPLIERS.master);
        playback6.masterGain.gain.cancelScheduledValues(playback6.audio.currentTime);
        playback6.masterGain.gain.setValueAtTime(
          playback6.masterGain.gain.value,
          playback6.audio.currentTime
        );
        playback6.masterGain.gain.exponentialRampToValueAtTime(
          target,
          playback6.audio.currentTime + 0.04
        );
      }
      saveCurrentState();
    };
    const handleMidiEnable = async (e3) => {
      const enabled = e3.target.checked;
      if (enabled) {
        const success = await initMIDI();
        if (!success) {
          return;
        }
      } else {
        panic();
      }
      dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
      restoreGains();
      saveCurrentState();
    };
    const openExportModal = () => {
      closeSettings();
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "export", open: true });
    };
    const handleReset = () => {
      if (confirm("Reset all settings and progress? This cannot be undone.")) {
        localStorage.clear();
        window.location.reload();
      }
    };
    const handleInstall = async () => {
      if (await triggerInstall()) {
        const btn = document.getElementById("installAppBtn");
        if (btn) {
          btn.style.display = "none";
        }
      }
    };
    const isOpen = useEnsembleState((s3) => s3.playback.modals.settings);
    const playback6 = useEnsembleState((s3) => s3.playback);
    const overlayRef = A2(null);
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    return /* @__PURE__ */ _(
      "div",
      {
        id: "settingsOverlay",
        ref: overlayRef,
        class: `settings-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        onClick: (e3) => {
          if (e3.target.id === "settingsOverlay") {
            closeSettings();
          }
        }
      },
      /* @__PURE__ */ _("div", { class: "settings-content", onClick: (e3) => e3.stopPropagation() }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; margin-bottom: 1rem;" }, /* @__PURE__ */ _("h2", null, "Settings"), /* @__PURE__ */ _(
        "button",
        {
          id: "closeSettingsBtn",
          style: "background: none; border: none; font-size: 1.5rem;",
          "aria-label": "Close Settings",
          onClick: closeSettings
        },
        "\xD7"
      )), /* @__PURE__ */ _("div", { class: "settings-controls" }, /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "Appearance"), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;" }, "Theme"), /* @__PURE__ */ _(
        "select",
        {
          id: "themeSelect",
          value: theme,
          onChange: (e3) => {
            applyTheme(e3.target.value);
            saveCurrentState();
          },
          "aria-label": "Select Theme"
        },
        /* @__PURE__ */ _("option", { value: "auto" }, "Auto (System Default)"),
        /* @__PURE__ */ _("option", { value: "dark" }, "Dark"),
        /* @__PURE__ */ _("option", { value: "light" }, "Light")
      )), /* @__PURE__ */ _("div", { style: "margin-bottom: 0;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;" }, "Chord Notation"), /* @__PURE__ */ _(
        "select",
        {
          id: "notationSelect",
          value: useEnsembleState((s3) => s3.arranger.notation),
          onChange: (e3) => {
            dispatch(ACTIONS.SET_NOTATION, e3.target.value);
            saveCurrentState();
          },
          "aria-label": "Chord Notation"
        },
        /* @__PURE__ */ _("option", { value: "roman" }, "Roman Numerals (I, vi, IV)"),
        /* @__PURE__ */ _("option", { value: "name" }, "Chord Names (C, Am, F)"),
        /* @__PURE__ */ _("option", { value: "nns" }, "Nashville Numbers (1, 6-, 4)")
      ))), /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "Playback & Performance"), /* @__PURE__ */ _("div", { class: "setting-item", style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _("label", { class: "setting-label" }, /* @__PURE__ */ _("span", null, "Master Volume")), /* @__PURE__ */ _(
        "input",
        {
          id: "masterVolume",
          type: "range",
          min: "0",
          max: "1",
          step: "0.05",
          value: masterVolume || 0.5,
          onInput: handleMasterVolume,
          style: "width: 100%;",
          "aria-label": "Master Volume",
          "aria-valuetext": `${Math.round((masterVolume || 0.5) * 100)}%`
        }
      )), /* @__PURE__ */ _("div", { class: "setting-item", style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _(
        "label",
        {
          class: "setting-label",
          style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;"
        },
        /* @__PURE__ */ _("span", null, "Global Complexity"),
        /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold;" }, complexityLabel)
      ), /* @__PURE__ */ _(
        "input",
        {
          id: "complexitySlider",
          type: "range",
          min: "0",
          max: "100",
          value: Math.round(complexity * 100),
          onInput: (e3) => {
            dispatch(
              ACTIONS.SET_COMPLEXITY,
              parseInt(e3.target.value, 10) / 100
            );
          },
          style: "width: 100%;",
          "aria-label": "Global Complexity",
          "aria-valuetext": complexityLabel
        }
      ), /* @__PURE__ */ _("p", { style: "font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;" }, "Adjusts syncopation and harmonic density for Soloist, Bass, and Harmony engines.")), /* @__PURE__ */ _("div", { style: "margin-bottom: 1.5rem; display: flex; gap: 1.5rem; flex-wrap: wrap;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          id: "countInCheck",
          type: "checkbox",
          checked: countIn,
          onChange: (e3) => {
            dispatch(ACTIONS.SET_PARAM, {
              module: "playback",
              param: "countIn",
              value: e3.target.checked
            });
            saveCurrentState();
          }
        }
      ), /* @__PURE__ */ _("span", null, "Count-in")), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          id: "metronomeCheck",
          type: "checkbox",
          checked: metronome,
          onChange: (e3) => {
            dispatch(ACTIONS.SET_METRONOME, e3.target.checked);
            saveCurrentState();
          }
        }
      ), /* @__PURE__ */ _("span", null, "Metronome")), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          id: "visualFlashCheck",
          type: "checkbox",
          checked: visualFlash,
          onChange: (e3) => {
            dispatch(ACTIONS.SET_PARAM, {
              module: "playback",
              param: "visualFlash",
              value: e3.target.checked
            });
            saveCurrentState();
          }
        }
      ), /* @__PURE__ */ _("span", null, "Visual Flash")), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          id: "hapticCheck",
          type: "checkbox",
          checked: haptic,
          onChange: (e3) => {
            dispatch(ACTIONS.SET_PARAM, {
              module: "playback",
              param: "haptic",
              value: e3.target.checked
            });
            saveCurrentState();
          }
        }
      ), /* @__PURE__ */ _("span", null, "Haptic Feedback"))), /* @__PURE__ */ _(
        "div",
        {
          class: "performance-ending-section",
          style: "background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 8px;"
        },
        /* @__PURE__ */ _("div", { style: "display: flex; flex-direction: column; gap: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500;" }, /* @__PURE__ */ _(
          "input",
          {
            id: "sessionTimerCheck",
            type: "checkbox",
            checked: songMode,
            onChange: (e3) => {
              dispatch(ACTIONS.SET_SONG_MODE, e3.target.checked);
              saveCurrentState();
            }
          }
        ), /* @__PURE__ */ _("span", null, "Song Mode")), /* @__PURE__ */ _(
          "div",
          {
            class: "ending-mode-selector",
            style: {
              display: "flex",
              gap: "0.5rem",
              opacity: songMode ? "1" : "0.4",
              pointerEvents: songMode ? "auto" : "none"
            }
          },
          /* @__PURE__ */ _(
            "button",
            {
              class: `chip-btn ${loopLimit === 0 ? "active" : ""}`,
              onClick: () => {
                dispatch(ACTIONS.SET_PARAM, {
                  module: "playback",
                  param: "loopLimit",
                  value: 0
                });
                saveCurrentState();
              },
              style: {
                padding: "0.4rem 0.8rem",
                borderRadius: "20px",
                border: "1px solid var(--border-color)",
                background: loopLimit === 0 ? "var(--accent-color)" : "none",
                color: loopLimit === 0 ? "white" : "var(--text-color)",
                fontSize: "0.8rem",
                cursor: "pointer"
              }
            },
            "Timer"
          ),
          /* @__PURE__ */ _(
            "button",
            {
              class: `chip-btn ${loopLimit > 0 ? "active" : ""}`,
              onClick: () => {
                dispatch(ACTIONS.SET_PARAM, {
                  module: "playback",
                  param: "loopLimit",
                  value: 3
                });
                saveCurrentState();
              },
              style: {
                padding: "0.4rem 0.8rem",
                borderRadius: "20px",
                border: "1px solid var(--border-color)",
                background: loopLimit > 0 ? "var(--accent-color)" : "none",
                color: loopLimit > 0 ? "white" : "var(--text-color)",
                fontSize: "0.8rem",
                cursor: "pointer"
              }
            },
            "Loops"
          )
        ), /* @__PURE__ */ _(
          "div",
          {
            id: "sessionTimerDurationContainer",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              opacity: songMode ? "1" : "0.4",
              pointerEvents: songMode ? "auto" : "none",
              transition: "all 0.2s ease"
            }
          },
          /* @__PURE__ */ _(
            "div",
            {
              id: "sessionTimerStepper",
              class: "stepper-control",
              style: {
                display: "flex",
                alignItems: "center",
                background: "var(--input-bg)",
                border: "1px solid var(--border-color)",
                borderRadius: "8px",
                overflow: "hidden"
              }
            },
            /* @__PURE__ */ _(
              "button",
              {
                id: "sessionTimerDec",
                class: "stepper-btn",
                style: "padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;",
                "aria-label": "Decrease song duration",
                onClick: () => {
                  if (loopLimit > 0) {
                    const next = Math.max(1, loopLimit - 1);
                    dispatch(ACTIONS.SET_PARAM, {
                      module: "playback",
                      param: "loopLimit",
                      value: next
                    });
                  } else {
                    const next = Math.max(1, sessionTimer - 1);
                    dispatch(ACTIONS.SET_SESSION_TIMER, next);
                  }
                  saveCurrentState();
                }
              },
              "-"
            ),
            /* @__PURE__ */ _(
              "input",
              {
                id: "sessionTimerInput",
                type: "number",
                value: loopLimit > 0 ? loopLimit : sessionTimer,
                readonly: true,
                style: "width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
              }
            ),
            /* @__PURE__ */ _(
              "button",
              {
                id: "sessionTimerInc",
                class: "stepper-btn",
                style: "padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;",
                "aria-label": "Increase song duration",
                onClick: () => {
                  if (loopLimit > 0) {
                    const next = Math.min(50, loopLimit + 1);
                    dispatch(ACTIONS.SET_PARAM, {
                      module: "playback",
                      param: "loopLimit",
                      value: next
                    });
                  } else {
                    const next = Math.min(20, sessionTimer + 1);
                    dispatch(ACTIONS.SET_SESSION_TIMER, next);
                  }
                  saveCurrentState();
                }
              },
              "+"
            )
          ),
          /* @__PURE__ */ _("span", { style: "font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;" }, loopLimit > 0 ? "Choruses" : "Minutes")
        ), loopLimit > 0 && /* @__PURE__ */ _("div", { style: "font-size: 0.75rem; color: var(--accent-color); font-weight: 500; text-align: right; margin-top: -0.5rem;" }, (() => {
          const { arranger: arranger6, playback: playback7 } = getState();
          const totalSteps = arranger6.totalSteps * loopLimit;
          const secPerStep = 60 / playback7.bpm / 4;
          const totalSec = totalSteps * secPerStep;
          const mins = Math.floor(totalSec / 60);
          const secs = Math.round(totalSec % 60);
          return `Est. Time: ${mins}:${secs.toString().padStart(2, "0")}`;
        })())),
        /* @__PURE__ */ _(
          "p",
          {
            class: "performance-ending-footer",
            style: "margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;"
          },
          "The band will evolve the energy naturally and perform a resolution at the end of the final loop once the limit is reached."
        )
      )), /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "Library & Presets"), /* @__PURE__ */ _("div", { style: "margin-bottom: 0;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          type: "checkbox",
          id: "applyPresetSettingsCheck",
          checked: useEnsembleState(
            (s3) => s3.playback.applyPresetSettings
          ),
          onChange: (e3) => {
            dispatch(
              ACTIONS.SET_PRESET_SETTINGS_MODE,
              e3.target.checked
            );
            saveCurrentState();
          }
        }
      ), /* @__PURE__ */ _("span", null, "Auto-Apply Preset Settings")), /* @__PURE__ */ _("p", { style: "font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;" }, "Automatically update BPM and Style when loading a library preset."))), /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "External (MIDI Output)"), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          id: "midiEnableCheck",
          type: "checkbox",
          checked: midiEnabled,
          onChange: handleMidiEnable
        }
      ), /* @__PURE__ */ _("span", null, "Enable Web MIDI Output")), /* @__PURE__ */ _("p", { style: "font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;" }, "Route notes to your DAW or external hardware.")), /* @__PURE__ */ _(
        "div",
        {
          id: "midiControls",
          style: {
            opacity: midiEnabled ? "1" : "0.5",
            pointerEvents: midiEnabled ? "auto" : "none",
            transition: "opacity 0.2s"
          }
        },
        /* @__PURE__ */ _("div", { style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
          "input",
          {
            id: "midiMuteLocalCheck",
            type: "checkbox",
            checked: midiMuteLocal,
            onChange: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                muteLocal: e3.target.checked
              });
              restoreGains();
              saveCurrentState();
            }
          }
        ), /* @__PURE__ */ _("span", null, "Mute Browser Audio"))),
        /* @__PURE__ */ _("div", { style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;" }, "Output Port"), /* @__PURE__ */ _(
          "select",
          {
            id: "midiOutputSelect",
            value: midiSelectedOutputId || "",
            onChange: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                selectedOutputId: e3.target.value
              });
              saveCurrentState();
            },
            style: "width: 100%;"
          },
          midiOutputs && midiOutputs.length > 0 ? midiOutputs.map((out) => /* @__PURE__ */ _("option", { value: out.id }, out.name)) : /* @__PURE__ */ _("option", { value: "" }, "No outputs found")
        )),
        /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;" }, ["Chords", "Bass", "Soloist", "Harmony", "Drums"].map((ch) => /* @__PURE__ */ _("div", { class: "midi-ch-group", key: ch }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;" }, ch), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.25rem;" }, /* @__PURE__ */ _(
          "input",
          {
            id: `midi${ch}Channel`,
            type: "number",
            min: "1",
            max: "16",
            value: midiChannels[ch.toLowerCase()],
            onChange: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                [`${ch.toLowerCase()}Channel`]: parseInt(
                  e3.target.value,
                  10
                )
              });
              saveCurrentState();
            },
            style: "width: 50%;",
            title: "Channel",
            "aria-label": `${ch} MIDI Channel`
          }
        ), /* @__PURE__ */ _(
          "input",
          {
            id: `midi${ch}Octave`,
            type: "number",
            min: "-2",
            max: "2",
            value: midiOctaves[ch.toLowerCase()],
            onChange: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                [`${ch.toLowerCase()}Octave`]: parseInt(
                  e3.target.value,
                  10
                )
              });
              saveCurrentState();
            },
            style: "width: 50%;",
            title: "Octave Offset",
            "aria-label": `${ch} MIDI Octave Offset`
          }
        ))))),
        /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Latency Offset"), /* @__PURE__ */ _("span", { id: "midiLatencyValue", style: "color: var(--accent-color);" }, midiLatency, "ms")), /* @__PURE__ */ _(
          "input",
          {
            id: "midiLatencySlider",
            type: "range",
            min: "-100",
            max: "100",
            step: "1",
            value: midiLatency,
            onInput: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                latency: parseInt(e3.target.value, 10)
              });
              saveCurrentState();
            },
            style: "width: 100%;",
            "aria-label": "MIDI Latency Offset",
            "aria-valuetext": `${midiLatency} ms`
          }
        )),
        /* @__PURE__ */ _("div", { style: "margin-bottom: 0;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Velocity Sensitivity"), /* @__PURE__ */ _(
          "span",
          {
            id: "midiVelocityValue",
            style: "color: var(--accent-color);"
          },
          parseFloat(midiVelocity).toFixed(1)
        )), /* @__PURE__ */ _(
          "input",
          {
            id: "midiVelocitySlider",
            type: "range",
            min: "0.5",
            max: "2.0",
            step: "0.1",
            value: midiVelocity,
            onInput: (e3) => {
              dispatch(ACTIONS.SET_MIDI_CONFIG, {
                velocitySensitivity: parseFloat(e3.target.value)
              });
              saveCurrentState();
            },
            style: "width: 100%;",
            "aria-label": "MIDI Velocity Sensitivity",
            "aria-valuetext": `${parseFloat(midiVelocity).toFixed(1)}x`
          }
        ))
      )), /* @__PURE__ */ _("div", { class: "settings-section", style: "border-bottom: none; padding-bottom: 0;" }, /* @__PURE__ */ _("h3", null, "System Actions"), /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;" }, /* @__PURE__ */ _(
        "button",
        {
          id: "settingsExportMidiBtn",
          class: "secondary-btn",
          style: "display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;",
          onClick: openExportModal
        },
        /* @__PURE__ */ _("span", null, "\u{1F3B9}"),
        " Export MIDI"
      ), /* @__PURE__ */ _(
        "button",
        {
          id: "installAppBtn",
          class: "secondary-btn",
          style: "display: none; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;",
          onClick: handleInstall
        },
        /* @__PURE__ */ _("span", null, "\u{1F4F2}"),
        " Install App"
      ), /* @__PURE__ */ _(
        "button",
        {
          id: "resetSettingsBtn",
          class: "secondary-btn",
          style: "color: var(--error-color); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); padding: 0.8rem 0.5rem;",
          onClick: handleReset
        },
        /* @__PURE__ */ _("span", null, "\u{1F5D1}\uFE0F"),
        " Reset All"
      ), /* @__PURE__ */ _(
        "button",
        {
          id: "refreshAppBtn",
          class: "secondary-btn",
          style: "display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;",
          onClick: () => window.location.reload()
        },
        /* @__PURE__ */ _("span", null, "\u{1F504}"),
        " Force Refresh"
      ))), /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "Advanced"), /* @__PURE__ */ _("label", { class: "setting-item toggle" }, /* @__PURE__ */ _("div", null, /* @__PURE__ */ _("span", { class: "label" }, "Debug Soloist"), /* @__PURE__ */ _("span", { class: "setting-description" }, "Enable chain-of-thought logging for the Soloist engine. Helpful for troubleshooting silence or strange behavior. Logs will appear in the browser console.")), /* @__PURE__ */ _(
        "input",
        {
          type: "checkbox",
          id: "debugSoloistToggle",
          checked: playback6.debugSoloist,
          onChange: (e3) => dispatch(ACTIONS.SET_PARAM, {
            module: "playback",
            param: "debugSoloist",
            value: e3.target.checked
          })
        }
      ), /* @__PURE__ */ _("span", { class: "toggle-slider" }))), /* @__PURE__ */ _(
        "div",
        {
          class: "settings-help",
          style: "margin-top: 1rem; border-top: 1px solid #334155; padding-top: 1rem; border-top: none;"
        },
        /* @__PURE__ */ _("details", { open: true }, /* @__PURE__ */ _("summary", { style: "cursor: pointer; font-weight: bold; color: var(--text-primary); list-style: none; display: flex; align-items: center; justify-content: space-between;" }, /* @__PURE__ */ _("span", null, "Help & Instructions"), /* @__PURE__ */ _("span", { style: "font-size: 0.8em;" }, "\u25BC")), /* @__PURE__ */ _("div", { style: "margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;" }, /* @__PURE__ */ _("div", { style: "margin-bottom: 1.5rem; background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);" }, /* @__PURE__ */ _("h4", { style: "color: var(--accent-color); margin-top: 0; margin-bottom: 0.5rem;" }, "Need more help?"), /* @__PURE__ */ _("p", { style: "margin-bottom: 0.8rem;" }, "For a deep dive into notation, soloing styles, and MIDI export, check out the full manual."), /* @__PURE__ */ _(
          "a",
          {
            href: "manual.html",
            target: "_blank",
            rel: "noopener noreferrer",
            style: "color: white; background: var(--accent-color); padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;"
          },
          "Open User Manual"
        )))),
        /* @__PURE__ */ _(
          "div",
          {
            id: "appVersion",
            style: "text-align: center; margin-top: 1.5rem; color: var(--text-muted); font-size: 0.8rem; opacity: 0.7;"
          },
          "Ensemble v",
          APP_VERSION
        )
      )))
    );
  }
  var playback3;
  var init_Settings = __esm({
    "public/components/Settings.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_state();
      init_types();
      init_ui_bridge();
      init_app_controller();
      init_config();
      init_engine();
      init_midi_controller();
      init_persistence();
      init_pwa();
      ({ playback: playback3 } = getState());
    }
  });

  // public/melody-harmonizer.js
  var melody_harmonizer_exports = {};
  __export(melody_harmonizer_exports, {
    Harmonizer: () => Harmonizer
  });
  var Harmonizer;
  var init_melody_harmonizer = __esm({
    "public/melody-harmonizer.js"() {
      init_config();
      init_utils();
      Harmonizer = class {
        constructor() {
          this.strategies = {
            Consonant: {
              name: "Consonant",
              description: "Safe, diatonic choices that strictly follow the key.",
              weights: {
                diatonic: 10,
                chromaticPenalty: 25,
                melodyFit: 5,
                rootMatch: 3,
                dominantResolution: 5,
                stepwiseMotion: 2,
                commonProgression: 4
              }
            },
            Balanced: {
              name: "Balanced",
              description: "A mix of conventional harmony with some colorful choices.",
              weights: {
                diatonic: 6,
                chromaticPenalty: 12,
                melodyFit: 8,
                rootMatch: 4,
                dominantResolution: 4,
                stepwiseMotion: 3,
                commonProgression: 3
              }
            },
            Complex: {
              name: "Complex",
              description: "Prioritizes melody fit and interesting color over key adherence.",
              weights: {
                diatonic: 2,
                chromaticPenalty: 4,
                melodyFit: 12,
                rootMatch: 2,
                dominantResolution: 2,
                stepwiseMotion: 1,
                commonProgression: 1
              }
            }
          };
          this.diatonicWeights = {
            major: { 0: 10, 2: 4, 4: 4, 5: 8, 7: 9, 9: 6, 11: 2 },
            // I, ii, iii, IV, V, vi, vii
            minor: { 0: 10, 2: 3, 3: 9, 5: 6, 7: 8, 8: 7, 10: 5 }
            // i, ii, III, iv, v, VI, VII
          };
        }
        /**
         * Generates multiple options for harmonization.
         * @returns {Array} Array of option objects { name, description, chords, progression }
         */
        generateOptions(melodyLine, key) {
          if (!melodyLine || melodyLine.length === 0) {
            return [];
          }
          const { rootIndex, isMinor } = this.parseKey(key);
          const measures = Math.ceil(melodyLine.length / 4);
          const measureNotes = [];
          for (let m3 = 0; m3 < measures; m3++) {
            const measureBeats = melodyLine.slice(m3 * 4, m3 * 4 + 4);
            measureNotes.push(this.getProminentNotes(measureBeats));
          }
          const structuralStates = this.detectStructure(measureNotes, measures);
          const options = [];
          Object.values(this.strategies).forEach((strategy) => {
            const result = this.runViterbi(
              measureNotes,
              rootIndex,
              isMinor,
              strategy,
              structuralStates
            );
            options.push({
              type: strategy.name,
              description: strategy.description,
              chords: result,
              progression: this.formatProgression(result.map((c3) => c3.roman))
            });
          });
          return options;
        }
        /**
         * Detects SRDC (Statement, Restatement, Departure, Conclusion) structure.
         */
        detectStructure(_measureNotes, totalMeasures) {
          const states = [];
          for (let m3 = 0; m3 < totalMeasures; m3++) {
            const phrasePos = m3 % 4;
            if (phrasePos === 0) {
              states.push("Statement");
            } else if (phrasePos === 1) {
              states.push("Restatement");
            } else if (phrasePos === 2) {
              states.push("Departure");
            } else {
              states.push("Conclusion");
            }
          }
          return states;
        }
        /**
         * Backward compatibility wrapper
         */
        generateProgression(melodyLine, key, creativity = 0.5) {
          const options = this.generateOptions(melodyLine, key);
          if (options.length === 0) {
            return "I";
          }
          if (creativity < 0.35) {
            return options[0].progression;
          }
          if (creativity > 0.65) {
            return options[2].progression;
          }
          return options[1].progression;
        }
        parseKey(key) {
          const normKey = normalizeKey(key);
          const isMinor = key.includes("m") && !key.includes("maj");
          const rootName = normKey.replace("m", "");
          const rootIndex = KEY_ORDER.indexOf(rootName);
          return { rootIndex: rootIndex === -1 ? 0 : rootIndex, isMinor };
        }
        getProminentNotes(beats) {
          const counts = {};
          beats.forEach((b2, idx) => {
            if (b2.midi && b2.energy > 0) {
              const pc = Math.round(b2.midi) % 12;
              const weight = (idx === 0 ? 3 : idx === 2 ? 1.5 : 1) * b2.energy;
              counts[pc] = (counts[pc] || 0) + weight;
            }
          });
          return Object.entries(counts).map(([pc, weight]) => ({ pc: parseInt(pc, 10), weight })).sort((a3, b2) => b2.weight - a3.weight);
        }
        /**
         * Viterbi Algorithm implementation
         */
        runViterbi(measureNotes, keyRoot, isMinor, strategy, structuralStates) {
          const T4 = measureNotes.length;
          if (T4 === 0) {
            return [];
          }
          const numStates = 24;
          const V3 = Array(T4).fill(null).map(() => new Float32Array(numStates).fill(-Infinity));
          const path = Array(T4).fill(null).map(() => new Int16Array(numStates).fill(0));
          const reasons = Array(T4).fill(null).map(() => Array(numStates).fill(null));
          for (let s3 = 0; s3 < numStates; s3++) {
            const { root, quality } = this.decodeState(s3);
            const emit = this.calculateEmission(
              measureNotes[0],
              root,
              quality,
              keyRoot,
              isMinor,
              strategy,
              structuralStates[0]
            );
            let startBias = 0;
            if (root === keyRoot) {
              startBias = 5;
            }
            V3[0][s3] = emit.score + startBias;
            reasons[0][s3] = emit.reasons;
          }
          for (let t3 = 1; t3 < T4; t3++) {
            const state2 = structuralStates[t3];
            for (let s3 = 0; s3 < numStates; s3++) {
              const { root, quality } = this.decodeState(s3);
              const emit = this.calculateEmission(
                measureNotes[t3],
                root,
                quality,
                keyRoot,
                isMinor,
                strategy,
                state2
              );
              let maxScore = -Infinity;
              let bestPrev = -1;
              let bestTransReason = "";
              for (let prevS = 0; prevS < numStates; prevS++) {
                const { root: prevRoot } = this.decodeState(prevS);
                const trans = this.calculateTransition(prevRoot, root, strategy, state2);
                const score = V3[t3 - 1][prevS] + trans.score + emit.score;
                if (score > maxScore) {
                  maxScore = score;
                  bestPrev = prevS;
                  bestTransReason = trans.reason;
                }
              }
              V3[t3][s3] = maxScore;
              path[t3][s3] = bestPrev;
              reasons[t3][s3] = [...emit.reasons];
              if (bestTransReason) {
                reasons[t3][s3].push(bestTransReason);
              }
            }
          }
          let bestFinalScore = -Infinity;
          let bestFinalState = -1;
          for (let s3 = 0; s3 < numStates; s3++) {
            const { root } = this.decodeState(s3);
            let endBias = 0;
            if (root === keyRoot) {
              endBias = 3;
            }
            if (V3[T4 - 1][s3] + endBias > bestFinalScore) {
              bestFinalScore = V3[T4 - 1][s3] + endBias;
              bestFinalState = s3;
            }
          }
          const resultPath = [];
          let currState = bestFinalState;
          for (let t3 = T4 - 1; t3 >= 0; t3--) {
            const { root, quality } = this.decodeState(currState);
            const romanInfo = this.convertRootToRoman(root, quality, keyRoot);
            resultPath.unshift({
              roman: romanInfo.roman,
              absRoot: root,
              quality,
              reasons: reasons[t3][currState] || [],
              structuralState: structuralStates[t3]
            });
            currState = path[t3][currState];
          }
          return resultPath;
        }
        decodeState(s3) {
          return {
            root: Math.floor(s3 / 2),
            quality: s3 % 2 === 0 ? "major" : "minor"
          };
        }
        calculateEmission(notes, root, quality, keyRoot, isMinor, strategy, structuralState) {
          let score = 0;
          const reasons = [];
          const w3 = { ...strategy.weights };
          if (structuralState === "Departure") {
            w3.diatonic *= 0.5;
            w3.melodyFit *= 1.2;
            w3.chromaticPenalty *= 0.4;
          } else if (structuralState === "Conclusion") {
            w3.diatonic *= 1.5;
            w3.rootMatch *= 2;
          }
          const distFromKey = (root - keyRoot + 12) % 12;
          const diatonicMap = isMinor ? this.diatonicWeights.minor : this.diatonicWeights.major;
          const diatonicVal = diatonicMap[distFromKey];
          if (diatonicVal !== void 0) {
            score += diatonicVal / 10 * w3.diatonic;
          } else {
            score -= w3.chromaticPenalty;
          }
          const chordTones = this.getChordTones(root, quality);
          let fitScore = 0;
          const matchedNotes = [];
          notes.forEach((note) => {
            if (chordTones.includes(note.pc)) {
              let boost = note.weight * w3.melodyFit;
              if (note.pc === root) {
                boost += w3.rootMatch;
                matchedNotes.push(this.getNoteName(note.pc));
              } else {
                matchedNotes.push(this.getNoteName(note.pc));
              }
              fitScore += boost;
            } else {
              const clashFactor = structuralState === "Departure" ? 1 : 2.5;
              score -= note.weight * clashFactor;
            }
          });
          score += fitScore;
          if (fitScore > 2) {
            reasons.push(`Melody matches ${matchedNotes.join(",")}`);
          }
          return { score, reasons };
        }
        calculateTransition(prevRoot, currRoot, strategy, structuralState) {
          let score = 0;
          let reason = "";
          const w3 = strategy.weights;
          const motion = (currRoot - prevRoot + 12) % 12;
          if (motion === 0) {
            score -= structuralState === "Statement" ? 0.5 : 2;
          } else if (motion === 5) {
            score += w3.dominantResolution;
            reason = "Circle of 5ths resolution";
          } else if (motion === 7) {
            score += w3.commonProgression;
            reason = "Plagal/Common motion";
          } else if (motion === 1 || motion === 2 || motion === 10 || motion === 11) {
            score += w3.stepwiseMotion;
            reason = "Stepwise motion";
          }
          if (structuralState === "Conclusion" && motion === 5) {
            score += 5;
          }
          return { score, reason };
        }
        getChordTones(root, quality) {
          const third = quality === "minor" ? 3 : 4;
          return [root, (root + third) % 12, (root + 7) % 12];
        }
        getNoteName(midi2) {
          const names = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
          return names[midi2 % 12];
        }
        convertRootToRoman(absRoot, quality, keyRoot) {
          const interval = (absRoot - keyRoot + 12) % 12;
          let roman = INTERVAL_TO_ROMAN[interval] || "I";
          if (quality === "minor") {
            roman = roman.toLowerCase();
          }
          return { roman, absRoot };
        }
        formatProgression(chords2) {
          const res = [...chords2];
          for (let i3 = 1; i3 < res.length; i3++) {
            if (res[i3] === ".") {
              res[i3] = res[i3 - 1];
            }
          }
          return res.join(" | ");
        }
      };
    }
  });

  // public/musicxml-parser.js
  function parseMusicXML(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    let divisions = 1;
    const divisionsNode = doc.querySelector("divisions");
    if (divisionsNode) {
      divisions = parseInt(divisionsNode.textContent, 10);
    }
    let xmlKey = "C";
    const fifthsNode = doc.querySelector("fifths");
    if (fifthsNode) {
      const fifths = parseInt(fifthsNode.textContent, 10);
      const keys = {
        0: "C",
        1: "G",
        2: "D",
        3: "A",
        4: "E",
        5: "B",
        6: "F#",
        7: "C#",
        "-1": "F",
        "-2": "Bb",
        "-3": "Eb",
        "-4": "Ab",
        "-5": "Db",
        "-6": "Gb",
        "-7": "Cb"
      };
      xmlKey = keys[fifths] || "C";
    }
    const parts = doc.querySelectorAll("part");
    const firstPart = parts.length > 0 ? parts[0] : doc;
    const measures = firstPart.querySelectorAll("measure");
    const sections = [];
    const leadSheetMelody = [];
    let _currentTimeSignature = "4/4";
    let hasChords = false;
    let firstChordMeasureIndex = -1;
    for (let i3 = 0; i3 < measures.length; i3++) {
      if (measures[i3].querySelector("harmony")) {
        firstChordMeasureIndex = i3;
        break;
      }
    }
    if (firstChordMeasureIndex === -1) {
      firstChordMeasureIndex = 0;
    }
    const measureStepOffsets = new Array(measures.length).fill(0);
    let runningStep = 0;
    let scanTS = "4/4";
    measures.forEach((m3, i3) => {
      const timeNode = m3.querySelector("attributes > time");
      if (timeNode) {
        const beats = timeNode.querySelector("beats")?.textContent;
        const beatType = timeNode.querySelector("beat-type")?.textContent;
        if (beats && beatType) {
          scanTS = `${beats}/${beatType}`;
        }
      }
      measureStepOffsets[i3] = runningStep;
      runningStep += getStepsPerMeasure(scanTS);
    });
    const stepZeroOffset = measureStepOffsets[firstChordMeasureIndex];
    const currentSection = {
      id: `s${Date.now()}`,
      label: "A",
      value: "",
      color: "#3b82f6",
      repeat: 1
    };
    let currentChords = [];
    measures.forEach((measureNode, measureIndex) => {
      let measureStep = 0;
      const currentGlobalStep = measureStepOffsets[measureIndex] - stepZeroOffset;
      const measureChords = [];
      const timeNode = measureNode.querySelector("attributes > time");
      if (timeNode) {
        const beats = timeNode.querySelector("beats")?.textContent;
        const beatType = timeNode.querySelector("beat-type")?.textContent;
        if (beats && beatType) {
          _currentTimeSignature = `${beats}/${beatType}`;
        }
      }
      const durationToSteps = (duration) => Math.round(duration / divisions * 4);
      measureNode.childNodes.forEach((node) => {
        if (node.nodeName === "harmony") {
          hasChords = true;
          let root = "";
          let kind = "";
          let alter = "";
          const rootStepNode = node.querySelector("root-step");
          if (rootStepNode) {
            root = rootStepNode.textContent;
          }
          const rootAlterNode = node.querySelector("root-alter");
          if (rootAlterNode) {
            const alterVal = parseInt(rootAlterNode.textContent, 10);
            if (alterVal === -1) {
              alter = "b";
            }
            if (alterVal === 1) {
              alter = "#";
            }
          }
          const kindNode = node.querySelector("kind");
          if (kindNode) {
            const textAttr = kindNode.getAttribute("text");
            if (textAttr) {
              kind = textAttr;
            } else {
              const kindText = kindNode.textContent;
              if (kindText === "major-seventh") {
                kind = "maj7";
              } else if (kindText === "minor-seventh") {
                kind = "m7";
              } else if (kindText === "dominant") {
                kind = "7";
              } else if (kindText === "half-diminished") {
                kind = "m7b5";
              } else if (kindText === "diminished") {
                kind = "dim";
              } else if (kindText === "minor") {
                kind = "m";
              } else if (kindText === "major") {
                kind = "";
              }
            }
          }
          let chordString = `${root}${alter}${kind}`;
          chordString = chordString.replace(/min7/g, "m7").replace(/maj7/g, "maj7").replace(/min/g, "m").replace(/mi7/g, "m7").replace(/ma7/g, "maj7").replace(/mi/g, "m");
          measureChords.push(chordString);
        }
        if (node.nodeName === "note") {
          const isRest = node.querySelector("rest") !== null;
          const durationNode = node.querySelector("duration");
          let duration = 0;
          if (durationNode) {
            duration = parseInt(durationNode.textContent, 10);
          }
          const steps = durationToSteps(duration);
          if (!isRest) {
            const pitchNode = node.querySelector("pitch");
            if (pitchNode) {
              const stepNode = pitchNode.querySelector("step");
              const octaveNode = pitchNode.querySelector("octave");
              const alterNode = pitchNode.querySelector("alter");
              const noteStep = stepNode ? stepNode.textContent : "C";
              const octave = octaveNode ? parseInt(octaveNode.textContent, 10) : 4;
              let noteAlter = "";
              if (alterNode) {
                const alterVal = parseInt(alterNode.textContent, 10);
                if (alterVal === -1) {
                  noteAlter = "b";
                }
                if (alterVal === 1) {
                  noteAlter = "#";
                }
              }
              const _noteString = `${noteStep}${noteAlter}${octave}`;
              const noteMap = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
              let midi2 = noteMap[noteStep] + (octave + 1) * 12;
              if (noteAlter === "b") {
                midi2 -= 1;
              }
              if (noteAlter === "#") {
                midi2 += 1;
              }
              leadSheetMelody.push({
                midi: midi2,
                globalStep: Math.round(currentGlobalStep + measureStep),
                durationSteps: steps
              });
            }
          }
          measureStep += steps;
        }
        if (node.nodeName === "forward") {
          const durationNode = node.querySelector("duration");
          if (durationNode) {
            measureStep += durationToSteps(parseInt(durationNode.textContent, 10));
          }
        }
        if (node.nodeName === "backup") {
          const durationNode = node.querySelector("duration");
          if (durationNode) {
            measureStep -= durationToSteps(parseInt(durationNode.textContent, 10));
          }
        }
      });
      if (measureChords.length === 0 && currentChords.length === 0) {
        if (currentGlobalStep >= 0) {
          currentChords.push("%");
        }
      } else if (measureChords.length > 0) {
        currentChords.push(measureChords.join(" "));
      } else {
        if (currentGlobalStep >= 0) {
          currentChords.push("%");
        }
      }
      if (currentGlobalStep >= 0) {
        if (currentChords.length === 8 || measureIndex === measures.length - 1) {
          if (currentChords.length > 0) {
            currentSection.value = currentChords.join(" | ");
            sections.push({ ...currentSection });
            currentSection.id = `s${Date.now()}${measureIndex}`;
            currentSection.label = String.fromCharCode(
              currentSection.label.charCodeAt(0) + 1
            );
            if (currentSection.label > "Z") {
              currentSection.label = "A";
            }
            currentChords = [];
          }
        }
      }
    });
    return {
      sections,
      leadSheetMelody,
      hasChords,
      xmlKey
    };
  }
  function reharmonizeMelody(leadSheetMelody, key, totalSteps) {
    if (!leadSheetMelody || leadSheetMelody.length === 0) {
      return null;
    }
    const harmonizer = new Harmonizer();
    const numBeats = Math.ceil(totalSteps / 4);
    const melodyByBeat = new Array(numBeats).fill(null).map(() => ({ midi: 0, energy: 0 }));
    leadSheetMelody.forEach((n2) => {
      const beatIdx = Math.floor(n2.globalStep / 4);
      if (beatIdx < numBeats) {
        if (n2.midi > melodyByBeat[beatIdx].midi) {
          melodyByBeat[beatIdx] = {
            midi: n2.midi,
            energy: 1
          };
        }
      }
    });
    const progressionStr = harmonizer.generateProgression(melodyByBeat, key, 0.5);
    const measures = progressionStr.split(" | ");
    const sections = [];
    const sectionSize = 8;
    for (let i3 = 0; i3 < measures.length; i3 += sectionSize) {
      const sectionMeasures = measures.slice(i3, i3 + sectionSize);
      sections.push({
        id: `reharm-${Date.now()}-${i3}`,
        label: String.fromCharCode(65 + Math.floor(i3 / sectionSize)),
        // A, B, C...
        value: sectionMeasures.join(" | "),
        color: "#3b82f6",
        repeat: 1
      });
    }
    return sections;
  }
  var init_musicxml_parser = __esm({
    "public/musicxml-parser.js"() {
      init_melody_harmonizer();
      init_utils();
    }
  });

  // public/sharing.js
  function shareProgression() {
    const { arranger: arranger6, chords: chords2, groove: groove2, playback: playback6 } = getState();
    try {
      const params = new URLSearchParams();
      params.set("s", compressSections(arranger6.sections));
      params.set("key", arranger6.key);
      params.set("ts", arranger6.timeSignature);
      params.set("bpm", playback6.bpm);
      params.set("style", chords2.style);
      params.set("genre", groove2.genreFeel);
      params.set("int", playback6.bandIntensity.toFixed(2));
      params.set("comp", playback6.complexity.toFixed(2));
      params.set("notation", arranger6.notation);
      const url = `${window.location.origin + window.location.pathname}?${params.toString()}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast("Share link copied to clipboard!");
      }).catch((err) => {
        console.error("Failed to copy URL: ", err);
        showToast("Failed to copy link. Please copy it from the address bar.");
      });
    } catch (e3) {
      console.error("Error generating share link:", e3);
      showToast("Error generating share link.");
    }
  }
  var init_sharing = __esm({
    "public/sharing.js"() {
      init_state();
      init_ui();
      init_utils();
    }
  });

  // public/tab-parser.js
  var tab_parser_exports = {};
  __export(tab_parser_exports, {
    countSyllables: () => countSyllables,
    detectKey: () => detectKey,
    parseTab: () => parseTab
  });
  function detectKey(sections) {
    if (!sections || sections.length === 0) {
      return { key: "C", isMinor: false, confidence: 0 };
    }
    const allChords = [];
    sections.forEach((s3) => {
      const parts = s3.value.split(" | ");
      for (let i3 = 0; i3 < s3.repeat; i3++) {
        parts.forEach((p3, idx) => {
          const isFirst = idx === 0 && i3 === 0 && sections.indexOf(s3) === 0;
          const isLast = idx === parts.length - 1 && i3 === s3.repeat - 1 && sections.indexOf(s3) === sections.length - 1;
          allChords.push({ chord: p3, weight: isFirst ? 3 : isLast ? 2 : 1 });
        });
      }
    });
    if (allChords.length === 0) {
      return { key: "C", isMinor: false, confidence: 0 };
    }
    const scores = [];
    KEY_ORDER.forEach((root) => {
      [false, true].forEach((isMinor) => {
        let score = 0;
        const rootIndex = KEY_ORDER.indexOf(root);
        const diatonicOffsets = isMinor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
        allChords.forEach(({ chord, weight }) => {
          const chordRoot = chord.match(CHORD_ROOT_PATTERN)?.[0];
          if (!chordRoot) {
            return;
          }
          const rootName = chordRoot.toUpperCase();
          const normalizedRoot = ENHARMONIC_MAP[rootName] || rootName;
          const chordIndex = KEY_ORDER.indexOf(normalizedRoot);
          const offset = (chordIndex - rootIndex + 12) % 12;
          const isChordMinor = chord.toLowerCase().includes("m") && !chord.toLowerCase().includes("maj");
          if (diatonicOffsets.includes(offset)) {
            score += weight;
            const expectedMinorOffsets = isMinor ? [0, 5, 7] : [2, 4, 9];
            if (isChordMinor === expectedMinorOffsets.includes(offset)) {
              score += weight * 0.5;
            }
          }
          if (offset === 0) {
            score += weight * 0.5;
            if (isChordMinor === isMinor) {
              score += weight * 1;
            }
          }
        });
        for (let i3 = 0; i3 < allChords.length - 1; i3++) {
          const c1 = allChords[i3].chord.match(CHORD_ROOT_PATTERN)?.[0];
          const c22 = allChords[i3 + 1].chord.match(CHORD_ROOT_PATTERN)?.[0];
          if (!c1 || !c22) {
            continue;
          }
          const n1 = ENHARMONIC_MAP[c1.toUpperCase()] || c1.toUpperCase();
          const n2 = ENHARMONIC_MAP[c22.toUpperCase()] || c22.toUpperCase();
          const o1 = (KEY_ORDER.indexOf(n1) - rootIndex + 12) % 12;
          const o22 = (KEY_ORDER.indexOf(n2) - rootIndex + 12) % 12;
          if (o1 === 7 && o22 === 0) {
            score += 2;
          }
        }
        scores.push({ key: root, isMinor, score });
      });
    });
    scores.sort((a3, b2) => b2.score - a3.score);
    const best = scores[0];
    const totalPossible = allChords.reduce((acc, curr) => acc + curr.weight, 0);
    const confidence = best.score / (totalPossible + 1);
    return { ...best, confidence };
  }
  function isMeasureGrid(line) {
    const hasSlashesOrDots = line.includes("/") || line.includes("..");
    const hasChordTokens = /[A-G%]/.test(line);
    return hasSlashesOrDots && !hasChordTokens;
  }
  function getSectionHeader(line) {
    const bracketMatch = line.match(/^\[(.*)\]$/);
    if (bracketMatch) {
      return bracketMatch[1];
    }
    const numMatch = line.match(/^#\s*(\d+\.?|.*)$/);
    if (numMatch) {
      return numMatch[1];
    }
    const colonMatch = line.match(/^([A-Z\s]+[0-9]*):/);
    if (colonMatch) {
      return colonMatch[1];
    }
    return null;
  }
  function countSyllables(text) {
    if (!text) {
      return 0;
    }
    const clean = text.toLowerCase().replace(/[^a-z]/g, " ");
    const tokens = clean.split(/\s+/).filter((t3) => t3.length > 0);
    let count = 0;
    for (const token of tokens) {
      const matches = token.match(VOWEL_GROUP_PATTERN);
      if (matches) {
        count += matches.length;
        if (token.length > 3 && token.endsWith("e") && !token.endsWith("le")) {
          if (matches.length > 1) {
            count--;
          }
        }
      }
    }
    return count;
  }
  function parseTab(text) {
    const lines = text.split("\n");
    const sections = [];
    let currentSection = null;
    let capo = 0;
    const flushCurrentSection = () => {
      if (currentSection && currentSection.measures.length > 0) {
        sections.push({
          id: generateId(),
          label: currentSection.label || "Import",
          value: currentSection.measures.map((m3) => m3.chord).join(" | "),
          syllables: currentSection.measures.map((m3) => m3.syllables),
          repeat: currentSection.repeat || 1,
          color: "#3b82f6"
        });
      }
    };
    for (let i3 = 0; i3 < lines.length; i3++) {
      const line = lines[i3].trim();
      if (line === "") {
        continue;
      }
      const headerMatch = getSectionHeader(line);
      if (headerMatch) {
        flushCurrentSection();
        currentSection = {
          label: headerMatch.trim(),
          measures: [],
          repeat: 1
        };
        if (line.includes(":")) {
          const restOfLine = line.split(":")[1].trim();
          if (restOfLine) {
            processLine(restOfLine, i3);
          }
        }
        continue;
      }
      if (line.toLowerCase().includes("key change") || line.toLowerCase().includes("transpose")) {
      }
      if (isMeasureGrid(line) && !line.includes(":")) {
        continue;
      }
      processLine(line, i3);
    }
    function processLine(line, lineIndex) {
      if (!currentSection) {
        currentSection = { label: "Import", measures: [], repeat: 1 };
      }
      if (line.includes("|")) {
        const bars = line.split("|").map((b2) => b2.trim());
        const validBars = bars.filter((b2, idx) => {
          if (b2 === "" && (idx === 0 || idx === bars.length - 1)) {
            return false;
          }
          return true;
        });
        if (validBars.length > 0) {
          let foundChords = false;
          const newMeasures = [];
          validBars.forEach((bar) => {
            const tokens2 = bar.split(/\s+/).filter((t3) => t3.length > 0);
            const barChords = [];
            let repeatBar = false;
            tokens2.forEach((t3) => {
              const clean = t3.replace(PARENTHESES_PATTERN, "");
              if (clean === "%") {
                repeatBar = true;
              } else if (CHORD_REGEX.test(clean)) {
                barChords.push(clean === "N.C." ? "R" : clean);
              }
            });
            if (barChords.length > 0 || repeatBar) {
              foundChords = true;
              if (repeatBar) {
                const last = newMeasures[newMeasures.length - 1] || currentSection.measures[currentSection.measures.length - 1];
                if (last) {
                  newMeasures.push({ ...last });
                }
              } else {
                newMeasures.push({
                  chord: barChords.join(" "),
                  syllables: 0
                  // will calculate later
                });
              }
            }
          });
          if (foundChords) {
            const lyricLine = lookAheadForLyrics(lineIndex);
            const totalSyllables = countSyllables(lyricLine);
            const syllablesPerBar = Math.ceil(totalSyllables / newMeasures.length);
            newMeasures.forEach((m3) => {
              m3.syllables = syllablesPerBar;
              currentSection.measures.push(m3);
            });
            return;
          }
        }
      }
      const tokens = line.split(/[\s,.]+/).filter((t3) => t3.length > 0);
      let chordCount = 0;
      let repeatValue = 1;
      const possibleChords = tokens.filter((t3) => {
        const clean = t3.replace(PIPE_PARENTHESES_PATTERN, "");
        if (clean === "") {
          return false;
        }
        if (CHORD_REGEX.test(clean) || clean === "%") {
          chordCount++;
          return true;
        }
        const repeatMatch = clean.match(REPEAT_MULTIPLIER_PATTERN);
        if (repeatMatch) {
          repeatValue = parseInt(repeatMatch[1], 10);
          return false;
        }
        return false;
      });
      const isChordLine = chordCount > 0 && (chordCount / tokens.length > 0.4 || chordCount > 3);
      if (isChordLine) {
        const cleanTokens = possibleChords.map((c3) => c3.replace(PIPE_PARENTHESES_PATTERN, ""));
        const lyricLine = lookAheadForLyrics(lineIndex);
        const totalSyllables = countSyllables(lyricLine);
        const syllablesPerMeasure = cleanTokens.length > 0 ? Math.ceil(totalSyllables / cleanTokens.length) : 0;
        cleanTokens.forEach((token) => {
          if (token === "%") {
            const last = currentSection.measures[currentSection.measures.length - 1];
            if (last) {
              currentSection.measures.push({ ...last });
            }
          } else {
            currentSection.measures.push({
              chord: token === "N.C." ? "R" : token,
              syllables: syllablesPerMeasure
            });
          }
        });
        if (repeatValue > 1) {
          currentSection.repeat = repeatValue;
        }
      } else {
        const lower = line.toLowerCase();
        if (lower.includes("capo")) {
          const match = line.match(CAPO_PATTERN);
          if (match) {
            capo = parseInt(match[1], 10);
          }
        }
      }
    }
    function lookAheadForLyrics(lineIndex) {
      for (let j4 = lineIndex + 1; j4 < lines.length; j4++) {
        const nextLine = lines[j4].trim();
        if (nextLine === "" || isMeasureGrid(nextLine)) {
          continue;
        }
        if (getSectionHeader(nextLine)) {
          break;
        }
        const nextTokens = nextLine.split(/[\s,.]+/).filter((t3) => t3.length > 0);
        const nextChordCount = nextTokens.filter((t3) => {
          const clean = t3.replace(PIPE_PARENTHESES_PATTERN, "");
          return clean !== "" && (CHORD_REGEX.test(clean) || clean === "%");
        }).length;
        const isNextChordLine = nextChordCount > 0 && (nextChordCount / nextTokens.length > 0.4 || nextChordCount > 3);
        if (!isNextChordLine) {
          return nextLine;
        }
        break;
      }
      return "";
    }
    flushCurrentSection();
    if (sections.length > 0 && sections[0].value.trim() === "") {
      sections.shift();
    }
    sections.forEach((s3, i3) => {
      s3.color = SECTION_COLORS[i3 % SECTION_COLORS.length];
    });
    return { sections, capo };
  }
  var CHORD_ROOT_PATTERN, VOWEL_GROUP_PATTERN, PARENTHESES_PATTERN, PIPE_PARENTHESES_PATTERN, REPEAT_MULTIPLIER_PATTERN, CAPO_PATTERN, CHORD_REGEX, SECTION_COLORS;
  var init_tab_parser = __esm({
    "public/tab-parser.js"() {
      init_config();
      init_utils();
      CHORD_ROOT_PATTERN = /^[A-G][b#]?/i;
      VOWEL_GROUP_PATTERN = /[aeiouy]+/g;
      PARENTHESES_PATTERN = /[()]/g;
      PIPE_PARENTHESES_PATTERN = /[|()]/g;
      REPEAT_MULTIPLIER_PATTERN = /^x\s*(\d+)$/i;
      CAPO_PATTERN = /capo[:\s]*(\d+)/i;
      CHORD_REGEX = /^(?:N\.?C\.?|[A-G][b#]?(?:maj|min|m|dim|aug|sus|add|M|alt)?(?:[0-9]+)?(?:(?:maj|min|m|dim|aug|sus|add|M|alt)?[0-9]*)?(?:[/-][A-G][b#]?(?:maj|min|m|dim|aug|sus|add|M|alt)?[0-9]*|[-+]\d+)?)$/i;
      SECTION_COLORS = [
        "#3b82f6",
        // blue
        "#10b981",
        // green
        "#f59e0b",
        // amber
        "#ef4444",
        // red
        "#8b5cf6",
        // violet
        "#ec4899"
        // pink
      ];
    }
  });

  // public/components/EditorModal.jsx
  var EditorModal_exports = {};
  __export(EditorModal_exports, {
    EditorModal: () => EditorModal
  });
  function EditorModal() {
    const { isOpen, hasLeadSheet, leadSheetMelody, currentKey, totalSteps } = useEnsembleState(
      (s3) => ({
        isOpen: s3.playback.modals.editor,
        hasLeadSheet: s3.soloist.leadSheetMelody && s3.soloist.leadSheetMelody.length > 0,
        leadSheetMelody: s3.soloist.leadSheetMelody,
        currentKey: s3.arranger.key,
        totalSteps: s3.arranger.totalSteps
      })
    );
    const [isMenuOpen, setIsMenuOpen] = d2(false);
    const [isImportMode, setIsImportMode] = d2(false);
    const [tabText, setTabText] = d2("");
    const handleImportTab = () => {
      setIsMenuOpen(false);
      setIsImportMode(true);
    };
    const handleConfirmImport = async () => {
      if (!tabText.trim()) {
        setIsImportMode(false);
        return;
      }
      try {
        const { parseTab: parseTab2, detectKey: detectKey2 } = await Promise.resolve().then(() => (init_tab_parser(), tab_parser_exports));
        const { sections: parsedSections, capo } = parseTab2(tabText);
        if (parsedSections.length > 0) {
          pushHistory();
          let finalSections = parsedSections;
          let detected = detectKey2(parsedSections);
          if (capo > 0) {
            finalSections = parsedSections.map((s3) => ({
              ...s3,
              value: transformRelativeProgression(s3.value, capo)
            }));
            if (detected && detected.confidence > 0.4) {
              const oldIdx = KEY_ORDER.indexOf(detected.key);
              const newIdx = (oldIdx + capo) % 12;
              detected = { ...detected, key: KEY_ORDER[newIdx] };
            }
          }
          if (detected && detected.confidence > 0.4) {
            arranger3.key = detected.key;
            arranger3.isMinor = detected.isMinor;
            showToast(
              `Imported ${finalSections.length} sections.${capo > 0 ? ` (Transposed Capo ${capo})` : ""} Key: ${detected.key} ${detected.isMinor ? "Minor" : "Major"}`
            );
          } else {
            showToast(
              `Imported ${finalSections.length} sections.${capo > 0 ? ` (Transposed Capo ${capo})` : ""}`
            );
          }
          dispatch(ACTIONS.SET_ARRANGEMENT, finalSections);
          setIsImportMode(false);
          setTabText("");
          refreshArrangerUI();
        } else {
          showToast("No valid chords found in tab.");
        }
      } catch (err) {
        console.error("[Editor] Import Error:", err);
        showToast("Failed to parse tab.");
      }
    };
    const overlayRef = A2(null);
    const closeEditor = () => {
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: false });
    };
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    const _handleAction = (fn2) => {
      setIsMenuOpen(false);
      fn2();
    };
    const handleAddSection = () => {
      setIsMenuOpen(false);
      addSection();
    };
    const handleTemplates = () => {
      setIsMenuOpen(false);
      if (window.innerWidth < 900) {
      }
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: false });
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "templates", open: true });
    };
    const handleAnalyze = () => {
      setIsMenuOpen(false);
      if (window.resetAnalyzer) {
        window.resetAnalyzer();
      }
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: false });
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "analyzer", open: true });
    };
    const handleRandomize = () => {
      setIsMenuOpen(false);
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: false });
      setTimeout(
        () => dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "generateSong", open: true }),
        10
      );
    };
    const handleMutate = () => {
      setIsMenuOpen(false);
      const targetId = arranger3.lastInteractedSectionId;
      const section = arranger3.sections.find((s3) => s3.id === targetId);
      if (!section) {
        return;
      }
      pushHistory();
      const { value } = mutateProgression(section.value);
      section.value = value;
      dispatch(ACTIONS.SET_PARAM, {
        module: "arranger",
        param: "mutatedSectionId",
        value: targetId
      });
      setTimeout(() => {
        dispatch(ACTIONS.SET_PARAM, {
          module: "arranger",
          param: "mutatedSectionId",
          value: null
        });
      }, 1e3);
      clearChordPresetHighlight();
      refreshArrangerUI();
    };
    const handleClear = () => {
      setIsMenuOpen(false);
      pushHistory();
      arranger3.sections = [{ id: generateId(), label: "Intro", value: "" }];
      clearChordPresetHighlight();
      refreshArrangerUI();
    };
    const handleUndo = () => {
      setIsMenuOpen(false);
      undo(refreshArrangerUI);
      clearChordPresetHighlight();
    };
    const handleSave = () => {
      setIsMenuOpen(false);
      saveProgression();
    };
    const handleShare = () => {
      setIsMenuOpen(false);
      shareProgression();
    };
    const handleClearLeadSeed = () => {
      setIsMenuOpen(false);
      dispatch(ACTIONS.CLEAR_LEAD_SHEET);
      syncWorker();
    };
    const handleReharmonize = async () => {
      setIsMenuOpen(false);
      if (!hasLeadSheet) {
        return;
      }
      const newSections = reharmonizeMelody(leadSheetMelody, currentKey, totalSteps);
      if (newSections) {
        dispatch(ACTIONS.SET_ARRANGEMENT, newSections);
        const { validateProgression: validateProgression2 } = await Promise.resolve().then(() => (init_chords(), chords_exports));
        validateProgression2();
        syncWorker();
      }
    };
    const handleFileUpload = (e3) => {
      const file = e3.target.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = parseMusicXML(event.target.result);
          dispatch(ACTIONS.IMPORT_MUSICXML, parsed);
        } catch (err) {
          console.error("Failed to parse MusicXML", err);
        }
      };
      reader.readAsText(file);
    };
    return /* @__PURE__ */ _(
      "div",
      {
        id: "editorOverlay",
        ref: overlayRef,
        class: `settings-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        onClick: (e3) => {
          if (e3.target.id === "editorOverlay") {
            closeEditor();
          }
        }
      },
      /* @__PURE__ */ _("div", { class: "settings-content editor-modal", onClick: (e3) => e3.stopPropagation() }, /* @__PURE__ */ _("div", { class: "modal-header" }, /* @__PURE__ */ _("h2", null, isImportMode ? "Import Tab" : "Arrangement Editor"), /* @__PURE__ */ _(
        "input",
        {
          type: "file",
          id: "xml-upload-editor",
          accept: ".xml,.mxl,.musicxml",
          style: "display:none;",
          onChange: handleFileUpload
        }
      ), /* @__PURE__ */ _("button", { id: "closeEditorBtn", class: "primary-btn", onClick: closeEditor }, "Done")), /* @__PURE__ */ _("div", { class: "editor-scroll-area" }, /* @__PURE__ */ _("div", { id: "sectionList", class: "section-list" }, isImportMode ? /* @__PURE__ */ _("div", { class: "import-tab-view" }, /* @__PURE__ */ _("p", { class: "import-help" }, "Paste Ultimate Guitar tabs or text charts below. Chords and lyrics will be parsed into song sections."), /* @__PURE__ */ _(
        "textarea",
        {
          id: "tabPasteArea",
          placeholder: "[Intro]\nEm  C  G  D",
          value: tabText,
          onInput: (e3) => setTabText(e3.target.value),
          autoFocus: true
        }
      ), /* @__PURE__ */ _("div", { class: "import-mode-actions" }, /* @__PURE__ */ _(
        "button",
        {
          class: "primary-btn import-confirm-btn",
          onClick: handleConfirmImport
        },
        "\u{1F680} Parse & Import"
      ), /* @__PURE__ */ _(
        "button",
        {
          class: "secondary-btn",
          onClick: () => {
            setIsImportMode(false);
            setTabText("");
          }
        },
        "Cancel"
      ))) : /* @__PURE__ */ _(Arranger, null))), /* @__PURE__ */ _("div", { class: "modal-footer" }, /* @__PURE__ */ _("div", { class: "footer-primary-actions" }, /* @__PURE__ */ _(
        "button",
        {
          id: "addSectionBtn",
          class: "primary-btn footer-main-btn",
          title: "Add Section",
          onClick: handleAddSection
        },
        /* @__PURE__ */ _("span", null, "\u2795 Add Section")
      ), /* @__PURE__ */ _(
        "button",
        {
          id: "arrangerActionTrigger",
          "aria-label": "Arranger Actions Menu",
          "aria-haspopup": "true",
          "aria-expanded": isMenuOpen,
          class: `action-trigger-btn ${isMenuOpen ? "active" : ""}`,
          title: "Arranger Actions",
          style: "justify-content: center; padding: 0.75rem 1rem;",
          onClick: (e3) => {
            e3.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }
        },
        /* @__PURE__ */ _("span", { style: "font-size: 1.2rem;" }, "\u22EE")
      )), /* @__PURE__ */ _("div", { class: "arranger-action-container" }, isMenuOpen && /* @__PURE__ */ _("div", { class: "menu-click-away", onClick: () => setIsMenuOpen(false) }), /* @__PURE__ */ _(
        "div",
        {
          id: "arrangerActionMenu",
          class: `action-menu-content ${isMenuOpen ? "open" : ""}`
        },
        /* @__PURE__ */ _("div", { class: "menu-section-header" }, "Structure"),
        /* @__PURE__ */ _(
          "button",
          {
            id: "importTabBtn",
            title: "Import from Text/Tab",
            "aria-label": "Import Tab (from Text)",
            onClick: handleImportTab
          },
          "\u{1F4E5} ",
          /* @__PURE__ */ _("span", null, "Import Tab")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "templatesBtn",
            title: "Song Templates",
            "aria-label": "Templates (Song Templates)",
            onClick: handleTemplates
          },
          "\u{1F4CB} ",
          /* @__PURE__ */ _("span", null, "Templates")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "randomizeBtn",
            title: "Randomize Progression",
            "aria-label": "Randomize (Progression)",
            onClick: handleRandomize
          },
          "\u{1F3B2} ",
          /* @__PURE__ */ _("span", null, "Randomize")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "clearProgBtn",
            title: "Clear Progression",
            "aria-label": "Clear All (Progression)",
            onClick: handleClear
          },
          "\u{1F5D1}\uFE0F ",
          /* @__PURE__ */ _("span", null, "Clear All")
        ),
        /* @__PURE__ */ _("div", { class: "menu-divider" }),
        /* @__PURE__ */ _("div", { class: "menu-section-header" }, "Melody & Intelligence"),
        /* @__PURE__ */ _(
          "button",
          {
            id: "importLeadSeedBtn",
            title: "Import Lead Seed (MusicXML)",
            "aria-label": "Import XML (Lead Seed from MusicXML)",
            onClick: () => {
              setIsMenuOpen(false);
              document.getElementById("xml-upload-editor").click();
            }
          },
          "\u{1F4E5} ",
          /* @__PURE__ */ _("span", null, "Import XML")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "analyzeAudioBtn",
            title: "Analyze Audio / Harmonize Melody",
            "aria-label": "Analyze (Audio / Harmonize Melody)",
            onClick: handleAnalyze
          },
          "\u{1F442} ",
          /* @__PURE__ */ _("span", null, "Analyze")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "mutateBtn",
            title: "Mutate Progression",
            "aria-label": "Mutate (Progression)",
            onClick: handleMutate
          },
          "\u2728 ",
          /* @__PURE__ */ _("span", null, "Mutate")
        ),
        hasLeadSheet && /* @__PURE__ */ _(
          "button",
          {
            id: "reharmonizeMelodyBtn",
            title: "Re-harmonize Lead Seed",
            "aria-label": "Re-harmonize (Lead Seed)",
            onClick: handleReharmonize
          },
          "\u{1F3B9} ",
          /* @__PURE__ */ _("span", null, "Re-harmonize")
        ),
        hasLeadSheet && /* @__PURE__ */ _(
          "button",
          {
            id: "clearLeadSeedBtn",
            title: "Clear Lead Seed",
            "aria-label": "Clear Lead Seed",
            onClick: handleClearLeadSeed
          },
          "\u{1F6AB} ",
          /* @__PURE__ */ _("span", null, "Clear Lead Seed")
        ),
        /* @__PURE__ */ _("div", { class: "menu-divider" }),
        /* @__PURE__ */ _("div", { class: "menu-section-header" }, "Project"),
        /* @__PURE__ */ _(
          "button",
          {
            id: "undoBtn",
            title: "Undo Last Change",
            "aria-label": "Undo (Last Change)",
            onClick: handleUndo
          },
          "\u21A9\uFE0F ",
          /* @__PURE__ */ _("span", null, "Undo")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "saveBtn",
            title: "Save to Library",
            "aria-label": "Save (to Library)",
            onClick: handleSave
          },
          "\u{1F4BE} ",
          /* @__PURE__ */ _("span", null, "Save")
        ),
        /* @__PURE__ */ _(
          "button",
          {
            id: "shareBtn",
            title: "Share Progression",
            "aria-label": "Share (Progression)",
            onClick: handleShare
          },
          "\u{1F517} ",
          /* @__PURE__ */ _("span", null, "Share")
        )
      ))))
    );
  }
  var arranger3;
  var init_EditorModal = __esm({
    "public/components/EditorModal.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_musicxml_parser();
      init_state();
      init_ui_bridge();
      init_worker_client();
      init_Arranger();
      init_arranger_controller();
      init_chords();
      init_config();
      init_history();
      init_sharing();
      init_types();
      init_ui();
      init_utils();
      ({ arranger: arranger3 } = getState());
    }
  });

  // public/song-generator.js
  function formatProgression(chordArray, bars) {
    if (chordArray.length === 12) {
      return chordArray.join(" | ");
    }
    const result = [];
    const sourceLen = chordArray.length;
    for (let i3 = 0; i3 < bars; i3++) {
      result.push(chordArray[i3 % sourceLen]);
    }
    return result.join(" | ");
  }
  function generateSong(options = {}) {
    const key = options.key === "Random" ? rand(KEY_ORDER) : options.key || "C";
    let timeSig = options.timeSignature;
    if (!timeSig || timeSig === "Random") {
      const roll2 = Math.random();
      if (roll2 < 0.7) {
        timeSig = "4/4";
      } else if (roll2 < 0.9) {
        timeSig = "3/4";
      } else {
        timeSig = "6/8";
      }
    }
    let style = options.structure;
    if (!style || style === "random") {
      style = rand(["pop", "pop", "pop", "ballad", "simple"]);
    }
    if (options.structure === "blues") {
      style = "blues";
    }
    const structureTemplate = STRUCTURES[style] || STRUCTURES.pop;
    const pool = PROGRESSIONS[style] || PROGRESSIONS.pop;
    const sections = [];
    const memory = {};
    if (options.seed?.type && options.seed.value) {
      memory[options.seed.type] = options.seed.value;
    }
    structureTemplate.forEach((label) => {
      let bars = 8;
      if (label === "Intro" || label === "Outro") {
        bars = 4;
      }
      if (style === "blues") {
        bars = 12;
      }
      let progressionStr;
      if (memory[label]) {
        progressionStr = memory[label];
      } else {
        const candidates = pool[label] || pool.Verse;
        const pattern = rand(candidates);
        progressionStr = formatProgression(pattern, bars);
        memory[label] = progressionStr;
      }
      sections.push({
        id: generateId(),
        label,
        value: progressionStr,
        key,
        timeSignature: timeSig,
        repeat: 1
      });
    });
    return sections;
  }
  var STRUCTURES, PROGRESSIONS, rand;
  var init_song_generator = __esm({
    "public/song-generator.js"() {
      init_config();
      init_utils();
      STRUCTURES = {
        pop: ["Intro", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Chorus", "Outro"],
        ballad: ["Intro", "Verse", "Verse", "Chorus", "Verse", "Chorus", "Bridge", "Chorus", "Outro"],
        blues: ["Intro", "Verse", "Verse", "Solo", "Verse", "Outro"],
        simple: ["Verse", "Chorus", "Verse", "Chorus"]
      };
      PROGRESSIONS = {
        pop: {
          Intro: [
            ["I", "IV", "I", "IV"],
            ["vi", "IV", "I", "V"],
            ["I", "V", "vi", "IV"],
            ["I", "vi", "IV", "V"]
          ],
          Verse: [
            ["I", "V", "vi", "IV"],
            ["vi", "IV", "I", "V"],
            ["I", "vi", "IV", "V"],
            // Doo-wop
            ["I", "IV", "I", "V"],
            ["ii", "V", "I", "vi"],
            ["vi", "iii", "IV", "I"]
          ],
          Chorus: [
            ["I", "V", "vi", "IV"],
            // Axis of Awesome
            ["IV", "I", "V", "vi"],
            ["I", "IV", "ii", "V"],
            ["I", "bVII", "IV", "I"],
            // Mixolydian / Rock
            ["vi", "IV", "I", "V"]
          ],
          Bridge: [
            ["vi", "IV", "I", "V"],
            ["vi", "iii", "IV", "V"],
            ["ii", "V", "iii", "vi"],
            ["IV", "V", "vi", "iii"],
            ["bVI", "bVII", "I", "I"]
            // Mario Cadence ish
          ],
          Outro: [
            ["I", "IV", "I", "IV"],
            ["vi", "IV", "I", "I"],
            ["ii", "V", "I", "I"]
          ]
        },
        ballad: {
          Intro: [
            ["I", "maj7", "I", "maj7"],
            ["vi", "IV", "I", "V"]
          ],
          Verse: [
            ["I", "iii", "IV", "V"],
            ["I", "vi", "ii", "V"]
          ],
          Chorus: [
            ["IV", "V", "I", "vi"],
            ["I", "V/VII", "vi", "IV"]
          ],
          Bridge: [
            ["vi", "V", "IV", "V"],
            ["iii", "vi", "ii", "V"]
          ],
          Outro: [["I", "IV", "I", "IV"]]
        },
        blues: {
          Intro: [["I7", "IV7", "I7", "V7"]],
          Verse: [["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"]],
          // 12-bar
          Chorus: [["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"]],
          Solo: [["I7", "IV7", "I7", "I7", "IV7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7"]],
          Outro: [["I7", "IV7", "I7", "I7", "V7", "IV7", "I7", "V7#9"]]
        }
      };
      rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
    }
  });

  // public/components/GenerateSongModal.jsx
  var GenerateSongModal_exports = {};
  __export(GenerateSongModal_exports, {
    GenerateSongModal: () => GenerateSongModal
  });
  function GenerateSongModal() {
    const { arranger: arranger6 } = getState();
    const dispatch2 = useDispatch();
    const isOpen = useEnsembleState((s3) => s3.playback.modals.generateSong);
    const overlayRef = A2(null);
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    const [key, setKey] = d2("Random");
    const [timeSignature, setTimeSignature] = d2("Random");
    const [structure, setStructure] = d2("pop");
    const [useSeed, setUseSeed] = d2(false);
    const [seedType, setSeedType] = d2("Verse");
    const close = () => {
      dispatch2(ACTIONS.SET_MODAL_OPEN, { modal: "generateSong", open: false });
    };
    const handleConfirm = () => {
      let seed = null;
      if (useSeed) {
        const targetId = arranger6.lastInteractedSectionId;
        const section = arranger6.sections.find((s3) => s3.id === targetId) || arranger6.sections[0];
        if (section?.value) {
          seed = {
            type: seedType,
            value: section.value
          };
        } else {
          showToast("No section found to seed from.");
        }
      }
      const newSections = generateSong({ key, timeSignature, structure, seed });
      pushHistory();
      if (arranger6.isDirty && arranger6.sections.length > 1) {
        if (!confirm("Replace current arrangement with generated song?")) {
          return;
        }
      }
      arranger6.sections = newSections;
      if (newSections.length > 0) {
        const first = newSections[0];
        if (first.key && first.key !== "Random") {
          arranger6.key = first.key;
        }
        if (first.timeSignature && first.timeSignature !== "Random") {
          arranger6.timeSignature = first.timeSignature;
        }
      }
      arranger6.isMinor = false;
      arranger6.isDirty = true;
      clearChordPresetHighlight();
      refreshArrangerUI();
      validateAndAnalyze();
      close();
      showToast("Generated new song!");
    };
    return /* @__PURE__ */ _(
      "div",
      {
        id: "generateSongOverlay",
        ref: overlayRef,
        class: `modal-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "generate-song-title",
        onClick: (e3) => {
          if (e3.target.id === "generateSongOverlay") {
            close();
          }
        }
      },
      /* @__PURE__ */ _("div", { class: "modal-content settings-content", onClick: (e3) => e3.stopPropagation() }, /* @__PURE__ */ _(
        "button",
        {
          class: "close-modal-btn",
          id: "closeGenerateSongBtn",
          "aria-label": "Close Generator",
          onClick: close
        },
        "\u2715"
      ), /* @__PURE__ */ _("h3", { id: "generate-song-title" }, "Song Generator"), /* @__PURE__ */ _("div", { class: "settings-controls" }, /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { htmlFor: "gen-root-key", class: "setting-label" }, "Root Key"), /* @__PURE__ */ _(
        "select",
        {
          id: "gen-root-key",
          value: key,
          onChange: (e3) => setKey(e3.target.value)
        },
        /* @__PURE__ */ _("option", { value: "Random" }, "Random"),
        /* @__PURE__ */ _("option", { value: "C" }, "C"),
        /* @__PURE__ */ _("option", { value: "Db" }, "Db"),
        /* @__PURE__ */ _("option", { value: "D" }, "D"),
        /* @__PURE__ */ _("option", { value: "Eb" }, "Eb"),
        /* @__PURE__ */ _("option", { value: "E" }, "E"),
        /* @__PURE__ */ _("option", { value: "F" }, "F"),
        /* @__PURE__ */ _("option", { value: "Gb" }, "Gb"),
        /* @__PURE__ */ _("option", { value: "G" }, "G"),
        /* @__PURE__ */ _("option", { value: "Ab" }, "Ab"),
        /* @__PURE__ */ _("option", { value: "A" }, "A"),
        /* @__PURE__ */ _("option", { value: "Bb" }, "Bb"),
        /* @__PURE__ */ _("option", { value: "B" }, "B")
      )), /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { htmlFor: "gen-time-sig", class: "setting-label" }, "Time Signature"), /* @__PURE__ */ _(
        "select",
        {
          id: "gen-time-sig",
          value: timeSignature,
          onChange: (e3) => setTimeSignature(e3.target.value)
        },
        /* @__PURE__ */ _("option", { value: "Random" }, "Random"),
        /* @__PURE__ */ _("option", { value: "4/4" }, "4/4"),
        /* @__PURE__ */ _("option", { value: "3/4" }, "3/4"),
        /* @__PURE__ */ _("option", { value: "2/4" }, "2/4"),
        /* @__PURE__ */ _("option", { value: "5/4" }, "5/4"),
        /* @__PURE__ */ _("option", { value: "6/8" }, "6/8"),
        /* @__PURE__ */ _("option", { value: "7/8" }, "7/8"),
        /* @__PURE__ */ _("option", { value: "12/8" }, "12/8")
      )), /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { htmlFor: "gen-structure", class: "setting-label" }, "Structure"), /* @__PURE__ */ _(
        "select",
        {
          id: "gen-structure",
          value: structure,
          onChange: (e3) => setStructure(e3.target.value)
        },
        /* @__PURE__ */ _("option", { value: "pop" }, "Pop (Verse-Chorus-Bridge)"),
        /* @__PURE__ */ _("option", { value: "blues" }, "12-Bar Blues"),
        /* @__PURE__ */ _("option", { value: "jazz" }, "Jazz Standard (AABA)"),
        /* @__PURE__ */ _("option", { value: "loop" }, "Short Loop (4 Bars)")
      )), /* @__PURE__ */ _(
        "div",
        {
          class: "setting-item",
          style: "margin-top: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;"
        },
        /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
          "input",
          {
            type: "checkbox",
            checked: useSeed,
            onChange: (e3) => setUseSeed(e3.target.checked)
          }
        ), /* @__PURE__ */ _("span", { class: "setting-label", style: "margin: 0;" }, "Seed from current section"))
      ), useSeed && /* @__PURE__ */ _("div", { class: "setting-item animate-in" }, /* @__PURE__ */ _("label", { htmlFor: "gen-seed-type", class: "setting-label" }, "Seed as..."), /* @__PURE__ */ _(
        "select",
        {
          id: "gen-seed-type",
          value: seedType,
          onChange: (e3) => setSeedType(e3.target.value)
        },
        /* @__PURE__ */ _("option", { value: "Verse" }, "Verse"),
        /* @__PURE__ */ _("option", { value: "Chorus" }, "Chorus"),
        /* @__PURE__ */ _("option", { value: "Bridge" }, "Bridge"),
        /* @__PURE__ */ _("option", { value: "Intro" }, "Intro")
      )))), /* @__PURE__ */ _(
        "button",
        {
          class: "primary-btn",
          style: "width: 100%; margin-top: 1.5rem; padding: 1rem;",
          onClick: handleConfirm
        },
        "Generate Song"
      ))
    );
  }
  var init_GenerateSongModal = __esm({
    "public/components/GenerateSongModal.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_arranger_controller();
      init_history();
      init_song_generator();
      init_state();
      init_types();
      init_ui();
      init_ui_bridge();
      init_utils();
    }
  });

  // public/midi-export.js
  function exportToMidi(options = {}) {
    showToast("Starting MIDI Export...");
    if (options.filename) {
      options.filename = options.filename.replace(/[^a-zA-Z0-9\s\-_()]/g, "").substring(0, 64).trim() || "ensemble-export";
    }
    syncWorker();
    startExport(options);
  }
  var init_midi_export = __esm({
    "public/midi-export.js"() {
      init_ui();
      init_worker_client();
    }
  });

  // public/components/ExportModal.jsx
  var ExportModal_exports = {};
  __export(ExportModal_exports, {
    ExportModal: () => ExportModal
  });
  function ExportModal() {
    const isOpen = useEnsembleState((s3) => s3.playback.modals.export);
    const [filename, setFilename] = d2("Ensemble Export");
    const overlayRef = A2(null);
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    y2(() => {
      if (isOpen) {
        let defaultName = arranger4.lastChordPreset || "Ensemble Export";
        defaultName = defaultName.replace(FILENAME_CLEANUP_PATTERN, "").trim();
        setFilename(`${defaultName} - ${arranger4.key} - ${playback4.bpm}bpm`);
      }
    }, [isOpen]);
    const close = () => {
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "export", open: false });
    };
    const adjustExportDuration = (delta) => {
      const input = document.getElementById("exportDurationInput");
      if (!input) {
        return;
      }
      const current = parseInt(input.value, 10);
      const next = Math.max(1, Math.min(20, current + delta));
      input.value = next;
    };
    const handleModeChange = (e3) => {
      const isTime = e3.target.value === "time";
      const container = document.getElementById("exportDurationContainer");
      const stepper = document.getElementById("exportDurationStepper");
      if (container) {
        container.style.opacity = isTime ? "1" : "0.5";
        container.style.pointerEvents = isTime ? "auto" : "none";
      }
      if (stepper) {
        stepper.style.borderColor = isTime ? "var(--accent-color)" : "var(--border-color)";
        stepper.style.backgroundColor = isTime ? "var(--card-bg)" : "var(--input-bg)";
      }
    };
    const handleConfirmExport = () => {
      const includedTracks = [];
      if (document.getElementById("exportChordsCheck")?.checked) {
        includedTracks.push("chords");
      }
      if (document.getElementById("exportBassCheck")?.checked) {
        includedTracks.push("bass");
      }
      if (document.getElementById("exportSoloistCheck")?.checked) {
        includedTracks.push("soloist");
      }
      if (document.getElementById("exportHarmoniesCheck")?.checked) {
        includedTracks.push("harmonies");
      }
      if (document.getElementById("exportDrumsCheck")?.checked) {
        includedTracks.push("drums");
      }
      const loopMode = document.querySelector('input[name="exportMode"]:checked')?.value || "once";
      const targetDurationInput = document.getElementById("exportDurationInput");
      const targetDuration = targetDurationInput ? parseFloat(targetDurationInput.value) : 1;
      const safeFilename = (filename || "Ensemble Export").replace(/[^a-zA-Z0-9\s\-_()]/g, "").substring(0, 64).trim();
      const finalFilename = safeFilename || "Ensemble Export";
      close();
      exportToMidi({ includedTracks, loopMode, targetDuration, filename: finalFilename });
    };
    return /* @__PURE__ */ _(
      "div",
      {
        id: "exportOverlay",
        ref: overlayRef,
        class: `settings-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        onClick: (e3) => {
          if (e3.target.id === "exportOverlay") {
            close();
          }
        }
      },
      /* @__PURE__ */ _("div", { class: "settings-content", onClick: (e3) => e3.stopPropagation() }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; margin-bottom: 1rem; align-items: center;" }, /* @__PURE__ */ _("h2", null, "MIDI Export Options"), /* @__PURE__ */ _(
        "button",
        {
          id: "closeExportBtn",
          class: "primary-btn",
          style: "padding: 0.4rem 1rem; font-size: 0.9rem; background: transparent; border: 1px solid var(--border-color); color: var(--text-color);",
          onClick: close
        },
        "Cancel"
      )), /* @__PURE__ */ _("div", { class: "settings-controls" }, /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "File Info"), /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { class: "setting-label" }, /* @__PURE__ */ _("span", null, "Filename")), /* @__PURE__ */ _(
        "input",
        {
          type: "text",
          id: "exportFilenameInput",
          value: filename,
          maxLength: 64,
          onInput: (e3) => setFilename(e3.target.value),
          style: "width: 100%; padding: 0.5rem; background: var(--input-bg); border: 1px solid var(--border-color); color: var(--text-color); border-radius: 4px;",
          spellcheck: "false"
        }
      ))), /* @__PURE__ */ _("div", { class: "settings-section" }, /* @__PURE__ */ _("h3", null, "Tracks to Include"), /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("input", { type: "checkbox", id: "exportChordsCheck", checked: true }), "Chords"), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("input", { type: "checkbox", id: "exportBassCheck", checked: true }), "Bass"), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("input", { type: "checkbox", id: "exportSoloistCheck", checked: true }), "Soloist"), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("input", { type: "checkbox", id: "exportHarmoniesCheck", checked: true }), "Harmonies"), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("input", { type: "checkbox", id: "exportDrumsCheck", checked: true }), "Drums"))), /* @__PURE__ */ _("div", { class: "settings-section", style: "border-bottom: none;" }, /* @__PURE__ */ _("h3", null, "Duration"), /* @__PURE__ */ _("div", { style: "display: flex; flex-direction: column; gap: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          type: "radio",
          name: "exportMode",
          value: "once",
          checked: true,
          onChange: handleModeChange
        }
      ), /* @__PURE__ */ _("span", null, "Cycle Through Once")), /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _(
        "input",
        {
          type: "radio",
          name: "exportMode",
          value: "time",
          onChange: handleModeChange
        }
      ), /* @__PURE__ */ _("span", null, "Target Duration (Minutes)")), /* @__PURE__ */ _(
        "div",
        {
          id: "exportDurationContainer",
          style: "margin-left: 1.8rem; opacity: 0.5; pointer-events: none; transition: opacity 0.2s;"
        },
        /* @__PURE__ */ _(
          "div",
          {
            id: "exportDurationStepper",
            class: "stepper-control",
            style: "display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; width: fit-content;"
          },
          /* @__PURE__ */ _(
            "button",
            {
              id: "exportDurationDec",
              "aria-label": "Decrease Duration",
              class: "stepper-btn",
              style: "padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;",
              onClick: () => adjustExportDuration(-1)
            },
            "-"
          ),
          /* @__PURE__ */ _(
            "input",
            {
              type: "number",
              id: "exportDurationInput",
              value: "3",
              min: "1",
              max: "20",
              readonly: true,
              style: "width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
            }
          ),
          /* @__PURE__ */ _(
            "button",
            {
              id: "exportDurationInc",
              "aria-label": "Increase Duration",
              class: "stepper-btn",
              style: "padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem; display: flex; align-items: center; justify-content: center;",
              onClick: () => adjustExportDuration(1)
            },
            "+"
          )
        )
      ))), /* @__PURE__ */ _("div", { style: "margin-top: 1.5rem;" }, /* @__PURE__ */ _(
        "button",
        {
          id: "confirmExportBtn",
          class: "primary-btn",
          style: "width: 100%; padding: 1rem;",
          onClick: handleConfirmExport
        },
        "Download MIDI"
      ))))
    );
  }
  var arranger4, playback4, FILENAME_CLEANUP_PATTERN;
  var init_ExportModal = __esm({
    "public/components/ExportModal.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_midi_export();
      init_state();
      init_ui_bridge();
      init_types();
      ({ arranger: arranger4, playback: playback4 } = getState());
      FILENAME_CLEANUP_PATTERN = /[^a-zA-Z0-9\s-_]/g;
    }
  });

  // public/components/TemplatesModal.jsx
  var TemplatesModal_exports = {};
  __export(TemplatesModal_exports, {
    TemplatesModal: () => TemplatesModal
  });
  function TemplatesModal() {
    const dispatch2 = useDispatch();
    const isOpen = useEnsembleState((s3) => s3.playback.modals.templates);
    const overlayRef = A2(null);
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    const close = () => {
      dispatch2(ACTIONS.SET_MODAL_OPEN, { modal: "templates", open: false });
    };
    const applyTemplate = (template) => {
      pushHistory();
      const newSections = template.sections.map((s3) => ({
        id: generateId(),
        label: s3.label,
        value: s3.value,
        repeat: s3.repeat || 1,
        key: s3.key || "",
        timeSignature: s3.timeSignature || "",
        seamless: s3.seamless || false
      }));
      if (arranger5.isDirty && arranger5.sections.length > 1) {
        if (!confirm(`Replace current arrangement with "${template.name}"?`)) {
          return;
        }
      }
      arranger5.sections = newSections;
      if (template.isMinor !== void 0) {
        arranger5.isMinor = template.isMinor;
      }
      const first = newSections[0];
      if (first.key) {
        arranger5.key = first.key;
      }
      if (first.timeSignature) {
        arranger5.timeSignature = first.timeSignature;
      }
      arranger5.isDirty = true;
      clearChordPresetHighlight();
      refreshArrangerUI();
      validateAndAnalyze();
      close();
      showToast(`Applied template: ${template.name}`);
    };
    return /* @__PURE__ */ _(
      "div",
      {
        id: "templatesOverlay",
        ref: overlayRef,
        class: `modal-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        onClick: (e3) => {
          if (e3.target.id === "templatesOverlay") {
            close();
          }
        }
      },
      /* @__PURE__ */ _("div", { class: "settings-content", onClick: (e3) => e3.stopPropagation() }, /* @__PURE__ */ _("div", { class: "modal-header" }, /* @__PURE__ */ _("h2", null, "Song Templates"), /* @__PURE__ */ _("button", { id: "closeTemplatesBtn", class: "primary-btn", onClick: close }, "Cancel")), /* @__PURE__ */ _(
        "div",
        {
          class: "templates-modal-label",
          style: "margin-bottom: 1.5rem; color: var(--text-muted);"
        },
        "Select a template to replace your current arrangement:"
      ), /* @__PURE__ */ _("div", { class: "template-chips", style: "display: flex; flex-wrap: wrap; gap: 0.5rem;" }, SONG_TEMPLATES.map((template, idx) => /* @__PURE__ */ _(
        "button",
        {
          key: idx,
          class: "preset-chip template-chip",
          onClick: () => applyTemplate(template)
        },
        formatUnicodeSymbols(template.name)
      ))))
    );
  }
  var arranger5;
  var init_TemplatesModal = __esm({
    "public/components/TemplatesModal.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_presets();
      init_state();
      init_types();
      init_ui_bridge();
      init_arranger_controller();
      init_history();
      init_ui();
      init_utils();
      ({ arranger: arranger5 } = getState());
    }
  });

  // public/audio-analyzer-lite.js
  var audio_analyzer_lite_exports = {};
  __export(audio_analyzer_lite_exports, {
    ChordAnalyzerLite: () => ChordAnalyzerLite
  });
  function calculateChromagramStandalone(signal, sampleRate, options, pitchFrequencies) {
    let chroma, pitchEnergy, windowValues;
    if (options.buffers) {
      chroma = options.buffers.chroma;
      chroma.fill(0);
      pitchEnergy = options.buffers.pitchEnergy;
      pitchEnergy.fill(0);
    } else {
      chroma = new Float32Array(12).fill(0);
      pitchEnergy = new Float32Array(128).fill(0);
    }
    const len = signal.length;
    const step = options.step || 4;
    const minMidi = options.minMidi || 0;
    const maxMidi = options.maxMidi || 127;
    if (options.buffers?.windowValues) {
      windowValues = options.buffers.windowValues;
    } else {
      const numSteps = ceil(len / step);
      windowValues = new Float32Array(numSteps);
      for (let i3 = 0, idx = 0; i3 < len; i3 += step, idx++) {
        windowValues[idx] = 0.5 * (1 - cos(2 * PI * i3 / (len - 1)));
      }
    }
    let startIdx = 0;
    let endIdx = pitchFrequencies.length;
    if (!options.suppressHarmonics) {
      startIdx = max(0, min(pitchFrequencies.length, minMidi - 24));
      endIdx = max(0, min(pitchFrequencies.length, maxMidi - 24 + 1));
    }
    let windowedSignal;
    if (options.buffers?.windowedSignal) {
      windowedSignal = options.buffers.windowedSignal;
    } else {
      const numSteps = ceil(len / step);
      windowedSignal = new Float32Array(numSteps);
    }
    for (let i3 = 0, idx = 0; i3 < len; i3 += step, idx++) {
      windowedSignal[idx] = signal[i3] * windowValues[idx];
    }
    const useTrigCache = options.buffers?.cosTable && options.buffers.sinTable;
    for (let pfIdx = startIdx; pfIdx < endIdx; pfIdx++) {
      const p3 = pitchFrequencies[pfIdx];
      let real = 0;
      let imag = 0;
      let cosDelta, sinDelta;
      if (useTrigCache) {
        cosDelta = options.buffers.cosTable[pfIdx];
        sinDelta = options.buffers.sinTable[pfIdx];
      } else {
        const angleStep = 2 * PI * p3.freq / sampleRate;
        const delta = step * angleStep;
        cosDelta = cos(delta);
        sinDelta = sin(delta);
      }
      let c3 = 1;
      let s3 = 0;
      const wsLen = windowedSignal.length;
      for (let idx = 0; idx < wsLen; idx++) {
        const sample = windowedSignal[idx];
        real += sample * c3;
        imag += sample * s3;
        const nextC = c3 * cosDelta - s3 * sinDelta;
        const nextS = s3 * cosDelta + c3 * sinDelta;
        c3 = nextC;
        s3 = nextS;
      }
      pitchEnergy[p3.midi] = real * real + imag * imag;
    }
    if (options.suppressHarmonics) {
      for (let m3 = 24; m3 <= 72; m3++) {
        const energy = pitchEnergy[m3];
        if (energy <= 0) {
          continue;
        }
        if (m3 + 12 < 128) {
          pitchEnergy[m3 + 12] = max(0, pitchEnergy[m3 + 12] - energy * 0.2);
        }
        if (m3 + 19 < 128) {
          pitchEnergy[m3 + 19] = max(0, pitchEnergy[m3 + 19] - energy * 0.1);
        }
        if (m3 + 24 < 128) {
          pitchEnergy[m3 + 24] = max(0, pitchEnergy[m3 + 24] - energy * 0.1);
        }
        if (m3 + 28 < 128) {
          pitchEnergy[m3 + 28] = max(0, pitchEnergy[m3 + 28] - energy * 0.05);
        }
      }
    }
    for (let m3 = 24; m3 <= 96; m3++) {
      if (m3 < minMidi || m3 > maxMidi) {
        continue;
      }
      const mag = pitchEnergy[m3];
      let weight = 1;
      if (m3 < 48) {
        weight = 0.6;
      } else if (m3 < 72) {
        weight = 1.2;
      } else if (m3 > 80) {
        weight = 0.5;
      }
      chroma[m3 % 12] += mag * weight;
    }
    if (options.skipSharpening) {
      return chroma;
    }
    const sharpened = new Float32Array(12);
    for (let i3 = 0; i3 < 12; i3++) {
      const prev = chroma[(i3 - 1 + 12) % 12];
      const next = chroma[(i3 + 1) % 12];
      if (chroma[i3] >= prev * 0.85 && chroma[i3] >= next * 0.85 && chroma[i3] > 0.1) {
        sharpened[i3] = chroma[i3];
      }
    }
    const maxVal = max(...sharpened);
    if (maxVal > 0) {
      for (let i3 = 0; i3 < 12; i3++) {
        sharpened[i3] /= maxVal;
      }
    }
    return sharpened;
  }
  var yieldToMain, min, max, floor, PI, cos, sin, abs, round, ceil, sqrt, KEY_TYPES, CHORD_PROFILES, CHORD_PROFILE_ENTRIES, MAJOR_DIATONIC, MINOR_DIATONIC, ChordAnalyzerLite;
  var init_audio_analyzer_lite = __esm({
    "public/audio-analyzer-lite.js"() {
      yieldToMain = () => new Promise((r3) => setTimeout(r3, 0));
      ({ min, max, floor, PI, cos, sin, abs, round, ceil, sqrt } = Math);
      KEY_TYPES = ["major", "minor", "dominant", "bluesMaj", "bluesMin"];
      CHORD_PROFILES = {
        maj: { 0: 1.6, 4: 1.4, 7: 1.1 },
        m: { 0: 1.6, 3: 1.4, 7: 1.1 },
        7: { 0: 1.6, 4: 1.3, 7: 1.1, 10: 1.5 },
        maj7: { 0: 1.6, 4: 1.3, 7: 1.1, 11: 1.2 },
        m7: { 0: 2, 3: 1.4, 7: 1.1, 10: 1.3 },
        6: { 0: 1.6, 4: 1.4, 7: 1.1, 9: 1.2 },
        m6: { 0: 1.6, 3: 1.4, 7: 1.1, 9: 1.2 },
        sus4: { 0: 1.6, 5: 1.4, 7: 1.1 },
        dim: { 0: 1.7, 3: 1.4, 6: 1.4 },
        dim7: { 0: 1.6, 3: 1.4, 6: 1.4, 9: 1.4 },
        aug: { 0: 1.6, 4: 1.4, 8: 1.4 }
      };
      CHORD_PROFILE_ENTRIES = Object.entries(CHORD_PROFILES);
      MAJOR_DIATONIC = [0, 2, 4, 5, 7, 9, 11];
      MINOR_DIATONIC = [0, 2, 3, 5, 7, 8, 10];
      ChordAnalyzerLite = class {
        constructor() {
          this.notes = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
          this.pitchFrequencies = [];
          for (let m3 = 24; m3 <= 96; m3++) {
            this.pitchFrequencies.push({
              midi: m3,
              freq: 440 * 2 ** ((m3 - 69) / 12),
              bin: m3 % 12
            });
          }
          this.keyProfiles = {
            major: [6.5, 2, 3.5, 2, 4.5, 4, 2, 5, 2, 3.5, 2, 3],
            minor: [6.5, 2.5, 3.5, 5, 2.5, 3.5, 2.5, 4.5, 4, 2.5, 3.5, 3],
            dominant: [7.5, 2, 3.5, 2, 4.5, 4, 2, 5, 2, 3.5, 4.5, 2],
            // Stronger Root and b7
            bluesMaj: [7.5, 1, 2, 2.5, 6, 4, 1.5, 4.5, 1.5, 2, 5.5, 1],
            // Strong 3, b7
            bluesMin: [7.5, 1, 2, 6, 2, 4, 1.5, 4.5, 1.5, 2, 5.5, 1]
            // Strong b3, b7
          };
        }
        /**
         * Identifies the global key and tuning offset of the audio.
         * Includes a high-res rotation check to handle tuning drift.
         */
        identifyGlobalKey(totalChroma) {
          let bestScore = -1;
          let bestKey = { root: 0, type: "major", tuningOffset: 0 };
          const rotatedBuffer = new Float32Array(12);
          for (let offset = -20; offset <= 20; offset++) {
            const rotatedChroma = this.rotateChroma(totalChroma, offset * 0.1, rotatedBuffer);
            for (let root = 0; root < 12; root++) {
              for (const type of KEY_TYPES) {
                let score = 0;
                for (let i3 = 0; i3 < 12; i3++) {
                  score += rotatedChroma[(root + i3) % 12] * this.keyProfiles[type][i3];
                }
                const offsetBias = 1 - abs(offset) * 0.02;
                const typeBias = type.startsWith("blues") ? 1.2 : type === "dominant" ? 1.15 : 1;
                score *= offsetBias * typeBias;
                if (score > bestScore) {
                  bestScore = score;
                  bestKey = { root, type, tuningOffset: offset * 0.1 };
                }
              }
            }
          }
          return bestKey;
        }
        /**
         * Identifies the key from a chromagram without tuning search.
         * Used for fast local key estimation during analysis.
         */
        identifySimpleKey(chroma) {
          let bestScore = -1;
          let bestKey = { root: 0, type: "major" };
          for (let root = 0; root < 12; root++) {
            for (const type of KEY_TYPES) {
              let score = 0;
              for (let i3 = 0; i3 < 12; i3++) {
                score += chroma[(root + i3) % 12] * this.keyProfiles[type][i3];
              }
              const typeBias = type.startsWith("blues") ? 1.2 : type === "dominant" ? 1.15 : 1;
              score *= typeBias;
              if (score > bestScore) {
                bestScore = score;
                bestKey = { root, type, score };
              }
            }
          }
          return bestKey;
        }
        /**
         * Rotates a 12-bin chromagram by a fractional semitone using linear interpolation.
         */
        rotateChroma(chroma, amount, output = null) {
          if (!output && amount === 0) {
            return chroma;
          }
          const result = output || new Float32Array(12);
          if (amount === 0) {
            if (result !== chroma) {
              result.set(chroma);
            }
            return result;
          }
          for (let i3 = 0; i3 < 12; i3++) {
            const sourceIdx = (i3 - amount + 12) % 12;
            const idx1 = floor(sourceIdx);
            const idx2 = (idx1 + 1) % 12;
            const frac = sourceIdx - idx1;
            result[i3] = chroma[idx1] * (1 - frac) + chroma[idx2] * frac;
          }
          return result;
        }
        /**
         * Analyzes an AudioBuffer and returns detected chords and pulse metadata.
         */
        async analyze(audioBuffer, options = {}) {
          const pulse = await this.identifyPulse(audioBuffer, options);
          let bpm = 120;
          if (typeof options.bpm === "number" && options.bpm > 0) {
            bpm = options.bpm;
          } else if (typeof pulse.bpm === "number" && pulse.bpm > 0) {
            bpm = pulse.bpm;
          }
          const beatsPerMeasure = pulse.beatsPerMeasure || 4;
          const sampleRate = audioBuffer.sampleRate;
          let fullSignal = audioBuffer.getChannelData(0);
          const startOffset = options.startTime || 0;
          const alignmentOffset = pulse.downbeatOffset >= 0 ? pulse.downbeatOffset : 0;
          let startSample = floor((startOffset + alignmentOffset) * sampleRate);
          if (startSample >= fullSignal.length) {
            console.warn(
              `[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) exceeds signal length. Starting at 0.`
            );
            startSample = 0;
          }
          const secondsPerBeat = 60 / bpm;
          const samplesPerBeat = floor(secondsPerBeat * sampleRate);
          if (fullSignal.length - startSample < samplesPerBeat && fullSignal.length >= samplesPerBeat) {
            console.warn(
              `[Analyzer-Lite] Alignment offset (${alignmentOffset.toFixed(3)}s) leaves insufficient data (< 1 beat). Resetting to 0.`
            );
            startSample = floor(startOffset * sampleRate);
          }
          const endSample = options.endTime ? floor(options.endTime * sampleRate) : fullSignal.length;
          const signal = fullSignal.subarray(startSample, endSample);
          const beats = floor(signal.length / samplesPerBeat);
          const globalChroma = this.calculateChromagram(signal, sampleRate, {
            minMidi: 48,
            maxMidi: 84,
            skipSharpening: true,
            suppressHarmonics: false,
            step: max(4, floor(signal.length / 1e6))
          });
          const globalKey = this.identifyGlobalKey(globalChroma);
          const tuningOffset = globalKey.tuningOffset;
          if (options.onProgress) {
            options.onProgress(15);
          }
          const results = [];
          let lastChord = "Rest";
          const rollingChroma = new Float32Array(12).fill(0);
          const ROLL_DECAY = 0.1;
          const chromaBuffer = new Float32Array(12);
          const pitchEnergyBuffer = new Float32Array(128);
          const step = 4;
          const numWindowSteps = ceil(samplesPerBeat / step);
          const windowValuesBuffer = new Float32Array(numWindowSteps);
          const windowedSignalBuffer = new Float32Array(numWindowSteps);
          for (let i3 = 0, idx = 0; i3 < samplesPerBeat; i3 += step, idx++) {
            windowValuesBuffer[idx] = 0.5 * (1 - cos(2 * PI * i3 / (samplesPerBeat - 1)));
          }
          const cosTable = new Float32Array(this.pitchFrequencies.length);
          const sinTable = new Float32Array(this.pitchFrequencies.length);
          for (let i3 = 0; i3 < this.pitchFrequencies.length; i3++) {
            const p3 = this.pitchFrequencies[i3];
            const angleStep = 2 * PI * p3.freq / sampleRate;
            const delta = step * angleStep;
            cosTable[i3] = cos(delta);
            sinTable[i3] = sin(delta);
          }
          const sharedBuffers = {
            chroma: chromaBuffer,
            pitchEnergy: pitchEnergyBuffer,
            windowValues: windowValuesBuffer,
            windowedSignal: windowedSignalBuffer,
            cosTable,
            sinTable
          };
          const fullChromaOptions = {
            minMidi: 48,
            maxMidi: 88,
            suppressHarmonics: false,
            step,
            buffers: sharedBuffers
          };
          const bassChromaOptions = {
            minMidi: 24,
            maxMidi: 47,
            suppressHarmonics: false,
            step,
            buffers: sharedBuffers
          };
          const finalChroma = new Float32Array(12);
          const finalBassChroma = new Float32Array(12);
          for (let b2 = 0; b2 < beats; b2++) {
            if (b2 % 10 === 0) {
              await yieldToMain();
            }
            const start = b2 * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window2 = signal.subarray(start, end);
            let sum = 0;
            const wLen = window2.length;
            for (let i3 = 0; i3 < wLen; i3++) {
              const x3 = window2[i3];
              sum += x3 * x3;
            }
            const energy = sqrt(sum / wLen);
            let chroma = this.calculateChromagram(window2, sampleRate, fullChromaOptions);
            chroma = this.rotateChroma(chroma, tuningOffset, finalChroma);
            if (energy > 1e-4) {
              for (let i3 = 0; i3 < 12; i3++) {
                rollingChroma[i3] = rollingChroma[i3] * ROLL_DECAY + chroma[i3] * (1 - ROLL_DECAY);
              }
            }
            const localKey = this.identifySimpleKey(rollingChroma);
            let bassChroma = this.calculateChromagram(window2, sampleRate, bassChromaOptions);
            bassChroma = this.rotateChroma(bassChroma, tuningOffset, finalBassChroma);
            let chord = "Rest";
            if (energy > 1e-4) {
              chord = this.identifyChord(chroma, {
                keyBias: localKey,
                bassNote: this.getStrongestBassNote(bassChroma),
                bassChroma
              });
              if (chord === "Rest" && lastChord !== "Rest" && energy > 2e-4) {
                chord = lastChord;
              }
            }
            results.push({ beat: b2, chord, energy, localKey });
            lastChord = chord;
            if (options.onProgress) {
              options.onProgress(15 + b2 / beats * 85);
            }
          }
          const smoothed = [];
          let lastConsensus = null;
          for (let i3 = 0; i3 < results.length; i3++) {
            const window2 = results.slice(max(0, i3 - 1), min(results.length, i3 + 2));
            const counts = {};
            window2.forEach((r3) => {
              const chord = r3.chord;
              counts[chord] = (counts[chord] || 0) + 1;
            });
            let energySum = 0;
            const wLen = window2.length;
            for (let j4 = 0; j4 < wLen; j4++) {
              energySum += window2[j4].energy;
            }
            const avgEnergy = energySum / wLen;
            let consensus = null;
            let maxCount = -1;
            for (const chordKey in counts) {
              if (counts[chordKey] > maxCount) {
                maxCount = counts[chordKey];
                consensus = chordKey;
              }
            }
            if (consensus !== lastConsensus || i3 === 0 && smoothed.length === 0) {
              smoothed.push({
                beat: i3,
                time: i3 * secondsPerBeat,
                chord: consensus,
                bpm,
                energy: avgEnergy
              });
              lastConsensus = consensus;
            }
          }
          if (smoothed.length === 0 && results.length > 0) {
            smoothed.push({
              beat: 0,
              time: 0,
              chord: results[0].chord,
              bpm,
              energy: results[0].energy
            });
          }
          fullSignal = null;
          return {
            chords: smoothed,
            pulse: {
              bpm,
              candidates: pulse.candidates,
              beatsPerMeasure,
              downbeatOffset: pulse.downbeatOffset
            }
          };
        }
        /**
         * Extracts the single strongest note per beat from the audio.
         * Used for the "Harmonize Melody" feature.
         * Includes Diatonic Gravity to favor notes within the detected key.
         * @returns {Promise<Array<{beat: number, midi: number, energy: number}>>}
         */
        async extractMelody(audioBuffer, pulseData, options = {}) {
          const signal = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          const bpm = pulseData.bpm;
          const secondsPerBeat = 60 / bpm;
          const samplesPerBeat = floor(secondsPerBeat * sampleRate);
          const startSample = floor((pulseData.downbeatOffset || 0) * sampleRate);
          if (startSample >= signal.length) {
            return [];
          }
          const workingSignal = signal.subarray(startSample);
          const beats = floor(workingSignal.length / samplesPerBeat);
          const rawMelody = [];
          const keyBias = options.keyBias || null;
          let scale = null;
          if (keyBias) {
            scale = keyBias.type === "minor" ? MINOR_DIATONIC : MAJOR_DIATONIC;
          }
          const minMidi = 48;
          const maxMidi = 84;
          const cosTable = new Float32Array(this.pitchFrequencies.length);
          const sinTable = new Float32Array(this.pitchFrequencies.length);
          const step = 4;
          for (let i3 = 0; i3 < this.pitchFrequencies.length; i3++) {
            const p3 = this.pitchFrequencies[i3];
            const angleStep = 2 * PI * p3.freq / sampleRate;
            const delta = step * angleStep;
            cosTable[i3] = cos(delta);
            sinTable[i3] = sin(delta);
          }
          let lastMidi = 60;
          for (let b2 = 0; b2 < beats; b2++) {
            if (b2 % 20 === 0) {
              await yieldToMain();
            }
            const start = b2 * samplesPerBeat;
            const end = start + samplesPerBeat;
            const window2 = workingSignal.subarray(start, end);
            let sum = 0;
            const wLen = window2.length;
            for (let i3 = 0; i3 < wLen; i3++) {
              const x3 = window2[i3];
              sum += x3 * x3;
            }
            const rms = sqrt(sum / wLen);
            if (rms < 0.01) {
              rawMelody.push({ beat: b2, midi: null, energy: 0 });
              continue;
            }
            let maxScore = -1;
            let bestMidi = -1;
            const startIdx = max(0, minMidi - 24);
            const endIdx = min(this.pitchFrequencies.length, maxMidi - 24 + 1);
            for (let pfIdx = startIdx; pfIdx < endIdx; pfIdx++) {
              const p3 = this.pitchFrequencies[pfIdx];
              let real = 0;
              let imag = 0;
              const cosDelta = cosTable[pfIdx];
              const sinDelta = sinTable[pfIdx];
              let c3 = 1;
              let s3 = 0;
              for (let i3 = 0; i3 < window2.length; i3 += 4) {
                const val = window2[i3];
                real += val * c3;
                imag += val * s3;
                const nextC = c3 * cosDelta - s3 * sinDelta;
                const nextS = s3 * cosDelta + c3 * sinDelta;
                c3 = nextC;
                s3 = nextS;
              }
              const energy = real * real + imag * imag;
              let score = energy;
              if (scale) {
                const relativePitch = (p3.midi - keyBias.root + 12) % 12;
                if (scale.includes(relativePitch)) {
                  score *= 1.4;
                }
              }
              const beatsPerMeasure = pulseData.beatsPerMeasure || 4;
              const beatInMeasure = b2 % beatsPerMeasure;
              if (beatInMeasure === 0) {
                score *= 1.5;
              } else if (beatInMeasure === 2 && beatsPerMeasure === 4) {
                score *= 1.25;
              }
              const dist = abs(p3.midi - lastMidi);
              if (dist > 2) {
                score *= max(0.1, 1 - (dist - 2) * 0.1);
              }
              if (score > maxScore) {
                maxScore = score;
                bestMidi = p3.midi;
              }
            }
            const normalizedEnergy = min(1, maxScore / 130);
            rawMelody.push({
              beat: b2,
              midi: bestMidi,
              energy: normalizedEnergy
            });
            if (bestMidi !== -1) {
              lastMidi = bestMidi;
            }
          }
          const smoothedMelody = [];
          for (let i3 = 0; i3 < rawMelody.length; i3++) {
            const prev = rawMelody[i3 - 1];
            const curr = rawMelody[i3];
            const next = rawMelody[i3 + 1];
            if (prev && next && curr.midi !== null && prev.midi === null && next.midi === null) {
              smoothedMelody.push({ ...curr, midi: null, energy: 0 });
            } else if (prev && next && curr.midi !== null && prev.midi !== null && next.midi !== null) {
              const distPrev = abs(curr.midi - prev.midi);
              const distNext = abs(curr.midi - next.midi);
              if (distPrev > 7 && distNext > 7 && prev.midi === next.midi) {
                smoothedMelody.push({ ...curr, midi: prev.midi });
              } else if (prev.midi === next.midi && curr.midi !== prev.midi) {
                smoothedMelody.push({ ...curr, midi: prev.midi });
              } else {
                smoothedMelody.push(curr);
              }
            } else {
              smoothedMelody.push(curr);
            }
          }
          return smoothedMelody;
        }
        /**
         * Identifies the "Pulse" (BPM, Meter, and Downbeat) of the audio using
         * Spectral Flux for robust onset detection and autocorrelation.
         * Includes "Top-Down" structural snapping based on clip duration.
         */
        async identifyPulse(audioBuffer, options = {}) {
          const signal = audioBuffer.getChannelData(0);
          const sampleRate = audioBuffer.sampleRate;
          const startTime = options.startTime || 0;
          const rawEndTime = options.endTime || audioBuffer.duration;
          let effectiveEndTime = rawEndTime;
          const durationRaw = rawEndTime - startTime;
          const manualBpm = typeof options.bpm === "number" && options.bpm > 0 ? options.bpm : 0;
          const winSize = floor(sampleRate * 0.02);
          const hopSize = floor(sampleRate * 0.01);
          const pulseMaxSeconds = max(30, durationRaw + 1);
          const numWindows = floor(min(signal.length, sampleRate * pulseMaxSeconds) / hopSize) - 2;
          const flux = new Float32Array(numWindows);
          let lastSpectrum = new Float32Array(12);
          const chromaBuffer = new Float32Array(12);
          const pitchEnergyBuffer = new Float32Array(128);
          const step = 8;
          const numWindowSteps = ceil(winSize / step);
          const windowValuesBuffer = new Float32Array(numWindowSteps);
          const windowedSignalBuffer = new Float32Array(numWindowSteps);
          for (let i3 = 0, idx = 0; i3 < winSize; i3 += step, idx++) {
            windowValuesBuffer[idx] = 0.5 * (1 - cos(2 * PI * i3 / (winSize - 1)));
          }
          const cosTable = new Float32Array(this.pitchFrequencies.length);
          const sinTable = new Float32Array(this.pitchFrequencies.length);
          for (let i3 = 0; i3 < this.pitchFrequencies.length; i3++) {
            const p3 = this.pitchFrequencies[i3];
            const angleStep = 2 * PI * p3.freq / sampleRate;
            const delta = step * angleStep;
            cosTable[i3] = cos(delta);
            sinTable[i3] = sin(delta);
          }
          const calcOptions = {
            step,
            skipSharpening: true,
            minMidi: 48,
            // Focus on rhythmic range (C3 and up, ignoring walking bass)
            maxMidi: 96,
            suppressHarmonics: false,
            buffers: {
              chroma: chromaBuffer,
              pitchEnergy: pitchEnergyBuffer,
              windowValues: windowValuesBuffer,
              windowedSignal: windowedSignalBuffer,
              cosTable,
              sinTable
            }
          };
          let lastActiveHop = 0;
          for (let w3 = 0; w3 < numWindows; w3++) {
            if (w3 % 500 === 0) {
              await yieldToMain();
            }
            const start = w3 * hopSize;
            const window2 = signal.subarray(start, start + winSize);
            const currentSpectrum = this.calculateChromagram(window2, sampleRate, calcOptions);
            let sum = 0;
            for (let i3 = 0; i3 < 12; i3++) {
              const diff = currentSpectrum[i3] - lastSpectrum[i3];
              if (diff > 0) {
                sum += diff;
              }
            }
            flux[w3] = sum;
            if (sum > 1e-3) {
              lastActiveHop = w3;
            }
            lastSpectrum.set(currentSpectrum);
          }
          effectiveEndTime = min(rawEndTime, (lastActiveHop * hopSize + winSize) / sampleRate + 0.5);
          if (rawEndTime - effectiveEndTime < 0.2) {
            effectiveEndTime = rawEndTime;
          }
          const duration = effectiveEndTime - startTime;
          const maxFlux = max(...flux);
          const onsets = flux.map((v3) => v3 / (maxFlux || 1));
          if (options.onProgress) {
            options.onProgress(5);
          }
          const structuralCandidates = [];
          const commonBarCounts = [4, 8, 12, 16, 24, 32, 48, 64];
          const commonMeters = [4, 3];
          commonBarCounts.forEach((bars) => {
            commonMeters.forEach((meter) => {
              const totalBeats = bars * meter;
              let bpm = totalBeats * 60 / duration;
              if (abs(bpm - round(bpm)) < 0.1) {
                bpm = round(bpm);
              }
              if (bpm >= 50 && bpm <= 200) {
                structuralCandidates.push({
                  bpm,
                  bars,
                  meter,
                  lag: round(60 / (bpm * 0.01))
                });
              }
            });
          });
          const minLag = 25;
          const maxLag = 240;
          let bestLag = 60;
          let maxCorr = -1;
          const correlations = new Float32Array(maxLag + 1);
          if (manualBpm > 0) {
            bestLag = round(60 / (manualBpm * 0.01));
          } else {
            for (let lag = minLag; lag <= maxLag; lag++) {
              if (lag % 20 === 0) {
                await yieldToMain();
              }
              let corr = 0;
              for (let i3 = 0; i3 < onsets.length - lag; i3++) {
                corr += onsets[i3] * onsets[i3 + lag];
              }
              let structuralBoost = 1;
              const currentBPM = 60 / (lag * 0.01);
              for (const cand of structuralCandidates) {
                const bpmDiff = abs(currentBPM - cand.bpm);
                if (bpmDiff < cand.bpm * 0.025) {
                  structuralBoost = max(
                    structuralBoost,
                    2 * (1 - bpmDiff / (cand.bpm * 0.025))
                  );
                }
              }
              let rangeBias = 1;
              if (lag >= 42 && lag <= 75) {
                rangeBias = 1.25;
              } else if (lag >= 37 && lag <= 100) {
                rangeBias = 1.1;
              } else if (lag > 120) {
                rangeBias = 0.8;
              }
              const biasedScore = corr * rangeBias * structuralBoost;
              correlations[lag] = biasedScore;
              if (biasedScore > maxCorr) {
                maxCorr = biasedScore;
                bestLag = lag;
              }
            }
          }
          if (options.onProgress) {
            options.onProgress(5);
          }
          const checkHarmonic = (targetLag) => {
            let currentLag = targetLag;
            let changed = true;
            while (changed) {
              changed = false;
              for (const m3 of [2, 3, 4]) {
                const slowerLag = round(currentLag * m3);
                if (slowerLag > maxLag) {
                  continue;
                }
                const scoreSlower = correlations[slowerLag];
                const targetScore = correlations[currentLag];
                let threshold = 0.75;
                if (currentLag >= 46 && currentLag <= 85) {
                  threshold = 1.3;
                }
                if (slowerLag > 120) {
                  threshold = 2.5;
                }
                if (scoreSlower > targetScore * threshold) {
                  currentLag = slowerLag;
                  changed = true;
                  break;
                }
              }
            }
            changed = true;
            while (changed) {
              changed = false;
              if (currentLag > 85) {
                for (const m3 of [2, 3, 4]) {
                  const fasterLag = round(currentLag / m3);
                  if (fasterLag < minLag) {
                    continue;
                  }
                  const scoreFaster = correlations[fasterLag];
                  const scoreCurrent = correlations[currentLag];
                  const bonus = fasterLag >= 42 && fasterLag <= 75 ? 1.5 : 1;
                  if (scoreFaster * bonus > scoreCurrent * 0.5) {
                    currentLag = fasterLag;
                    changed = true;
                    break;
                  }
                }
              }
            }
            return currentLag;
          };
          bestLag = checkHarmonic(bestLag);
          let primaryBPM = 60 / (bestLag * 0.01);
          const snapThresholdBPM = 2.5;
          let bestStructuralMatch = null;
          bestStructuralMatch = structuralCandidates.filter((c3) => abs(c3.bpm - primaryBPM) < snapThresholdBPM).sort((a3, b2) => abs(a3.bpm - primaryBPM) - abs(b2.bpm - primaryBPM))[0];
          if (bestStructuralMatch) {
            primaryBPM = parseFloat(bestStructuralMatch.bpm.toFixed(2));
            bestLag = round(60 / (primaryBPM * 0.01));
          } else {
            const fullDuration = rawEndTime - startTime;
            const structuralCandidatesFull = [];
            [4, 8, 12, 16, 24, 32, 48, 64].forEach((bars) => {
              [4, 3].forEach((meter) => {
                const bpm = bars * meter * 60 / fullDuration;
                if (bpm >= 50 && bpm <= 200) {
                  structuralCandidatesFull.push({ bpm, bars, meter });
                }
              });
            });
            bestStructuralMatch = structuralCandidatesFull.filter((c3) => abs(c3.bpm - primaryBPM) < snapThresholdBPM).sort((a3, b2) => abs(a3.bpm - primaryBPM) - abs(b2.bpm - primaryBPM))[0];
            if (bestStructuralMatch) {
              primaryBPM = parseFloat(bestStructuralMatch.bpm.toFixed(2));
              bestLag = round(60 / (primaryBPM * 0.01));
            }
          }
          const candidatesMap = /* @__PURE__ */ new Map();
          [2, 1, 0.5, 4, 0.25].forEach((mult) => {
            const lag = round(bestLag * mult);
            if (lag >= minLag && lag <= maxLag) {
              const bpm = mult === 1 ? primaryBPM : round(60 / (lag * 0.01));
              if (!candidatesMap.has(bpm)) {
                candidatesMap.set(bpm, correlations[lag] || 0);
              }
            }
          });
          const candidates = Array.from(candidatesMap.entries()).map(([bpm, score]) => ({
            bpm,
            score
          }));
          const primaryCandidate = candidates.find((c3) => c3.bpm === primaryBPM);
          if (primaryCandidate) {
            primaryCandidate.score *= bestStructuralMatch ? 100 : 3;
          }
          candidates.sort((a3, b2) => b2.score - a3.score);
          let beatsPerMeasure = bestStructuralMatch ? bestStructuralMatch.meter : 4;
          if (!bestStructuralMatch) {
            let score3 = 0;
            let score4 = 0;
            const lag3 = bestLag * 3;
            const lag4 = bestLag * 4;
            if (onsets.length > lag4) {
              for (let i3 = 0; i3 < onsets.length - lag4; i3++) {
                score3 += onsets[i3] * onsets[i3 + lag3];
                score4 += onsets[i3] * onsets[i3 + lag4];
              }
            }
            beatsPerMeasure = score3 > score4 * 1.4 ? 3 : 4;
          }
          const measureSteps = bestLag * beatsPerMeasure;
          const phaseScores = new Float32Array(measureSteps);
          for (let i3 = 0; i3 < onsets.length; i3++) {
            phaseScores[i3 % measureSteps] += onsets[i3];
          }
          let bestPhase = 0;
          let maxPhaseScore = 0;
          for (let p3 = 0; p3 < measureSteps; p3++) {
            if (phaseScores[p3] > maxPhaseScore) {
              maxPhaseScore = phaseScores[p3];
              bestPhase = p3;
            }
          }
          lastSpectrum = null;
          let finalBpm = candidates[0]?.bpm || primaryBPM;
          if (abs(finalBpm - round(finalBpm)) < 0.3) {
            finalBpm = round(finalBpm);
          }
          return {
            bpm: finalBpm,
            candidates: candidates.length > 0 ? candidates : [{ bpm: finalBpm, score: 1 }],
            beatsPerMeasure,
            downbeatOffset: bestPhase * 0.01
          };
        }
        /**
         * Extracts the single strongest note from a bass-specific chromagram.
         */
        getStrongestBassNote(bassChroma) {
          let maxBass = 0;
          let bassNoteIdx = -1;
          for (let i3 = 0; i3 < 12; i3++) {
            if (bassChroma[i3] > maxBass) {
              maxBass = bassChroma[i3];
              bassNoteIdx = i3;
            }
          }
          return bassNoteIdx > -1 ? this.notes[bassNoteIdx] : null;
        }
        /**
         * Calculates energy in 12 semitone bins using a bank of targeted
         * single-frequency filters with Hann windowing and Harmonic Suppression.
         */
        calculateChromagram(signal, sampleRate, options = {}) {
          return calculateChromagramStandalone(signal, sampleRate, options, this.pitchFrequencies);
        }
        identifyChord(chroma, options = {}) {
          let bestScore = -1;
          let bestChordData = { root: 0, type: "maj" };
          for (let root = 0; root < 12; root++) {
            for (const [type, profile] of CHORD_PROFILE_ENTRIES) {
              let score = 0;
              for (let i3 = 0; i3 < 12; i3++) {
                const chromaIdx = (root + i3) % 12;
                const val = chroma[chromaIdx];
                if (profile[i3]) {
                  let effectiveVal = val;
                  if (val < 0.1 && options.bassChroma && options.bassChroma[chromaIdx] > 0.1) {
                    effectiveVal = options.bassChroma[chromaIdx];
                  }
                  score += effectiveVal * profile[i3];
                  if (effectiveVal < 0.1) {
                    score -= 2;
                  }
                } else {
                  score -= val * 0.5;
                }
              }
              if (options.keyBias) {
                const relativeRoot = (root - options.keyBias.root + 12) % 12;
                let isDiatonic = false;
                if (options.keyBias.type === "major") {
                  isDiatonic = MAJOR_DIATONIC.includes(relativeRoot);
                } else if (options.keyBias.type === "minor") {
                  isDiatonic = MINOR_DIATONIC.includes(relativeRoot);
                } else if (options.keyBias.type === "dominant") {
                  isDiatonic = [0, 2, 4, 5, 7, 9, 10].includes(relativeRoot);
                  if (isDiatonic && type === "7" && [0, 5, 7, 10].includes(relativeRoot)) {
                    score *= 1.2;
                  }
                } else if (options.keyBias.type.startsWith("blues")) {
                  if ([0, 5, 7].includes(relativeRoot) && type === "7") {
                    score *= 1.35;
                  } else if ([3, 10].includes(relativeRoot)) {
                    score *= 1.15;
                  }
                  isDiatonic = [0, 3, 5, 7, 10].includes(relativeRoot);
                }
                if (isDiatonic) {
                  score *= 1.3;
                }
              }
              if (type === "7" || type === "m7" || type === "maj7") {
                const seventhIdx = type === "maj7" ? 11 : 10;
                const absSeventhIdx = (root + seventhIdx) % 12;
                if (chroma[absSeventhIdx] < 0.15) {
                  score *= 0.6;
                }
              }
              if (["maj7", "m7", "6", "m6", "dim7"].includes(type)) {
                score *= 0.96;
              }
              if (score > bestScore) {
                bestScore = score;
                bestChordData = { root, type };
              }
            }
          }
          let energy = 0;
          for (let i3 = 0; i3 < chroma.length; i3++) {
            energy += chroma[i3];
          }
          if (energy < 0.05) {
            return "Rest";
          }
          let chordName = this.notes[bestChordData.root] + (bestChordData.type === "maj" ? "" : bestChordData.type);
          if (options.bassNote && options.bassNote !== this.notes[bestChordData.root]) {
            let totalEnergy = 0;
            for (let i3 = 0; i3 < chroma.length; i3++) {
              totalEnergy += chroma[i3];
            }
            const bassIdx = this.notes.indexOf(options.bassNote);
            let bassEnergy = chroma[bassIdx];
            if (options.bassChroma) {
              bassEnergy = max(bassEnergy, options.bassChroma[bassIdx]);
            }
            if (bassEnergy > totalEnergy * 0.12) {
              const root = bestChordData.root;
              const interval = (bassIdx - root + 12) % 12;
              const isStableInversion = [3, 4, 7].includes(interval);
              if (isStableInversion) {
                chordName += `/${options.bassNote}`;
              }
            }
          }
          return chordName;
        }
      };
    }
  });

  // public/form-extractor.js
  var form_extractor_exports = {};
  __export(form_extractor_exports, {
    extractForm: () => extractForm
  });
  function extractForm(beatData, options = 4) {
    if (!beatData || beatData.length < 4) {
      return [];
    }
    const beatsPerMeasure = typeof options === "object" ? options.beatsPerMeasure || 4 : options;
    const maxBeat = beatData[beatData.length - 1].beat;
    const timeline = new Array(maxBeat + 1).fill(null);
    beatData.forEach((b2) => {
      timeline[b2.beat] = b2;
    });
    let current = timeline.find((b2) => b2 !== null) || { chord: "C", energy: 0 };
    for (let i4 = 0; i4 < timeline.length; i4++) {
      if (timeline[i4]) {
        current = timeline[i4];
      } else {
        timeline[i4] = { ...current, beat: i4 };
      }
    }
    const simplify = (c3) => {
      if (!c3 || c3 === "Rest" || c3 === "-") {
        return "-";
      }
      return c3.replace(CHORD_EXTENSION_PATTERN, (match) => {
        if (match.startsWith("m")) {
          return "m";
        }
        return "";
      }).trim();
    };
    const getChordDistance = (c1, c22) => {
      if (c1 === c22) {
        return 0;
      }
      const root1 = c1.replace(/m$/, "");
      const root2 = c22.replace(/m$/, "");
      if (root1 === root2) {
        return 0.4;
      }
      return 1;
    };
    const measures = [];
    const originalMeasures = [];
    const measureEnergy = [];
    for (let i4 = 0; i4 < timeline.length; i4 += beatsPerMeasure) {
      const slice = timeline.slice(i4, i4 + beatsPerMeasure);
      if (slice.length < beatsPerMeasure) {
        break;
      }
      const counts = {};
      let totalEnergy = 0;
      slice.forEach((b2) => {
        counts[b2.chord] = (counts[b2.chord] || 0) + 1;
        totalEnergy += b2.energy;
      });
      let majority = null;
      let maxCount = -1;
      for (const chord in counts) {
        if (counts[chord] > maxCount) {
          maxCount = counts[chord];
          majority = chord;
        }
      }
      measureEnergy.push(totalEnergy / beatsPerMeasure);
      if (counts[majority] >= beatsPerMeasure * 0.5) {
        measures.push(simplify(majority));
        originalMeasures.push(majority);
      } else {
        const c1 = slice[0].chord;
        const c3 = slice[2].chord || slice[1].chord;
        measures.push(`${simplify(c1)} ${simplify(c3)}`);
        originalMeasures.push(`${c1} ${c3}`);
      }
    }
    const sections = [];
    let i3 = 0;
    const getSimilarity = (idx1, idx2, len) => {
      let error = 0;
      for (let k3 = 0; k3 < len; k3++) {
        const m1 = measures[idx1 + k3];
        const m22 = measures[idx2 + k3];
        const sub1 = m1.split(" ");
        const sub2 = m22.split(" ");
        const dist = getChordDistance(sub1[0], sub2[0]);
        error += dist;
      }
      return 1 - error / len;
    };
    const getConsensusValue = (startIdx, len, repeats) => {
      const consensus = [];
      for (let k3 = 0; k3 < len; k3++) {
        const counts = {};
        for (let r3 = 0; r3 < repeats; r3++) {
          const measure = originalMeasures[startIdx + r3 * len + k3];
          counts[measure] = (counts[measure] || 0) + 1;
        }
        const best = Object.entries(counts).sort((a3, b2) => b2[1] - a3[1])[0][0];
        consensus.push(best);
      }
      return consensus.join(" | ");
    };
    while (i3 < measures.length) {
      let bestLen = 0;
      let bestRepeat = 0;
      let bestScore = 0;
      for (const s3 of sections) {
        const len = s3.lengthInMeasures;
        if (len < 4) {
          continue;
        }
        if (i3 + len <= measures.length) {
          const sim = getSimilarity(s3.startMeasureIndex, i3, len);
          if (sim >= 0.7) {
            if (len >= bestLen) {
              let currentRepeat = 1;
              let lookAheadIdx = i3 + len;
              while (lookAheadIdx + len <= measures.length) {
                if (getSimilarity(s3.startMeasureIndex, lookAheadIdx, len) >= 0.7) {
                  currentRepeat++;
                  lookAheadIdx += len;
                } else {
                  break;
                }
              }
              const score = 5 + len + currentRepeat;
              if (score > bestScore) {
                bestLen = len;
                bestRepeat = currentRepeat;
                bestScore = score;
              }
            }
          }
        }
      }
      for (const len of [32, 16, 12, 8, 4]) {
        if (i3 + len <= measures.length) {
          let currentScore = 0;
          let repeat = 1;
          let lookAheadIdx = i3 + len;
          while (lookAheadIdx + len <= measures.length) {
            const sim = getSimilarity(i3, lookAheadIdx, len);
            if (sim >= 0.7) {
              repeat++;
              currentScore += sim;
              lookAheadIdx += len;
            } else {
              break;
            }
          }
          const avgScore = repeat > 1 ? currentScore / (repeat - 1) : 0;
          const weightedScore = avgScore * Math.sqrt(len);
          if (repeat > 1 && weightedScore > bestScore) {
            bestLen = len;
            bestRepeat = repeat;
            bestScore = weightedScore;
          }
        }
      }
      if (bestLen > 0) {
        const value = getConsensusValue(i3, bestLen, bestRepeat);
        const sliceLen = bestLen * bestRepeat;
        let sumEnergy = 0;
        for (let k3 = 0; k3 < sliceLen; k3++) {
          sumEnergy += measureEnergy[i3 + k3];
        }
        const avgEnergy = sumEnergy / sliceLen;
        sections.push({
          value,
          repeat: bestRepeat,
          energy: avgEnergy,
          startMeasureIndex: i3,
          lengthInMeasures: bestLen
        });
        i3 += sliceLen;
      } else {
        const len = Math.min(4, measures.length - i3);
        const value = originalMeasures.slice(i3, i3 + len).join(" | ");
        let sumEnergy = 0;
        for (let k3 = 0; k3 < len; k3++) {
          sumEnergy += measureEnergy[i3 + k3];
        }
        const avgEnergy = sumEnergy / len;
        sections.push({
          value,
          repeat: 1,
          energy: avgEnergy,
          startMeasureIndex: i3,
          lengthInMeasures: len
        });
        i3 += len;
      }
    }
    const consolidated = [];
    const areValuesSimilar = (v1, v22) => {
      const m1 = v1.split(" | ").map(simplify);
      const m22 = v22.split(" | ").map(simplify);
      if (m1.length !== m22.length) {
        return false;
      }
      let error = 0;
      for (let k3 = 0; k3 < m1.length; k3++) {
        error += getChordDistance(m1[k3], m22[k3]);
      }
      return 1 - error / m1.length >= 0.7;
    };
    sections.forEach((s3) => {
      const last = consolidated[consolidated.length - 1];
      if (last && areValuesSimilar(last.value, s3.value)) {
        last.repeat += s3.repeat;
        last.energy = (last.energy + s3.energy) / 2;
      } else {
        consolidated.push(s3);
      }
    });
    let currentLetter = "A";
    const uniqueProgressions = [];
    consolidated.forEach((s3) => {
      let match = uniqueProgressions.find((p3) => areValuesSimilar(p3.value, s3.value));
      if (!match) {
        match = {
          value: s3.value,
          label: `Section ${currentLetter}`
        };
        const isShort = s3.lengthInMeasures <= 8;
        const isFirst = uniqueProgressions.length === 0;
        const isLast = consolidated.indexOf(s3) === consolidated.length - 1;
        const isLowEnergy = s3.energy < 0.4;
        if (isFirst && isShort && isLowEnergy) {
          match.label = "Intro";
        } else if (isLast && isShort && isLowEnergy) {
          match.label = "Outro";
        } else {
          currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
        }
        uniqueProgressions.push(match);
      }
      s3.label = match.label;
    });
    return consolidated.map((s3) => {
      const totalMeasures = s3.value.split("|").length * s3.repeat;
      const startBeat = s3.startMeasureIndex * beatsPerMeasure;
      const loopLengthBeats = s3.lengthInMeasures * beatsPerMeasure;
      return {
        ...s3,
        startBeat,
        loopLengthBeats,
        endBeat: startBeat + loopLengthBeats,
        blockEndBeat: startBeat + totalMeasures * beatsPerMeasure,
        isLoop: true
        // Everything is a loop candidate in this view
      };
    });
  }
  var CHORD_EXTENSION_PATTERN;
  var init_form_extractor = __esm({
    "public/form-extractor.js"() {
      CHORD_EXTENSION_PATTERN = /maj7|maj9|m7|m9|m6|m11|7|6|9|11|13|sus4|sus2|dim|aug|5/g;
    }
  });

  // public/components/AnalyzerModal.jsx
  var AnalyzerModal_exports = {};
  __export(AnalyzerModal_exports, {
    AnalyzerModal: () => AnalyzerModal
  });
  function AnalyzerModal() {
    const dispatch2 = useDispatch();
    const isOpen = useEnsembleState((s3) => s3.playback.modals.analyzer);
    const arrangerKey = useEnsembleState((s3) => s3.arranger.key);
    const bandIntensity = useEnsembleState((s3) => s3.playback.bandIntensity);
    const sessionTimer = useEnsembleState((s3) => s3.playback.sessionTimer);
    const sessionStartTime = useEnsembleState((s3) => s3.playback.sessionStartTime);
    const overlayRef = A2(null);
    y2(() => {
      if (isOpen && overlayRef.current) {
        const focusable = overlayRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable) {
          setTimeout(() => focusable.focus(), 50);
        }
      }
    }, [isOpen]);
    const [view, setView] = d2("idle");
    const [mode, setMode] = d2("chords");
    const [strategyMode, setStrategyMode] = d2("balanced");
    const [forceKey, setForceKey] = d2(false);
    const [stagedChords, setStagedChords] = d2([]);
    const [currentStableChord, setCurrentStableChord] = d2(null);
    const [detectedKey, setDetectedKey] = d2("--");
    const [autoAdd, setAutoAdd] = d2(false);
    const [replaceExisting, setReplaceExisting] = d2(true);
    const [trimRange, setTrimRange] = d2({ start: 0, end: 0 });
    const [audioBuffer, setAudioBuffer] = d2(null);
    const [progress, setProgress] = d2(0);
    const [analysisData, setAnalysisData] = d2(null);
    const [selectedOptionIdx, setSelectedOptionIdx] = d2(0);
    const audioCtxRef = A2(null);
    const streamRef = A2(null);
    const analyzerRef = A2(null);
    const harmonizerRef = A2(null);
    const stabilityRef = A2({ lastChord: null, counter: 0 });
    const autoAddTimerRef = A2(null);
    const canvasRef = A2(null);
    const STABILITY_THRESHOLD = 3;
    const AUTO_ADD_DELAY = 1200;
    function close() {
      dispatch2(ACTIONS.SET_MODAL_OPEN, { modal: "analyzer", open: false });
    }
    function stopLiveListen() {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t3) => t3.stop());
        streamRef.current = null;
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
      analyzerRef.current = null;
      harmonizerRef.current = null;
      if (autoAddTimerRef.current) {
        clearTimeout(autoAddTimerRef.current);
      }
      setCurrentStableChord(null);
      setDetectedKey("--");
      setView("idle");
    }
    y2(() => {
      return () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t3) => t3.stop());
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close();
        }
        if (autoAddTimerRef.current) {
          clearTimeout(autoAddTimerRef.current);
        }
      };
    }, []);
    function addCurrentChord() {
      if (!currentStableChord) {
        return;
      }
      setStagedChords((prev) => {
        const last = prev[prev.length - 1];
        if (last === `${currentStableChord} `) {
          return prev;
        }
        return [...prev, `${currentStableChord} `];
      });
    }
    async function startLiveListen() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast("Live Listen requires a Secure Context (HTTPS or localhost).");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: true
          }
        });
        const { ChordAnalyzerLite: ChordAnalyzerLite2 } = await Promise.resolve().then(() => (init_audio_analyzer_lite(), audio_analyzer_lite_exports));
        analyzerRef.current = new ChordAnalyzerLite2();
        if (mode === "melody") {
          const { Harmonizer: Harmonizer2 } = await Promise.resolve().then(() => (init_melody_harmonizer(), melody_harmonizer_exports));
          harmonizerRef.current = new Harmonizer2();
        }
        streamRef.current = stream;
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioCtxRef.current.destination);
        const targetSamples = Math.floor(audioCtxRef.current.sampleRate * 0.5);
        let chunks = [];
        let totalChunkLen = 0;
        processor.onaudioprocess = (e3) => {
          const input = e3.inputBuffer.getChannelData(0);
          chunks.push(new Float32Array(input));
          totalChunkLen += input.length;
          if (totalChunkLen >= targetSamples) {
            const fullBuffer = new Float32Array(totalChunkLen);
            let offset = 0;
            for (const c3 of chunks) {
              fullBuffer.set(c3, offset);
              offset += c3.length;
            }
            const analysisBuffer = fullBuffer.slice(-targetSamples);
            chunks = [fullBuffer.slice(-Math.floor(targetSamples / 2))];
            totalChunkLen = chunks[0].length;
            processAnalysis(analysisBuffer);
          }
        };
        setView("live");
      } catch (err) {
        console.error("[LiveListen] Error:", err);
        showToast(`Microphone access denied or error: ${err.message}`);
      }
    }
    function processAnalysis(buffer) {
      if (!analyzerRef.current || !audioCtxRef.current) {
        return;
      }
      const sampleRate = audioCtxRef.current.sampleRate;
      let detected = null;
      if (mode === "melody") {
        let sumSq = 0;
        for (let i3 = 0; i3 < buffer.length; i3++) {
          sumSq += buffer[i3] * buffer[i3];
        }
        const rms = Math.sqrt(sumSq / buffer.length);
        if (rms > 0.02) {
          const chroma = analyzerRef.current.calculateChromagram(buffer, sampleRate, {
            minMidi: 48,
            maxMidi: 84
          });
          const keyRes = analyzerRef.current.identifySimpleKey(chroma);
          const keyStr = analyzerRef.current.notes[keyRes.root] + (keyRes.type === "minor" ? "m" : "");
          setDetectedKey(keyStr);
          if (harmonizerRef.current) {
            let effectiveStrategy = strategyMode;
            if (strategyMode === "auto") {
              const elapsedMins = (performance.now() - sessionStartTime) / 6e4;
              const progress2 = sessionTimer > 0 ? Math.min(1, elapsedMins / sessionTimer) : 0;
              if (bandIntensity > 0.8 || progress2 > 0.8) {
                effectiveStrategy = "complex";
              } else if (bandIntensity < 0.4 || progress2 < 0.25) {
                effectiveStrategy = "consonant";
              } else {
                effectiveStrategy = "balanced";
              }
            }
            const pulse = { bpm: 120, downbeatOffset: 0 };
            analyzerRef.current.extractMelody(new Float32Array(buffer), pulse, { keyBias: keyRes }).then((melodyLine) => {
              const options = harmonizerRef.current.generateOptions(
                melodyLine,
                keyStr
              );
              const match = options.find(
                (o3) => o3.type.toLowerCase() === effectiveStrategy.toLowerCase()
              );
              if (match && match.chords.length > 0) {
                const bestChord = match.chords[0].roman;
                if (bestChord === stabilityRef.current.lastChord) {
                  stabilityRef.current.counter++;
                } else {
                  stabilityRef.current.counter = 0;
                  stabilityRef.current.lastChord = bestChord;
                }
                if (stabilityRef.current.counter >= STABILITY_THRESHOLD) {
                  setCurrentStableChord(bestChord);
                }
              }
            });
          }
        }
      } else {
        const chroma = analyzerRef.current.calculateChromagram(buffer, sampleRate, {
          minMidi: 32,
          maxMidi: 80
        });
        detected = analyzerRef.current.identifyChord(chroma);
      }
      if (mode !== "melody" && detected && detected !== "Rest") {
        if (detected === stabilityRef.current.lastChord) {
          stabilityRef.current.counter++;
        } else {
          stabilityRef.current.counter = 0;
          stabilityRef.current.lastChord = detected;
        }
        if (stabilityRef.current.counter >= STABILITY_THRESHOLD) {
          setCurrentStableChord(detected);
        }
      } else if (mode !== "melody") {
        stabilityRef.current.counter = 0;
        stabilityRef.current.lastChord = null;
      }
    }
    async function processFile(file) {
      if (!file) {
        return;
      }
      setView("processing");
      setProgress(10);
      try {
        const arrayBuffer = await file.arrayBuffer();
        Promise.resolve().then(() => (init_state(), state_exports)).then(async ({ playback: playback6 }) => {
          if (!playback6.audio) {
            const { initAudio: initAudio2 } = await Promise.resolve().then(() => (init_engine(), engine_exports));
            initAudio2();
          }
          const decoded = await playback6.audio.decodeAudioData(arrayBuffer);
          setAudioBuffer(decoded);
          setTrimRange({ start: 0, end: Math.floor(decoded.duration) });
          setView("trim");
        });
      } catch (err) {
        console.error("[Analyzer] Load Error:", err);
        showToast("Failed to load audio");
        setView("idle");
      }
    }
    async function handleFileUpload(e3) {
      processFile(e3.target.files[0]);
    }
    function handleDragOver(e3) {
      e3.preventDefault();
      e3.stopPropagation();
    }
    function handleDrop(e3) {
      e3.preventDefault();
      e3.stopPropagation();
      if (e3.dataTransfer.files?.[0]) {
        processFile(e3.dataTransfer.files[0]);
      }
    }
    async function performAnalysis() {
      if (!audioBuffer) {
        return;
      }
      setView("processing");
      setProgress(20);
      try {
        const { ChordAnalyzerLite: ChordAnalyzerLite2 } = await Promise.resolve().then(() => (init_audio_analyzer_lite(), audio_analyzer_lite_exports));
        const analyzer = new ChordAnalyzerLite2();
        const pulse = await analyzer.identifyPulse(audioBuffer, {
          onProgress: (p3) => setProgress(20 + p3 * 0.1)
        });
        if (mode === "melody") {
          const { Harmonizer: Harmonizer2 } = await Promise.resolve().then(() => (init_melody_harmonizer(), melody_harmonizer_exports));
          const harmonizer = new Harmonizer2();
          setProgress(40);
          const melodyLine = await analyzer.extractMelody(audioBuffer, pulse, {
            onProgress: (p3) => setProgress(40 + p3 * 0.4)
          });
          setProgress(80);
          const options = harmonizer.generateOptions(melodyLine, arrangerKey);
          setAnalysisData({
            summary: `Harmonized ${Math.ceil(melodyLine.length / 4)} measures`,
            bpm: Math.round(pulse.bpm),
            options,
            mode: "melody"
          });
        } else {
          const { extractForm: extractForm2 } = await Promise.resolve().then(() => (init_form_extractor(), form_extractor_exports));
          setProgress(40);
          const result = await analyzer.analyze(audioBuffer, {
            startTime: trimRange.start,
            endTime: trimRange.end,
            onProgress: (p3) => setProgress(40 + p3 * 0.4)
          });
          setProgress(80);
          const sections = extractForm2(result.chords, result.pulse);
          setAnalysisData({
            summary: `Detected ${sections.length} sections`,
            bpm: Math.round(result.pulse.bpm),
            sections,
            mode: "chords"
          });
        }
        setView("results");
      } catch (err) {
        console.error("[Analyzer] Analysis Error:", err);
        showToast("Analysis failed");
        setView("trim");
      }
    }
    function importResults() {
      if (!analysisData) {
        return;
      }
      pushHistory();
      let newSections = [];
      if (analysisData.mode === "melody") {
        const opt = analysisData.options[selectedOptionIdx];
        newSections = [
          {
            id: generateId(),
            label: `Harmonized (${opt.type})`,
            value: opt.progression,
            repeat: 1,
            key: "",
            timeSignature: "",
            seamless: false
          }
        ];
      } else {
        newSections = analysisData.sections.map((s3) => ({
          id: generateId(),
          label: s3.label,
          value: s3.value,
          repeat: s3.repeat,
          key: "",
          timeSignature: "",
          seamless: false
        }));
      }
      Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
        if (replaceExisting) {
          arranger6.sections = newSections;
        } else {
          arranger6.sections.push(...newSections);
        }
        arranger6.isDirty = true;
        refreshArrangerUI();
        close();
        showToast(`Imported ${newSections.length} sections.`);
      });
    }
    function captureLiveHistory() {
      if (stagedChords.length === 0) {
        return;
      }
      pushHistory();
      const progressionStr = stagedChords.join("").trim();
      const cleanProgression = progressionStr.endsWith("|") ? progressionStr.slice(0, -1).trim() : progressionStr;
      const newSection = {
        id: generateId(),
        label: "Live Input",
        value: cleanProgression,
        repeat: 1,
        key: "",
        timeSignature: "",
        seamless: false
      };
      Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
        if (replaceExisting) {
          arranger6.sections = [newSection];
        } else {
          arranger6.sections.push(newSection);
        }
        arranger6.isDirty = true;
        refreshArrangerUI();
        close();
        showToast(`Imported sequence.`);
      });
    }
    y2(() => {
      if (view === "trim" && audioBuffer && canvasRef.current) {
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext("2d");
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;
        canvasCtx.fillStyle = "rgba(59, 130, 246, 0.5)";
        canvasCtx.clearRect(0, 0, width, height);
        canvasCtx.strokeStyle = "rgba(255,255,255,0.1)";
        canvasCtx.beginPath();
        canvasCtx.moveTo(0, amp);
        canvasCtx.lineTo(width, amp);
        canvasCtx.stroke();
        for (let i3 = 0; i3 < width; i3++) {
          let min3 = 1, max3 = -1;
          for (let j4 = 0; j4 < step; j4++) {
            const datum = data[i3 * step + j4];
            if (datum < min3) {
              min3 = datum;
            }
            if (datum > max3) {
              max3 = datum;
            }
          }
          canvasCtx.fillRect(i3, (1 + min3) * amp, 1, Math.max(1, (max3 - min3) * amp));
        }
      }
    }, [view, audioBuffer]);
    y2(() => {
      if (autoAdd && currentStableChord) {
        if (autoAddTimerRef.current) {
          clearTimeout(autoAddTimerRef.current);
        }
        autoAddTimerRef.current = setTimeout(addCurrentChord, AUTO_ADD_DELAY);
      }
    }, [currentStableChord, autoAdd]);
    y2(() => {
      function handleKeyDown(e3) {
        if (e3.code === "Space" && isOpen && view === "live") {
          e3.preventDefault();
          addCurrentChord();
        }
      }
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, view, currentStableChord]);
    return /* @__PURE__ */ _(
      "div",
      {
        id: "analyzerOverlay",
        ref: overlayRef,
        class: `modal-overlay ${isOpen ? "active" : ""}`,
        "aria-hidden": !isOpen ? "true" : "false",
        onClick: (e3) => {
          if (e3.target.id === "analyzerOverlay") {
            close();
          }
        }
      },
      /* @__PURE__ */ _(
        "div",
        {
          class: "modal-content analyzer-modal settings-content",
          onClick: (e3) => e3.stopPropagation()
        },
        /* @__PURE__ */ _(
          "button",
          {
            class: "close-modal-btn",
            id: "closeAnalyzerBtn",
            "aria-label": "Close Analyzer",
            onClick: close
          },
          "\u2715"
        ),
        /* @__PURE__ */ _("div", { class: "analyzer-body" }, /* @__PURE__ */ _("h3", null, mode === "melody" ? "Melody Harmonizer" : "Audio Chord Analyzer"), /* @__PURE__ */ _(
          "div",
          {
            class: "analyzer-mode-switch",
            style: "display: flex; gap: 8px; margin: 1rem 0; background: var(--input-bg); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);"
          },
          /* @__PURE__ */ _(
            "label",
            {
              class: `mode-option ${mode === "chords" ? "active" : ""}`,
              style: getModeStyle(mode === "chords")
            },
            /* @__PURE__ */ _(
              "input",
              {
                type: "radio",
                name: "analyzerMode",
                value: "chords",
                checked: mode === "chords",
                onChange: () => setMode("chords"),
                class: "sr-only"
              }
            ),
            /* @__PURE__ */ _("span", { style: "font-size: 1.1rem;" }, "\u{1F3BC}"),
            /* @__PURE__ */ _("span", { style: "font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;" }, "Chords")
          ),
          /* @__PURE__ */ _(
            "label",
            {
              class: `mode-option ${mode === "melody" ? "active" : ""}`,
              style: getModeStyle(mode === "melody")
            },
            /* @__PURE__ */ _(
              "input",
              {
                type: "radio",
                name: "analyzerMode",
                value: "melody",
                checked: mode === "melody",
                onChange: () => setMode("melody"),
                class: "sr-only"
              }
            ),
            /* @__PURE__ */ _("span", { style: "font-size: 1.1rem;" }, "\u{1F3A4}"),
            /* @__PURE__ */ _("span", { style: "font-size: 0.85rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;" }, "Melody")
          )
        ), mode === "melody" && /* @__PURE__ */ _(
          "div",
          {
            class: "harmonizer-strategy-switch",
            style: "display: flex; gap: 4px; margin: 0.5rem 0 1rem 0; background: rgba(0,0,0,0.1); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color); overflow-x: auto;"
          },
          ["Consonant", "Balanced", "Complex", "Auto"].map((s3) => /* @__PURE__ */ _(
            "button",
            {
              key: s3,
              onClick: () => setStrategyMode(s3.toLowerCase()),
              style: {
                flex: 1,
                padding: "6px 8px",
                fontSize: "0.75rem",
                borderRadius: "4px",
                border: "none",
                background: strategyMode === s3.toLowerCase() ? s3 === "Auto" ? "var(--accent-color)" : "var(--border-color)" : "transparent",
                color: strategyMode === s3.toLowerCase() ? "white" : "var(--text-secondary)",
                fontWeight: s3 === "Auto" ? "bold" : "normal",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }
            },
            s3 === "Auto" ? "\u2728 Auto" : s3
          ))
        ), view === "idle" && /* @__PURE__ */ _(k, null, /* @__PURE__ */ _(
          "label",
          {
            class: "analyzer-drop-zone",
            id: "analyzerDropZone",
            for: "analyzerFileInput",
            onDragOver: handleDragOver,
            onDrop: handleDrop
          },
          /* @__PURE__ */ _("div", { class: "drop-zone-content" }, /* @__PURE__ */ _("span", { class: "drop-icon" }, "\u{1F3B5}"), /* @__PURE__ */ _("p", null, "Drag & drop an audio file here"), /* @__PURE__ */ _("p", { class: "drop-subtext" }, "Supports MP3, WAV, M4A, AAC"), /* @__PURE__ */ _(
            "input",
            {
              type: "file",
              id: "analyzerFileInput",
              accept: "audio/*,.m4a,.aac",
              class: "sr-only",
              onChange: handleFileUpload
            }
          ))
        ), /* @__PURE__ */ _(
          "div",
          {
            id: "liveListenContainer",
            style: "display: flex; gap: 1rem; margin-bottom: 1rem;"
          },
          /* @__PURE__ */ _(
            "button",
            {
              id: "liveListenBtn",
              class: "primary-btn",
              onClick: startLiveListen,
              style: "flex: 1; display: flex; align-items: center; justify-content: center; gap: 0.5rem; background: var(--green); color: white; border: none;"
            },
            /* @__PURE__ */ _("span", null, "\u{1F3A4}"),
            " Live Listen"
          )
        )), view === "live" && /* @__PURE__ */ _(
          "div",
          {
            id: "liveListenView",
            class: "live-listen-view",
            style: "display: block; text-align: center; padding: 2rem 1rem; background: rgba(0,0,0,0.2); border-radius: 12px; border: 2px solid var(--green);"
          },
          /* @__PURE__ */ _("div", { class: "pulse-icon" }, "\u{1F3A4}"),
          /* @__PURE__ */ _(
            "div",
            {
              id: "liveKeyContainer",
              style: "margin-bottom: 0.5rem; display: flex; justify-content: center; align-items: center; gap: 1rem;"
            },
            /* @__PURE__ */ _(
              "span",
              {
                id: "liveKeyLabel",
                style: "font-size: 1.1rem; color: var(--accent-color); font-weight: bold;"
              },
              "Key: ",
              formatUnicodeSymbols(detectedKey)
            ),
            /* @__PURE__ */ _("label", { style: "font-size: 0.8rem; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; gap: 0.3rem;" }, /* @__PURE__ */ _(
              "input",
              {
                type: "checkbox",
                checked: forceKey,
                onChange: (e3) => setForceKey(e3.target.checked)
              }
            ), " ", "Lock Key")
          ),
          /* @__PURE__ */ _(
            "h2",
            {
              id: "liveChordDisplay",
              style: "font-size: 4rem; margin: 0.5rem 0 1rem 0; color: var(--green); text-shadow: 0 0 20px rgba(133, 153, 0, 0.4); min-height: 1.2em;"
            },
            currentStableChord ? formatUnicodeSymbols(currentStableChord) : "---"
          ),
          /* @__PURE__ */ _("div", { style: "display: flex; justify-content: center; align-items: center; gap: 1rem; margin-bottom: 1.5rem;" }, /* @__PURE__ */ _(
            "button",
            {
              onClick: addCurrentChord,
              class: "primary-btn",
              style: "background: var(--green); color: white; border: none; padding: 0.8rem 2rem; font-size: 1.1rem;"
            },
            "Add Chord (Space)"
          ), /* @__PURE__ */ _("label", { style: "font-size: 0.9rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.05); padding: 0.5rem 1rem; border-radius: 8px; cursor: pointer;" }, /* @__PURE__ */ _(
            "input",
            {
              type: "checkbox",
              checked: autoAdd,
              onChange: (e3) => setAutoAdd(e3.target.checked)
            }
          ), /* @__PURE__ */ _("span", null, "Auto-Add"))),
          /* @__PURE__ */ _("div", { style: "background: rgba(0,0,0,0.3); border-radius: 8px; padding: 1rem; margin-bottom: 1.5rem; text-align: left;" }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" }, /* @__PURE__ */ _("label", { style: "font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;" }, "Your Progression"), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.5rem;" }, /* @__PURE__ */ _(
            "button",
            {
              onClick: () => setStagedChords((prev) => prev.slice(0, -1)),
              style: "font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;"
            },
            "\u238C Undo"
          ), /* @__PURE__ */ _(
            "button",
            {
              onClick: () => setStagedChords([]),
              style: "font-size: 0.8rem; padding: 0.3rem 0.6rem; background: rgba(255,255,255,0.1); border: none; border-radius: 4px; color: var(--text-color); cursor: pointer;"
            },
            "\u{1F5D1} Clear"
          ))), /* @__PURE__ */ _(
            "div",
            {
              id: "liveStagedDisplay",
              style: "font-family: monospace; font-size: 1.2rem; color: white; min-height: 1.5em; word-break: break-all; line-height: 1.6;"
            },
            stagedChords.length > 0 ? stagedChords.join("") : /* @__PURE__ */ _("span", { style: "color: var(--text-muted); font-style: italic;" }, "Start playing to build a sequence...")
          )),
          /* @__PURE__ */ _("div", { style: "display: flex; gap: 1rem; margin-bottom: 1rem;" }, /* @__PURE__ */ _(
            "button",
            {
              onClick: captureLiveHistory,
              class: "primary-btn",
              style: `flex: 2; background: var(--accent-color); color: white; border: none; ${stagedChords.length === 0 ? "opacity: 0.5; pointer-events: none;" : ""}`
            },
            "Import Sequence"
          ), /* @__PURE__ */ _(
            "button",
            {
              onClick: stopLiveListen,
              class: "primary-btn",
              style: "flex: 1; background: var(--error-color); color: white; border: none;"
            },
            "Stop"
          ))
        ), view === "trim" && /* @__PURE__ */ _(
          "div",
          {
            id: "analyzerTrimView",
            class: "analyzer-trim-view",
            style: "display: block;"
          },
          /* @__PURE__ */ _("div", { class: "waveform-container" }, /* @__PURE__ */ _("canvas", { ref: canvasRef, id: "analyzerWaveformCanvas" }), /* @__PURE__ */ _("div", { id: "analyzerSelectionOverlay", class: "waveform-selection" })),
          /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;" }, /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { class: "setting-label" }, "Start (sec)"), /* @__PURE__ */ _(
            "input",
            {
              type: "number",
              value: trimRange.start,
              min: "0",
              max: trimRange.end - 1,
              step: "1",
              onInput: (e3) => setTrimRange((prev) => ({
                ...prev,
                start: parseInt(e3.target.value, 10)
              })),
              style: "width: 100%;"
            }
          )), /* @__PURE__ */ _("div", { class: "setting-item" }, /* @__PURE__ */ _("label", { class: "setting-label" }, "End (sec)"), /* @__PURE__ */ _(
            "input",
            {
              type: "number",
              value: trimRange.end,
              min: trimRange.start + 1,
              max: Math.floor(audioBuffer?.duration || 0),
              step: "1",
              onInput: (e3) => setTrimRange((prev) => ({
                ...prev,
                end: parseInt(e3.target.value, 10)
              })),
              style: "width: 100%;"
            }
          ))),
          /* @__PURE__ */ _(
            "p",
            {
              id: "analyzerDurationLabel",
              style: "font-size: 0.75rem; color: var(--text-muted); margin-bottom: 1rem;"
            },
            "Duration: ",
            (trimRange.end - trimRange.start).toFixed(1),
            "s"
          ),
          /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text-secondary); cursor: pointer;" }, /* @__PURE__ */ _(
            "input",
            {
              type: "checkbox",
              checked: forceKey,
              onChange: (e3) => setForceKey(e3.target.checked)
            }
          ), /* @__PURE__ */ _("span", null, "Use Arranger Key (", arrangerKey, ")"))),
          /* @__PURE__ */ _(
            "button",
            {
              onClick: performAnalysis,
              class: "primary-btn",
              style: "width: 100%;"
            },
            "Analyze Selection"
          )
        ), view === "processing" && /* @__PURE__ */ _(
          "div",
          {
            id: "analyzerProcessing",
            class: "analyzer-processing",
            style: "display: block;"
          },
          /* @__PURE__ */ _("div", { class: "spinner" }),
          /* @__PURE__ */ _("p", null, "Ensemble is listening..."),
          /* @__PURE__ */ _("div", { class: "progress-bar-container" }, /* @__PURE__ */ _(
            "div",
            {
              id: "analyzerProgressBar",
              class: "progress-bar",
              style: `width: ${progress}%`
            }
          ))
        ), view === "results" && analysisData && /* @__PURE__ */ _("div", { id: "analyzerResults", class: "analyzer-results", style: "display: block;" }, /* @__PURE__ */ _("h3", null, "Analysis Complete"), /* @__PURE__ */ _("p", { style: "font-size: 0.9rem; color: var(--text-muted); margin-bottom: 1rem;" }, analysisData.summary), /* @__PURE__ */ _("div", { id: "bpmCandidateContainer", style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _(
          "label",
          {
            class: "setting-label",
            style: "display: block; margin-bottom: 0.5rem;"
          },
          "Detected Tempo:"
        ), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.5rem; align-items: center;" }, /* @__PURE__ */ _("span", { style: "font-size: 1.2rem; font-weight: bold; color: var(--accent-color);" }, analysisData.bpm, " BPM")), /* @__PURE__ */ _("div", { style: "margin-top: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px; display: flex; align-items: center; justify-content: space-between;" }, /* @__PURE__ */ _("span", { style: "font-size: 0.85rem;" }, "Sync project BPM"), /* @__PURE__ */ _("input", { type: "checkbox", checked: true }))), /* @__PURE__ */ _("div", { class: "suggested-sections-container" }, analysisData.mode === "melody" ? /* @__PURE__ */ _("div", { class: "harmonizer-options-list" }, /* @__PURE__ */ _("label", { class: "setting-label" }, "Select Harmonization Strategy:"), analysisData.options.map((opt, idx) => /* @__PURE__ */ _(
          "div",
          {
            key: idx,
            class: `harmonizer-option-card ${selectedOptionIdx === idx ? "active" : ""}`,
            onClick: () => setSelectedOptionIdx(idx),
            style: {
              padding: "12px",
              margin: "8px 0",
              borderRadius: "8px",
              background: selectedOptionIdx === idx ? "rgba(59, 130, 246, 0.2)" : "rgba(255,255,255,0.05)",
              border: `2px solid ${selectedOptionIdx === idx ? "var(--accent-color)" : "transparent"}`,
              cursor: "pointer",
              transition: "all 0.2s"
            }
          },
          /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; align-items: flex-start;" }, /* @__PURE__ */ _("div", { style: "flex: 1;" }, /* @__PURE__ */ _("div", { style: "font-weight: bold; font-size: 1rem; color: var(--accent-color);" }, opt.type), /* @__PURE__ */ _("div", { style: "font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;" }, opt.description), /* @__PURE__ */ _("div", { style: "font-family: monospace; font-size: 1.1rem; letter-spacing: 0.05em; color: white;" }, formatUnicodeSymbols(opt.progression)), selectedOptionIdx === idx && opt.chords && /* @__PURE__ */ _("div", { style: "margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; flex-wrap: wrap; gap: 4px;" }, opt.chords.map((c3, cIdx) => /* @__PURE__ */ _(
            "div",
            {
              key: cIdx,
              style: "text-align: center; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; min-width: 60px;"
            },
            /* @__PURE__ */ _("div", { style: "font-size: 0.6rem; text-transform: uppercase; color: var(--text-muted);" }, c3.structuralState.slice(
              0,
              4
            )),
            /* @__PURE__ */ _("div", { style: "font-weight: bold; font-size: 0.85rem;" }, formatUnicodeSymbols(
              c3.roman
            ))
          )))), selectedOptionIdx === idx && /* @__PURE__ */ _("div", { style: "color: var(--accent-color); font-size: 1.2rem;" }, "\u2713"))
        ))) : analysisData.sections.map((s3, idx) => /* @__PURE__ */ _("div", { key: idx, class: "section-preview-chip" }, /* @__PURE__ */ _("strong", null, s3.label, ":"), " ", s3.value))), /* @__PURE__ */ _(
          "div",
          {
            class: "analyzer-actions",
            style: "margin-top: 1.5rem; border-top: 1px solid var(--border-color); padding-top: 1rem;"
          },
          /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; margin-bottom: 1rem; cursor: pointer;" }, /* @__PURE__ */ _(
            "input",
            {
              type: "checkbox",
              checked: replaceExisting,
              onChange: (e3) => setReplaceExisting(e3.target.checked)
            }
          ), /* @__PURE__ */ _("span", null, "Replace existing arrangement")),
          /* @__PURE__ */ _(
            "button",
            {
              onClick: importResults,
              class: "primary-btn",
              style: "width: 100%;"
            },
            "Import Arrangement"
          )
        )))
      )
    );
  }
  function getModeStyle(isActive) {
    return {
      flex: 1,
      textAlign: "center",
      padding: "10px",
      cursor: "pointer",
      borderRadius: "6px",
      transition: "all 0.2s",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      background: isActive ? "var(--accent-color)" : "transparent",
      color: isActive ? "white" : "var(--text-secondary)",
      boxShadow: isActive ? "0 2px 4px rgba(0,0,0,0.2)" : "none"
    };
  }
  var init_AnalyzerModal = __esm({
    "public/components/AnalyzerModal.jsx"() {
      init_preact_module();
      init_compat_module();
      init_hooks_module();
      init_arranger_controller();
      init_history();
      init_types();
      init_ui();
      init_ui_bridge();
      init_utils();
    }
  });

  // public/main.js
  init_arranger_controller();
  init_chords();
  init_engine();
  init_scheduler_core();
  init_instrument_controller();
  init_pwa();
  init_state();

  // public/state-hydration.js
  init_app_controller();
  init_config();
  init_presets();
  init_state();
  init_types();
  init_utils();
  var clamp = (val, min3, max3, defaultVal) => {
    const num = parseFloat(val);
    if (Number.isNaN(num)) {
      return defaultVal;
    }
    return Math.min(Math.max(min3, num), max3);
  };
  function validateSections(sections) {
    if (!Array.isArray(sections)) {
      return [];
    }
    const safeSections = sections.slice(0, 500);
    return safeSections.map((s3, i3) => {
      if (!s3 || typeof s3 !== "object") {
        return {
          id: generateId(),
          label: `Section ${i3 + 1}`,
          value: "",
          key: "",
          repeat: 1,
          timeSignature: "",
          seamless: false
        };
      }
      let safeLabel = escapeHTML(s3.label || `Section ${i3 + 1}`);
      if (safeLabel.length > 100) {
        safeLabel = safeLabel.substring(0, 100);
      }
      let safeValue = typeof s3.value === "string" ? s3.value : "";
      if (safeValue.length > 1e3) {
        safeValue = safeValue.substring(0, 1e3);
      }
      safeValue = stripDangerousChars(safeValue);
      let safeKey = "";
      if (s3.key && typeof s3.key === "string") {
        const normKey = normalizeKey(s3.key);
        if (KEY_ORDER.includes(normKey)) {
          safeKey = normKey;
        }
      }
      return {
        id: s3.id || generateId(),
        label: safeLabel,
        value: safeValue,
        key: safeKey,
        repeat: Math.min(Math.max(1, parseInt(s3.repeat, 10) || 1), 64),
        timeSignature: typeof s3.timeSignature === "string" && TIME_SIGNATURES[s3.timeSignature] ? s3.timeSignature : "",
        seamless: !!s3.seamless
      };
    });
  }
  function hydrateState() {
    const { playback: playback6, chords: chords2, bass: bass2, soloist: soloist2, harmony: harmony2, groove: groove2, arranger: arranger6, vizState: vizState2 } = getState();
    const savedState = storage.get("currentState");
    if (savedState?.sections) {
      const validatedSections = validateSections(savedState.sections);
      let validatedKey = "C";
      if (savedState.key) {
        const normKey = normalizeKey(savedState.key);
        if (KEY_ORDER.includes(normKey)) {
          validatedKey = normKey;
        }
      }
      let validatedTS = "4/4";
      if (savedState.timeSignature && TIME_SIGNATURES[savedState.timeSignature]) {
        validatedTS = savedState.timeSignature;
      }
      const validNotations = ["roman", "name", "nns"];
      const validatedNotation = validNotations.includes(savedState.notation) ? savedState.notation : "roman";
      Object.assign(arranger6, {
        sections: validatedSections,
        key: validatedKey,
        timeSignature: validatedTS,
        isMinor: savedState.isMinor || false,
        notation: validatedNotation,
        lastChordPreset: savedState.lastChordPreset || "Pop (Standard)"
      });
      Object.assign(playback6, {
        theme: savedState.theme || "auto",
        bpm: clamp(savedState.bpm, 20, 300, 100),
        bandIntensity: clamp(savedState.bandIntensity, 0, 1, 0.35),
        complexity: clamp(savedState.complexity, 0, 1, 0.3),
        autoIntensity: true,
        metronome: false,
        visualFlash: savedState.visualFlash !== void 0 ? savedState.visualFlash : false,
        haptic: savedState.haptic !== void 0 ? savedState.haptic : false,
        countIn: savedState.countIn !== void 0 ? savedState.countIn : true,
        sessionTimer: clamp(savedState.sessionTimer, 0, 60, 5),
        songMode: savedState.songMode !== void 0 ? !!savedState.songMode : true,
        applyPresetSettings: savedState.applyPresetSettings !== void 0 ? savedState.applyPresetSettings : false,
        stopAtEnd: false
      });
      vizState2.enabled = savedState.vizEnabled !== void 0 ? savedState.vizEnabled : false;
      if (savedState.chords) {
        Object.assign(chords2, {
          enabled: savedState.chords.enabled !== void 0 ? savedState.chords.enabled : true,
          style: savedState.chords.style || "smart",
          instrument: "Piano",
          octave: clamp(savedState.chords.octave, 0, 127, 48),
          // Reasonable MIDI range
          density: savedState.chords.density,
          volume: clamp(savedState.chords.volume, 0, 1, 0.5),
          reverb: clamp(savedState.chords.reverb, 0, 1, 0.3),
          pianoRoots: savedState.chords.pianoRoots || false,
          activeTab: savedState.chords.activeTab || "smart"
        });
      }
      if (savedState.bass) {
        Object.assign(bass2, {
          enabled: savedState.bass.enabled !== void 0 ? savedState.bass.enabled : true,
          style: savedState.bass.style || "smart",
          octave: clamp(savedState.bass.octave, 0, 127, 36),
          volume: clamp(savedState.bass.volume, 0, 1, 0.45),
          reverb: clamp(savedState.bass.reverb, 0, 1, 0.05),
          activeTab: savedState.bass.activeTab || "smart"
        });
      }
      if (savedState.soloist) {
        Object.assign(soloist2, {
          enabled: savedState.soloist.enabled !== void 0 ? savedState.soloist.enabled : false,
          style: savedState.soloist.style || "smart",
          preset: savedState.soloist.preset || "trumpet",
          octave: savedState.soloist.octave === 77 || savedState.soloist.octave === 67 || savedState.soloist.octave === void 0 ? 72 : clamp(savedState.soloist.octave, 0, 127, 72),
          volume: clamp(savedState.soloist.volume, 0, 1, 0.5),
          reverb: clamp(savedState.soloist.reverb, 0, 1, 0.6),
          mode: savedState.soloist.mode ? savedState.soloist.mode : savedState.soloist.doubleStops ? "guitar" : "monophonic",
          activeTab: savedState.soloist.activeTab || "smart",
          leadSheetMelody: savedState.soloist.leadSheetMelody || []
        });
      }
      if (savedState.harmony) {
        Object.assign(harmony2, {
          enabled: savedState.harmony.enabled !== void 0 ? savedState.harmony.enabled : false,
          style: savedState.harmony.style || "smart",
          octave: clamp(savedState.harmony.octave, 0, 127, 60),
          volume: clamp(savedState.harmony.volume, 0, 1, 0.4),
          reverb: clamp(savedState.harmony.reverb, 0, 1, 0.4),
          complexity: clamp(savedState.harmony.complexity, 0, 1, 0.5),
          activeTab: savedState.harmony.activeTab || "smart"
        });
      }
      if (savedState.groove) {
        Object.assign(groove2, {
          enabled: savedState.groove.enabled !== void 0 ? savedState.groove.enabled : true,
          volume: clamp(savedState.groove.volume, 0, 1, 0.5),
          reverb: clamp(savedState.groove.reverb, 0, 1, 0.2),
          swing: clamp(savedState.groove.swing, 0, 100, 0),
          swingSub: savedState.groove.swingSub,
          measures: clamp(savedState.groove.measures, 1, 8, 1),
          humanize: clamp(savedState.groove.humanize, 0, 100, 20),
          followPlayback: savedState.groove.followPlayback !== void 0 ? savedState.groove.followPlayback : savedState.groove.autoFollow !== void 0 ? savedState.groove.autoFollow : true,
          lastDrumPreset: savedState.groove.lastDrumPreset || "Basic Rock",
          genreFeel: savedState.groove.genreFeel && Object.values(SMART_GENRES).some((g4) => g4.feel === savedState.groove.genreFeel) ? savedState.groove.genreFeel : "Rock",
          larsMode: savedState.groove.larsMode || false,
          larsIntensity: clamp(savedState.groove.larsIntensity, 0, 1, 0.5),
          lastSmartGenre: savedState.groove.lastSmartGenre || Object.keys(SMART_GENRES).find(
            (k3) => SMART_GENRES[k3].feel === savedState.groove.genreFeel
          ) || "Rock",
          activeTab: savedState.groove.activeTab || "smart",
          mobileTab: savedState.groove.mobileTab || "chords",
          creativity: savedState.groove.creativity !== void 0 ? !!savedState.groove.creativity : false,
          sectionSeedMap: savedState.groove.sectionSeedMap || {},
          currentMeasure: 0
        });
        if (savedState.groove.pattern && savedState.groove.pattern.length > 0) {
          savedState.groove.pattern.forEach((savedInst) => {
            const inst = groove2.instruments.find((i3) => i3.name === savedInst.name);
            if (inst) {
              inst.steps.fill(0);
              savedInst.steps.forEach((v3, i3) => {
                if (i3 < 128) {
                  inst.steps[i3] = v3;
                }
              });
            }
          });
        }
      }
      if (savedState.midi) {
        dispatch(ACTIONS.SET_MIDI_CONFIG, {
          enabled: savedState.midi.enabled || false,
          selectedOutputId: savedState.midi.selectedOutputId || null,
          chordsChannel: savedState.midi.chordsChannel || 1,
          bassChannel: savedState.midi.bassChannel || 2,
          soloistChannel: savedState.midi.soloistChannel || 3,
          harmonyChannel: savedState.midi.harmonyChannel || 4,
          drumsChannel: savedState.midi.drumsChannel || 10,
          latency: savedState.midi.latency || 0,
          muteLocal: savedState.midi.muteLocal !== void 0 ? savedState.midi.muteLocal : true,
          chordsOctave: savedState.midi.chordsOctave || 0,
          bassOctave: savedState.midi.bassOctave || 0,
          soloistOctave: savedState.midi.soloistOctave || 0,
          drumsOctave: savedState.midi.drumsOctave || 0,
          velocitySensitivity: savedState.midi.velocitySensitivity !== void 0 ? savedState.midi.velocitySensitivity : 1
        });
        if (savedState.midi.enabled) {
          Promise.resolve().then(() => (init_midi_controller(), midi_controller_exports)).then(({ initMIDI: initMIDI2 }) => {
            initMIDI2();
          });
        }
      }
      applyTheme(playback6.theme);
    } else {
      applyTheme("auto");
    }
    dispatch("HYDRATE");
  }
  function loadFromUrl() {
    const { arranger: arranger6, groove: groove2 } = getState();
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    if (params.get("s")) {
      arranger6.sections = decompressSections(params.get("s"));
      hasParams = true;
    } else if (params.get("prog")) {
      let prog = params.get("prog");
      if (prog.length > 1e3) {
        prog = prog.substring(0, 1e3);
      }
      prog = stripDangerousChars(prog);
      arranger6.sections = [{ id: generateId(), label: "Main", value: prog }];
      hasParams = true;
    }
    if (hasParams) {
      clearChordPresetHighlight2();
    }
    if (params.get("key")) {
      const rawKey = normalizeKey(params.get("key"));
      if (KEY_ORDER.includes(rawKey)) {
        arranger6.key = rawKey;
      }
    }
    if (params.get("ts")) {
      const ts = params.get("ts");
      if (TIME_SIGNATURES[ts]) {
        arranger6.timeSignature = ts;
      }
    }
    if (params.get("bpm")) {
      const bpm = parseFloat(params.get("bpm"));
      if (!Number.isNaN(bpm) && bpm >= 20 && bpm <= 300) {
        dispatch(ACTIONS.SET_BPM, bpm);
      }
    }
    if (params.get("style")) {
      const style = params.get("style");
      if (CHORD_STYLES.some((s3) => s3.id === style)) {
        dispatch(ACTIONS.SET_STYLE, { module: "chords", style });
      }
    }
    if (params.get("genre")) {
      const genre = params.get("genre");
      if (SMART_GENRES[genre]) {
        groove2.lastSmartGenre = genre;
        groove2.genreFeel = genre;
      }
    }
    if (params.get("int")) {
      const val = parseFloat(params.get("int"));
      if (!Number.isNaN(val)) {
        dispatch(ACTIONS.SET_BAND_INTENSITY, Math.max(0, Math.min(1, val)));
      }
    }
    if (params.get("comp")) {
      const val = parseFloat(params.get("comp"));
      if (!Number.isNaN(val)) {
        dispatch(ACTIONS.SET_COMPLEXITY, Math.max(0, Math.min(1, val)));
      }
    }
    if (params.get("notation")) {
      const not = params.get("notation");
      if (["roman", "name", "nns"].includes(not)) {
        arranger6.notation = not;
      }
    }
  }
  function clearChordPresetHighlight2() {
  }

  // public/ui-root.jsx
  init_preact_module();

  // public/App.jsx
  init_preact_module();
  init_hooks_module();
  init_Arranger();

  // public/components/ChordVisualizer.jsx
  init_preact_module();
  init_compat_module();
  init_hooks_module();
  init_config();
  init_ui_bridge();
  init_utils();
  var ChordCard = M2(
    ({ chord, isActive, totalMeasures, isMaximized, notation, leadSheetMelody, soloistStyle }) => {
      const disp = chord.display ? chord.display[notation] : null;
      const cardRef = A2(null);
      y2(() => {
        if (!cardRef.current) {
          return;
        }
        const card = cardRef.current;
        const charCount = disp ? disp.root.length + disp.suffix.length + (disp.bass ? disp.bass.length + 1 : 0) : chord.absName?.length || 0;
        let scale = 1;
        if (isMaximized) {
          if (totalMeasures > 24) {
            scale *= 0.9;
          }
          if (totalMeasures > 32) {
            scale *= 0.8;
          }
          if (totalMeasures > 48) {
            scale *= 0.7;
          }
        }
        if (charCount > 7) {
          scale *= 0.9;
        }
        if (charCount > 10) {
          scale *= 0.8;
        }
        if (scale < 1) {
          card.style.setProperty("--font-scale", scale.toFixed(2));
        } else {
          card.style.removeProperty("--font-scale");
        }
      }, [disp, chord.absName, isMaximized, totalMeasures]);
      const handleClick = (e3) => {
        e3.stopPropagation();
        if (window.previewChord) {
          window.previewChord(chord.globalIndex);
        }
      };
      const classNames = [
        "chord-card",
        chord.isMinor ? "minor" : "",
        chord.quality === "aug" || chord.quality === "augmaj7" ? "aug" : "",
        isActive ? "active" : ""
      ].filter(Boolean).join(" ");
      const sparklineNotes = T2(() => {
        if (soloistStyle !== "lead_sheet" || !leadSheetMelody || leadSheetMelody.length === 0 || chord.start === void 0) {
          return [];
        }
        return leadSheetMelody.filter(
          (n2) => n2.globalStep >= chord.start && n2.globalStep < chord.end
        );
      }, [leadSheetMelody, soloistStyle, chord.start, chord.end]);
      return /* @__PURE__ */ _("div", { className: classNames, ref: cardRef, onClick: handleClick }, disp ? /* @__PURE__ */ _(k, null, /* @__PURE__ */ _("span", { className: "root" }, formatUnicodeSymbols(disp.root)), /* @__PURE__ */ _("span", { className: "suffix" }, formatUnicodeSymbols(disp.suffix)), disp.bass && /* @__PURE__ */ _("span", { className: "bass-note" }, "/", formatUnicodeSymbols(disp.bass))) : formatUnicodeSymbols(chord.absName) || "...", sparklineNotes.length > 0 && /* @__PURE__ */ _("div", { className: "sparkline-container" }, sparklineNotes.map((n2, i3) => {
        const height = Math.min(100, Math.max(15, (n2.midi - 48) / 36 * 100));
        return /* @__PURE__ */ _(
          "div",
          {
            key: i3,
            className: "sparkline-bar",
            style: `height: ${height}%`
          }
        );
      })));
    }
  );
  function ChordVisualizer() {
    const {
      progression,
      timeSignature,
      lastActiveChordIndex,
      sectionsState,
      notation,
      leadSheetMelody,
      soloistStyle
    } = useEnsembleState((s3) => ({
      progression: s3.arranger.progression,
      timeSignature: s3.arranger.timeSignature,
      lastActiveChordIndex: s3.chords.lastActiveChordIndex,
      sectionsState: s3.arranger.sections,
      notation: s3.arranger.notation || "roman",
      leadSheetMelody: s3.soloist.leadSheetMelody,
      soloistStyle: s3.soloist.style
    }));
    const isMaximized = document.body.classList.contains("chord-maximized");
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES["4/4"];
    const groupedSections = T2(() => {
      const blocks = [];
      let currentBlock = null;
      let currentMeasure = null;
      let currentMeasureBeats = 0;
      let currentStep = 0;
      progression.forEach((chord, i3) => {
        const sectionData = sectionsState.find((s3) => s3.id === chord.sectionId);
        const isSeamless = sectionData?.seamless;
        const isNewSection = !currentBlock || currentBlock.lastSectionId !== chord.sectionId;
        if (isNewSection) {
          if (!currentBlock || !isSeamless) {
            currentBlock = {
              id: chord.sectionId,
              label: chord.sectionLabel,
              measures: [],
              lastSectionId: chord.sectionId
            };
            blocks.push(currentBlock);
            currentMeasure = null;
            currentMeasureBeats = 0;
          } else {
            currentBlock.lastSectionId = chord.sectionId;
          }
        }
        if (isNewSection && currentMeasureBeats > 0) {
          currentMeasure = null;
          currentMeasureBeats = 0;
        }
        if (!currentMeasure || currentMeasureBeats >= ts.beats) {
          currentMeasure = {
            chords: [],
            // Tag measure if it starts a seamless section
            sectionLabel: isNewSection && isSeamless ? chord.sectionLabel : null
          };
          currentBlock.measures.push(currentMeasure);
          currentMeasureBeats = 0;
        }
        const durationSteps = Math.round(chord.beats * ts.stepsPerBeat);
        currentMeasure.chords.push({
          ...chord,
          globalIndex: i3,
          start: currentStep,
          end: currentStep + durationSteps
        });
        currentStep += durationSteps;
        currentMeasureBeats += chord.beats;
      });
      return blocks;
    }, [progression, ts, sectionsState]);
    const totalMeasures = T2(
      () => groupedSections.reduce((acc, s3) => acc + s3.measures.length, 0),
      [groupedSections]
    );
    y2(() => {
      const container = document.getElementById("chordVisualizer");
      if (!container) {
        return;
      }
      container.dataset.totalMeasures = totalMeasures;
      if (isMaximized) {
        return;
      }
      const activeCard = container.querySelector(".chord-card.active");
      if (!activeCard) {
        return;
      }
      const containerRect = container.getBoundingClientRect();
      const cardRect = activeCard.getBoundingClientRect();
      const scrollThreshold = containerRect.top + containerRect.height * 0.7;
      if (cardRect.bottom > scrollThreshold || cardRect.top < containerRect.top) {
        const targetScrollTop = container.scrollTop + (cardRect.top - containerRect.top) - containerRect.height * 0.2;
        container.scrollTo({
          top: targetScrollTop,
          behavior: "smooth"
        });
      }
    }, [lastActiveChordIndex, isMaximized, totalMeasures]);
    return /* @__PURE__ */ _(k, null, groupedSections.map((section) => /* @__PURE__ */ _(
      "div",
      {
        key: section.id,
        className: "section-block",
        onClick: () => {
          const detail = { detail: { sectionId: section.id } };
          document.dispatchEvent(new CustomEvent("open-editor", detail));
        }
      },
      /* @__PURE__ */ _("div", { className: "section-block-header" }, formatUnicodeSymbols(section.label)),
      /* @__PURE__ */ _("div", { className: "section-block-content" }, section.measures.map((measure, mIdx) => /* @__PURE__ */ _("div", { key: mIdx, className: "measure-box" }, measure.sectionLabel && /* @__PURE__ */ _("div", { className: "key-label" }, formatUnicodeSymbols(measure.sectionLabel)), measure.chords.map((chord) => /* @__PURE__ */ _(
        ChordCard,
        {
          key: chord.globalIndex,
          chord,
          isActive: chord.globalIndex === lastActiveChordIndex,
          totalMeasures,
          isMaximized,
          notation,
          leadSheetMelody,
          soloistStyle
        }
      )))))
    )));
  }

  // public/components/GlobalShortcuts.jsx
  init_hooks_module();
  init_instrument_controller();
  init_persistence();
  init_state();
  init_types();
  function GlobalShortcuts() {
    y2(() => {
      const handleKeyDown = (e3) => {
        const { playback: playback6, groove: groove2 } = getState();
        const isTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(e3.target.tagName) || e3.target.isContentEditable;
        const anyModalOpen = Object.values(playback6.modals).some((isOpen) => isOpen);
        if (e3.key === " " && !isTyping && !anyModalOpen) {
          e3.preventDefault();
          dispatch(ACTIONS.TOGGLE_PLAY, { viz: playback6.viz });
        }
        if (e3.key.toLowerCase() === "e" && !isTyping && !e3.metaKey && !e3.ctrlKey) {
          e3.preventDefault();
          const isOpen = playback6.modals.editor;
          dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: !isOpen });
        }
        if (e3.key.toLowerCase() === "s" && !isTyping && !e3.metaKey && !e3.ctrlKey) {
          e3.preventDefault();
          Promise.resolve().then(() => (init_instrument_controller(), instrument_controller_exports)).then(({ togglePower: togglePower2 }) => {
            togglePower2("soloist");
          });
        }
        if (["1", "2", "3", "4", "5"].includes(e3.key) && !isTyping) {
          const btns = document.querySelectorAll(".mobile-tabs-nav .tab-btn");
          const btn = btns[parseInt(e3.key, 10) - 1];
          if (btn) {
            btn.click();
          }
        }
        if (e3.key === "[" && !isTyping) {
          switchMeasure((groove2.currentMeasure - 1 + groove2.measures) % groove2.measures);
        }
        if (e3.key === "]" && !isTyping) {
          switchMeasure((groove2.currentMeasure + 1) % groove2.measures);
        }
        if (e3.key === "Escape") {
          if (document.body.classList.contains("chord-maximized")) {
            document.body.classList.remove("chord-maximized");
            const btn = document.getElementById("maximizeChordBtn");
            if (btn) {
              btn.textContent = "\u26F6";
            }
          }
          Object.keys(playback6.modals).forEach((key) => {
            if (playback6.modals[key]) {
              dispatch(ACTIONS.SET_MODAL_OPEN, { modal: key, open: false });
            }
          });
        }
      };
      const handleOpenEditor = (e3) => {
        const { sectionId } = e3.detail || {};
        if (sectionId) {
          Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
            arranger6.lastInteractedSectionId = sectionId;
          });
        }
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: true });
      };
      window.addEventListener("keydown", handleKeyDown);
      document.addEventListener("open-editor", handleOpenEditor);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("open-editor", handleOpenEditor);
      };
    }, []);
    return null;
  }

  // public/components/GroovePanel.jsx
  init_preact_module();
  init_hooks_module();
  init_instrument_controller();
  init_persistence();
  init_state();
  init_types();
  init_ui_bridge();
  init_worker_client();

  // public/components/InstrumentSettings.jsx
  init_preact_module();
  init_state();
  init_types();
  init_ui_bridge();
  init_config();
  init_persistence();
  var { playback: playback2 } = getState();
  function InstrumentSettings({ module }) {
    const state2 = useEnsembleState((s3) => {
      const key = module === "groove" ? "groove" : module;
      return s3[key];
    });
    if (!state2) {
      return null;
    }
    const moduleName = module === "groove" ? "drum" : module === "chords" ? "chord" : module === "harmony" ? "harmony" : module;
    const updateAudio = (type, val) => {
      const numVal = parseFloat(val);
      const isReverb = type === "reverb";
      if (state2) {
        dispatch(isReverb ? ACTIONS.SET_REVERB : ACTIONS.SET_VOLUME, {
          module,
          value: numVal
        });
        saveCurrentState();
      }
      const internalName = module === "groove" ? "drums" : module === "harmony" ? "harmonies" : module;
      const gainKey = isReverb ? `${internalName}Reverb` : `${internalName}Gain`;
      const multiplier = isReverb ? 1 : MIXER_GAIN_MULTIPLIERS[internalName] || 1;
      if (playback2[gainKey] && playback2.audio) {
        const target = Math.max(1e-4, numVal * multiplier);
        playback2[gainKey].gain.cancelScheduledValues(playback2.audio.currentTime);
        playback2[gainKey].gain.setValueAtTime(
          playback2[gainKey].gain.value,
          playback2.audio.currentTime
        );
        playback2[gainKey].gain.exponentialRampToValueAtTime(
          target,
          playback2.audio.currentTime + 0.04
        );
      }
    };
    return /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: 1fr 1fr; gap: 2rem;" }, /* @__PURE__ */ _("div", null, /* @__PURE__ */ _("h4", { style: "margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);" }, module === "groove" ? "Feel & Actions" : module === "chords" || module === "harmony" ? "Voicing" : "Instrument"), module === "chords" && /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, "Density"), /* @__PURE__ */ _(
      "select",
      {
        id: "densitySelect",
        value: state2.density || "standard",
        onChange: (e3) => {
          dispatch(ACTIONS.SET_CHORD_DENSITY, e3.target.value);
          saveCurrentState();
        },
        "aria-label": "Voicing Density"
      },
      /* @__PURE__ */ _("option", { value: "thin" }, "Thin (3 notes)"),
      /* @__PURE__ */ _("option", { value: "standard" }, "Standard (4 notes)"),
      /* @__PURE__ */ _("option", { value: "rich" }, "Rich (5+ notes)")
    )), module === "harmony" && /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Complexity"), /* @__PURE__ */ _(
      "span",
      {
        id: "harmonyComplexityValue",
        style: "color: var(--accent-color); font-weight: bold;"
      },
      Math.round((state2.complexity || 0.5) * 100),
      "%"
    )), /* @__PURE__ */ _(
      "input",
      {
        id: "harmonyComplexity",
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: state2.complexity || 0.5,
        onInput: (e3) => {
          const val = parseFloat(e3.target.value);
          dispatch(ACTIONS.SET_PARAM, {
            module: "harmony",
            param: "complexity",
            value: val
          });
          saveCurrentState();
        },
        "aria-label": "Harmony Complexity",
        "aria-valuetext": `${Math.round((state2.complexity || 0.5) * 100)}%`
      }
    )), module === "soloist" && /* @__PURE__ */ _(k, null, /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Complexity"), /* @__PURE__ */ _(
      "span",
      {
        id: "soloistComplexityValue",
        style: "color: var(--accent-color); font-weight: bold;"
      },
      Math.round((state2.complexity || 0.5) * 100),
      "%"
    )), /* @__PURE__ */ _(
      "input",
      {
        id: "soloistComplexity",
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: state2.complexity !== void 0 ? state2.complexity : 0.5,
        onInput: (e3) => {
          const val = parseFloat(e3.target.value);
          dispatch(ACTIONS.SET_PARAM, {
            module: "soloist",
            param: "complexity",
            value: val
          });
          saveCurrentState();
        },
        "aria-label": "Soloist Complexity",
        "aria-valuetext": `${Math.round((state2.complexity || 0.5) * 100)}%`
      }
    )), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, "Lead Sound"), /* @__PURE__ */ _(
      "select",
      {
        id: "soloistPresetSelect",
        value: state2.preset || "classic",
        onChange: (e3) => {
          dispatch(ACTIONS.SET_SOLOIST_PRESET, e3.target.value);
          saveCurrentState();
        },
        "aria-label": "Lead Sound Preset"
      },
      /* @__PURE__ */ _("option", { value: "classic" }, "Classic Sawtooth"),
      /* @__PURE__ */ _("option", { value: "neo" }, "Neo-Juno"),
      /* @__PURE__ */ _("option", { value: "vowel" }, "Vowel Lead"),
      /* @__PURE__ */ _("option", { value: "trumpet" }, "Trumpet"),
      /* @__PURE__ */ _("option", { value: "saxophone" }, "Saxophone")
    )), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, "Phrasing Mode"), /* @__PURE__ */ _(
      "select",
      {
        id: "soloistModeSelect",
        value: state2.mode || "monophonic",
        onChange: (e3) => {
          dispatch(ACTIONS.SET_SOLOIST_MODE, e3.target.value);
          saveCurrentState();
        },
        "aria-label": "Soloist Phrasing Mode"
      },
      /* @__PURE__ */ _("option", { value: "monophonic" }, "Monophonic"),
      /* @__PURE__ */ _("option", { value: "guitar" }, "Guitar"),
      /* @__PURE__ */ _("option", { value: "piano" }, "Piano")
    ))), module === "groove" && /* @__PURE__ */ _(GrooveControls, { state: state2 })), /* @__PURE__ */ _("div", null, /* @__PURE__ */ _("h4", { style: "margin-top: 0; margin-bottom: 1rem; font-size: 0.9rem; color: var(--accent-color);" }, "Mixer"), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Volume"), /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold;" }, Math.round(state2.volume * 100), "%")), /* @__PURE__ */ _(
      "input",
      {
        id: `${moduleName}Volume`,
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: state2.volume,
        onInput: (e3) => updateAudio("volume", e3.target.value),
        "aria-label": `${module} Volume`,
        "aria-valuetext": `${Math.round(state2.volume * 100)}%`,
        style: "width: 100%;"
      }
    )), /* @__PURE__ */ _("div", null, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;" }, /* @__PURE__ */ _("span", null, "Reverb"), /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold;" }, Math.round(state2.reverb * 100), "%")), /* @__PURE__ */ _(
      "input",
      {
        id: `${moduleName}Reverb`,
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
        value: state2.reverb,
        onInput: (e3) => updateAudio("reverb", e3.target.value),
        "aria-label": `${module} Reverb`,
        "aria-valuetext": `${Math.round(state2.reverb * 100)}%`,
        style: "width: 100%;"
      }
    ))));
  }
  function GrooveControls({ state: state2 }) {
    const { swing, swingSub } = useEnsembleState((s3) => ({
      swing: s3.groove.swing,
      swingSub: s3.groove.swingSub
    }));
    return /* @__PURE__ */ _("div", null, /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _(
      "label",
      {
        class: "control-label",
        style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;"
      },
      /* @__PURE__ */ _("span", null, "Swing"),
      /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold;" }, swing || 0, "%")
    ), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.4rem; align-items: center;" }, /* @__PURE__ */ _(
      "input",
      {
        id: "swingSlider",
        type: "range",
        min: "0",
        max: "100",
        value: swing || 0,
        onInput: (e3) => {
          dispatch(ACTIONS.SET_SWING, parseInt(e3.target.value, 10));
          saveCurrentState();
        },
        style: "flex-grow: 1; height: 4px;",
        "aria-label": "Swing Amount",
        "aria-valuetext": `${swing || 0}%`
      }
    ), /* @__PURE__ */ _(
      "select",
      {
        id: "swingBaseSelect",
        value: swingSub || "8th",
        onChange: (e3) => {
          dispatch(ACTIONS.SET_SWING_SUB, e3.target.value);
          saveCurrentState();
        },
        "aria-label": "Swing Base Note"
      },
      /* @__PURE__ */ _("option", { value: "16th" }, "1/16"),
      /* @__PURE__ */ _("option", { value: "8th" }, "1/8")
    ))), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _(
      "label",
      {
        class: "control-label",
        style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8;"
      },
      /* @__PURE__ */ _("span", null, "Humanize"),
      /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold;" }, state2.humanize || 0, "%")
    ), /* @__PURE__ */ _(
      "input",
      {
        id: "humanizeSlider",
        type: "range",
        min: "0",
        max: "100",
        value: state2.humanize || 0,
        onInput: (e3) => {
          dispatch(ACTIONS.SET_HUMANIZE, parseInt(e3.target.value, 10));
          saveCurrentState();
        },
        style: "width: 100%; height: 4px;",
        "aria-label": "Humanize Amount",
        "aria-valuetext": `${state2.humanize || 0}%`
      }
    )), /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem; border-top: 1px solid var(--border-color); padding-top: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.8rem; color: #94a3b8; cursor: pointer;" }, /* @__PURE__ */ _("span", null, "Lars Mode"), /* @__PURE__ */ _(
      "input",
      {
        id: "larsModeCheck",
        type: "checkbox",
        checked: state2.larsMode,
        onChange: (e3) => {
          dispatch(ACTIONS.SET_LARS_MODE, e3.target.checked);
          saveCurrentState();
        }
      }
    )), /* @__PURE__ */ _(
      "div",
      {
        id: "larsIntensityContainer",
        style: {
          opacity: state2.larsMode ? "1" : "0.5",
          pointerEvents: state2.larsMode ? "auto" : "none"
        }
      },
      /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;" }, /* @__PURE__ */ _("span", null, "Lars Intensity"), /* @__PURE__ */ _(
        "span",
        {
          id: "larsIntensityValue",
          style: "color: var(--accent-color); font-weight: bold;"
        },
        Math.round(state2.larsIntensity * 100),
        "%"
      )),
      /* @__PURE__ */ _(
        "input",
        {
          id: "larsIntensitySlider",
          type: "range",
          min: "0",
          max: "100",
          value: Math.round(state2.larsIntensity * 100),
          onInput: (e3) => {
            const val = parseInt(e3.target.value, 10);
            dispatch(ACTIONS.SET_LARS_INTENSITY, val / 100);
            saveCurrentState();
          },
          style: "width: 100%; height: 4px;",
          "aria-label": "Lars Mode Intensity",
          "aria-valuetext": `${Math.round(state2.larsIntensity * 100)}%`
        }
      )
    )));
  }

  // public/components/PresetLibrary.jsx
  init_preact_module();
  init_hooks_module();
  init_arranger_controller();
  init_instrument_controller();
  init_persistence();
  init_presets();
  init_types();
  init_ui_bridge();
  init_utils();
  init_worker_client();
  function PresetLibrary({ type }) {
    const dispatch2 = useDispatch();
    const { lastChordPreset, lastDrumPreset, isDirty } = useEnsembleState((s3) => ({
      lastChordPreset: s3.arranger.lastChordPreset,
      lastDrumPreset: s3.groove.lastDrumPreset,
      isDirty: s3.arranger.isDirty
    }));
    const [userPresets, setUserPresets] = d2([]);
    y2(() => {
      const key = type === "chord" ? "ensemble_userPresets" : "ensemble_userDrumPresets";
      const load = () => {
        const data = JSON.parse(localStorage.getItem(key) || "[]");
        setUserPresets(data);
      };
      load();
      window.addEventListener("storage_sync", load);
      return () => window.removeEventListener("storage_sync", load);
    }, [type]);
    const presets = type === "chord" ? CHORD_PRESETS : Object.keys(DRUM_PRESETS).map((name) => ({ name, ...DRUM_PRESETS[name] }));
    const activeId = type === "chord" ? isDirty ? null : lastChordPreset : lastDrumPreset;
    const handleSelect = (item, isUser = false) => {
      if (type === "chord") {
        if (isDirty && !confirm("Discard your custom arrangement and load this preset?")) {
          return;
        }
        const newSections = isUser ? item.sections ? decompressSections(item.sections) : [{ id: generateId(), label: "Main", value: item.prog }] : item.sections.map((s3) => ({
          id: generateId(),
          label: s3.label,
          value: s3.value,
          repeat: s3.repeat || 1,
          key: s3.key || "",
          timeSignature: s3.timeSignature || "",
          seamless: !!s3.seamless
        }));
        dispatch2(ACTIONS.SET_ARRANGEMENT, newSections);
        dispatch2(ACTIONS.SET_PARAM, { module: "arranger", param: "isDirty", value: false });
        dispatch2(ACTIONS.SET_PARAM, {
          module: "arranger",
          param: "isMinor",
          value: item.isMinor || false
        });
        dispatch2(ACTIONS.SET_PARAM, {
          module: "arranger",
          param: "lastChordPreset",
          value: item.name
        });
        if (item.settings) {
          if (useEnsembleState.getState().playback.applyPresetSettings) {
            if (item.settings.bpm) {
              dispatch2(ACTIONS.SET_BPM, item.settings.bpm);
            }
            if (item.settings.style) {
              dispatch2(ACTIONS.SET_STYLE, {
                module: "chords",
                style: item.settings.style
              });
            }
          }
          if (item.settings.timeSignature) {
            dispatch2(ACTIONS.SET_PARAM, {
              module: "arranger",
              param: "timeSignature",
              value: item.settings.timeSignature
            });
          } else {
            dispatch2(ACTIONS.SET_PARAM, {
              module: "arranger",
              param: "timeSignature",
              value: "4/4"
            });
          }
        }
        validateAndAnalyze();
        flushBuffers();
        saveCurrentState();
      } else {
        if (isUser) {
          if (item.measures) {
            dispatch2(ACTIONS.SET_PARAM, {
              module: "groove",
              param: "measures",
              value: item.measures
            });
            dispatch2(ACTIONS.SET_PARAM, {
              module: "groove",
              param: "currentMeasure",
              value: 0
            });
          }
          item.pattern.forEach((savedInst) => {
            dispatch2(ACTIONS.SET_GROOVE_STEPS, {
              instrument: savedInst.name,
              steps: savedInst.steps
            });
          });
          if (item.swing !== void 0) {
            dispatch2(ACTIONS.SET_PARAM, {
              module: "groove",
              param: "swing",
              value: item.swing
            });
          }
          if (item.swingSub) {
            dispatch2(ACTIONS.SET_PARAM, {
              module: "groove",
              param: "swingSub",
              value: item.swingSub
            });
          }
          dispatch2(ACTIONS.SET_PARAM, {
            module: "groove",
            param: "lastDrumPreset",
            value: item.name
          });
          syncWorker();
          saveCurrentState();
        } else {
          loadDrumPreset(item.name);
          dispatch2(ACTIONS.SET_PARAM, {
            module: "groove",
            param: "lastDrumPreset",
            value: item.name
          });
          syncWorker();
          saveCurrentState();
        }
      }
    };
    const handleDelete = (e3, index) => {
      e3.stopPropagation();
      if (!confirm(`Delete this ${type === "chord" ? "preset" : "drum pattern"}?`)) {
        return;
      }
      const key = type === "chord" ? "ensemble_userPresets" : "ensemble_userDrumPresets";
      const updated = [...userPresets];
      updated.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(updated));
      setUserPresets(updated);
      window.dispatchEvent(new Event("storage_sync"));
    };
    const sorted = [...presets].sort((a3, b2) => {
      const catA = a3.category || "";
      const catB = b2.category || "";
      if (catA !== catB) {
        return catA.localeCompare(catB);
      }
      return (a3.name || "").localeCompare(b2.name || "");
    });
    return /* @__PURE__ */ _(k, null, /* @__PURE__ */ _("div", { className: "presets-container" }, sorted.map((item, idx) => /* @__PURE__ */ _(
      "button",
      {
        key: item.id || item.name,
        className: `preset-chip ${type}-preset-chip ${activeId === (item.id || item.name) ? "active" : ""}`,
        onClick: () => handleSelect(item),
        "data-id": item.id || item.name,
        "data-category": item.category || "Other",
        style: {
          animationDelay: `${Math.min(idx * 0.03, 0.6)}s`
        }
      },
      formatUnicodeSymbols(item.name)
    ))), userPresets.length > 0 && /* @__PURE__ */ _(
      "div",
      {
        className: "user-presets-section",
        style: "border-top: 1px solid #334155; padding-top: 0.5rem; margin-top: 0.5rem;"
      },
      /* @__PURE__ */ _(
        "label",
        {
          className: "library-label",
          style: "font-size: 0.75rem; color: #64748b; margin-bottom: 0.4rem; display: block;"
        },
        "User"
      ),
      /* @__PURE__ */ _("div", { className: "presets-container" }, userPresets.map((item, idx) => /* @__PURE__ */ _(
        "button",
        {
          key: `user-${idx}`,
          className: `preset-chip user-preset-chip ${type}-preset-chip ${activeId === item.name ? "active" : ""}`,
          onClick: () => handleSelect(item, true),
          style: {
            animationDelay: `${Math.min(idx * 0.05, 0.6)}s`
          }
        },
        item.name,
        /* @__PURE__ */ _(
          "span",
          {
            className: "delete-btn",
            onClick: (e3) => handleDelete(e3, idx),
            style: "margin-left: 0.5rem; opacity: 0.5; font-size: 0.8rem;"
          },
          "\u2715"
        )
      )))
    ));
  }

  // public/components/SequencerGrid.jsx
  init_preact_module();
  init_compat_module();
  init_hooks_module();
  init_config();
  init_instrument_controller();
  init_state();
  init_types();
  init_ui_bridge();
  init_utils();
  var { playback: playbackState } = getState();
  var Step = M2(({ instIdx, stepIdx, value, instName, stepInfo, onToggle }) => {
    const className = [
      "step",
      value === 1 ? "active" : "",
      value === 2 ? "accented" : "",
      stepInfo.isGroupStart ? "group-marker" : "",
      stepInfo.isBeatStart ? "beat-marker" : ""
    ].filter(Boolean).join(" ");
    const status = value === 1 ? "active" : value === 2 ? "accented" : "inactive";
    return /* @__PURE__ */ _(
      "div",
      {
        className,
        "data-inst-idx": instIdx,
        "data-step-idx": stepIdx,
        role: "button",
        tabIndex: 0,
        "aria-label": `${instName}, step ${stepIdx + 1}, ${status}`,
        onMouseDown: (e3) => onToggle(e3, instIdx, stepIdx),
        onMouseOver: (e3) => onToggle(e3, instIdx, stepIdx),
        onKeyDown: (e3) => {
          if (e3.key === "Enter" || e3.key === " ") {
            e3.preventDefault();
            onToggle(e3, instIdx, stepIdx);
          }
        }
      }
    );
  });
  function SequencerGrid() {
    const { instruments, measures, timeSignature, isPlaying } = useEnsembleState((s3) => ({
      instruments: s3.groove.instruments,
      measures: s3.groove.measures,
      timeSignature: s3.arranger.timeSignature,
      isPlaying: s3.playback.isPlaying
    }));
    const isDraggingRef = A2(false);
    const dragTypeRef = A2(0);
    const _gridRef = A2(null);
    const stepCache = A2(/* @__PURE__ */ new Map());
    const spm = getStepsPerMeasure(timeSignature);
    const totalSteps = measures * spm;
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES["4/4"];
    const allStepInfos = T2(() => {
      return Array.from({ length: totalSteps }, (_3, i3) => getStepInfo(i3, ts));
    }, [totalSteps, ts]);
    y2(() => {
      const handleMouseUp = () => {
        isDraggingRef.current = false;
      };
      window.addEventListener("mouseup", handleMouseUp);
      return () => window.removeEventListener("mouseup", handleMouseUp);
    }, []);
    _2(() => {
      const grid = document.getElementById("sequencerGrid");
      if (!grid) {
        return;
      }
      stepCache.current.clear();
      const steps = grid.getElementsByClassName("step");
      for (let i3 = 0; i3 < steps.length; i3++) {
        const stepEl = steps[i3];
        const idx = parseInt(stepEl.getAttribute("data-step-idx"), 10);
        if (!Number.isNaN(idx)) {
          if (!stepCache.current.has(idx)) {
            stepCache.current.set(idx, []);
          }
          stepCache.current.get(idx).push(stepEl);
        }
      }
    }, [instruments, totalSteps]);
    y2(() => {
      if (!isPlaying) {
        const grid = document.getElementById("sequencerGrid");
        if (grid) {
          const playingSteps = grid.getElementsByClassName("playing");
          while (playingSteps.length > 0) {
            playingSteps[0].classList.remove("playing");
          }
        }
        return;
      }
      let lastStep = -1;
      let frameId;
      const loop = () => {
        const step = (playbackState.lastPlayingStep || 0) % totalSteps;
        if (step !== lastStep) {
          const grid = document.getElementById("sequencerGrid");
          if (grid && grid.offsetParent !== null) {
            if (lastStep !== -1) {
              const prev = stepCache.current.get(lastStep);
              if (prev) {
                for (let i3 = 0; i3 < prev.length; i3++) {
                  prev[i3].classList.remove("playing");
                }
              }
            }
            const curr = stepCache.current.get(step);
            if (curr) {
              for (let i3 = 0; i3 < curr.length; i3++) {
                curr[i3].classList.add("playing");
              }
            }
          }
          lastStep = step;
        }
        frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
    }, [isPlaying, totalSteps]);
    const handleToggle = q2((e3, instIdx, stepIdx) => {
      if (e3.type === "mouseover" && !isDraggingRef.current) {
        return;
      }
      const { groove: groove2 } = getState();
      const inst = groove2.instruments[instIdx];
      let newType = dragTypeRef.current;
      if (e3.type === "mousedown" || e3.type === "keydown") {
        if (inst.steps[stepIdx] === 0) {
          newType = 1;
        } else if (inst.steps[stepIdx] === 1) {
          newType = 2;
        } else {
          newType = 0;
        }
        if (e3.type === "mousedown") {
          dragTypeRef.current = newType;
          isDraggingRef.current = true;
        }
      }
      if (inst.steps[stepIdx] !== newType) {
        inst.steps[stepIdx] = newType;
        clearDrumPresetHighlight();
        dispatch(ACTIONS.STEP_TOGGLE);
      }
    }, []);
    const handleAudition = q2((inst) => {
      Promise.resolve().then(() => (init_engine(), engine_exports)).then(({ initAudio: initAudio2, playDrumSound: playDrumSound2 }) => {
        initAudio2();
        playDrumSound2(inst.name, playbackState.audio.currentTime, 1);
      });
    }, []);
    const handleMute = q2((inst, _instIdx) => {
      inst.muted = !inst.muted;
      dispatch("MUTE_TOGGLE");
    }, []);
    return /* @__PURE__ */ _(k, null, instruments.map((inst, instIdx) => /* @__PURE__ */ _("div", { key: inst.name, className: "track" }, /* @__PURE__ */ _("div", { className: "track-header" }, /* @__PURE__ */ _(
      "span",
      {
        className: `track-symbol ${inst.muted ? "muted" : ""}`,
        title: `Audition ${inst.name}`,
        role: "button",
        tabIndex: 0,
        "aria-label": `Audition ${inst.name}`,
        onClick: () => handleAudition(inst),
        onKeyDown: (e3) => {
          if (e3.key === "Enter" || e3.key === " ") {
            e3.preventDefault();
            handleAudition(inst);
          }
        }
      },
      inst.symbol || inst.name.charAt(0)
    ), /* @__PURE__ */ _(
      "button",
      {
        className: `mute-toggle ${inst.muted ? "active" : ""}`,
        title: inst.muted ? "Unmute" : "Mute",
        "aria-label": `${inst.muted ? "Unmute" : "Mute"} ${inst.name}`,
        "aria-pressed": inst.muted,
        onClick: () => handleMute(inst, instIdx)
      },
      "M"
    )), /* @__PURE__ */ _(
      "div",
      {
        className: "steps",
        style: { gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }
      },
      allStepInfos.map((stepInfo, stepIdx) => /* @__PURE__ */ _(
        Step,
        {
          key: stepIdx,
          instIdx,
          stepIdx,
          value: inst.steps[stepIdx],
          instName: inst.name,
          stepInfo,
          onToggle: handleToggle
        }
      ))
    ))), /* @__PURE__ */ _("div", { className: "track label-row" }, /* @__PURE__ */ _("div", { className: "track-header label-header" }), /* @__PURE__ */ _(
      "div",
      {
        className: "steps",
        style: { gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }
      },
      allStepInfos.map((stepInfo, i3) => {
        const isBeatStart = stepInfo.isBeatStart;
        const isGroupStart = stepInfo.isGroupStart;
        const shouldShowLabel = stepInfo.isCompound ? isGroupStart : isBeatStart;
        if (!shouldShowLabel) {
          return /* @__PURE__ */ _("div", { key: i3, className: "step-label" });
        }
        const label = stepInfo.isCompound ? stepInfo.groupIndex + 1 : stepInfo.beatIndex + 1;
        return /* @__PURE__ */ _(
          "div",
          {
            key: i3,
            className: `step-label ${isBeatStart ? "beat-start" : ""} ${isGroupStart ? "group-start" : ""}`
          },
          label
        );
      })
    )));
  }

  // public/components/GroovePanel.jsx
  function GroovePanel({ isActiveMobile }) {
    const { activeTab, enabled, measures, fillActive } = useEnsembleState((s3) => ({
      activeTab: s3.groove.activeTab,
      enabled: s3.groove.enabled,
      measures: s3.groove.measures,
      fillActive: s3.groove.fillActive
    }));
    const [isMenuOpen, setIsMenuOpen] = d2(false);
    const menuRef = A2(null);
    y2(() => {
      if (!isMenuOpen) {
        return;
      }
      const handleClickOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setIsMenuOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isMenuOpen]);
    const switchTab = (tab) => {
      dispatch(ACTIONS.SET_ACTIVE_TAB, { module: "groove", tab });
      syncWorker();
      saveCurrentState();
    };
    return /* @__PURE__ */ _(
      "div",
      {
        class: `panel dashboard-panel instrument-panel ${isActiveMobile ? "active-mobile" : ""}`,
        id: "panel-grooves",
        "data-id": "grooves"
      },
      /* @__PURE__ */ _("div", { class: "panel-header groove-panel-header" }, /* @__PURE__ */ _("div", { style: "display: flex; align-items: center; gap: 0.75rem;" }, /* @__PURE__ */ _("h2", { style: { color: fillActive ? "var(--soloist-color)" : "" } }, "Grooves")), /* @__PURE__ */ _("div", { class: "instrument-tabs" }, /* @__PURE__ */ _(
        "button",
        {
          class: `instrument-tab-btn ${activeTab === "classic" ? "active" : ""}`,
          onClick: () => switchTab("classic")
        },
        "Classic"
      ), /* @__PURE__ */ _(
        "button",
        {
          class: `instrument-tab-btn ${activeTab === "smart" ? "active" : ""}`,
          onClick: () => switchTab("smart")
        },
        "Smart"
      )), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.5rem; align-items: center;", ref: menuRef }, /* @__PURE__ */ _(
        "button",
        {
          class: `panel-menu-btn ${isMenuOpen ? "active" : ""}`,
          "aria-label": "Settings",
          onClick: () => setIsMenuOpen(!isMenuOpen)
        },
        "\u22EE"
      ), /* @__PURE__ */ _(
        "div",
        {
          class: `panel-settings-menu grooves-settings-menu ${isMenuOpen ? "open" : ""}`
        },
        /* @__PURE__ */ _(InstrumentSettings, { module: "groove" })
      ), /* @__PURE__ */ _(
        "button",
        {
          class: `power-btn desktop-power-btn ${enabled ? "active" : ""}`,
          id: "groovePowerBtnDesktop",
          "aria-label": "Toggle Grooves",
          onClick: () => togglePower("groove")
        },
        "\u23FB"
      ))),
      /* @__PURE__ */ _(
        "div",
        {
          id: "groove-tab-classic",
          class: `instrument-tab-content ${activeTab === "classic" ? "active" : ""}`
        },
        /* @__PURE__ */ _("div", { style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;" }, "Style"), /* @__PURE__ */ _(PresetLibrary, { type: "drum" })),
        /* @__PURE__ */ _("div", { style: "background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 8px; margin-bottom: 0;" }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;" }, /* @__PURE__ */ _("h4", { style: "margin: 0; font-size: 0.9rem; color: var(--accent-color);" }, "Step Sequencer"), /* @__PURE__ */ _(
          "select",
          {
            id: "drumBarsSelect",
            "aria-label": "Number of Drum Measures",
            value: measures,
            onChange: (e3) => updateMeasures(e3.target.value)
          },
          /* @__PURE__ */ _("option", { value: "1" }, "1"),
          /* @__PURE__ */ _("option", { value: "2" }, "2"),
          /* @__PURE__ */ _("option", { value: "4" }, "4"),
          /* @__PURE__ */ _("option", { value: "8" }, "8")
        )), /* @__PURE__ */ _(
          "div",
          {
            id: "measurePagination",
            style: "display: flex; gap: 0.4rem; margin-bottom: 1rem; align-items: center;"
          }
        ), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.5rem; margin-bottom: 1rem;" }, /* @__PURE__ */ _(
          "button",
          {
            id: "cloneMeasureBtn",
            style: "font-size: 0.75rem; padding: 0.3rem 0.6rem; flex: 1;",
            onClick: cloneMeasure
          },
          "\u29C9 Copy to All"
        ), /* @__PURE__ */ _(
          "button",
          {
            id: "saveDrumBtn",
            style: "font-size: 0.75rem; padding: 0.3rem 0.6rem; flex: 1;",
            onClick: saveDrumPreset
          },
          "\u{1F4BE} Save Pattern"
        )), /* @__PURE__ */ _("div", { className: "sequencer-grid", id: "sequencerGrid" }, /* @__PURE__ */ _(SequencerGrid, null)))
      ),
      /* @__PURE__ */ _(
        "div",
        {
          id: "groove-tab-smart",
          class: `instrument-tab-content ${activeTab === "smart" ? "active" : ""}`
        },
        /* @__PURE__ */ _(GenreSelector, null),
        /* @__PURE__ */ _(IntensitySlider, null),
        /* @__PURE__ */ _(CreativityToggle, null)
      )
    );
  }
  function IntensitySlider() {
    const { bandIntensity, autoIntensity } = useEnsembleState((s3) => ({
      bandIntensity: s3.playback.bandIntensity,
      autoIntensity: s3.playback.autoIntensity
    }));
    return /* @__PURE__ */ _("div", { class: "smart-control-group", style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; margin-bottom: 0.5rem; align-items: center;" }, /* @__PURE__ */ _("label", { htmlFor: "intensitySlider", style: "font-size: 0.9rem; color: #94a3b8;" }, "Intensity (Global)"), /* @__PURE__ */ _("div", { style: "display: flex; gap: 1rem; align-items: center;" }, /* @__PURE__ */ _("label", { style: "font-size: 0.75rem; color: var(--text-secondary); display: flex; align-items: center; gap: 0.3rem; cursor: pointer;" }, /* @__PURE__ */ _(
      "input",
      {
        type: "checkbox",
        checked: autoIntensity,
        onChange: (e3) => {
          dispatch(ACTIONS.SET_AUTO_INTENSITY, e3.target.checked);
          saveCurrentState();
        }
      }
    ), " ", "Auto"), /* @__PURE__ */ _("span", { style: "color: var(--accent-color); font-weight: bold; font-size: 0.9rem;" }, Math.round(bandIntensity * 100), "%"))), /* @__PURE__ */ _(
      "input",
      {
        id: "intensitySlider",
        type: "range",
        min: "0",
        max: "100",
        value: Math.round(bandIntensity * 100),
        onInput: (e3) => {
          dispatch(ACTIONS.SET_BAND_INTENSITY, parseInt(e3.target.value, 10) / 100);
        },
        disabled: autoIntensity,
        style: { width: "100%", height: "6px", opacity: autoIntensity ? 0.5 : 1 }
      }
    ));
  }
  function CreativityToggle() {
    const creativity = useEnsembleState((s3) => s3.groove.creativity);
    return /* @__PURE__ */ _("div", { class: "smart-control-group", style: "margin-bottom: 1rem;" }, /* @__PURE__ */ _("label", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; cursor: pointer;" }, /* @__PURE__ */ _("span", { style: "font-size: 0.9rem; color: #94a3b8;" }, "Creativity"), /* @__PURE__ */ _(
      "input",
      {
        id: "creativityCheck",
        type: "checkbox",
        checked: creativity,
        onChange: (e3) => {
          dispatch(ACTIONS.SET_CREATIVITY, e3.target.checked);
          syncWorker();
          saveCurrentState();
        }
      }
    )), /* @__PURE__ */ _("p", { style: "font-size: 0.75rem; color: var(--text-muted); margin: 0; line-height: 1.4;" }, "Enables generative variations and musical risks."));
  }
  function GenreSelector() {
    const { lastSmartGenre, pendingGenreFeel, genreSwitchCountdown } = useEnsembleState((s3) => ({
      lastSmartGenre: s3.groove.lastSmartGenre,
      pendingGenreFeel: s3.groove.pendingGenreFeel,
      genreSwitchCountdown: s3.groove.genreSwitchCountdown
    }));
    const genres = [
      "Rock",
      "Jazz",
      "Funk",
      "Disco",
      "Hip Hop",
      "Blues",
      "Neo-Soul",
      "Reggae",
      "Acoustic",
      "Bossa",
      "Country",
      "Metal",
      "Ska-Punk"
    ];
    const handleGenreClick = (genre) => {
      Promise.resolve().then(() => (init_presets(), presets_exports)).then(({ SMART_GENRES: SMART_GENRES2 }) => {
        const config11 = SMART_GENRES2[genre];
        if (config11) {
          Promise.resolve().then(() => (init_state(), state_exports)).then(({ groove: groove2 }) => {
            Object.assign(groove2, { lastSmartGenre: genre });
            dispatch(ACTIONS.SET_GENRE_FEEL, {
              genreName: genre,
              feel: config11.feel,
              swing: config11.swing,
              sub: config11.sub,
              drum: config11.drum,
              chord: config11.chord,
              bass: config11.bass,
              soloist: config11.soloist
            });
            syncWorker();
            saveCurrentState();
          });
        }
      });
    };
    return /* @__PURE__ */ _("div", { class: "smart-control-group", style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;" }, "Genre"), /* @__PURE__ */ _("div", { class: "genre-selector" }, genres.map((genre) => {
      const isActive = genre === lastSmartGenre && !pendingGenreFeel;
      const isPending = pendingGenreFeel && pendingGenreFeel.genreName === genre;
      return /* @__PURE__ */ _(
        "button",
        {
          key: genre,
          className: `genre-btn ${isActive ? "active" : ""} ${isPending ? "pending" : ""}`,
          "data-genre": genre,
          "data-countdown": isPending && genreSwitchCountdown ? genreSwitchCountdown : void 0,
          onClick: () => handleGenreClick(genre),
          "aria-pressed": isActive ? "true" : "false"
        },
        genre
      );
    })));
  }

  // public/components/InstrumentPanel.jsx
  init_preact_module();
  init_hooks_module();
  init_instrument_controller();
  init_persistence();
  init_state();
  init_types();
  init_ui_bridge();
  init_worker_client();

  // public/components/SoloistSmartTab.jsx
  init_preact_module();
  init_persistence();
  init_state();
  init_types();
  init_ui_bridge();
  function SoloistSmartTab() {
    const { tradeMode, phrasingIntensity, motifTracking } = useEnsembleState((s3) => ({
      tradeMode: s3.soloist.tradeMode,
      phrasingIntensity: s3.soloist.phrasingIntensity ?? 0.5,
      motifTracking: s3.soloist.motifTracking ?? false
    }));
    const setTradeMode = (mode) => {
      dispatch(ACTIONS.SET_PARAM, { module: "soloist", param: "tradeMode", value: mode });
      saveCurrentState();
    };
    const handleIntensityChange = (e3) => {
      dispatch(ACTIONS.SET_PARAM, {
        module: "soloist",
        param: "phrasingIntensity",
        value: parseFloat(e3.target.value)
      });
      saveCurrentState();
    };
    const toggleMotifTracking = () => {
      dispatch(ACTIONS.SET_PARAM, {
        module: "soloist",
        param: "motifTracking",
        value: !motifTracking
      });
      saveCurrentState();
    };
    return /* @__PURE__ */ _(
      "div",
      {
        class: "soloist-smart-controls",
        style: "display: flex; flex-direction: column; gap: 0.75rem; padding: 0.25rem 0;"
      },
      /* @__PURE__ */ _("div", { class: "slider-group" }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; margin-bottom: 0.2rem;" }, /* @__PURE__ */ _("label", { style: "font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;" }, "Soloist Articulation"), /* @__PURE__ */ _("span", { style: "font-size: 0.75rem; color: #94a3b8; font-variant-numeric: tabular-nums;" }, Math.round(phrasingIntensity * 100), "%")), /* @__PURE__ */ _(
        "input",
        {
          type: "range",
          min: "0",
          max: "1",
          step: "0.05",
          value: phrasingIntensity,
          onInput: handleIntensityChange,
          style: "width: 100%; margin: 0; cursor: pointer;"
        }
      )),
      /* @__PURE__ */ _(
        "div",
        {
          class: "toggle-group",
          style: "display: flex; justify-content: space-between; align-items: center;"
        },
        /* @__PURE__ */ _(
          "label",
          {
            style: "font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; cursor: pointer;",
            onClick: toggleMotifTracking
          },
          "Rhythmic Motif Tracking"
        ),
        /* @__PURE__ */ _(
          "button",
          {
            class: `mini-toggle-btn ${motifTracking ? "active" : ""}`,
            onClick: toggleMotifTracking,
            style: "min-width: 3rem;"
          },
          motifTracking ? "On" : "Off"
        )
      ),
      /* @__PURE__ */ _("div", { class: "trade-mode-group" }, /* @__PURE__ */ _("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;" }, /* @__PURE__ */ _("label", { style: "font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;" }, "Trade Mode"), /* @__PURE__ */ _("span", { style: "font-size: 0.7rem; opacity: 0.5; font-style: italic;" }, tradeMode === "manual" ? "Manual Control" : `Autoswitch: ${tradeMode}`)), /* @__PURE__ */ _("div", { style: "display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem;" }, ["manual", "sections", "loops"].map((mode) => /* @__PURE__ */ _(
        "button",
        {
          class: `mini-toggle-btn ${tradeMode === mode ? "active" : ""}`,
          style: "text-transform: capitalize;",
          onClick: () => setTradeMode(mode)
        },
        mode
      ))))
    );
  }

  // public/components/StyleSelector.jsx
  init_preact_module();
  init_engine();
  init_instrument_controller();
  init_persistence();
  init_types();
  init_ui_bridge();
  init_utils();
  init_worker_client();
  function StyleSelector({ module, styles }) {
    const dispatch2 = useDispatch();
    const currentStyle = useEnsembleState((state2) => {
      const modState = state2[module];
      if (!modState) {
        return null;
      }
      return modState.state?.style || modState.style;
    });
    const onSelect = (styleId) => {
      dispatch2(ACTIONS.SET_STYLE, { module, style: styleId });
      if (styleId !== "smart") {
        dispatch2(ACTIONS.SET_ACTIVE_TAB, { module, tab: "classic" });
      }
      syncWorker();
      flushBuffers();
      restoreGains();
      saveCurrentState();
    };
    const categorized = styles.reduce((acc, item) => {
      const cat = item.category || "Other";
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(item);
      return acc;
    }, {});
    const categories = Object.keys(categorized).sort();
    return /* @__PURE__ */ _("div", { class: "style-selector-container" }, categories.map((cat) => /* @__PURE__ */ _("div", { key: cat, class: "style-category" }, categories.length > 1 && /* @__PURE__ */ _(
      "div",
      {
        class: "category-label",
        style: {
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          marginTop: "0.5rem",
          marginBottom: "0.25rem"
        }
      },
      cat
    ), /* @__PURE__ */ _(
      "div",
      {
        class: "chip-grid",
        style: { display: "flex", flexWrap: "wrap", gap: "0.5rem" }
      },
      categorized[cat].map((item) => /* @__PURE__ */ _(
        "button",
        {
          key: item.id,
          type: "button",
          class: `preset-chip ${module}-style-chip ${currentStyle === item.id ? "active" : ""}`,
          onClick: () => onSelect(item.id)
        },
        formatUnicodeSymbols(item.name)
      ))
    ))));
  }

  // public/components/InstrumentPanel.jsx
  function InstrumentPanel({ id, module, title, styles, isActiveMobile }) {
    const { activeTab, enabled, tradeMode } = useEnsembleState((s3) => ({
      activeTab: s3[module].activeTab,
      enabled: s3[module].enabled,
      tradeMode: s3[module].tradeMode
    }));
    const [isMenuOpen, setIsMenuOpen] = d2(false);
    const menuRef = A2(null);
    y2(() => {
      if (!isMenuOpen) {
        return;
      }
      const handleClickOutside = (event) => {
        if (menuRef.current && !menuRef.current.contains(event.target)) {
          setIsMenuOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }, [isMenuOpen]);
    const switchTab = (tab) => {
      dispatch(ACTIONS.SET_ACTIVE_TAB, { module, tab });
      syncWorker();
      saveCurrentState();
    };
    const headerClass = `${module === "chords" ? "chord" : module === "harmony" ? "harmony" : module}-panel-header`;
    const isWaiting = module === "soloist" && !enabled && tradeMode !== "manual";
    const powerClass = `power-btn desktop-power-btn ${enabled ? "active" : isWaiting ? "waiting" : ""}`;
    return /* @__PURE__ */ _(
      "div",
      {
        class: `panel dashboard-panel instrument-panel ${activeTab === "smart" ? "smart-active" : ""} ${isActiveMobile ? "active-mobile" : ""}`,
        id,
        "data-id": module
      },
      /* @__PURE__ */ _("div", { class: `panel-header ${headerClass}` }, /* @__PURE__ */ _("div", { style: "display: flex; align-items: center; gap: 0.75rem;" }, /* @__PURE__ */ _("h2", null, title)), /* @__PURE__ */ _("div", { class: "instrument-tabs" }, /* @__PURE__ */ _(
        "button",
        {
          class: `instrument-tab-btn ${activeTab === "classic" ? "active" : ""}`,
          "aria-pressed": activeTab === "classic",
          onClick: () => switchTab("classic")
        },
        "Classic"
      ), /* @__PURE__ */ _(
        "button",
        {
          class: `instrument-tab-btn ${activeTab === "smart" ? "active" : ""}`,
          "aria-pressed": activeTab === "smart",
          onClick: () => switchTab("smart")
        },
        "Smart"
      )), /* @__PURE__ */ _("div", { style: "display: flex; gap: 0.5rem; align-items: center;", ref: menuRef }, /* @__PURE__ */ _(
        "button",
        {
          class: `panel-menu-btn ${isMenuOpen ? "active" : ""}`,
          "aria-label": `${title} Settings`,
          "aria-expanded": isMenuOpen,
          "aria-haspopup": "true",
          onClick: () => setIsMenuOpen(!isMenuOpen)
        },
        "\u22EE"
      ), /* @__PURE__ */ _("div", { class: `panel-settings-menu ${isMenuOpen ? "open" : ""}` }, /* @__PURE__ */ _(InstrumentSettings, { module })), /* @__PURE__ */ _(
        "button",
        {
          class: powerClass,
          id: `${module === "chords" ? "chord" : module}PowerBtnDesktop`,
          "aria-label": `Toggle ${title}`,
          onClick: () => togglePower(module)
        },
        "\u23FB"
      ))),
      /* @__PURE__ */ _(
        "div",
        {
          id: `${module === "chords" ? "chord" : module}-tab-classic`,
          class: `instrument-tab-content ${activeTab === "classic" ? "active" : ""}`
        },
        /* @__PURE__ */ _("label", { style: "display: block; margin-bottom: 0.5rem; font-size: 0.9rem; color: #94a3b8;" }, "Style"),
        /* @__PURE__ */ _(
          "div",
          {
            id: `${module === "harmony" ? "harmony" : module}StylePresets`,
            class: "presets-container"
          },
          /* @__PURE__ */ _(StyleSelector, { module, styles })
        )
      ),
      /* @__PURE__ */ _(
        "div",
        {
          id: `${module === "chords" ? "chord" : module}-tab-smart`,
          class: `instrument-tab-content ${activeTab === "smart" ? "active" : ""}`
        },
        module === "soloist" ? /* @__PURE__ */ _(SoloistSmartTab, null) : /* @__PURE__ */ _(
          "div",
          {
            class: "smart-status",
            style: `padding: 0.5rem; background: rgba(var(--${module}-color-rgb), 0.05); border-radius: 8px; border: 1px dashed rgba(var(--${module}-color-rgb), 0.2); text-align: center;`
          },
          /* @__PURE__ */ _("p", { style: "font-size: 0.8rem; margin: 0;" }, "\u2728 ", /* @__PURE__ */ _("strong", null, "Smart Follow"), " Active")
        )
      )
    );
  }

  // public/components/KeySignatureControls.jsx
  init_preact_module();
  init_arranger_controller();
  init_config();
  init_instrument_controller();
  init_persistence();
  init_types();
  init_ui_bridge();
  init_utils();
  init_worker_client();
  var GROUPING_OPTIONS = {
    "5/4": [
      [3, 2],
      [2, 3]
    ],
    "7/8": [
      [2, 2, 3],
      [3, 2, 2],
      [2, 3, 2]
    ],
    "7/4": [
      [4, 3],
      [3, 4]
    ]
  };
  function KeySignatureControls() {
    const dispatch2 = useDispatch();
    const { arrangerKey, timeSignature, isMinor, grouping, lastDrumPreset } = useEnsembleState(
      (s3) => ({
        arrangerKey: s3.arranger.key,
        timeSignature: s3.arranger.timeSignature,
        isMinor: s3.arranger.isMinor,
        grouping: s3.arranger.grouping,
        lastDrumPreset: s3.groove.lastDrumPreset
      })
    );
    const handleKeyChange = (e3) => {
      const newKey = e3.target.value;
      Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
        arranger6.key = newKey;
        validateAndAnalyze();
        saveCurrentState();
        dispatch2("KEY_CHANGE");
      });
    };
    const handleTimeSigChange = (e3) => {
      const newTS = e3.target.value;
      Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
        arranger6.timeSignature = newTS;
        arranger6.grouping = null;
        if (lastDrumPreset) {
          loadDrumPreset(lastDrumPreset);
        }
        validateAndAnalyze();
        saveCurrentState();
        dispatch2("TIME_SIG_CHANGE");
      });
    };
    const toggleGrouping = () => {
      const options = GROUPING_OPTIONS[timeSignature];
      if (!options) {
        return;
      }
      Promise.resolve().then(() => (init_state(), state_exports)).then(({ arranger: arranger6 }) => {
        const current = arranger6.grouping || TIME_SIGNATURES[timeSignature].grouping;
        const currentIndex = options.findIndex((opt) => opt.join("+") === current.join("+"));
        const nextIndex = (currentIndex + 1) % options.length;
        arranger6.grouping = options[nextIndex];
        flushBuffers();
        syncWorker();
        saveCurrentState();
        dispatch2("GROUPING_CHANGE");
      });
    };
    const keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    const timeSignatures = ["4/4", "3/4", "2/4", "5/4", "6/8", "7/8", "7/4", "12/8"];
    return /* @__PURE__ */ _("div", { class: "key-controls" }, /* @__PURE__ */ _(
      "button",
      {
        id: "maximizeChordBtn",
        title: "Maximize",
        class: "header-btn",
        "aria-label": "Maximize Chords",
        onClick: () => {
          const isMax = document.body.classList.toggle("chord-maximized");
          const btn = document.getElementById("maximizeChordBtn");
          if (btn) {
            btn.textContent = isMax ? "\u2715" : "\u26F6";
            btn.title = isMax ? "Exit Maximize" : "Maximize";
          }
        }
      },
      "\u26F6"
    ), /* @__PURE__ */ _("div", { class: "time-sig-group" }, /* @__PURE__ */ _(
      "select",
      {
        id: "timeSigSelect",
        value: timeSignature,
        onChange: handleTimeSigChange,
        "aria-label": "Time Signature"
      },
      timeSignatures.map((ts) => /* @__PURE__ */ _("option", { key: ts, value: ts }, ts))
    ), /* @__PURE__ */ _(
      "div",
      {
        id: "groupingToggle",
        style: {
          display: ["5/4", "7/8", "7/4"].includes(timeSignature) ? "flex" : "none",
          alignItems: "center",
          justifyContent: "center"
        }
      },
      /* @__PURE__ */ _(
        "button",
        {
          id: "groupingLabel",
          type: "button",
          class: "badge-btn",
          title: "Click to toggle grouping",
          "aria-label": "Toggle rhythmic grouping",
          onClick: toggleGrouping
        },
        grouping ? grouping.join("+") : TIME_SIGNATURES[timeSignature]?.grouping.join("+") || "3+2"
      )
    )), /* @__PURE__ */ _(
      "select",
      {
        id: "keySelect",
        value: arrangerKey,
        onChange: handleKeyChange,
        "aria-label": "Select Key"
      },
      keys.map((k3) => /* @__PURE__ */ _("option", { key: k3, value: k3 }, formatUnicodeSymbols(k3), isMinor ? "m" : ""))
    ), /* @__PURE__ */ _(
      "button",
      {
        id: "relKeyBtn",
        title: "Relative Key (Major/Minor)",
        class: "header-btn rel-key-btn",
        "aria-label": "Relative Key Toggle",
        onClick: () => {
          switchToRelativeKey();
          dispatch2("REL_KEY_TOGGLE");
        }
      },
      isMinor ? "min" : "maj"
    ), /* @__PURE__ */ _(
      "button",
      {
        id: "transDownBtn",
        title: "Transpose Down",
        class: "header-btn",
        "aria-label": "Transpose Down",
        onClick: () => {
          transposeKey(-1);
          dispatch2("TRANSPOSE");
        }
      },
      "\u266D"
    ), /* @__PURE__ */ _(
      "button",
      {
        id: "transUpBtn",
        title: "Transpose Up",
        class: "header-btn",
        "aria-label": "Transpose Up",
        onClick: () => {
          transposeKey(1);
          dispatch2("TRANSPOSE");
        }
      },
      "\u266F"
    ));
  }

  // public/components/Modals.jsx
  init_preact_module();
  init_compat_module();
  init_hooks_module();
  init_ui_bridge();
  var Settings2 = z3(() => Promise.resolve().then(() => (init_Settings(), Settings_exports)).then((m3) => ({ default: m3.Settings })));
  var EditorModal2 = z3(
    () => Promise.resolve().then(() => (init_EditorModal(), EditorModal_exports)).then((m3) => ({ default: m3.EditorModal }))
  );
  var GenerateSongModal2 = z3(
    () => Promise.resolve().then(() => (init_GenerateSongModal(), GenerateSongModal_exports)).then((m3) => ({ default: m3.GenerateSongModal }))
  );
  var ExportModal2 = z3(
    () => Promise.resolve().then(() => (init_ExportModal(), ExportModal_exports)).then((m3) => ({ default: m3.ExportModal }))
  );
  var TemplatesModal2 = z3(
    () => Promise.resolve().then(() => (init_TemplatesModal(), TemplatesModal_exports)).then((m3) => ({ default: m3.TemplatesModal }))
  );
  var AnalyzerModal2 = z3(
    () => Promise.resolve().then(() => (init_AnalyzerModal(), AnalyzerModal_exports)).then((m3) => ({ default: m3.AnalyzerModal }))
  );
  function AnimatedModalWrapper({ isOpen, component: Component }) {
    const [shouldRender, setShouldRender] = d2(isOpen);
    const [isClosing, setIsClosing] = d2(false);
    y2(() => {
      if (isOpen) {
        setShouldRender(true);
        setIsClosing(false);
      } else if (shouldRender) {
        setIsClosing(true);
        const timer = setTimeout(() => {
          setShouldRender(false);
          setIsClosing(false);
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [isOpen, shouldRender]);
    if (!shouldRender) {
      return null;
    }
    return /* @__PURE__ */ _("div", { class: isClosing ? "closing" : "" }, /* @__PURE__ */ _(Component, null));
  }
  function Modals() {
    const { settingsOpen, editorOpen, generateSongOpen, exportOpen, templatesOpen, analyzerOpen } = useEnsembleState((s3) => ({
      settingsOpen: s3.playback.modals.settings,
      editorOpen: s3.playback.modals.editor,
      generateSongOpen: s3.playback.modals.generateSong,
      exportOpen: s3.playback.modals.export,
      templatesOpen: s3.playback.modals.templates,
      analyzerOpen: s3.playback.modals.analyzer
    }));
    y2(() => {
      const anyOpen = settingsOpen || editorOpen || generateSongOpen || exportOpen || templatesOpen || analyzerOpen;
      if (anyOpen) {
        document.body.classList.add("modal-open");
      } else {
        document.body.classList.remove("modal-open");
      }
    }, [settingsOpen, editorOpen, generateSongOpen, exportOpen, templatesOpen, analyzerOpen]);
    return /* @__PURE__ */ _(k, null, /* @__PURE__ */ _(P3, { fallback: null }, /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: settingsOpen, component: Settings2 }), /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: editorOpen, component: EditorModal2 }), /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: generateSongOpen, component: GenerateSongModal2 }), /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: exportOpen, component: ExportModal2 }), /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: templatesOpen, component: TemplatesModal2 }), /* @__PURE__ */ _(AnimatedModalWrapper, { isOpen: analyzerOpen, component: AnalyzerModal2 })));
  }

  // public/components/NotificationLayer.jsx
  init_preact_module();
  init_compat_module();
  init_ui_bridge();

  // public/components/PWAUpdateBanner.jsx
  init_preact_module();
  init_hooks_module();
  init_pwa();
  init_ui_bridge();
  function PWAUpdateBanner() {
    const updateAvailable = useEnsembleState((s3) => s3.playback.updateAvailable);
    const [isVisible, setIsVisible] = d2(false);
    y2(() => {
      if (updateAvailable) {
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
      } else {
        setIsVisible(false);
      }
    }, [updateAvailable]);
    if (!updateAvailable) {
      return null;
    }
    return /* @__PURE__ */ _(
      "div",
      {
        id: "updateBanner",
        class: `update-banner ${isVisible ? "show" : ""}`,
        role: "alert",
        "aria-live": "polite"
      },
      /* @__PURE__ */ _("span", null, "A new version is available."),
      /* @__PURE__ */ _(
        "button",
        {
          id: "updateRefreshBtn",
          onClick: skipWaiting,
          "aria-label": "Refresh application to apply update"
        },
        "Refresh"
      )
    );
  }

  // public/components/NotificationLayer.jsx
  function ToastItem({ message }) {
    const [isClosing, setIsClosing] = d2(false);
    y2(() => {
      const timer = setTimeout(() => {
        setIsClosing(true);
      }, 1700);
      return () => clearTimeout(timer);
    }, []);
    return /* @__PURE__ */ _("div", { class: `toast ${isClosing ? "closing" : ""}`, role: "status", "aria-live": "polite" }, message);
  }
  function NotificationLayer() {
    const { toasts, flashIntensity } = useEnsembleState((s3) => ({
      toasts: s3.playback.toasts,
      flashIntensity: s3.playback.flashIntensity
    }));
    return /* @__PURE__ */ _(k, null, /* @__PURE__ */ _(PWAUpdateBanner, null), /* @__PURE__ */ _(
      "div",
      {
        id: "flashOverlay",
        style: {
          opacity: flashIntensity,
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundColor: "white",
          pointerEvents: "none",
          zIndex: 9999,
          transition: flashIntensity > 0 ? "none" : "opacity 0.1s ease-out"
        }
      }
    ), /* @__PURE__ */ _(
      "div",
      {
        class: "toasts-container",
        style: {
          position: "fixed",
          bottom: "2rem",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1e4,
          display: "flex",
          flexDirection: "column-reverse",
          // Newest at bottom
          gap: "0.5rem",
          pointerEvents: "none",
          alignItems: "center"
        }
      },
      toasts.map((toast) => /* @__PURE__ */ _(ToastItem, { key: toast.id, message: toast.message }))
    ));
  }

  // public/components/Transport.jsx
  init_preact_module();
  init_compat_module();
  init_hooks_module();
  init_state();
  init_types();
  init_ui_bridge();
  init_instrument_controller();
  var { playback: playback5 } = getState();
  function Transport() {
    const { isPlaying, bpm, sessionTimer, sessionStartTime, songMode } = useEnsembleState(
      (state2) => ({
        isPlaying: state2.playback.isPlaying,
        bpm: state2.playback.bpm,
        sessionTimer: state2.playback.sessionTimer,
        sessionStartTime: state2.playback.sessionStartTime,
        songMode: state2.playback.songMode
      })
    );
    const [tapActive, setTapActive] = d2(false);
    const [timeLeft, setTimeLeft] = d2(null);
    y2(() => {
      let interval;
      if (isPlaying && songMode && sessionTimer > 0 && sessionStartTime) {
        const updateTimer = () => {
          const elapsedMs = performance.now() - sessionStartTime;
          const totalMs = sessionTimer * 60 * 1e3;
          const remainingMs = Math.max(0, totalMs - elapsedMs);
          const mins = Math.floor(remainingMs / 6e4);
          const secs = Math.floor(remainingMs % 6e4 / 1e3);
          setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
        };
        updateTimer();
        interval = setInterval(updateTimer, 1e3);
      } else {
        setTimeLeft(null);
      }
      return () => clearInterval(interval);
    }, [isPlaying, sessionTimer, sessionStartTime, songMode]);
    const onTogglePlay = () => {
      dispatch(ACTIONS.TOGGLE_PLAY, { viz: playback5.viz });
    };
    const onBpmInput = (e3) => {
      dispatch(ACTIONS.SET_BPM, e3.target.value);
    };
    const onTap = (_e) => {
      handleTap((val) => dispatch(ACTIONS.SET_BPM, val));
      setTapActive(true);
      setTimeout(() => setTapActive(false), 100);
    };
    const openSettings = () => {
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "settings", open: true });
    };
    return /* @__PURE__ */ _("div", { class: "main-controls" }, /* @__PURE__ */ _(
      "button",
      {
        id: "playBtn",
        class: `primary-btn ${isPlaying ? "playing" : ""}`,
        onClick: onTogglePlay
      },
      /* @__PURE__ */ _("span", { id: "playBtnText" }, isPlaying ? timeLeft && songMode ? `STOP (${timeLeft})` : "STOP" : "START")
    ), /* @__PURE__ */ _("div", { class: "control-group", id: "bpmControlGroup" }, /* @__PURE__ */ _("span", { class: "control-label", id: "bpm-label" }, "BPM"), /* @__PURE__ */ _(
      "input",
      {
        type: "number",
        id: "bpmInput",
        value: bpm,
        min: "40",
        max: "240",
        "aria-labelledby": "bpm-label",
        "aria-label": "Tempo in BPM",
        onInput: onBpmInput
      }
    ), /* @__PURE__ */ _(
      "button",
      {
        id: "tapBtn",
        class: tapActive ? "handle-tap" : "",
        style: "padding: 0.2rem 0.5rem; font-size: 0.8rem; height: auto;",
        "aria-label": "Tap Tempo",
        onClick: onTap
      },
      "TAP"
    )), /* @__PURE__ */ _(
      "button",
      {
        id: "settingsBtn",
        style: "padding: 0.5rem; background: transparent; border: none; font-size: 1.2rem; cursor: pointer;",
        "aria-label": "Settings",
        onClick: openSettings
      },
      "\u2699\uFE0F"
    ));
  }

  // public/App.jsx
  init_config();
  init_instrument_controller();
  init_persistence();
  init_presets();
  init_pwa();
  init_state();
  init_types();
  init_ui_bridge();
  init_worker_client();
  function App() {
    const { vizEnabled, grooveMobileTab } = useEnsembleState((s3) => ({
      vizEnabled: s3.vizState.enabled,
      grooveMobileTab: s3.groove.mobileTab
    }));
    return /* @__PURE__ */ _(k, null, /* @__PURE__ */ _(GlobalShortcuts, null), /* @__PURE__ */ _("div", { class: "app-container" }, /* @__PURE__ */ _(Header, null), /* @__PURE__ */ _("main", { class: "app-main-layout loaded", id: "dashboardGrid" }, /* @__PURE__ */ _(ArrangerPanel, null), /* @__PURE__ */ _(VisualizerPanel, { enabled: vizEnabled }), /* @__PURE__ */ _(Sidebar, { grooveMobileTab }), /* @__PURE__ */ _(MobileNav, { activeTab: grooveMobileTab }))), /* @__PURE__ */ _(Modals, null), /* @__PURE__ */ _(NotificationLayer, null));
  }
  function Header() {
    return /* @__PURE__ */ _("header", null, /* @__PURE__ */ _("h1", null, "Ensemble"), /* @__PURE__ */ _(Transport, null));
  }
  function ArrangerPanel() {
    const { soloistStyle, hasLeadSheet } = useEnsembleState((s3) => ({
      soloistStyle: s3.soloist.style,
      hasLeadSheet: s3.soloist.leadSheetMelody && s3.soloist.leadSheetMelody.length > 0
    }));
    const openEditor = () => {
      dispatch(ACTIONS.SET_MODAL_OPEN, { modal: "editor", open: true });
    };
    return /* @__PURE__ */ _("div", { class: "panel dashboard-panel active-mobile", id: "panel-arranger", "data-id": "arranger" }, /* @__PURE__ */ _("div", { class: "panel-header chord-panel-header" }, /* @__PURE__ */ _(
      "div",
      {
        class: "panel-title-group",
        style: "display: flex; align-items: center; gap: 0.75rem;"
      },
      /* @__PURE__ */ _("h2", null, "Arranger"),
      soloistStyle === "lead_sheet" && hasLeadSheet && /* @__PURE__ */ _(
        "span",
        {
          class: "badge",
          style: "font-size: 0.7rem; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(16, 185, 129, 0.3); display: flex; align-items: center; gap: 4px; white-space: nowrap;"
        },
        "\u{1F3B5} Lead Sheet Active"
      )
    ), /* @__PURE__ */ _("div", { class: "panel-header-controls" }, /* @__PURE__ */ _(KeySignatureControls, null))), /* @__PURE__ */ _("div", { className: "display-area", id: "chordVisualizer" }, /* @__PURE__ */ _(ChordVisualizer, null)), /* @__PURE__ */ _("div", { id: "activeSectionLabel", class: "active-section-label" }), /* @__PURE__ */ _("div", { style: "margin-bottom: 1.5rem;" }, /* @__PURE__ */ _(
      "button",
      {
        id: "editArrangementBtn",
        class: "primary-btn",
        style: "width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;",
        onClick: openEditor
      },
      /* @__PURE__ */ _("span", null, "\u270F\uFE0F"),
      " Edit Arrangement"
    )), /* @__PURE__ */ _("div", { style: "flex-grow: 1; display: flex; flex-direction: column; gap: 0.5rem; min-height: 100px;" }, /* @__PURE__ */ _("label", { class: "library-label" }, "Library"), /* @__PURE__ */ _(PresetLibrary, { type: "chord" })));
  }
  function VisualizerPanel({ enabled }) {
    const handleToggle = () => {
      togglePower("viz");
    };
    return /* @__PURE__ */ _(
      "div",
      {
        class: `panel dashboard-panel ${!enabled ? "collapsed" : ""}`,
        id: "panel-visualizer",
        "data-id": "visualizer"
      },
      /* @__PURE__ */ _("div", { class: "panel-header" }, /* @__PURE__ */ _("div", { style: "display: flex; align-items: center; gap: 0.75rem;" }, /* @__PURE__ */ _(
        "button",
        {
          id: "vizPowerBtn",
          class: `power-btn ${enabled ? "active" : ""}`,
          "aria-label": "Toggle Visualizer",
          onClick: handleToggle
        },
        "\u23FB"
      ), /* @__PURE__ */ _("h2", null, "Visualizer"))),
      /* @__PURE__ */ _("div", { class: "viz-graph-area" }, /* @__PURE__ */ _("div", { id: "unifiedVizContainer" }))
    );
  }
  function Sidebar({ grooveMobileTab }) {
    const activeMobileTab = grooveMobileTab === "mobile" ? "grooves" : grooveMobileTab;
    return /* @__PURE__ */ _("div", { class: "layout-column sidebar-column", id: "col-sidebar" }, /* @__PURE__ */ _(
      InstrumentPanel,
      {
        id: "panel-chords",
        module: "chords",
        title: "Chords",
        styles: CHORD_STYLES,
        isActiveMobile: activeMobileTab === "chords"
      }
    ), /* @__PURE__ */ _(GroovePanel, { isActiveMobile: activeMobileTab === "grooves" }), /* @__PURE__ */ _(
      InstrumentPanel,
      {
        id: "panel-bass",
        module: "bass",
        title: "Bass",
        styles: BASS_STYLES,
        isActiveMobile: activeMobileTab === "bass"
      }
    ), /* @__PURE__ */ _(
      InstrumentPanel,
      {
        id: "panel-soloist",
        module: "soloist",
        title: "Soloist",
        styles: SOLOIST_STYLES,
        isActiveMobile: activeMobileTab === "soloist"
      }
    ), /* @__PURE__ */ _(
      InstrumentPanel,
      {
        id: "panel-harmonies",
        module: "harmony",
        title: "Harmony",
        styles: HARMONY_STYLES,
        isActiveMobile: activeMobileTab === "harmonies"
      }
    ));
  }
  function MobileNavTab({ tab, activeTab, onSwitch }) {
    const isActive = activeTab === tab.id || activeTab === "mobile" && tab.id === "grooves";
    const { enabled, tradeMode } = useEnsembleState((s3) => ({
      enabled: s3[tab.module].enabled,
      tradeMode: s3[tab.module].tradeMode
    }));
    const isWaiting = tab.module === "soloist" && !enabled && tradeMode !== "manual";
    const powerClass = `power-btn ${enabled ? "active" : isWaiting ? "waiting" : ""}`;
    return /* @__PURE__ */ _(
      "div",
      {
        class: `tab-item ${isActive ? "active" : ""} tab-${tab.id}`,
        onClick: () => onSwitch(tab.id)
      },
      /* @__PURE__ */ _("button", { class: `tab-btn ${isActive ? "active" : ""}` }, tab.label),
      /* @__PURE__ */ _(
        "button",
        {
          id: `${tab.module === "chords" ? "chord" : tab.module}PowerBtn`,
          class: powerClass,
          "aria-label": `Toggle ${tab.label}`,
          onClick: (e3) => {
            e3.stopPropagation();
            togglePower(tab.module);
          }
        },
        "\u23FB"
      )
    );
  }
  function MobileNav({ activeTab }) {
    const switchMobileTab = (tab) => {
      if (tab === "grooves") {
        dispatch(ACTIONS.SET_ACTIVE_TAB, { module: "groove", tab: "smart" });
      }
      const { groove: groove2 } = getState();
      groove2.mobileTab = tab;
      dispatch("MOBILE_TAB_SWITCH");
      syncWorker();
      saveCurrentState();
    };
    return /* @__PURE__ */ _("div", { class: "mobile-tabs-nav" }, [
      { id: "chords", label: "Chords", module: "chords" },
      { id: "grooves", label: "Grooves", module: "groove" },
      { id: "bass", label: "Bass", module: "bass" },
      { id: "soloist", label: "Soloist", module: "soloist" },
      { id: "harmonies", label: "Harmony", module: "harmony" }
    ].map((tab) => /* @__PURE__ */ _(
      MobileNavTab,
      {
        key: tab.id,
        tab,
        activeTab,
        onSwitch: switchMobileTab
      }
    )));
  }

  // public/ui-root.jsx
  var ErrorBoundary = class extends x {
    constructor() {
      super();
      this.state = { errored: false };
    }
    componentDidCatch(error) {
      this.setState({ errored: true });
      console.error("[UI-Root] Component Crash:", error);
    }
    render(props, state2) {
      if (state2.errored) {
        return /* @__PURE__ */ _("div", { style: "padding: 2rem; text-align: center; background: #1e293b; color: white; height: 100vh;" }, /* @__PURE__ */ _("h2", null, "Something went wrong in the UI."), /* @__PURE__ */ _("p", null, "The audio engine may still be running. Try refreshing."), /* @__PURE__ */ _("button", { onClick: () => window.location.reload(), class: "primary-btn" }, "Refresh App"));
      }
      return props.children;
    }
  };
  function mountComponents() {
    console.log("[UI-Root] Mounting Preact Root...");
    const root = document.body;
    J(
      /* @__PURE__ */ _(ErrorBoundary, null, /* @__PURE__ */ _(App, null)),
      root
    );
  }

  // public/visualizer.js
  init_constants();
  var { min: min2, max: max2, floor: floor2, PI: PI2, round: round2, ceil: ceil2 } = Math;
  var IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
  var INTERVAL_CATEGORY = [0, 3, 3, 1, 1, 3, 3, 2, 3, 3, 3, 3];
  var INTERVAL_COLOR_INDEX = INTERVAL_CATEGORY;
  var RingBuffer = class {
    constructor(capacity) {
      this.buffer = new Array(capacity);
      this.capacity = capacity;
      this.start = 0;
      this.count = 0;
    }
    get length() {
      return this.count;
    }
    push(item) {
      if (this.count < this.capacity) {
        this.buffer[(this.start + this.count) % this.capacity] = item;
        this.count++;
      } else {
        this.buffer[this.start] = item;
        this.start = (this.start + 1) % this.capacity;
      }
    }
    at(index) {
      if (index < 0 || index >= this.count) {
        return void 0;
      }
      return this.buffer[(this.start + index) % this.capacity];
    }
    clear() {
      this.start = 0;
      this.count = 0;
    }
    *[Symbol.iterator]() {
      for (let i3 = 0; i3 < this.count; i3++) {
        yield this.at(i3);
      }
    }
    /**
     * Optimized iteration that avoids modulo operations per element.
     * @param {function(item, index): boolean|void} callback - Return false to break loop
     */
    forEach(callback) {
      const buffer = this.buffer;
      const capacity = this.capacity;
      const count = this.count;
      const start = this.start;
      const headLength = min2(count, capacity - start);
      for (let i3 = 0; i3 < headLength; i3++) {
        if (callback(buffer[start + i3], i3) === false) {
          return;
        }
      }
      if (headLength < count) {
        const tailLength = count - headLength;
        for (let i3 = 0; i3 < tailLength; i3++) {
          if (callback(buffer[i3], headLength + i3) === false) {
            return;
          }
        }
      }
    }
  };
  function getYStandalone(m3, midY, centerMidi, yScale) {
    return midY - (m3 - centerMidi) * yScale;
  }
  function getXStandalone(t3, currentTime, pianoRollWidth, timeScale) {
    return pianoRollWidth + (currentTime - t3) * timeScale;
  }
  var UnifiedVisualizer = class {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        console.warn(
          `[Visualizer] Container #${containerId} not found. Deferring initialization.`
        );
      }
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { alpha: false });
      this.staticCanvas = document.createElement("canvas");
      this.staticCtx = this.staticCanvas.getContext("2d", { alpha: false });
      if (this.container) {
        this.container.appendChild(this.canvas);
      }
      this.tracks = {};
      this.chordEvents = [];
      this.windowSize = 4;
      this.visualRange = 60;
      this.centerMidi = 60;
      this.pianoRollWidth = 50;
      this.registers = { chords: 60 };
      this.beatReferenceTime = null;
      this.themeCache = null;
      this.isFillActive = false;
      if (typeof document !== "undefined" && document.documentElement) {
        this.updateThemeCache();
      }
      this.cNotesBuffer = new Uint8Array(128);
      this.soloistBuffers = [[], [], [], []];
      this.activeChordBuffers = [[], [], [], []];
      this.guideToneBuffers = [[], [], [], []];
      if (this.container) {
        this.initDOM();
      }
      this.themeObserver = new MutationObserver((mutations) => {
        if (mutations.some((m3) => m3.type === "attributes" && m3.attributeName === "data-theme")) {
          this.updateThemeCache();
        }
      });
      this.themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
      });
      this.themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      this.themeListener = () => this.updateThemeCache();
      this.themeMediaQuery.addEventListener("change", this.themeListener);
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          this.resize(entry.contentRect);
        }
      });
      if (this.container) {
        this.resizeObserver.observe(this.container);
      }
    }
    updateThemeCache() {
      if (!document.documentElement) {
        return;
      }
      const style = getComputedStyle(document.documentElement);
      const isDark = document.documentElement.getAttribute("data-theme") === "dark" || document.documentElement.getAttribute("data-theme") === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      this.themeCache = {
        bgColor: isDark ? "#0f172a" : "#f8fafc",
        keyWhite: isDark ? "#cbd5e1" : "#ffffff",
        keyBlack: isDark ? "#1e293b" : "#1e293b",
        keySeparator: isDark ? "#334155" : "#e2e8f0",
        gridColorMeasure: isDark ? "rgba(56, 189, 248, 0.4)" : "rgba(2, 132, 199, 0.3)",
        gridColorBeat: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
        playheadColor: isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)",
        outlineColor: isDark ? "#000" : "#fff",
        labelColor: isDark ? "#64748b" : "#94a3b8",
        guideLineBlack: isDark ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.03)",
        guideLineWhite: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.05)",
        separatorColor: isDark ? "#334155" : "#cbd5e1",
        chordColors: [
          style.getPropertyValue("--blue").trim() || "#268bd2",
          // 0: root
          style.getPropertyValue("--green").trim() || "#859900",
          // 1: third
          style.getPropertyValue("--orange").trim() || "#cb4b16",
          // 2: fifth
          style.getPropertyValue("--magenta").trim() || "#d33682"
          // 3: seventh
        ]
      };
      this.intervalColors = INTERVAL_CATEGORY.map(
        (catIndex) => this.themeCache.chordColors[catIndex]
      );
      this.categoryColors = this.themeCache.chordColors;
      for (const name in this.tracks) {
        this.resolveTrackColor(name, style);
      }
      if (this.width && this.height) {
        this.renderStaticLayer();
      }
    }
    resolveTrackColor(name, style = null) {
      if (!this.tracks[name]) {
        return;
      }
      const track = this.tracks[name];
      if (track.color.startsWith("var(")) {
        if (!style) {
          style = getComputedStyle(document.documentElement);
        }
        const varName = track.color.slice(4, -1);
        track.resolvedColor = style.getPropertyValue(varName).trim() || "#3b82f6";
      } else {
        track.resolvedColor = track.color;
      }
    }
    initDOM() {
      this.container.style.position = "relative";
      this.canvas.style.display = "block";
      this.canvas.style.width = "100%";
      this.canvas.style.height = "100%";
      this.infoLayer = document.createElement("div");
      this.infoLayer.style.cssText = `
            position: absolute; top: 10px; left: ${this.pianoRollWidth + 10}px; right: 10px;
            display: flex; justify-content: space-between;
            pointer-events: none; z-index: var(--z-controls);
        `;
      this.container.appendChild(this.infoLayer);
    }
    resize(contentRect) {
      const dpr = window.devicePixelRatio || 1;
      const rect = contentRect || this.container?.getBoundingClientRect() || { width: 0, height: 0 };
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.width = rect.width;
      this.height = rect.height;
      this.ctx.scale(dpr, dpr);
      this.yScale = this.height / this.visualRange;
      this.midY = this.height / 2;
      this.timeScale = (this.width - this.pianoRollWidth) / this.windowSize;
      this.staticCanvas.width = this.canvas.width;
      this.staticCanvas.height = this.canvas.height;
      this.staticCtx.scale(dpr, dpr);
      this.renderStaticLayer();
    }
    // Optimization: Stable method for Y calculation to avoid closure allocation
    getY(m3) {
      return getYStandalone(m3, this.midY, this.centerMidi, this.yScale);
    }
    // Optimization: Stable method for X calculation to avoid closure allocation
    getX(t3, currentTime) {
      return getXStandalone(t3, currentTime, this.pianoRollWidth, this.timeScale);
    }
    renderStaticLayer() {
      if (!this.themeCache || !this.width || !this.height) {
        return;
      }
      const ctx = this.staticCtx;
      const w3 = this.width;
      const h3 = this.height;
      const yScale = this.yScale;
      const {
        bgColor,
        keyWhite,
        keyBlack,
        keySeparator,
        labelColor,
        guideLineBlack,
        guideLineWhite,
        separatorColor
      } = this.themeCache;
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w3, h3);
      const topMidi = this.centerMidi + this.visualRange / 2;
      const bottomMidi = this.centerMidi - this.visualRange / 2;
      const startMidi = floor2(bottomMidi);
      const endMidi = ceil2(topMidi);
      ctx.lineWidth = 1;
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let m3 = startMidi; m3 <= endMidi; m3++) {
        const y3 = this.getY(m3);
        const noteInOctave = m3 % 12;
        const isBlack = IS_BLACK[noteInOctave];
        ctx.fillStyle = isBlack ? keyBlack : keyWhite;
        ctx.fillRect(0, y3 - yScale / 2, this.pianoRollWidth, yScale);
        if (noteInOctave === 0) {
          ctx.fillStyle = labelColor;
          const octave = m3 / 12 - 1;
          ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y3);
        }
      }
      ctx.strokeStyle = keySeparator;
      ctx.beginPath();
      for (let m3 = startMidi; m3 <= endMidi; m3++) {
        const y3 = this.getY(m3);
        ctx.moveTo(0, y3 + yScale / 2);
        ctx.lineTo(this.pianoRollWidth, y3 + yScale / 2);
      }
      ctx.stroke();
      ctx.strokeStyle = guideLineWhite;
      ctx.beginPath();
      for (let m3 = startMidi; m3 <= endMidi; m3++) {
        const noteInOctave = m3 % 12;
        if (!IS_BLACK[noteInOctave]) {
          const y3 = this.getY(m3);
          ctx.moveTo(this.pianoRollWidth, y3);
          ctx.lineTo(w3, y3);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = guideLineBlack;
      ctx.beginPath();
      for (let m3 = startMidi; m3 <= endMidi; m3++) {
        const noteInOctave = m3 % 12;
        if (IS_BLACK[noteInOctave]) {
          const y3 = this.getY(m3);
          ctx.moveTo(this.pianoRollWidth, y3);
          ctx.lineTo(w3, y3);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = separatorColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.pianoRollWidth, 0);
      ctx.lineTo(this.pianoRollWidth, h3);
      ctx.stroke();
    }
    addTrack(name, color) {
      const label = document.createElement("div");
      label.style.color = color;
      label.style.fontWeight = "bold";
      label.style.fontSize = "1.2rem";
      label.style.textShadow = `0 0 2px #000`;
      label.textContent = "";
      this.infoLayer.appendChild(label);
      this.tracks[name] = {
        color,
        history: new RingBuffer(100),
        label
      };
      this.resolveTrackColor(name);
      if (!this.registers[name]) {
        this.registers[name] = 60;
      }
    }
    setRegister(name, midi2) {
      this.registers[name] = midi2;
    }
    setBeatReference(time) {
      this.beatReferenceTime = time;
    }
    pushNote(name, event) {
      if (!this.tracks[name]) {
        return;
      }
      this.tracks[name].history.push(event);
      if (event.noteName && event.octave) {
        this.tracks[name].label.textContent = `${event.noteName}${event.octave}`;
      }
    }
    pushChord(event) {
      this.chordEvents.push(event);
      while (this.chordEvents.length > 40) {
        this.chordEvents.shift();
      }
    }
    /**
     * Truncates any active notes on a track to end at the specified time.
     * Used for enforcing monophony in the visualizer.
     */
    truncateNotes(name, time) {
      if (!this.tracks[name]) {
        return;
      }
      for (const ev of this.tracks[name].history) {
        const noteEnd = ev.time + (ev.duration || 0.25);
        if (ev.time < time && noteEnd > time) {
          ev.duration = time - ev.time;
        }
      }
    }
    render(currentTime, bpm, tsConfig) {
      if (!this.container) {
        return;
      }
      if (!this.themeCache) {
        this.updateThemeCache();
      }
      if (!this.width || !this.height) {
        this.resize();
      }
      const ctx = this.ctx;
      const w3 = this.width;
      const h3 = this.height;
      const graphW = w3 - this.pianoRollWidth;
      const minTime = currentTime - this.windowSize;
      const yScale = this.yScale;
      const frameXBase = this.pianoRollWidth + currentTime * this.timeScale;
      const frameXScale = this.timeScale;
      const frameYBase = this.midY + this.centerMidi * this.yScale;
      const frameYScale = this.yScale;
      const { gridColorMeasure, gridColorBeat, playheadColor, outlineColor, chordColors } = this.themeCache;
      ctx.drawImage(this.staticCanvas, 0, 0, w3, h3);
      const topMidi = this.centerMidi + this.visualRange / 2;
      const bottomMidi = this.centerMidi - this.visualRange / 2;
      const startMidi = floor2(bottomMidi);
      const endMidi = ceil2(topMidi);
      const minOct = floor2(startMidi / 12);
      const maxOct = ceil2(endMidi / 12);
      this.cNotesBuffer.fill(0);
      for (let i3 = 0; i3 < 4; i3++) {
        this.activeChordBuffers[i3].length = 0;
      }
      for (const ev of this.chordEvents) {
        if (ev.time > currentTime) {
          break;
        }
        if (ev.time <= currentTime && ev.time + (ev.duration || 2) >= currentTime) {
          if (ev.notes) {
            const rootPC = ev.rootMidi % 12;
            for (const m3 of ev.notes) {
              if (m3 < startMidi || m3 > endMidi) {
                continue;
              }
              const interval = (m3 % 12 - rootPC + 12) % 12;
              const y3 = frameYBase - m3 * frameYScale;
              const colorIdx = INTERVAL_COLOR_INDEX[interval];
              this.activeChordBuffers[colorIdx].push(y3);
              if (m3 % 12 === 0) {
                this.cNotesBuffer[m3] = 1;
              }
            }
          }
        }
      }
      for (let i3 = 0; i3 < 4; i3++) {
        const buffer = this.activeChordBuffers[i3];
        if (buffer.length === 0) {
          continue;
        }
        ctx.fillStyle = this.categoryColors[i3];
        ctx.beginPath();
        for (let j4 = 0; j4 < buffer.length; j4++) {
          ctx.rect(0, buffer[j4] - yScale / 2, this.pianoRollWidth, yScale);
        }
        ctx.fill();
      }
      for (const name in this.tracks) {
        const track = this.tracks[name];
        const color = track.resolvedColor || track.color;
        ctx.fillStyle = color;
        const buffer = track.history.buffer;
        const capacity = track.history.capacity;
        const count = track.history.count;
        const start = track.history.start;
        const headLength = min2(count, capacity - start);
        let stop = false;
        for (let i3 = 0; i3 < headLength; i3++) {
          const ev = buffer[start + i3];
          if (ev.time > currentTime) {
            stop = true;
            break;
          }
          if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
            if (ev.midi >= startMidi && ev.midi <= endMidi) {
              const y3 = this.getY(ev.midi);
              ctx.fillRect(0, y3 - yScale / 2, this.pianoRollWidth, yScale);
              if (ev.midi % 12 === 0) {
                this.cNotesBuffer[ev.midi] = 1;
              }
            }
          }
        }
        if (!stop && headLength < count) {
          const tailLength = count - headLength;
          for (let i3 = 0; i3 < tailLength; i3++) {
            const ev = buffer[i3];
            if (ev.time > currentTime) {
              break;
            }
            if (ev.time <= currentTime && ev.time + (ev.duration || 0.25) >= currentTime) {
              if (ev.midi >= startMidi && ev.midi <= endMidi) {
                const y3 = this.getY(ev.midi);
                ctx.fillRect(0, y3 - yScale / 2, this.pianoRollWidth, yScale);
                if (ev.midi % 12 === 0) {
                  this.cNotesBuffer[ev.midi] = 1;
                }
              }
            }
          }
        }
      }
      ctx.fillStyle = "#fff";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const startC = ceil2(startMidi / 12) * 12;
      for (let m3 = startC; m3 <= endMidi; m3 += 12) {
        if (this.cNotesBuffer[m3]) {
          const y3 = this.getY(m3);
          const octave = m3 / 12 - 1;
          ctx.fillText(`C${octave}`, this.pianoRollWidth - 4, y3);
        }
      }
      if (bpm && this.beatReferenceTime !== null) {
        const ts = typeof tsConfig === "object" && tsConfig !== null ? tsConfig : { beats: tsConfig || 4, grouping: [tsConfig || 4], stepsPerBeat: 4 };
        const beatsPerMeasure = ts.beats;
        const beatLen = 60 / bpm;
        const startBeat = floor2((minTime - this.beatReferenceTime) / beatLen);
        ctx.lineWidth = 1;
        ctx.strokeStyle = gridColorMeasure;
        ctx.beginPath();
        for (let i3 = startBeat; ; i3++) {
          const t3 = this.beatReferenceTime + i3 * beatLen;
          if (t3 > currentTime + 0.1) {
            break;
          }
          if (i3 % beatsPerMeasure !== 0) {
            continue;
          }
          const x3 = this.getX(t3, currentTime);
          if (x3 < this.pianoRollWidth) {
            continue;
          }
          ctx.moveTo(x3, 0);
          ctx.lineTo(x3, h3);
        }
        ctx.stroke();
        ctx.beginPath();
        for (let i3 = startBeat; ; i3++) {
          const t3 = this.beatReferenceTime + i3 * beatLen;
          if (t3 > currentTime + 0.1) {
            break;
          }
          const beatInMeasure = (i3 % beatsPerMeasure + beatsPerMeasure) % beatsPerMeasure;
          if (beatInMeasure === 0) {
            continue;
          }
          const x3 = this.getX(t3, currentTime);
          if (x3 < this.pianoRollWidth) {
            continue;
          }
          let isGroupStart = false;
          if (ts.grouping && ts.grouping.length > 1) {
            let accumulated = 0;
            for (const g4 of ts.grouping) {
              if (beatInMeasure === accumulated) {
                isGroupStart = true;
                break;
              }
              accumulated += g4;
            }
          }
          if (isGroupStart) {
            ctx.strokeStyle = gridColorMeasure;
            ctx.globalAlpha = 0.4;
            ctx.moveTo(x3, 0);
            ctx.lineTo(x3, h3);
            ctx.stroke();
            ctx.beginPath();
            ctx.globalAlpha = 1;
          } else {
            ctx.strokeStyle = gridColorBeat;
            ctx.moveTo(x3, 0);
            ctx.lineTo(x3, h3);
          }
        }
        ctx.stroke();
      }
      if (this.isFillActive) {
        const yMin = this.getY(52);
        const yMax = this.getY(36);
        const fillGradient = ctx.createLinearGradient(
          this.pianoRollWidth,
          yMin,
          this.pianoRollWidth,
          yMax
        );
        fillGradient.addColorStop(0, "rgba(211, 54, 130, 0)");
        fillGradient.addColorStop(0.5, "rgba(211, 54, 130, 0.15)");
        fillGradient.addColorStop(1, "rgba(211, 54, 130, 0)");
        ctx.fillStyle = fillGradient;
        ctx.fillRect(this.pianoRollWidth, yMin, graphW, yMax - yMin);
      }
      ctx.globalAlpha = 0.1;
      for (let i3 = 0; i3 < 4; i3++) {
        this.guideToneBuffers[i3].length = 0;
      }
      for (const ev of this.chordEvents) {
        const chordEnd = ev.time + (ev.duration || 2);
        if (chordEnd < minTime) {
          continue;
        }
        if (ev.time > currentTime) {
          break;
        }
        if (!ev.intervals) {
          continue;
        }
        const start = max2(minTime, ev.time);
        const end = min2(currentTime, chordEnd);
        const xStart = frameXBase - start * frameXScale;
        const xEnd = frameXBase - end * frameXScale;
        const x3 = xEnd;
        const cw = xStart - xEnd;
        const rootPC = ev.rootMidi % 12;
        for (const interval of ev.intervals) {
          const pc = ((rootPC + interval) % 12 + 12) % 12;
          const colorIdx = INTERVAL_COLOR_INDEX[(interval % 12 + 12) % 12];
          const buffer = this.guideToneBuffers[colorIdx];
          for (let oct = minOct; oct <= maxOct; oct++) {
            const m3 = pc + oct * 12;
            const y3 = round2(frameYBase - m3 * frameYScale);
            if (y3 >= -10 && y3 <= h3 + 10) {
              buffer.push(x3, y3 - yScale / 2, cw, yScale);
            }
          }
        }
      }
      for (let i3 = 0; i3 < 4; i3++) {
        const buffer = this.guideToneBuffers[i3];
        if (buffer.length === 0) {
          continue;
        }
        ctx.fillStyle = this.categoryColors[i3];
        ctx.beginPath();
        for (let j4 = 0; j4 < buffer.length; j4 += 4) {
          ctx.rect(buffer[j4], buffer[j4 + 1], buffer[j4 + 2], buffer[j4 + 3]);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 0.5;
      for (let i3 = 0; i3 < 4; i3++) {
        this.guideToneBuffers[i3].length = 0;
      }
      for (const ev of this.chordEvents) {
        const chordEnd = ev.time + (ev.duration || 2);
        if (chordEnd < minTime) {
          continue;
        }
        if (ev.time > currentTime) {
          break;
        }
        if (!ev.notes) {
          continue;
        }
        const start = max2(minTime, ev.time);
        const end = min2(currentTime, chordEnd);
        const xStart = frameXBase - start * frameXScale;
        const xEnd = frameXBase - end * frameXScale;
        const x3 = xEnd;
        const cw = xStart - xEnd;
        const rootPC = ev.rootMidi % 12;
        for (const midi2 of ev.notes) {
          const y3 = round2(frameYBase - midi2 * frameYScale);
          const interval = (midi2 % 12 - rootPC + 12) % 12;
          const colorIdx = INTERVAL_COLOR_INDEX[interval];
          if (y3 >= -10 && y3 <= h3 + 10) {
            this.guideToneBuffers[colorIdx].push(x3, y3 - yScale / 2 + 2, cw, yScale - 4);
          }
        }
      }
      for (let i3 = 0; i3 < 4; i3++) {
        const buffer = this.guideToneBuffers[i3];
        if (buffer.length === 0) {
          continue;
        }
        ctx.fillStyle = this.categoryColors[i3];
        ctx.beginPath();
        for (let j4 = 0; j4 < buffer.length; j4 += 4) {
          ctx.rect(buffer[j4], buffer[j4 + 1], buffer[j4 + 2], buffer[j4 + 3]);
        }
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const name in this.tracks) {
        const track = this.tracks[name];
        let activeX = -10, activeY = -10, isActive = false, activeColor = null;
        if (name === "drums") {
          ctx.fillStyle = track.resolvedColor || track.color;
          ctx.beginPath();
          const buffer = track.history.buffer;
          const capacity = track.history.capacity;
          const count = track.history.count;
          const start = track.history.start;
          const headLength = min2(count, capacity - start);
          let stop = false;
          for (let i3 = 0; i3 < headLength; i3++) {
            const ev = buffer[start + i3];
            if (ev.time > currentTime) {
              stop = true;
              break;
            }
            const noteEnd = ev.time + (ev.duration || 0.1);
            if (noteEnd < minTime) {
              continue;
            }
            const x3 = frameXBase - ev.time * frameXScale;
            const y3 = round2(frameYBase - ev.midi * frameYScale);
            const intensity = ev.velocity || 1;
            ctx.moveTo(x3, y3 - 6 * intensity);
            ctx.lineTo(x3 + 4 * intensity, y3);
            ctx.lineTo(x3, y3 + 6 * intensity);
            ctx.lineTo(x3 - 4 * intensity, y3);
          }
          if (!stop && headLength < count) {
            const tailLength = count - headLength;
            for (let i3 = 0; i3 < tailLength; i3++) {
              const ev = buffer[i3];
              if (ev.time > currentTime) {
                break;
              }
              const noteEnd = ev.time + (ev.duration || 0.1);
              if (noteEnd < minTime) {
                continue;
              }
              const x3 = frameXBase - ev.time * frameXScale;
              const y3 = round2(frameYBase - ev.midi * frameYScale);
              const intensity = ev.velocity || 1;
              ctx.moveTo(x3, y3 - 6 * intensity);
              ctx.lineTo(x3 + 4 * intensity, y3);
              ctx.lineTo(x3, y3 + 6 * intensity);
              ctx.lineTo(x3 - 4 * intensity, y3);
            }
          }
          ctx.fill();
          continue;
        }
        const color = track.resolvedColor || track.color;
        if (name === MODULES.SOLOIST) {
          const baseWidth = 4;
          for (let b2 = 0; b2 < 4; b2++) {
            this.soloistBuffers[b2].length = 0;
          }
          const buffer = track.history.buffer;
          const capacity = track.history.capacity;
          const count = track.history.count;
          const start = track.history.start;
          const headLength = min2(count, capacity - start);
          let stop = false;
          for (let i3 = 0; i3 < headLength; i3++) {
            const ev = buffer[start + i3];
            if (ev.time > currentTime) {
              stop = true;
              break;
            }
            const noteEnd = ev.time + (ev.duration || 0.25);
            if (noteEnd < minTime) {
              continue;
            }
            const startT = max2(minTime, ev.time);
            const endT = min2(currentTime, noteEnd);
            const x1 = frameXBase - startT * frameXScale;
            const x22 = frameXBase - endT * frameXScale;
            const y3 = round2(frameYBase - ev.midi * frameYScale);
            if (y3 >= -10 && y3 <= h3 + 10) {
              let typeCode = 0;
              if (ev.noteType === "arp") {
                typeCode = 1;
              } else if (ev.noteType === "target") {
                typeCode = 2;
              } else if (ev.noteType === "altered") {
                typeCode = 3;
              }
              this.soloistBuffers[typeCode].push(x1, y3, x22);
              if (ev.time <= currentTime && noteEnd >= currentTime) {
                activeX = x22;
                activeY = y3;
                isActive = true;
                if (ev.noteType === "arp") {
                  activeColor = chordColors[2];
                } else if (ev.noteType === "target") {
                  activeColor = chordColors[0];
                } else if (ev.noteType === "altered") {
                  activeColor = chordColors[3];
                } else {
                  activeColor = color;
                }
              }
            }
          }
          if (!stop && headLength < count) {
            const tailLength = count - headLength;
            for (let i3 = 0; i3 < tailLength; i3++) {
              const ev = buffer[i3];
              if (ev.time > currentTime) {
                break;
              }
              const noteEnd = ev.time + (ev.duration || 0.25);
              if (noteEnd < minTime) {
                continue;
              }
              const startT = max2(minTime, ev.time);
              const endT = min2(currentTime, noteEnd);
              const x1 = frameXBase - startT * frameXScale;
              const x22 = frameXBase - endT * frameXScale;
              const y3 = round2(frameYBase - ev.midi * frameYScale);
              if (y3 >= -10 && y3 <= h3 + 10) {
                let typeCode = 0;
                if (ev.noteType === "arp") {
                  typeCode = 1;
                } else if (ev.noteType === "target") {
                  typeCode = 2;
                } else if (ev.noteType === "altered") {
                  typeCode = 3;
                }
                this.soloistBuffers[typeCode].push(x1, y3, x22);
                if (ev.time <= currentTime && noteEnd >= currentTime) {
                  activeX = x22;
                  activeY = y3;
                  isActive = true;
                  if (ev.noteType === "arp") {
                    activeColor = chordColors[2];
                  } else if (ev.noteType === "target") {
                    activeColor = chordColors[0];
                  } else if (ev.noteType === "altered") {
                    activeColor = chordColors[3];
                  } else {
                    activeColor = color;
                  }
                }
              }
            }
          }
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth = baseWidth + 2;
          ctx.beginPath();
          let hasOutline = false;
          for (let b2 = 0; b2 < 4; b2++) {
            const buf = this.soloistBuffers[b2];
            if (buf.length > 0) {
              hasOutline = true;
              for (let j4 = 0; j4 < buf.length; j4 += 3) {
                ctx.moveTo(buf[j4], buf[j4 + 1]);
                ctx.lineTo(buf[j4 + 2], buf[j4 + 1]);
              }
            }
          }
          if (hasOutline) {
            ctx.stroke();
          }
          ctx.lineWidth = baseWidth;
          if (this.soloistBuffers[0].length > 0) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            const buf = this.soloistBuffers[0];
            for (let j4 = 0; j4 < buf.length; j4 += 3) {
              ctx.moveTo(buf[j4], buf[j4 + 1]);
              ctx.lineTo(buf[j4 + 2], buf[j4 + 1]);
            }
            ctx.stroke();
          }
          if (this.soloistBuffers[2].length > 0) {
            ctx.strokeStyle = chordColors[0];
            ctx.beginPath();
            const buf = this.soloistBuffers[2];
            for (let j4 = 0; j4 < buf.length; j4 += 3) {
              ctx.moveTo(buf[j4], buf[j4 + 1]);
              ctx.lineTo(buf[j4 + 2], buf[j4 + 1]);
            }
            ctx.stroke();
          }
          if (this.soloistBuffers[1].length > 0) {
            ctx.strokeStyle = chordColors[2];
            ctx.beginPath();
            const buf = this.soloistBuffers[1];
            for (let j4 = 0; j4 < buf.length; j4 += 3) {
              ctx.moveTo(buf[j4], buf[j4 + 1]);
              ctx.lineTo(buf[j4 + 2], buf[j4 + 1]);
            }
            ctx.stroke();
          }
          if (this.soloistBuffers[3].length > 0) {
            ctx.strokeStyle = chordColors[3];
            ctx.beginPath();
            const buf = this.soloistBuffers[3];
            for (let j4 = 0; j4 < buf.length; j4 += 3) {
              ctx.moveTo(buf[j4], buf[j4 + 1]);
              ctx.lineTo(buf[j4 + 2], buf[j4 + 1]);
            }
            ctx.stroke();
          }
        } else {
          const baseWidth = 5;
          let hasNotes = false;
          ctx.beginPath();
          const buffer = track.history.buffer;
          const capacity = track.history.capacity;
          const count = track.history.count;
          const start = track.history.start;
          const headLength = min2(count, capacity - start);
          let stop = false;
          for (let i3 = 0; i3 < headLength; i3++) {
            const ev = buffer[start + i3];
            if (ev.time > currentTime) {
              stop = true;
              break;
            }
            const noteEnd = ev.time + (ev.duration || 0.25);
            if (noteEnd < minTime) {
              continue;
            }
            const startT = max2(minTime, ev.time);
            const endT = min2(currentTime, noteEnd);
            const x1 = frameXBase - startT * frameXScale;
            const x22 = frameXBase - endT * frameXScale;
            const y3 = round2(frameYBase - ev.midi * frameYScale);
            if (y3 >= -10 && y3 <= h3 + 10) {
              ctx.moveTo(x1, y3);
              ctx.lineTo(x22, y3);
              hasNotes = true;
              if (ev.time <= currentTime && noteEnd >= currentTime) {
                activeX = x22;
                activeY = y3;
                isActive = true;
                activeColor = color;
              }
            }
          }
          if (!stop && headLength < count) {
            const tailLength = count - headLength;
            for (let i3 = 0; i3 < tailLength; i3++) {
              const ev = buffer[i3];
              if (ev.time > currentTime) {
                break;
              }
              const noteEnd = ev.time + (ev.duration || 0.25);
              if (noteEnd < minTime) {
                continue;
              }
              const startT = max2(minTime, ev.time);
              const endT = min2(currentTime, noteEnd);
              const x1 = frameXBase - startT * frameXScale;
              const x22 = frameXBase - endT * frameXScale;
              const y3 = round2(frameYBase - ev.midi * frameYScale);
              if (y3 >= -10 && y3 <= h3 + 10) {
                ctx.moveTo(x1, y3);
                ctx.lineTo(x22, y3);
                hasNotes = true;
                if (ev.time <= currentTime && noteEnd >= currentTime) {
                  activeX = x22;
                  activeY = y3;
                  isActive = true;
                  activeColor = color;
                }
              }
            }
          }
          if (hasNotes) {
            ctx.strokeStyle = outlineColor;
            ctx.lineWidth = baseWidth + 2;
            ctx.stroke();
            ctx.strokeStyle = color;
            ctx.lineWidth = baseWidth;
            ctx.stroke();
          }
        }
        if (isActive) {
          ctx.fillStyle = activeColor || "#fff";
          ctx.strokeStyle = outlineColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(activeX, activeY, 6, 0, PI2 * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.strokeStyle = playheadColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.pianoRollWidth, 0);
      ctx.lineTo(this.pianoRollWidth, h3);
      ctx.stroke();
    }
    clear() {
      for (const name in this.tracks) {
        this.tracks[name].history.clear();
        this.tracks[name].label.textContent = "";
      }
      this.chordEvents = [];
      if (this.width && this.height) {
        this.ctx.clearRect(0, 0, this.width, this.height);
      }
    }
    destroy() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect();
        this.resizeObserver = null;
      }
      if (this.themeObserver) {
        this.themeObserver.disconnect();
        this.themeObserver = null;
      }
      if (this.themeMediaQuery && this.themeListener) {
        this.themeMediaQuery.removeEventListener("change", this.themeListener);
        this.themeMediaQuery = null;
        this.themeListener = null;
      }
      if (this.canvas?.parentNode) {
        this.canvas.parentNode.removeChild(this.canvas);
      }
      if (this.infoLayer?.parentNode) {
        this.infoLayer.parentNode.removeChild(this.infoLayer);
      }
      this.staticCanvas = null;
      this.staticCtx = null;
    }
  };

  // public/main.js
  init_worker_client();
  var viz;
  function init() {
    const { playback: playback6, groove: groove2 } = getState();
    try {
      hydrateState();
      loadFromUrl();
      validateProgression();
      mountComponents();
      initWorker(
        () => scheduler(),
        (notes, requestTimestamp, workerProcessTime, isResolution) => {
          const { playback: playback7, soloist: soloist2, bass: bass2, harmony: harmony2, chords: chords2, groove: groove3 } = getState();
          if (playback7.resolutionTriggered && !isResolution) {
            return;
          }
          if (requestTimestamp) {
            const now = performance.now();
            const roundTrip = now - requestTimestamp;
            const logicLatency = roundTrip - (workerProcessTime || 0);
            if (logicLatency > 50) {
              console.warn(
                `[Performance] High Logic Latency: ${logicLatency.toFixed(1)}ms (Worker: ${workerProcessTime?.toFixed(1)}ms)`
              );
            }
          }
          const sbUpdatedSteps = /* @__PURE__ */ new Set();
          const bassUpdatedSteps = /* @__PURE__ */ new Set();
          notes.forEach((n2) => {
            if (n2.module === "bass") {
              if (!bassUpdatedSteps.has(n2.step)) {
                bass2.buffer.set(n2.step, []);
                bassUpdatedSteps.add(n2.step);
              }
              bass2.buffer.get(n2.step).push(n2);
            } else if (n2.module === "soloist") {
              if (!soloist2.doubleStops && soloist2.buffer.has(n2.step)) {
                return;
              }
              if (!sbUpdatedSteps.has(n2.step)) {
                soloist2.buffer.set(n2.step, []);
                sbUpdatedSteps.add(n2.step);
              }
              soloist2.buffer.get(n2.step).push(n2);
            } else if (n2.module === "harmony") {
              if (!harmony2.buffer.has(n2.step)) {
                harmony2.buffer.set(n2.step, []);
              }
              harmony2.buffer.get(n2.step).push(n2);
            } else if (n2.module === "chords") {
              if (!chords2.buffer.has(n2.step)) {
                chords2.buffer.set(n2.step, []);
              }
              chords2.buffer.get(n2.step).push(n2);
            } else if (n2.module === "groove") {
              if (!groove3.buffer.has(n2.step)) {
                groove3.buffer.set(n2.step, []);
              }
              groove3.buffer.get(n2.step).push(n2);
            }
          });
          if (playback7.isPlaying) {
            scheduler();
          }
        }
      );
      viz = new UnifiedVisualizer("unifiedVizContainer");
      playback6.viz = viz;
      viz.addTrack("bass", "var(--success-color)");
      viz.addTrack("soloist", "var(--soloist-color)");
      viz.addTrack("harmony", "var(--harmony-color)");
      viz.addTrack("drums", "var(--text-color)");
      setInstrumentControllerRefs(() => scheduler(), viz);
      const hasDrumPattern = groove2.instruments.some((inst) => inst.steps.some((s3) => s3 > 0));
      if (!hasDrumPattern) {
        loadDrumPreset(groove2.lastDrumPreset || "Basic Rock");
      }
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          if (playback6.audio && playback6.audio.state === "suspended" && playback6.isPlaying) {
            playback6.audio.resume().catch(() => {
            });
          }
        }
      });
      analyzeFormUI();
      subscribe((action, payload) => syncWorker(action, payload));
      syncWorker();
    } catch (e3) {
      console.error("Error during init:", e3);
    }
  }
  window.previewChord = (index) => {
    const { playback: playback6, arranger: arranger6 } = getState();
    if (playback6.isPlaying) {
      return;
    }
    initAudio();
    const chord = arranger6.progression[index];
    if (!chord) {
      return;
    }
    const wasSustainActive = playback6.sustainActive;
    playback6.sustainActive = false;
    const now = playback6.audio.currentTime;
    chord.freqs.forEach((f3) => playNote(f3, now, 1, { vol: 0.15, instrument: "Piano" }));
    playback6.sustainActive = wasSustainActive;
    const cards = document.querySelectorAll(".chord-card");
    if (cards[index]) {
      cards[index].classList.add("active");
      setTimeout(() => {
        if (!playback6.isPlaying) {
          cards[index].classList.remove("active");
        }
      }, 300);
    }
  };
  window.addEventListener("load", () => {
    requestAnimationFrame(() => {
      init();
      initPWA();
    });
  });
})();
