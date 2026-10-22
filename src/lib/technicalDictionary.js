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
export const TECHNICAL_TERMS = [
  // Rotating equipment & components
  'turbine', 'turbines', 'compressor', 'compressors', 'gearbox', 'gearboxes',
  'bearing', 'bearings', 'impeller', 'impellers', 'rotor', 'rotors',
  'stator', 'stators', 'combustor', 'combustors', 'igniter', 'igniters',
  'nozzle', 'nozzles', 'coupling', 'couplings', 'diaphragm', 'diaphragms',
  'solenoid', 'solenoids', 'actuator', 'actuators', 'manifold', 'manifolds',
  'flange', 'flanges', 'gasket', 'gaskets', 'strainer', 'strainers',
  'skid', 'skids', 'recuperator', 'recuperators',

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
  'derated', 'derating',

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
  'ppe', 'sop', 'mcc', 'avo', 'rpm', 'kva', 'kw', 'hz',

  // Units/readings commonly written lowercase in running text
  'psig', 'psia', 'psid',
]
