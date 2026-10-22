// Industrial/rotating-equipment vocabulary that a general English dictionary
// (dictionary-en, used by spellcheck.js) has never heard of, so every one of
// these would otherwise get flagged as a typo on practically every
// maintenance record. Added to the speller unconditionally, before any
// user-taught words from "Add to Dictionary" (spellcheck.js's
// addToDictionary()) — this list ships with the app, so it works for a new
// device/browser with nothing taught yet, not just after someone's clicked
// through every one of these by hand.
//
// Add further terms here directly, always lowercase, including acronyms —
// nspell/Hunspell accepts ANY casing of a word added lowercase (confirmed
// directly against the real dictionary: adding "thermocouple" also passed
// "Thermocouple" and "THERMOCOUPLE"; adding "rtd" also passed "RTD"; adding
// "kva" also passed "kVA"). The reverse direction does NOT hold — adding an
// upper-case acronym like "RTD" does NOT also cover lowercase "rtd" — so
// lowercase is strictly safer and covers more real-world typing than
// matching an acronym's usual casing would.
// Entries below are grouped by category rather than by when/how they were
// found — a term added from a future DB scan goes into whichever category
// below it actually belongs to, not a new dated block at the bottom, so
// this stays a dictionary organized by meaning rather than a changelog.
// SPEC.md's decision log still has the "why" and "why NOT" for any given
// scan (e.g. "seeded from this plant's real record text", 2026-10-22) —
// this file is just the data.
export const TECHNICAL_TERMS = [
  // Rotating equipment & components
  'turbine', 'turbines', 'compressor', 'compressors', 'gearbox', 'gearboxes',
  'bearing', 'bearings', 'impeller', 'impellers', 'rotor', 'rotors',
  'stator', 'stators', 'combustor', 'combustors', 'igniter', 'igniters',
  'nozzle', 'nozzles', 'coupling', 'couplings', 'diaphragm', 'diaphragms',
  'solenoid', 'solenoids', 'actuator', 'actuators', 'manifold', 'manifolds',
  'flange', 'flanges', 'gasket', 'gaskets', 'strainer', 'strainers',
  'skid', 'skids', 'recuperator', 'recuperators', 'coalescer', 'coalescers',
  'arrestor', 'arrestors', 'deaerator', 'deaerators', 'intercooler',
  'intercoolers', 'aftercooler', 'aftercoolers', 'desander', 'desanders',
  'eductor', 'eductors', 'diffuser', 'diffusers', 'desuperheater',
  'desuperheaters', 'antisurge', 'blowdown', 'blowoff', 'venturi', 'venturis', 'rotameter',
  'rotameters', 'flowmeter', 'flowmeters', 'wattmeter', 'wattmeters',

  // Instrumentation & test equipment
  'thermocouple', 'thermocouples', 'borescope', 'borescopes', 'borescoping',
  'borescoped', 'multimeter', 'multimeters', 'tachometer', 'tachometers',
  'accelerometer', 'accelerometers', 'pyrometer', 'pyrometers',
  'megger', 'meggering', 'endoscope', 'endoscopes',

  // Conditions, processes & actions
  'vibration', 'lubrication', 'lubricant', 'lubricants', 'hydraulic',
  'hydraulics', 'pneumatic', 'pneumatics', 'calibration', 'calibrated',
  'calibrating', 'alignment', 'misalignment', 'overhaul', 'overhauled',
  'overhauling', 'tribology', 'thermography', 'thermographic',
  'commissioning', 'decommissioning', 'troubleshooting', 'derate',
  'derated', 'derating', 'overspeed', 'outstandings',

  // "re-calibrated", "re-aligned", "re-torqued", etc. — written hyphenated,
  // per the user's preference, rather than as one closed-up word
  // ("recalibrated"). No separate dictionary entry needed for the
  // "re-X" form at all: spellcheck.js's WORD_PATTERN only ever matches
  // letter runs, so a hyphen already splits it into two words to check
  // separately — "re" and whatever follows it — and both halves of every
  // "re-" form actually used in this app's records (re-calibrated,
  // re-aligned, re-torqued, re-tightened, re-checked, re-installed) are
  // already plain English words dictionary-en recognizes on their own
  // (confirmed directly: "re" by itself passes, same as "calibrated",
  // "aligned", "torqued", etc.) — it's only the closed-up, no-hyphen form
  // ("recalibrated") that doesn't.

  // Acronyms — normally typed upper-case, but stored lowercase (see note
  // above) so any casing the user actually types is still accepted
  'rtd', 'rtds', 'plc', 'plcs', 'hvac', 'scada', 'vfd', 'vfds', 'vsd',
  'pid', 'gtg', 'gt', 'ndt', 'nde', 'cmms', 'oem', 'esd', 'bop', 'loto',
  'ppe', 'sop', 'mcc', 'avo', 'rpm', 'kva', 'kw', 'hz', 'hmi', 'emi',
  'sn', 'jb', 'jbs', 'rio', 'rios', 'ucp', 'ucps', 'psv', 'psvs', 'pcv',
  'pcvs', 'pdt', 'pdts', 'pdit', 'pdits', 'ovs', 'bsi', 'gd', 'stg',
  'dcs', 'ats', 'mov', 'movs', 'sov', 'sovs', 'esdv', 'esdvs', 'bdv',
  'bdvs', 'prv', 'prvs', 'lcp', 'lcps', 'rtu', 'rtus', 'modbus',
  'profibus', 'fieldbus',

  // Units/readings commonly written lowercase in running text
  'psig', 'psia', 'psid',

  // Tools, consumables & site equipment
  'manlift', 'manlifts', 'sikaflex',

  // Vendor/manufacturer names this plant's own records actually use —
  // unlike everything above, these are specific to whoever supplies THIS
  // site, not generic vocabulary another deployment of this app would
  // necessarily want; kept here anyway at the user's explicit request
  // (2026-10-22) rather than left to "Add to Dictionary" one at a time.
  // "det"/"tronics" cover "Det-Tronics" (confirmed as the real hyphenated
  // brand name, not "Detronics"/"Detronix" as it's sometimes typed here —
  // spellcheck.js's WORD_PATTERN splits the hyphen the same way it does
  // for "re-calibrated", so the hyphenated form needs no entry of its own,
  // just its two halves). "Petroment" is kept exactly as this plant's own
  // records already spell it — no public record of this company turned up
  // to verify against, unlike the others below.
  'ge', 'abb', 'mtl', 'himatrix', 'det', 'tronics', 'tyco', 'petroment',
  'rockwell', 'allen', 'bradley',

  // Control-system software/tools (same caveat as the vendor names above —
  // this plant's own stack, not universal). Verified product names/
  // spellings directly rather than assumed: "SIMATIC PCS 7" (space before
  // the 7 officially, but the digit is never part of the matched word
  // anyway — same as "GT-8040" — so only "pcs"/"simatic" need an entry at
  // all), "WinCC", "TIA Portal" ("Portal" is already a real English word,
  // no entry needed for it), "InTouch", "FactoryTalk". "RSLogix" is kept
  // too even though Rockwell has since renamed it "Studio 5000 Logix
  // Designer" — "Studio"/"Logix"/"Designer" either need no entry (already
  // real words or, for "Logix", covered below) or aren't realistically
  // going to get typed as a whole product name in a maintenance comment,
  // while "RSLogix" is still what most people actually call it day to day.
  'pcs', 'simatic', 'wincc', 'tia', 'intouch', 'wonderware', 'factorytalk',
  'rslogix', 'logix',
]
