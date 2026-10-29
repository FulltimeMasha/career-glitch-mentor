// Bridge evaluation — the deterministic degree route for a person whose
// degree was earned outside the US (Matchmaker 2.0 extension, brief §5.4).
//
// Rules are a TABLE in code, keyed by the degree field the person picked in
// the stage-0 bank (degree_field). No LLM writes any of this: the result
// carries it as data, and the report letter receives it as fact.
//
// CREDIT RULE (recorded in DATA_PASS_CHANGELOG.md): no ladder step's
// training_months is ever reduced by a foreign degree — US licensing steps
// have fixed, state-set lengths, and inventing a shorter path would be a
// claim the data does not back. What an evaluated degree DOES do is satisfy
// degree-level prerequisites for licensed roles in its own field; that is
// exactly what credential evaluation certifies.

export const DEGREE_FIELDS = {
  engineering: 'Engineering',
  medicine: 'Medicine',
  nursing: 'Nursing',
  dentistry: 'Dentistry',
  pharmacy: 'Pharmacy',
  law: 'Law',
  accounting_business: 'Accounting / business',
  education: 'Education',
  it_computing: 'IT / computing',
  architecture: 'Architecture',
  other: 'Another field',
};

export const DEGREE_LEVELS = {
  bachelor: "Bachelor's degree",
  master: "Master's degree",
  doctorate_professional: 'Doctorate / professional degree',
  associate: 'Associate degree',
  other: 'Another level',
};

// Step 1 is the same for every field: credential evaluation comes first,
// because every licensing board downstream asks for it.
const EVAL_STEP = {
  id: 'credential_evaluation',
  title: 'Get the degree evaluated (WES / ECE)',
  text: 'Order a course-by-course credential evaluation from WES (World Education Services) or ECE (Educational Credential Evaluators). Every US licensing board, employer and school downstream will ask for it, and it fixes the official US equivalency of the degree (field and level) that the rest of the route is built on.',
};

// The field route AFTER evaluation. evaluator_note names the channel the
// field's own boards actually use where it differs from the generic route.
const FIELD_ROUTES = {
  engineering: {
    evaluator_note: 'State engineering boards often ask for the evaluation through NCEES Credentials Evaluations rather than WES/ECE - the board of the state you license in decides, so check its requirement before ordering.',
    steps: [
      { id: 'fe_eit', title: 'Pass the FE exam and become an EIT', text: 'With the evaluated degree, register with your state board and pass the NCEES Fundamentals of Engineering (FE) exam. Passing makes you an Engineer in Training (EIT) - the first US licence step.' },
      { id: 'experience', title: 'Work under a licensed PE', text: 'Accumulate the qualifying engineering experience your state requires (typically about four years) working under a licensed Professional Engineer.' },
      { id: 'pe', title: 'Pass the PE exam for the state licence', text: 'Sit the NCEES Principles and Practice of Engineering (PE) exam in your discipline and apply for the state PE licence. The licence is issued by the state, so the exact experience count and paperwork follow that state board\'s rules.' },
    ],
  },
  medicine: {
    evaluator_note: 'Physicians are certified through ECFMG, which runs its own primary-source verification of the medical diploma - WES/ECE alone does not open the USMLE route.',
    steps: [
      { id: 'ecfmg', title: 'ECFMG certification', text: 'Register with ECFMG (Educational Commission for Foreign Medical Graduates) and have the medical degree verified at the source. ECFMG certification is the gate for everything after it.' },
      { id: 'usmle', title: 'Pass USMLE Step 1 and Step 2 CK', text: 'Sit the United States Medical Licensing Examination steps. Scores here decide which residency programs will look at the application.' },
      { id: 'residency', title: 'Match into a US residency', text: 'Apply through the Match (NRMP) and complete a US residency in the specialty - a foreign residency does not replace it. The state medical licence follows residency and USMLE Step 3.' },
    ],
  },
  nursing: {
    evaluator_note: 'Nursing boards typically require the evaluation through CGFNS (or a board-listed evaluator such as WES/ECE) plus an English-proficiency exam for internationally educated nurses.',
    steps: [
      { id: 'board_evaluation', title: 'Board credential review (CGFNS)', text: 'Have the nursing degree and licence verified through CGFNS or the evaluator your state board of nursing lists, and complete the English-proficiency exam if the board requires it.' },
      { id: 'nclex', title: 'Pass the NCLEX-RN', text: 'Once the board declares you eligible, sit the NCLEX-RN. Passing it is what makes the foreign nursing degree a US RN licence.' },
    ],
  },
  dentistry: {
    evaluator_note: 'Dental boards require the ECE evaluation of the dental degree as part of the application file.',
    steps: [
      { id: 'inbde', title: 'Pass the INBDE', text: 'With the evaluated degree, sit the Integrated National Board Dental Examination (INBDE).' },
      { id: 'advanced_standing', title: 'Complete a CODA advanced-standing program where the state requires it', text: 'Most states license foreign-trained dentists only after a US advanced-standing DDS/DMD program (typically about two years). A few states have narrower routes - the state dental board\'s rule decides.' },
      { id: 'state_licence', title: 'State dental licence', text: 'Apply for licensure with the state dental board once the exam and any required program are complete.' },
    ],
  },
  pharmacy: {
    evaluator_note: 'The pharmacy route starts with the ECE evaluation - NABP requires it for the FPGEC file.',
    steps: [
      { id: 'fpgec', title: 'FPGEC certification and the FPGEE', text: 'Apply to NABP for Foreign Pharmacy Graduate Examination Committee (FPGEC) certification and pass the FPGEE exam.' },
      { id: 'intern_hours', title: 'Complete intern hours', text: 'Work the intern hours your state board of pharmacy requires under a licensed pharmacist.' },
      { id: 'naplex', title: 'Pass the NAPLEX', text: 'Sit the North American Pharmacist Licensure Examination and apply for the state pharmacist licence.' },
    ],
  },
  law: {
    evaluator_note: 'There is no national route for foreign law degrees: each state bar decides eligibility on its own rules.',
    steps: [
      { id: 'bar_eligibility', title: 'Get the state bar eligibility ruling', text: 'Have the degree evaluated and ask the bar of the state you want to practice in whether the degree qualifies you. A small number of states (New York and California are the usual routes) admit some foreign-trained lawyers, often after a US LLM.' },
      { id: 'bar_exam', title: 'Pass the state bar exam', text: 'Once declared eligible, sit that state\'s bar examination. The licence that follows is valid in that state.' },
    ],
  },
  accounting_business: {
    evaluator_note: 'State CPA boards name their own approved evaluation services (NIES is the common one); a business degree without the accounting credits follows the same evaluation, then the credit check.',
    steps: [
      { id: 'cpa_credits', title: 'Evaluation + education-credit check for the CPA route', text: 'Have the degree evaluated, then compare the transcript against the state board\'s accounting and business credit requirements. Missing credits are picked up at a US college before the exam.' },
      { id: 'cpa_exam', title: 'Pass the CPA exam', text: 'Sit the Uniform CPA Examination and complete the state\'s experience requirement for the licence.' },
    ],
  },
  education: {
    evaluator_note: 'Teacher licensure is state-run; districts and state departments of education accept WES/ECE evaluations of the degree.',
    steps: [
      { id: 'state_licensure', title: 'State teacher licensure review', text: 'Send the evaluated degree to the state department of education. It maps the degree to a certificate area and lists any missing US coursework or tests.' },
      { id: 'praxis', title: 'Pass the state teacher tests', text: 'Complete the required state exams (Praxis in most states) and any missing coursework, then apply for the teaching certificate.' },
    ],
  },
  it_computing: {
    evaluator_note: 'IT has no licence wall in the US - the evaluation matters for employers, immigration files and any later degree, not for permission to work.',
    steps: [
      { id: 'use_evaluation', title: 'Use the evaluation as the equivalency proof', text: 'Keep the WES/ECE report as the standing proof of the degree\'s US equivalency for employers and schools. No licence steps follow - hiring turns on skills and portfolio.' },
    ],
  },
  architecture: {
    evaluator_note: 'Foreign architects are evaluated through EESA (Education Evaluation Services for Architects), the channel NCARB uses.',
    steps: [
      { id: 'eesa_ncarb', title: 'EESA evaluation and the NCARB foreign-architect path', text: 'Have the degree evaluated through EESA and open the NCARB record for foreign-educated architects.' },
      { id: 'axp_are', title: 'Experience (AXP) and the ARE exams', text: 'Complete the Architectural Experience Program hours the board requires and pass the Architect Registration Examination divisions for the state licence.' },
    ],
  },
  other: {
    evaluator_note: '',
    steps: [
      { id: 'use_evaluation', title: 'Use the evaluation as the equivalency proof', text: 'Keep the WES/ECE report as the standing proof of the degree\'s US equivalency. If the target field is licensed in your state, its board will name any further exams - none are assumed here.' },
    ],
  },
};

// Which degree field a profession belongs to, by its name — a small
// deterministic keyword table (used only to say whether the person's own
// degree feeds the route they are matched to; it never touches scores).
// Returns null when the profession has no degree-field reading.
export function professionFieldKey(profession) {
  const name = String((profession && profession.name) || '');
  if (!name) return null;
  if (/\b(Nurse|Nursing)\b/i.test(name)) return 'nursing';
  if (/\b(Dentist|Dental Surgeon|Orthodontist|Endodontist)\b/i.test(name)) return 'dentistry';
  if (/\bPharmacist\b/i.test(name)) return 'pharmacy';
  if (/\b(Physician|Surgeon|Psychiatrist|Pediatrician|Anesthesiologist|Radiologist|Cardiologist|Dermatologist|Oncologist|Neurologist)\b/i.test(name)) return 'medicine';
  if (/\b(Lawyer|Attorney)\b/i.test(name)) return 'law';
  if (/\b(Accountant|Auditor)\b/i.test(name)) return 'accounting_business';
  if (/\b(Teacher|Professor)\b/i.test(name)) return 'education';
  if (/\bArchitect\b/i.test(name) && !/\b(Software|Solutions|Cloud|Systems|Data)\b/i.test(name)) return 'architecture';
  if (/\b(Software|Data|Developer|Programmer|DevOps|Machine Learning|AI Engineer|Prompt Engineer)\b/i.test(name)) return 'it_computing';
  if (/\bEngineer\b/i.test(name)) return 'engineering';
  return null;
}

// structured: session.structured (stage-0 answers). targetSlugs: the routes
// the person is actually being matched to (stated target + top-3 careers);
// fieldOfSlug(slug) -> the base field key of that profession, or null when
// the profession has no recorded field. Returns null when there is no
// foreign degree.
export function buildBridgeEvaluation(structured, targetSlugs, fieldOfSlug) {
  const s = structured && typeof structured === 'object' ? structured : {};
  if (s.degree_status !== 'foreign_degree') return null;
  const field = typeof s.degree_field === 'string' && DEGREE_FIELDS[s.degree_field] ? s.degree_field : 'other';
  const route = FIELD_ROUTES[field] || FIELD_ROUTES.other;
  const degree = {
    status: 'foreign_degree',
    field,
    field_label: DEGREE_FIELDS[field],
    level: typeof s.degree_level === 'string' && DEGREE_LEVELS[s.degree_level] ? s.degree_level : null,
    level_label: typeof s.degree_level === 'string' && DEGREE_LEVELS[s.degree_level] ? DEGREE_LEVELS[s.degree_level] : null,
    country: typeof s.degree_country === 'string' && s.degree_country.trim() ? s.degree_country.trim() : null,
    years_in_field: Number.isFinite(Number(s.degree_years)) ? Number(s.degree_years) : null,
  };
  const steps = [EVAL_STEP, ...route.steps];
  // Field match: does the degree's own field feed any of the person's routes?
  let target_in_field = null;
  if (typeof fieldOfSlug === 'function' && Array.isArray(targetSlugs)) {
    for (const slug of targetSlugs) {
      if (slug && fieldOfSlug(slug) === field) { target_in_field = slug; break; }
    }
  }
  return {
    degree,
    evaluator_note: route.evaluator_note || '',
    steps,
    credit: {
      rule: 'no_months_reduction',
      target_in_field,
      note: target_in_field
        ? 'The evaluated degree satisfies the degree-level prerequisites of licensed routes in its own field. It does not shorten the state-set training lengths of the ladder steps below, so no step below is shown shorter than it is.'
        : 'The evaluated degree is a real asset on its own route above. It does not shorten the training lengths of the ladder steps below - those are set by state licensing rules, not by the degree - so no step is shown shorter than it is.',
    },
  };
}
