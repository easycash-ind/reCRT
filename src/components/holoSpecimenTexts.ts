import type { HoloSpecimenId } from "./CrestedIrisHoloHeroCanvas";

export interface SpecimenSurroundingTexts {
  headerCode: string;
  dispersionLine1: string;
  dispersionLine2: string;
  chartTitle: string;
  chartSub: string;
  topRightList: readonly [string, string, string, string];
  matrixHeader: string;
  matrixCells: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  leftTopTitle: string;
  leftTopBadge: string;
  leftTopGrid: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  leftTopScaleTag: string;
  nutrientTitle: string;
  nutrientLabel: string;
  nutrientUnit: string;
  nutrientRateLabel: string;
  leftMidTitle: string;
  leftMidDesc: string;
  leftMidVectorTag: string;
  leftMidVectorDesc: string;
  leftBotTitle: string;
  leftBotValue: string;
  leftBotDesc: string;
  leftBotMetrics: readonly [
    [string, string],
    [string, string],
    [string, string],
  ];
  rightMidTopBadge: string;
  rightMidTopTitle: string;
  rightMidTopGrid: readonly [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  rightMidTopFormula: string;
  rightAxisTitle: string;
  rightAxisLine1: string;
  rightAxisLine2: string;
  rightBotTitle: string;
  rightBotStatus: string;
  rightBotMetrics: readonly [string, string, string];
  rightBotArchive: string;
  footerCol1Title: string;
  footerCol1Desc: string;
  footerCol2Title: string;
  footerCol2Desc: string;
  footerCol3Title: string;
  footerCol3Desc: string;
  footerStemTag: string;
  footerCol5Code: string;
  footerCol5Desc: string;
}

export const HOLO_SPECIMEN_TEXTS: Record<
  HoloSpecimenId,
  SpecimenSurroundingTexts
> = {
  iris: {
    headerCode: "CROPEA",
    dispersionLine1: "REFRACTIVE DISPERSION: N_D = 1.492",
    dispersionLine2: "THIN-FILM PHASE: 380NM — 740NM",
    chartTitle: "SLRMEI // SPECTRAL",
    chartSub: "INTERFERENCE HARMONICS [A/B]",
    topRightList: [
      "558.2 // LAMELLAR_PHASE",
      "049.8 // CREST_FIMBRIAE",
      "104.7 // VASCULAR_FLUX",
      "882.1 // CHLORO_STEM",
    ],
    matrixHeader: "02880 // 11.40 · CRESTED_IRIS",
    matrixCells: [
      "λ_CYAN: 486nm",
      "λ_VIOL: 412nm",
      "λ_CORAL: 615nm",
      "Q_F: 0.942",
      "ΔΦ: +1.84rad",
      "ISO: 3.20/mm",
      "TEPAL: 6-SEG",
      "STYLE: 3-LOBE",
      "STEM: +0.00X",
    ],
    leftTopTitle: "MIRE // 10.884-B",
    leftTopBadge: "[LOCKED]",
    leftTopGrid: [
      "CH_01: 0.9418",
      "PHASE: +14.2°",
      "CH_02: 0.8724",
      "PHASE: -08.6°",
      "CH_03: 1.1205",
      "PHASE: +29.4°",
      "CH_04: 0.6410",
      "PHASE: +03.1°",
    ],
    leftTopScaleTag: "Δλ=0.04nm",
    nutrientTitle: "NUTRIENT_FLUX // ATP-07",
    nutrientLabel: "CONSUMED_BIO:",
    nutrientUnit: "μM",
    nutrientRateLabel: "SPARK_DRAIN:",
    leftMidTitle: "PEWT 45.0",
    leftMidDesc:
      "OUTER TEPALS SPREADING, OBOVATE-ELLIPTIC WITH FIMBRIATE MARGIN AND VIOLET-RINGED ORANGE CREST RIDGES.",
    leftMidVectorTag: "MORPH_VECTOR // 04",
    leftMidVectorDesc: "GEODESIC ISOLINE DENSITY: 32.0 L/CM · LAPLACIAN: +0.74",
    leftBotTitle: "KINETIC_INTEGRAL // Σ_09",
    leftBotValue: "305.7 mV",
    leftBotDesc:
      "DIELECTRIC PERMITTIVITY ALONG EPIDERMAL CUTICLE FOLDS EXHIBITS ANISOTROPIC BIREFRINGENCE UNDER GRAZING INCIDENCE.",
    leftBotMetrics: [
      ["GAIN_X", "+4.82dB"],
      ["NOISE_FL", "-94.1dB"],
      ["COHERENCE", "0.9962"],
    ],
    rightMidTopBadge: "[INTERF_M4]",
    rightMidTopTitle: "SPECTRAL_LATTICE // 72",
    rightMidTopGrid: [
      "BAND_A: 412.4nm",
      "IOR_1: 1.514",
      "BAND_B: 486.1nm",
      "IOR_2: 1.492",
      "BAND_C: 542.8nm",
      "IOR_3: 1.478",
      "BAND_D: 612.8nm",
      "IOR_4: 1.461",
    ],
    rightMidTopFormula:
      "CONSTRUCTIVE PATH DIFFERENCE: 2·n·d·cos(θ) = (m - 1/2)·λ",
    rightAxisTitle: "OPTICAL AXIS // +Z_00",
    rightAxisLine1: "AZIMUTH: -58.0° · ELEVATION: +28.0° · TILT: +25.0°",
    rightAxisLine2: "PERIANTH TUBE COHERENCE: 99.4% · STYLE: 3 CRESTS",
    rightBotTitle: "VASCULAR_TELEMETRY // IX-08",
    rightBotStatus: "SYNC_OK",
    rightBotMetrics: ["FLUX: 18.4lm", "ATTEN: 0.12/cm", "HASH: 0x7F4A"],
    rightBotArchive:
      "HERBARIUM ARCHIVE · TAXONOMIC VERIFICATION NODE [IRIDACEAE_JP]",
    footerCol1Title: "RAYO SFEARTH",
    footerCol1Desc:
      "IRIDESCENCE FIELD HARMONICS & DIELECTRIC FILM DISPERSION MATRIX [MODE_IV].",
    footerCol2Title: "LARIV MCTH CRAAII",
    footerCol2Desc:
      "PARAMETRIC FLOW CONTOURS ALONG OUTER FALL LAMINA & FIMBRIATE STYLE ARMS.",
    footerCol3Title: "RAMX E ORANCT",
    footerCol3Desc:
      "CORAL-AMBER CREST PAPILLAE LUMINESCENCE · PEAK 612.8 NM.",
    footerStemTag: "[STEM_AXIS // X:0.00]",
    footerCol5Code: "0257",
    footerCol5Desc: "VERTS: 24,741 // _IRIS_META 4-CH BAKED ATTRIBUTES.",
  },

  orchid: {
    headerCode: "GYNOSTEM",
    dispersionLine1: "BIREFRINGENCE INDEX: ΔN = 0.168",
    dispersionLine2: "LABELLUM RESONANCE: 410NM — 685NM",
    chartTitle: "ZYGOMORPH // HARMONIC",
    chartSub: "LABELLUM DIFFRACTION [L1/L2]",
    topRightList: [
      "714.6 // GYNOSTEMIUM_ARC",
      "082.3 // POLLINIA_OCTAD",
      "319.0 // RESUPINATE_TORSION",
      "604.5 // KEEL_LAMELLAE",
    ],
    matrixHeader: "04190 // 08.75 · GROUND_ORCHID",
    matrixCells: [
      "λ_VIOL: 438nm",
      "λ_MAGE: 572nm",
      "λ_GOLD: 604nm",
      "Q_F: 0.968",
      "ΔΦ: +2.41rad",
      "KEEL: 5-RIDGE",
      "SEPAL: 3-SEG",
      "PETAL: 2+1LIP",
      "OVARY: 180°TW",
    ],
    leftTopTitle: "EPICHILE // 24.610-K",
    leftTopBadge: "[PHASE_SYNC]",
    leftTopGrid: [
      "LP_01: 1.2840",
      "TORQ: +180.0°",
      "LP_02: 0.9104",
      "KEEL: +1.42mm",
      "LP_03: 1.4520",
      "HOOD: -12.4°",
      "LP_04: 0.7832",
      "WING: +34.8°",
    ],
    leftTopScaleTag: "Δn=0.168",
    nutrientTitle: "MYCORRHIZA_ATP // ORC-12",
    nutrientLabel: "SYMBIOTIC_BIO:",
    nutrientUnit: "nmol",
    nutrientRateLabel: "KEEL_DRAIN:",
    leftMidTitle: "LABELLUM 82.4",
    leftMidDesc:
      "ZYGOMORPHIC PERIANTH WITH THREE SPREADING LANCEOLATE SEPALS; TRILOBED LIP BEARING FIVE UNDULATE PARALLEL LAMELLAR CRESTS.",
    leftMidVectorTag: "COLUMN_VECTOR // 09",
    leftMidVectorDesc:
      "GYNOSTEMIUM WING SPAN: 18.5 MM · GAUSSIAN CURVATURE: +1.12",
    leftBotTitle: "RESUPINATION_TORQUE // Ω_14",
    leftBotValue: "418.2 mV",
    leftBotDesc:
      "HELICAL VASCULAR TORSION ACROSS PEDICELLATE OVARY DRIVES ANISOTROPIC WAVEGUIDE COUPLING INTO UNDULATE LABELLUM RIDGES.",
    leftBotMetrics: [
      ["TORSION", "+180.0°"],
      ["Q_FACTOR", "14.85"],
      ["COUPLING", "0.9984"],
    ],
    rightMidTopBadge: "[CREST_WG]",
    rightMidTopTitle: "WAVEGUIDE_ARRAY // 38",
    rightMidTopGrid: [
      "RIDGE_1: 438.2nm",
      "N_EFF: 1.542",
      "RIDGE_2: 492.0nm",
      "N_EFF: 1.518",
      "RIDGE_3: 556.4nm",
      "N_EFF: 1.496",
      "RIDGE_4: 618.9nm",
      "N_EFF: 1.472",
    ],
    rightMidTopFormula: "COUPLED LAMELLAR MODE: β(ω) = (2π/λ) · n_eff(θ, z)",
    rightAxisTitle: "ZYGOMORPHIC AXIS // +Z_02",
    rightAxisLine1: "AZIMUTH: -90.0° · ELEVATION: -35.0° · SYMMETRY: C_1V",
    rightAxisLine2: "GYNOSTEMIUM ALIGNMENT: 99.7% · POLLINIA: 8 WAXY MASSES",
    rightBotTitle: "ORCHID_TELEMETRY // BS-25",
    rightBotStatus: "RESONANT",
    rightBotMetrics: ["FLUX: 22.8lm", "ATTEN: 0.09/cm", "HASH: 0x9C1E"],
    rightBotArchive:
      "HERBARIUM ARCHIVE · TAXONOMIC VERIFICATION NODE [ORCHIDACEAE_JP]",
    footerCol1Title: "EPIPHYTE MATRIX",
    footerCol1Desc:
      "ZYGOMORPHIC WAVEGUIDE DISPERSION & PSEUDOBULB BIO-CAPACITANCE [MODE_II].",
    footerCol2Title: "LABELLUM CRESTS",
    footerCol2Desc:
      "FIVE UNDULATE LONGITUDINAL LAMELLAE GUIDING PHOTONIC SPARK PROPAGATION.",
    footerCol3Title: "POLLINIA OCTAD",
    footerCol3Desc:
      "ROSTELLUM VISCIDIUM LUMINESCENCE · RESONANT PEAK 594.2 NM.",
    footerStemTag: "[OVARY_AXIS // X:0.00]",
    footerCol5Code: "0512",
    footerCol5Desc: "VERTS: 21,029 // _IRIS_META 4-CH BAKED ATTRIBUTES.",
  },

  sakura: {
    headerCode: "ANTHOS",
    dispersionLine1: "ANTHOCYANIN TRANSMIT: T_0 = 91.4%",
    dispersionLine2: "COROLLA SPECTRUM: 435NM — 710NM",
    chartTitle: "CALYX_FLUX // PHOTONIC",
    chartSub: "NECTARY ABSORPTION [P1/P2]",
    topRightList: [
      "392.4 // HYPANTHIUM_CUP",
      "128.0 // ANTHER_CORONA",
      "512.9 // EMARGINATE_NOTCH",
      "740.2 // PEDICEL_XYLEM",
    ],
    matrixHeader: "07320 // 03.18 · KAWAZU_SAKURA",
    matrixCells: [
      "λ_ROSE: 518nm",
      "λ_CYAN: 472nm",
      "λ_AMBR: 608nm",
      "Q_F: 0.954",
      "ΔΦ: +1.36rad",
      "NOTCH: BIFID",
      "PETAL: 5-FREE",
      "STAMEN: 38-FIL",
      "CALYX: 5-LOBE",
    ],
    leftTopTitle: "COROLLA // 05.392-S",
    leftTopBadge: "[C5_BLOOM]",
    leftTopGrid: [
      "PT_01: 0.9812",
      "AZIM: +072.0°",
      "PT_02: 1.0420",
      "AZIM: +144.0°",
      "PT_03: 0.9645",
      "AZIM: +216.0°",
      "PT_04: 1.0180",
      "AZIM: +288.0°",
    ],
    leftTopScaleTag: "C5_SYM=99.2%",
    nutrientTitle: "SAP_METABOLISM // PRU-05",
    nutrientLabel: "NECTAR_UPTAKE:",
    nutrientUnit: "μL",
    nutrientRateLabel: "XYLEM_DRAIN:",
    leftMidTitle: "PRUNUS 64.8",
    leftMidDesc:
      "ACTINOMORPHIC FIVE-PETALED COROLLA WITH APICAL EMARGINATE NOTCHES, CAMPANULATE HYPANTHIUM TUBE AND RADIATING STAMEN CORONA.",
    leftMidVectorTag: "FLORAL_VECTOR // 05",
    leftMidVectorDesc:
      "FILAMENT CORONA RADIUS: 14.2 MM · RADIAL ISOLINES: 36.0 L/CM",
    leftBotTitle: "TRANSPIRATION_FIELD // Ψ_03",
    leftBotValue: "264.9 mV",
    leftBotDesc:
      "RADIAL WATER POTENTIAL GRADIENT FROM HYPANTHIUM RECEPTACLE TO BIFID PETAL MARGINS SUSTAINS LAMINAR PHOTON TRANSPORT.",
    leftBotMetrics: [
      ["PRESSURE", "0.72MPa"],
      ["CONDUCT", "18.64"],
      ["ISOTROPY", "0.9948"],
    ],
    rightMidTopBadge: "[STAMEN_38]",
    rightMidTopTitle: "CORONA_DISPERSION // 94",
    rightMidTopGrid: [
      "RING_IN: 465.0nm",
      "IOR_A: 1.488",
      "RING_MD: 512.5nm",
      "IOR_B: 1.474",
      "RING_EX: 578.2nm",
      "IOR_C: 1.459",
      "ANTHER: 608.4nm",
      "IOR_D: 1.448",
    ],
    rightMidTopFormula:
      "PENTAMEROUS CORONA DIFFRACTION: I(θ) = I_0 · sinc²(5·k·a·sinθ)",
    rightAxisTitle: "ACTINOMORPHIC AXIS // +Z_03",
    rightAxisLine1: "AZIMUTH: -80.0° · ELEVATION: +30.0° · SYMMETRY: C_5",
    rightAxisLine2: "HYPANTHIUM COHERENCE: 99.6% · ANTHERS: 38 FILAMENTS",
    rightBotTitle: "SAKURA_TELEMETRY // PL-03",
    rightBotStatus: "BLOOM_OK",
    rightBotMetrics: ["FLUX: 26.1lm", "ATTEN: 0.08/cm", "HASH: 0x3A8D"],
    rightBotArchive:
      "HERBARIUM ARCHIVE · TAXONOMIC VERIFICATION NODE [ROSACEAE_JP]",
    footerCol1Title: "PRUNUS SPECTRA",
    footerCol1Desc:
      "PENTAMEROUS THIN-FILM REFRACTION & HYPANTHIUM NECTARY FIELD [MODE_V].",
    footerCol2Title: "EMARGINATE VEINS",
    footerCol2Desc:
      "DICHOTOMOUS RADIAL VASCULAR BUNDLES TERMINATING AT APICAL PETAL NOTCHES.",
    footerCol3Title: "ANTHER CORONA",
    footerCol3Desc:
      "POLYANDROUS GOLDEN POLLEN SAC LUMINESCENCE · PEAK 608.4 NM.",
    footerStemTag: "[PEDICEL_AXIS // X:0.00]",
    footerCol5Code: "0803",
    footerCol5Desc: "VERTS: 28,613 // _IRIS_META 4-CH BAKED ATTRIBUTES.",
  },
};
