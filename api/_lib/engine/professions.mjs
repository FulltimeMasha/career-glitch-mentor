// engine/professions.mjs
// ---------------------------------------------------------------------------
// Profession loader for Career Glitch Mentor (Day-1 hackathon build).
//
// Reads the LIVE Career Glitch site data:
//   <siteDir>/professions.json          { n: [tuples], q: [test questions] }
//   <siteDir>/roadmaps-data-1.json      { <slug>: {name, sticker, money[], …}, byName: {name: slug} }
//   <siteDir>/roadmaps-data-2.json      same shape
//   <siteDir>/roadmaps-data-3.json      same shape, no byName map
// Default siteDir = ~/workspace/careerglitch-site (override via opts.siteDir
// or env CG_SITE_DIR). A frozen copy of the four files lives in the repo at
// data/site-snapshot/ for reference; the loader reads the live files.
//
// professions.json tuple layout (verified against careerglitch-site
// build_test.py `enrich()`: source tuples have 13 fields, enrich() appends
// [studyBand, payK]):
//   [0] name        [1] category   [2] pay (1..3)      [3] ai (0..2, AI-risk band)
//   [4] remote 0..2 [5] lic  0..2  [6] hands 0..2      [7] people 0..2
//   [8] biz 0..1    [9] tech 0..2  [10] out 0..2       [11] care 0..2
//   [12] creat 0..2 [13] studyBand 1..5 (site STUDY_LABELS:
//        1 "1–6 mo", 2 "6–12 mo", 3 "1–2 yrs", 4 "2–4 yrs", 5 "4+ yrs")
//   [14] payK (median pay, $K/year)
//
// HONESTY RULE (model v2 §1в): fields that come from O*NET / BLS imports
// (onet_soc, bls_*, work_values_extent, abilities_lv, skills_lv) are filled
// ONLY from data/onet-import.json (WS2, scripts/import_onet.py — O*NET
// 30.2, hand-reviewed mapping) when that file is present next to the
// engine. Where a profession has no clean O*NET match (31 of 339), the
// sourced fields stay null, the Day-1 stub derivations remain, and
// data_flags says so ('no_onet_match'). license_type and
// inflow_competition_flag have no source at all yet: always null, always
// flagged. Nothing sourced is invented; everything derived is a
// documented stub and flagged as such.
//
// O*NET attribution (CC BY 4.0): "This page includes information from
// the O*NET 30.2 Database by the U.S. Department of Labor, Employment
// and Training Administration (USDOL/ETA). Used under the CC BY 4.0
// license. O*NET® is a trademark of USDOL/ETA. Career Glitch has
// modified all or some of this information. USDOL/ETA has not approved,
// endorsed, or tested these modifications."
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_SITE_DIR = join(homedir(), 'workspace', 'careerglitch-site');

const ROADMAP_FILES = ['roadmaps-data-1.json', 'roadmaps-data-2.json', 'roadmaps-data-3.json'];

// Fields whose values are null because no source exists yet (model v2 §1в).
const UNSOURCED_FIELDS = [
  'onet_soc',
  'bls_inherited',
  'bls_vintage',
  'bls_ai_exposure',
  'work_values_extent',
  'work_values_frozen_date',
  'abilities_lv',
  'skills_lv',
  'work_context',
  'inflow_competition_flag',
  'license_type',
];

// ---------------------------------------------------------------------------
// SOURCED BLS OUTLOOK LINES — the only professions for which a jobs-outlook
// figure has actually been read from a source in this project (the verified
// BLS 2025–35 anchors in scripts/acceptance_c.mjs, the same strings the
// /mentor Radar shows, plus two figures stated on the professions' own
// roadmap cards and one outlook line printed on a card). Every other
// profession gets bls_outlook = null and the UI omits the line — an outlook
// is never invented. Keys are loader slugs.
// ---------------------------------------------------------------------------
// 28.10.2026 data pass: the map was extended to every profession whose
// O*NET-SOC code resolves to a detailed row of BLS Employment Projections
// Table 1.2 (2025–35) — the percent is that row's employment change,
// rounded to a whole percent, labelled by sign. Combined-occupation rows
// are used where BLS publishes no split row (e.g. 31-1121/31-1122 read
// the 31-1120 row; 29-2011/29-2012 read 29-2010). One hand crosswalk:
// substance-abuse-counselor (O*NET 21-1011) reads EP row 21-1018, the
// same occupation in the BLS SOC coding. Professions with no SOC match
// or no EP row keep bls_outlook = null — an outlook is never invented.
const SOURCED_OUTLOOK = {
  'accountant': 'Growing · +5% to 2035 (BLS)',
  'bookkeeper-advisory': 'Shrinking · −6% to 2035 (BLS)',
  'translator-interpreter': 'Growing · +2% to 2035 (BLS)',
  'registered-nurse': 'Growing · +6% to 2035 (BLS)',
  'certified-nursing-assistant': 'Growing · +3% to 2035 (BLS)',
  'dental-hygienist': 'Growing · +8% projected growth (its card, BLS-based)',
  'graphic-designer': 'Shrinking · −2% (its card, BLS May 2025)',
  'customer-service-representative': 'Shrinking · −5% to 2035 (BLS)',
  'aba-therapist-kids': 'Growing · +7% to 2035 (BLS)',
  'actuary': 'Growing · +9% to 2035 (BLS)',
  'administrative-assistant': 'Shrinking · −6% to 2035 (BLS)',
  'ai-automation-specialist': 'Growing · +10% to 2035 (BLS)',
  'air-traffic-controller': 'Growing · +2% to 2035 (BLS)',
  'airbnb-co-host-str-manager': 'Growing · +4% to 2035 (BLS)',
  'aircraft-dispatcher-faa': 'Shrinking · −1% to 2035 (BLS)',
  'aircraft-mechanic-a-p': 'Growing · +5% to 2035 (BLS)',
  'animator': 'Flat · 0% to 2035 (BLS)',
  'appliance-repair-tech': 'Growing · +2% to 2035 (BLS)',
  'arborist-tree-pro': 'Growing · +4% to 2035 (BLS)',
  'art-director': 'Growing · +4% to 2035 (BLS)',
  'athletic-trainer': 'Growing · +13% to 2035 (BLS)',
  'audiologist': 'Growing · +11% to 2035 (BLS)',
  'auto-detailing-mobile-owner': 'Growing · +4% to 2035 (BLS)',
  'auto-mechanic': 'Growing · +5% to 2035 (BLS)',
  'b2b-sales-rep': 'Shrinking · −1% to 2035 (BLS)',
  'baker': 'Growing · +6% to 2035 (BLS)',
  'bakery-caf-owner': 'Growing · +6% to 2035 (BLS)',
  'barber': 'Growing · +3% to 2035 (BLS)',
  'barista-craft-coffee': 'Growing · +6% to 2035 (BLS)',
  'beauty-salon-owner': 'Growing · +8% to 2035 (BLS)',
  'biomedical-equipment-technician-bmet': 'Growing · +13% to 2035 (BLS)',
  'boat-captain': 'Growing · +4% to 2035 (BLS)',
  'boat-mechanic-marine-tech': 'Growing · +5% to 2035 (BLS)',
  'boat-restoration-flipping': 'Growing · +5% to 2035 (BLS)',
  'boilermaker': 'Shrinking · −2% to 2035 (BLS)',
  'brand-strategist': 'Growing · +7% to 2035 (BLS)',
  'brick-mason': 'Growing · +1% to 2035 (BLS)',
  'bus-driver': 'Growing · +1% to 2035 (BLS)',
  'business-consultant': 'Growing · +10% to 2035 (BLS)',
  'butcher': 'Growing · +2% to 2035 (BLS)',
  'cabinet-maker': 'Shrinking · −3% to 2035 (BLS)',
  'car-flipping': 'Growing · +5% to 2035 (BLS)',
  'cardiovascular-technologist': 'Growing · +4% to 2035 (BLS)',
  'carpenter': 'Growing · +4% to 2035 (BLS)',
  'caterer': 'Growing · +6% to 2035 (BLS)',
  'cdl-truck-driver': 'Growing · +4% to 2035 (BLS)',
  'certified-anesthesiologist-assistant': 'Growing · +21% to 2035 (BLS)',
  'chef': 'Growing · +7% to 2035 (BLS)',
  'childcare-center-owner': 'Shrinking · −3% to 2035 (BLS)',
  'chiropractor': 'Growing · +9% to 2035 (BLS)',
  'chocolatier-candy-maker': 'Growing · +7% to 2035 (BLS)',
  'choreographer': 'Growing · +3% to 2035 (BLS)',
  'civil-engineer': 'Growing · +6% to 2035 (BLS)',
  'cleaning-company-owner': 'Growing · +3% to 2035 (BLS)',
  'clinical-research-coordinator': 'Growing · +8% to 2035 (BLS)',
  'cloud-architect': 'Growing · +8% to 2035 (BLS)',
  'coffee-roaster': 'Flat · 0% to 2035 (BLS)',
  'commercial-diver': 'Growing · +5% to 2035 (BLS)',
  'commercial-industrial-designer': 'Growing · +2% to 2035 (BLS)',
  'commercial-insurance-producer': 'Growing · +3% to 2035 (BLS)',
  'commercial-pilot': 'Growing · +5% to 2035 (BLS)',
  'community-health-worker': 'Growing · +13% to 2035 (BLS)',
  'compliance-officer': 'Growing · +4% to 2035 (BLS)',
  'computer-and-information-research-scientist': 'Growing · +22% to 2035 (BLS)',
  'computer-hardware-engineer': 'Growing · +9% to 2035 (BLS)',
  'computer-network-architect': 'Growing · +8% to 2035 (BLS)',
  'computer-systems-analyst': 'Growing · +8% to 2035 (BLS)',
  'concrete-finisher': 'Growing · +2% to 2035 (BLS)',
  'construction-estimator': 'Shrinking · −3% to 2035 (BLS)',
  'copywriter': 'Flat · 0% to 2035 (BLS)',
  'corporate-trainer': 'Growing · +11% to 2035 (BLS)',
  'cosmetologist-hair-stylist': 'Growing · +8% to 2035 (BLS)',
  'crane-operator': 'Growing · +4% to 2035 (BLS)',
  'crm-email-marketer': 'Growing · +7% to 2035 (BLS)',
  'cybersecurity-analyst': 'Growing · +21% to 2035 (BLS)',
  'dance-instructor': 'Growing · +4% to 2035 (BLS)',
  'data-analyst': 'Growing · +35% to 2035 (BLS)',
  'data-engineer': 'Growing · +9% to 2035 (BLS)',
  'data-scientist-ml-engineer': 'Growing · +35% to 2035 (BLS)',
  'database-administrator-architect': 'Growing · +9% to 2035 (BLS)',
  'delivery-driver-light-truck': 'Growing · +6% to 2035 (BLS)',
  'dental-assistant': 'Growing · +7% to 2035 (BLS)',
  'dentist': 'Growing · +6% to 2035 (BLS)',
  'devops-engineer': 'Growing · +10% to 2035 (BLS)',
  'diesel-mechanic': 'Growing · +4% to 2035 (BLS)',
  'digital-forensics-analyst': 'Growing · +5% to 2035 (BLS)',
  'dispatcher-trucking': 'Shrinking · −1% to 2035 (BLS)',
  'dog-trainer': 'Growing · +4% to 2035 (BLS)',
  'driving-instructor': 'Growing · +4% to 2035 (BLS)',
  'drone-pilot-commercial': 'Growing · +5% to 2035 (BLS)',
  'drywall-finisher': 'Growing · +3% to 2035 (BLS)',
  'e-commerce-manager': 'Growing · +4% to 2035 (BLS)',
  'ekg-technician': 'Growing · +4% to 2035 (BLS)',
  'elder-care-companion-pro': 'Growing · +18% to 2035 (BLS)',
  'electrician': 'Growing · +9% to 2035 (BLS)',
  'electrologist': 'Growing · +9% to 2035 (BLS)',
  'elevator-mechanic': 'Growing · +6% to 2035 (BLS)',
  'emergency-management-director': 'Growing · +4% to 2035 (BLS)',
  'emt-paramedic': 'Growing · +6% to 2035 (BLS)',
  'enrolled-agent-tax-pro': 'Growing · +5% to 2035 (BLS)',
  'epidemiologist': 'Growing · +19% to 2035 (BLS)',
  'esthetician': 'Growing · +9% to 2035 (BLS)',
  'ev-charging-technician': 'Growing · +9% to 2035 (BLS)',
  'event-planner': 'Growing · +6% to 2035 (BLS)',
  'executive-assistant': 'Flat · 0% to 2035 (BLS)',
  'farm-equipment-mechanic': 'Growing · +11% to 2035 (BLS)',
  'farm-ranch-manager': 'Shrinking · −3% to 2035 (BLS)',
  'farmers-market-producer': 'Shrinking · −3% to 2035 (BLS)',
  'fashion-designer': 'Flat · 0% to 2035 (BLS)',
  'fiber-optic-technician': 'Shrinking · −3% to 2035 (BLS)',
  'film-stage-lighting-technician': 'Shrinking · −5% to 2035 (BLS)',
  'financial-analyst': 'Growing · +7% to 2035 (BLS)',
  'firefighter': 'Growing · +4% to 2035 (BLS)',
  'fitness-trainer': 'Growing · +7% to 2035 (BLS)',
  'flight-attendant': 'Growing · +9% to 2035 (BLS)',
  'flooring-installer': 'Shrinking · −16% to 2035 (BLS)',
  'florist': 'Shrinking · −6% to 2035 (BLS)',
  'food-safety-inspector': 'Growing · +2% to 2035 (BLS)',
  'food-scientist-technologist': 'Growing · +6% to 2035 (BLS)',
  'food-truck-owner': 'Growing · +5% to 2035 (BLS)',
  'funeral-director': 'Growing · +3% to 2035 (BLS)',
  'furniture-restorer': 'Shrinking · −4% to 2035 (BLS)',
  'game-designer': 'Growing · +6% to 2035 (BLS)',
  'garage-door-tech': 'Growing · +6% to 2035 (BLS)',
  'general-contractor': 'Growing · +9% to 2035 (BLS)',
  'genetic-counselor': 'Growing · +10% to 2035 (BLS)',
  'gis-specialist-cartographer': 'Growing · +7% to 2035 (BLS)',
  'glazier-glass': 'Growing · +2% to 2035 (BLS)',
  'grant-writer': 'Growing · +6% to 2035 (BLS)',
  'gym-fitness-studio-owner': 'Growing · +7% to 2035 (BLS)',
  'hair-replacement-wig-specialist': 'Growing · +8% to 2035 (BLS)',
  'handyman-company-owner': 'Growing · +4% to 2035 (BLS)',
  'handyman-solo-pro': 'Growing · +4% to 2035 (BLS)',
  'harbor-pilot': 'Growing · +4% to 2035 (BLS)',
  'hazardous-materials-removal-worker': 'Growing · +2% to 2035 (BLS)',
  'health-informatics-specialist': 'Growing · +8% to 2035 (BLS)',
  'heavy-equipment-operator': 'Growing · +5% to 2035 (BLS)',
  'helicopter-pilot': 'Growing · +8% to 2035 (BLS)',
  'histotechnologist': 'Growing · +3% to 2035 (BLS)',
  'home-health-aide': 'Growing · +18% to 2035 (BLS)',
  'home-inspector': 'Flat · 0% to 2035 (BLS)',
  'home-stager': 'Growing · +3% to 2035 (BLS)',
  'house-painter': 'Growing · +3% to 2035 (BLS)',
  'hr-specialist': 'Growing · +6% to 2035 (BLS)',
  'hvac-technician': 'Growing · +11% to 2035 (BLS)',
  'illustrator': 'Shrinking · −3% to 2035 (BLS)',
  'instructional-designer': 'Growing · +2% to 2035 (BLS)',
  'insurance-agent': 'Growing · +3% to 2035 (BLS)',
  'insurance-claims-adjuster': 'Shrinking · −6% to 2035 (BLS)',
  'insurance-underwriter': 'Shrinking · −4% to 2035 (BLS)',
  'interior-designer': 'Growing · +3% to 2035 (BLS)',
  'it-support-specialist': 'Shrinking · −4% to 2035 (BLS)',
  'jewelry-maker': 'Shrinking · −3% to 2035 (BLS)',
  'junk-removal-owner': 'Growing · +2% to 2035 (BLS)',
  'lab-technician': 'Growing · +3% to 2035 (BLS)',
  'land-surveyor': 'Growing · +6% to 2035 (BLS)',
  'landscape-architect': 'Growing · +4% to 2035 (BLS)',
  'landscaper-lawn-pro': 'Growing · +5% to 2035 (BLS)',
  'laser-hair-removal-technician': 'Growing · +9% to 2035 (BLS)',
  'lash-brow-artist': 'Growing · +9% to 2035 (BLS)',
  'lawn-care-company-owner': 'Growing · +5% to 2035 (BLS)',
  'librarian': 'Growing · +3% to 2035 (BLS)',
  'lineworker-power-lines': 'Growing · +10% to 2035 (BLS)',
  'loan-officer': 'Growing · +1% to 2035 (BLS)',
  'locksmith': 'Shrinking · −12% to 2035 (BLS)',
  'locomotive-engineer': 'Growing · +1% to 2035 (BLS)',
  'logistics-coordinator': 'Growing · +18% to 2035 (BLS)',
  'lpn-lvn': 'Growing · +3% to 2035 (BLS)',
  'luxury-real-estate-agent': 'Growing · +2% to 2035 (BLS)',
  'makeup-artist': 'Growing · +6% to 2035 (BLS)',
  'market-researcher': 'Growing · +7% to 2035 (BLS)',
  'marriage-and-family-therapist': 'Growing · +14% to 2035 (BLS)',
  'massage-therapist': 'Growing · +15% to 2035 (BLS)',
  'meal-prep-business-owner': 'Growing · +12% to 2035 (BLS)',
  'mediator-arbitrator': 'Growing · +5% to 2035 (BLS)',
  'medical-assistant': 'Growing · +13% to 2035 (BLS)',
  'medical-coder': 'Growing · +8% to 2035 (BLS)',
  'medical-courier-owner-route': 'Growing · +8% to 2035 (BLS)',
  'medical-dosimetrist': 'Growing · +5% to 2035 (BLS)',
  'millwright': 'Growing · +1% to 2035 (BLS)',
  'mobile-app-developer': 'Growing · +10% to 2035 (BLS)',
  'mobile-mechanic-owner': 'Growing · +7% to 2035 (BLS)',
  'mobile-pet-groomer': 'Growing · +12% to 2035 (BLS)',
  'mortgage-broker': 'Growing · +1% to 2035 (BLS)',
  'motion-designer-3d-artist': 'Flat · 0% to 2035 (BLS)',
  'moving-company-owner': 'Growing · +6% to 2035 (BLS)',
  'mri-technologist': 'Growing · +8% to 2035 (BLS)',
  'museum-curator': 'Growing · +5% to 2035 (BLS)',
  'music-instructor': 'Growing · +4% to 2035 (BLS)',
  'nail-technician': 'Growing · +9% to 2035 (BLS)',
  'nanny-family-assistant-pro': 'Shrinking · −2% to 2035 (BLS)',
  'network-and-computer-systems-administrator': 'Shrinking · −4% to 2035 (BLS)',
  'no-code-developer': 'Growing · +4% to 2035 (BLS)',
  'nuclear-medicine-technologist': 'Growing · +4% to 2035 (BLS)',
  'nuclear-reactor-operator': 'Shrinking · −6% to 2035 (BLS)',
  'nurse-practitioner': 'Growing · +41% to 2035 (BLS)',
  'nutrition-coach-dietitian': 'Growing · +8% to 2035 (BLS)',
  'occupational-therapist': 'Growing · +15% to 2035 (BLS)',
  'online-tutor': 'Flat · 0% to 2035 (BLS)',
  'operations-manager': 'Growing · +5% to 2035 (BLS)',
  'optometrist': 'Growing · +10% to 2035 (BLS)',
  'orthotist-prosthetist': 'Growing · +13% to 2035 (BLS)',
  'owner-operator-trucking': 'Growing · +4% to 2035 (BLS)',
  'painting-company-owner': 'Growing · +3% to 2035 (BLS)',
  'paralegal': 'Flat · 0% to 2035 (BLS)',
  'penetration-tester': 'Growing · +5% to 2035 (BLS)',
  'permanent-makeup-artist': 'Growing · +9% to 2035 (BLS)',
  'personal-financial-advisor': 'Growing · +1% to 2035 (BLS)',
  'pest-control-tech': 'Growing · +6% to 2035 (BLS)',
  'pet-boarding-daycare-owner': 'Growing · +12% to 2035 (BLS)',
  'pet-grooming-salon-owner': 'Growing · +12% to 2035 (BLS)',
  'pharmacist': 'Growing · +5% to 2035 (BLS)',
  'pharmacy-technician': 'Growing · +6% to 2035 (BLS)',
  'phlebotomist': 'Growing · +7% to 2035 (BLS)',
  'photo-booth-event-rentals-owner': 'Growing · +3% to 2035 (BLS)',
  'photographer': 'Shrinking · −1% to 2035 (BLS)',
  'physical-therapist': 'Growing · +12% to 2035 (BLS)',
  'physician': 'Growing · +3% to 2035 (BLS)',
  'physician-assistant': 'Growing · +21% to 2035 (BLS)',
  'pipefitter': 'Growing · +7% to 2035 (BLS)',
  'plasterer-and-stucco-mason': 'Growing · +3% to 2035 (BLS)',
  'plumber': 'Growing · +7% to 2035 (BLS)',
  'podcast-producer': 'Growing · +4% to 2035 (BLS)',
  'podiatrist': 'Growing · +2% to 2035 (BLS)',
  'police-officer': 'Growing · +4% to 2035 (BLS)',
  'pool-technician': 'Growing · +4% to 2035 (BLS)',
  'ppc-paid-ads-specialist': 'Growing · +7% to 2035 (BLS)',
  'pr-specialist': 'Growing · +2% to 2035 (BLS)',
  'preschool-teacher': 'Growing · +5% to 2035 (BLS)',
  'pressure-washing-owner': 'Growing · +2% to 2035 (BLS)',
  'private-chef': 'Growing · +7% to 2035 (BLS)',
  'private-investigator': 'Growing · +6% to 2035 (BLS)',
  'private-tutor-in-person': 'Flat · 0% to 2035 (BLS)',
  'probation-officer': 'Growing · +3% to 2035 (BLS)',
  'product-manager': 'Growing · +7% to 2035 (BLS)',
  'project-manager': 'Growing · +7% to 2035 (BLS)',
  'property-manager': 'Growing · +4% to 2035 (BLS)',
  'psychiatrist': 'Growing · +7% to 2035 (BLS)',
  'psychologist-therapist': 'Growing · +12% to 2035 (BLS)',
  'pt-assistant': 'Growing · +23% to 2035 (BLS)',
  'qa-engineer': 'Growing · +6% to 2035 (BLS)',
  'radiation-therapist': 'Growing · +3% to 2035 (BLS)',
  'radiology-tech': 'Growing · +5% to 2035 (BLS)',
  'real-estate-agent': 'Growing · +2% to 2035 (BLS)',
  'real-estate-appraiser': 'Growing · +4% to 2035 (BLS)',
  'recreational-therapist': 'Growing · +5% to 2035 (BLS)',
  'recruiter': 'Growing · +6% to 2035 (BLS)',
  'reflexologist': 'Growing · +15% to 2035 (BLS)',
  'registered-nurse-2': 'Growing · +10% to 2035 (BLS)',
  'rehabilitation-counselor': 'Growing · +2% to 2035 (BLS)',
  'reinforcing-iron-and-rebar-worker': 'Shrinking · −5% to 2035 (BLS)',
  'respiratory-therapist': 'Growing · +9% to 2035 (BLS)',
  'restaurant-manager': 'Growing · +6% to 2035 (BLS)',
  'robotics-engineer': 'Growing · +4% to 2035 (BLS)',
  'robotics-technician': 'Growing · +3% to 2035 (BLS)',
  'roofer': 'Growing · +5% to 2035 (BLS)',
  'school-counselor': 'Growing · +3% to 2035 (BLS)',
  'school-teacher': 'Flat · 0% to 2035 (BLS)',
  'security-and-fire-alarm-systems-installer': 'Growing · +7% to 2035 (BLS)',
  'semiconductor-technician': 'Growing · +8% to 2035 (BLS)',
  'senior-home-care-agency-owner': 'Growing · +18% to 2035 (BLS)',
  'seo-specialist': 'Growing · +7% to 2035 (BLS)',
  'septic-system-installer': 'Growing · +8% to 2035 (BLS)',
  'set-production-designer': 'Growing · +1% to 2035 (BLS)',
  'sheet-metal-worker': 'Growing · +3% to 2035 (BLS)',
  'ship-engineer-merchant-marine': 'Growing · +3% to 2035 (BLS)',
  'site-reliability-engineer': 'Growing · +10% to 2035 (BLS)',
  'smm-manager': 'Growing · +7% to 2035 (BLS)',
  'social-worker': 'Growing · +4% to 2035 (BLS)',
  'software-developer': 'Growing · +10% to 2035 (BLS)',
  'solar-installer': 'Growing · +37% to 2035 (BLS)',
  'sonographer-ultrasound': 'Growing · +14% to 2035 (BLS)',
  'sound-engineering-technician': 'Shrinking · −3% to 2035 (BLS)',
  'spa-owner': 'Growing · +6% to 2035 (BLS)',
  'speech-public-speaking-coach': 'Growing · +4% to 2035 (BLS)',
  'speech-therapist': 'Growing · +17% to 2035 (BLS)',
  'sports-coach': 'Growing · +6% to 2035 (BLS)',
  'sterile-processing-tech': 'Growing · +11% to 2035 (BLS)',
  'structural-ironworker': 'Shrinking · −5% to 2035 (BLS)',
  'substance-abuse-counselor': 'Growing · +18% to 2035 (BLS)',
  'surgical-technologist': 'Growing · +5% to 2035 (BLS)',
  'swim-instructor': 'Growing · +6% to 2035 (BLS)',
  'technical-writer': 'Growing · +1% to 2035 (BLS)',
  'tile-setter': 'Growing · +9% to 2035 (BLS)',
  'tow-truck-operator': 'Growing · +4% to 2035 (BLS)',
  'tower-climber-telecom': 'Growing · +1% to 2035 (BLS)',
  'train-conductor': 'Growing · +1% to 2035 (BLS)',
  'transportation-inspector': 'Growing · +2% to 2035 (BLS)',
  'tutoring-center-owner': 'Flat · 0% to 2035 (BLS)',
  'urban-and-regional-planner': 'Growing · +4% to 2035 (BLS)',
  'ux-ui-designer': 'Growing · +6% to 2035 (BLS)',
  'vending-atm-route-owner': 'Shrinking · −3% to 2035 (BLS)',
  'vet-technician': 'Growing · +9% to 2035 (BLS)',
  'veterinarian': 'Growing · +9% to 2035 (BLS)',
  'veterinary-assistant': 'Growing · +9% to 2035 (BLS)',
  'video-editor': 'Growing · +4% to 2035 (BLS)',
  'videographer': 'Growing · +1% to 2035 (BLS)',
  'virtual-assistant': 'Shrinking · −6% to 2035 (BLS)',
  'voice-actor': 'Flat · 0% to 2035 (BLS)',
  'water-wastewater-treatment-operator': 'Shrinking · −6% to 2035 (BLS)',
  'water-well-driller': 'Growing · +4% to 2035 (BLS)',
  'web-designer': 'Growing · +6% to 2035 (BLS)',
  'wedding-photographer': 'Shrinking · −1% to 2035 (BLS)',
  'wedding-planner': 'Growing · +6% to 2035 (BLS)',
  'welder': 'Growing · +2% to 2035 (BLS)',
  'wellness-coach': 'Growing · +6% to 2035 (BLS)',
  'wind-turbine-technician': 'Growing · +30% to 2035 (BLS)',
  'window-cleaning-owner': 'Growing · +2% to 2035 (BLS)',
  'yoga-pilates-instructor': 'Growing · +7% to 2035 (BLS)',
};

// ---------------------------------------------------------------------------
// TRAINING OVERRIDES (data pass, 28.10.2026) — per-profession training
// months that replace BOTH the matched roadmap card's text and the
// study-band fallback. Used where the inherited/default figure is wrong
// for THIS profession: a slug-collision child that inherited its parent's
// card (registered-nurse-2, tattoo-artist-2), and no-card professions
// whose band midpoint contradicts the sourced entry path (BLS OOH).
// Every value carries its basis here; nothing is tuned for scoring.
// ---------------------------------------------------------------------------
const TRAINING_OVERRIDES = {
  // CRNA: nurse-anesthesia graduate program ≈36 months — the profession's
  // OWN figure (BLS OOH: RN licence + ≥1 yr critical-care experience,
  // then the APRN program). Previously inherited from the RN card by
  // slug collision; the number coincides, the provenance did not.
  'registered-nurse-2': 36,
  // Paramedical tattoo: experienced tattoo artist + specialised
  // certification courses — editorial estimate (no BLS series exists).
  'tattoo-artist-2': 12,
  // Instructional designers: master's is the typical entry (BLS OOH) —
  // 4–5 years, not the band-4 midpoint of 36.
  'instructional-designer': 54,
  // Boilermakers: apprenticeship typically 4 years (BLS OOH) — 4–5 years,
  // not the band-4 midpoint of 36.
  'boilermaker': 54,
  // Commercial divers: dive-school programs run ~6–12 months (a
  // qualifying program is 28 weeks) — not the band-1 midpoint of 3.5.
  'commercial-diver': 9,
  // Choreographers: years of formal dance training plus experience as a
  // dancer first (BLS OOH) — 4–5 years, not the band-1 midpoint of 3.5.
  'choreographer': 54,
  // Doctoral-entry professions (remainder pass, 29.10.2026): the band-5
  // figure (54) and the programme-only figures (48) understate the
  // standard route by 2–3×. Each total is the full standard path from
  // BLS OOH "How to Become" — bachelor's + doctorate (+ the residency
  // licensure requires). The chain is also stated in the profession's
  // LADDERS prerequisites, so the card shows WHY it takes this long.
  // Surgeon: 48 bachelor's + 48 MD/DO + 60 general-surgery residency (5y).
  'general-surgeon': 156,
  // Psychiatrist: 48 + 48 MD/DO + 48 psychiatry residency (4y).
  'psychiatrist': 144,
  // Physician (this row is family physicians): 48 + 48 MD/DO + 36
  // family-medicine residency (3y).
  'physician': 132,
  // Podiatrist: 48 + 48 DPM + 36 PMSR residency (3y, required for licensure).
  'podiatrist': 132,
  // Psychologist: 48 + ~60 doctoral (PhD/PsyD, 4–6y incl. the internship
  // year; 5y is the middle of the BLS range).
  'psychologist-therapist': 108,
  // Dentist: 48 + 48 DDS/DMD.
  'dentist': 96,
  // Veterinarian: 48 + 48 DVM.
  'veterinarian': 96,
  // Optometrist: 48 + 48 OD.
  'optometrist': 96,
  // Pharmacist: 48 + 48 PharmD (the typical bachelor's route; the BLS
  // minimum is 2 years of prerequisites, which would total 72).
  'pharmacist': 96,
  // Chiropractor: 48 + 48 DC (BLS: DC programmes run 4 years; a
  // bachelor's is required for licensure in most states).
  'chiropractor': 96,
  // Audiologist: 48 + 48 AuD.
  'audiologist': 96,
  // Physical therapist: 48 + 36 DPT (3y is the typical programme length).
  'physical-therapist': 84,
};

// ---------------------------------------------------------------------------
// EDITORIAL VERDICTS for professions that have a tuple in professions.json
// but no roadmap card yet (the +30/day growth batches). The roadmap series
// is the verdict source of truth WHERE A CARD EXISTS; these fill the gaps
// so no served profession carries a null verdict (founder QA, 27.10.2026:
// a null verdict renders as "–" and a NO must never reach a top-3).
// Basis, per the editorial standard: BLS 2024–34 employment outlook for
// the occupation plus its AI-exposure band in this base. NO is reserved
// for occupations BLS projects to DECLINE or that are documented
// automation targets; everything else is YES. Flagged on every object
// ('verdict_editorial') so a later roadmap card silently supersedes it.
// ---------------------------------------------------------------------------
const EDITORIAL_VERDICTS = {
  'computer-network-architect': 'YES',
  'database-administrator-architect': 'YES',
  'computer-systems-analyst': 'YES',
  'gis-specialist-cartographer': 'YES',
  'certified-anesthesiologist-assistant': 'YES',
  'cardiovascular-perfusionist': 'YES',
  'medical-dosimetrist': 'YES',
  'orthotist-prosthetist': 'YES',
  'athletic-trainer': 'YES',
  'biomedical-equipment-technician-bmet': 'YES',
  'millwright': 'YES',
  'structural-ironworker': 'YES',
  'brick-mason': 'YES',
  'sheet-metal-worker': 'YES',
  'water-wastewater-treatment-operator': 'NO',
  'lineworker-power-lines': 'YES',
  'sound-engineering-technician': 'NO',
  'fashion-designer': 'NO',
  'electrologist': 'YES',
  'food-scientist-technologist': 'YES',
  'brewer-brewmaster': 'YES',
  'substance-abuse-counselor': 'YES',
  'firefighter': 'YES',
  'funeral-director': 'YES',
  'emergency-management-director': 'YES',
  'aircraft-dispatcher-faa': 'YES',
  'ship-engineer-merchant-marine': 'YES',
  'insurance-underwriter': 'NO',
  'real-estate-appraiser': 'YES',
  'construction-estimator': 'YES',
  'network-and-computer-systems-administrator': 'NO',
  'robotics-engineer': 'YES',
  'computer-hardware-engineer': 'YES',
  'instructional-designer': 'YES',
  'veterinarian': 'YES',
  'dentist': 'YES',
  'chiropractor': 'YES',
  'epidemiologist': 'YES',
  'psychiatrist': 'YES',
  'sleep-technologist': 'YES',
  'boilermaker': 'NO',
  'commercial-diver': 'YES',
  'water-well-driller': 'YES',
  'septic-system-installer': 'YES',
  'civil-engineer': 'YES',
  'landscape-architect': 'YES',
  'commercial-industrial-designer': 'YES',
  'choreographer': 'YES',
  'body-piercing-artist': 'YES',
  'laser-hair-removal-technician': 'YES',
  'coffee-roaster': 'YES',
  'winemaker-enologist': 'YES',
  'police-officer': 'YES',
  'private-investigator': 'YES',
  'librarian': 'YES',
  'community-health-worker': 'YES',
  'locomotive-engineer': 'NO',
  'delivery-driver-light-truck': 'YES',
  'personal-financial-advisor': 'YES',
  'compliance-officer': 'YES',
  'computer-and-information-research-scientist': 'YES',
  'site-reliability-engineer': 'YES',
  'health-informatics-specialist': 'YES',
  'digital-forensics-analyst': 'YES',
  'podiatrist': 'YES',
  'recreational-therapist': 'YES',
  'histotechnologist': 'YES',
  'hazardous-materials-removal-worker': 'YES',
  'security-and-fire-alarm-systems-installer': 'YES',
  'plasterer-and-stucco-mason': 'YES',
  'reinforcing-iron-and-rebar-worker': 'YES',
  'farm-equipment-mechanic': 'YES',
  'urban-and-regional-planner': 'YES',
  'museum-curator': 'YES',
  'film-stage-lighting-technician': 'YES',
  'hair-replacement-wig-specialist': 'YES',
  'reflexologist': 'YES',
  'farm-ranch-manager': 'NO',
  'food-safety-inspector': 'YES',
  'marriage-and-family-therapist': 'YES',
  'rehabilitation-counselor': 'YES',
  'probation-officer': 'YES',
  'mediator-arbitrator': 'YES',
  'helicopter-pilot': 'YES',
  'harbor-pilot': 'YES',
  'transportation-inspector': 'YES',
  'car-wash-owner': 'YES',
  'gym-fitness-studio-owner': 'YES',
  'mechanical-engineer': 'YES',
  'electrical-engineer': 'YES',
  'platform-engineer': 'YES',
  'embedded-systems-engineer': 'YES',
  'general-surgeon': 'YES',
  'certified-nurse-midwife': 'YES',
  'medical-laboratory-scientist': 'YES',
  'board-certified-behavior-analyst-bcba': 'YES',
  'data-center-technician': 'YES',
  'cnc-machinist-programmer': 'YES',
  'avionics-technician': 'YES',
  'power-plant-operator': 'NO',
  'telecommunications-equipment-installer': 'NO',
  'costume-designer': 'NO',
  'lighting-designer': 'YES',
  'audio-video-equipment-technician': 'YES',
  'scalp-micropigmentation-artist': 'YES',
  'food-stylist': 'YES',
  'distiller': 'YES',
  'vertical-farm-technician': 'YES',
  'school-psychologist': 'YES',
  'esl-adult-literacy-teacher': 'NO',
  'career-and-technical-education-teacher': 'YES',
  'child-life-specialist': 'YES',
  'customs-broker': 'YES',
  'freight-broker-agent': 'YES',
  'subway-streetcar-operator': 'YES',
  'business-broker': 'YES',
  'medical-health-services-manager': 'YES',
  'medical-secretary': 'YES',
  'cad-drafter': 'NO',
  'building-inspector': 'YES',
  'civil-engineering-technician': 'YES',
};

// ---------------------------------------------------------------------------
// STATUTORY AGE GATES — professions whose entry is age-limited by law or
// federal rule, not by preference (founder QA, 27.10.2026: a 38-year-old
// was matched to Air Traffic Controller; the FAA does not accept
// applicants over 31). Scoring excludes these by the person's Point A age.
// ---------------------------------------------------------------------------
const AGE_GATES = {
  'air-traffic-controller': { max: 30, source: 'FAA — controller applicants must be under 31 at entry' },
  'aircraft-dispatcher-faa': { min: 23, source: 'FAA — the aircraft dispatcher certificate requires age 23+' },
  // --- Cause-B expansion (28.10.2026): every entry is a statutory or
  // licensing floor, or — for the owner block — the legal-majority rule
  // for signing the contracts the business runs on. Deliberately NOT
  // derived from attrs.lic: lic==2 also covers roles a 16–17-year-old
  // may legally enter in many states (cosmetology-family licences,
  // apprenticeships), so an automatic lic→age rule would over-block.
  // Per-entry sources below; the full journal is in
  // DATA_PASS_CHANGELOG.md (cause-B entry).
  // 21+ — federal interstate / sworn-officer floors.
  'cdl-truck-driver': { min: 21, source: 'FMCSA — interstate commercial driving requires 21 (the intrastate floor is 18)' },
  'owner-operator-trucking': { min: 21, source: 'FMCSA — interstate commercial driving requires 21 (the intrastate floor is 18)' },
  'customs-broker': { min: 21, source: '19 CFR 111.11 — a US customs broker licence requires age 21+' },
  'police-officer': { min: 21, source: 'Most US jurisdictions set 21 for sworn officers (some hire at 18–20); the federal standard is 21' },
  'probation-officer': { min: 21, source: 'Probation/parole officers hold peace-officer status — most jurisdictions require 21' },
  // 18 — FAA / USCG certificates.
  'commercial-pilot': { min: 18, source: 'FAA — the commercial pilot certificate requires 18 (the airline ATP certificate: 23)' },
  'helicopter-pilot': { min: 18, source: 'FAA — the commercial helicopter certificate requires 18' },
  'drone-pilot-commercial': { min: 16, source: 'FAA — Part 107 remote-pilot certification requires 16' },
  'aircraft-mechanic-a-p': { min: 18, source: 'FAA — the mechanic certificate (A&P) requires 18' },
  'boat-captain': { min: 18, source: 'USCG — the OUPV/master licence requires 18' },
  'ship-engineer-merchant-marine': { min: 18, source: 'USCG — officer endorsements on the merchant mariner credential require 18' },
  'commercial-diver': { min: 18, source: 'ADC commercial-diver certification requires 18' },
  // 18 — state-licensed sales, finance and brokerage.
  'insurance-agent': { min: 18, source: 'State insurance producer licensing requires 18' },
  'commercial-insurance-producer': { min: 18, source: 'State insurance producer licensing requires 18' },
  'insurance-claims-adjuster': { min: 18, source: 'State adjuster licensing (in licensing states) requires 18' },
  'real-estate-agent': { min: 18, source: 'State real-estate licensing requires 18' },
  'real-estate-appraiser': { min: 18, source: 'State appraiser licensing requires 18' },
  'business-broker': { min: 18, source: 'Business brokerage is practised under a real-estate licence (18+)' },
  'yacht-broker': { min: 18, source: 'Yacht brokerage licensing (e.g. Florida DBPR yacht broker) requires 18' },
  'property-manager': { min: 18, source: 'Third-party property management requires a real-estate licence in most states (18+)' },
  'mortgage-broker': { min: 18, source: 'NMLS mortgage licensing under the SAFE Act requires 18' },
  'loan-officer': { min: 18, source: 'NMLS mortgage licensing under the SAFE Act requires 18' },
  'personal-financial-advisor': { min: 18, source: 'FINRA securities licensing requires 18' },
  'accountant': { min: 18, source: 'CPA licensure requires 18 in most states (this card is the CPA track)' },
  'general-contractor': { min: 18, source: 'Contractor licensing requires 18 in licensing states' },
  'home-inspector': { min: 18, source: 'Home-inspector licensing (in licensing states) requires 18' },
  // 18 — state-board licensed clinical professions (licence + degree).
  'registered-nurse': { min: 18, source: 'State nursing licensure requires 18' },
  // Matchmaker 2.0 core (28.10.2026): the two new licensed/owner rows
  // of the nursing → aesthetics ladder. certified-nursing-assistant
  // deliberately has NO entry: NC Nurse Aide I programmes admit from
  // 16½ (Wake Tech), so an 18+ gate would be an invented barrier.
  'aesthetic-nurse-nurse-injector': { min: 18, source: 'Practised on the RN licence — state nursing licensure requires 18' },
  'med-spa-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'registered-nurse-2': { min: 18, source: 'State nursing licensure requires 18 (CRNA practice sits on the RN licence)' },
  'lpn-lvn': { min: 18, source: 'State practical-nursing licensure requires 18' },
  'nurse-practitioner': { min: 18, source: 'State APRN licensure requires 18' },
  'physician-assistant': { min: 18, source: 'State PA licensure requires 18' },
  'pharmacist': { min: 18, source: 'State pharmacy licensure requires 18' },
  'physical-therapist': { min: 18, source: 'State PT licensure requires 18' },
  'occupational-therapist': { min: 18, source: 'State OT licensure requires 18' },
  'speech-therapist': { min: 18, source: 'State speech-language pathology licensure requires 18' },
  'respiratory-therapist': { min: 18, source: 'State respiratory-care licensure requires 18' },
  'dentist': { min: 18, source: 'State dental licensure requires 18' },
  'optometrist': { min: 18, source: 'State optometry licensure requires 18' },
  'veterinarian': { min: 18, source: 'State veterinary licensure requires 18' },
  'chiropractor': { min: 18, source: 'State chiropractic licensure requires 18' },
  'psychiatrist': { min: 18, source: 'State medical licensure requires 18' },
  'physician': { min: 18, source: 'State medical licensure requires 18' },
  'general-surgeon': { min: 18, source: 'State medical licensure requires 18' },
  'podiatrist': { min: 18, source: 'State podiatry licensure requires 18' },
  'audiologist': { min: 18, source: 'State audiology licensure requires 18' },
  'certified-nurse-midwife': { min: 18, source: 'State APRN licensure requires 18 (CNM sits on the RN licence)' },
  'certified-anesthesiologist-assistant': { min: 18, source: 'State AA licensure requires 18 (in licensing states)' },
  'cardiovascular-perfusionist': { min: 18, source: 'Perfusionist licensure/certification requires 18 (in licensing states)' },
  'radiation-therapist': { min: 18, source: 'State radiation-therapy licensure requires 18' },
  'athletic-trainer': { min: 18, source: 'State athletic-trainer licensure requires 18 (in licensing states)' },
  'genetic-counselor': { min: 18, source: 'State genetic-counsellor licensure requires 18 (in licensing states)' },
  'nutrition-coach-dietitian': { min: 18, source: 'Registered-dietitian licensure requires 18 (the licensed anchor of this card)' },
  'psychologist-therapist': { min: 18, source: 'State psychology licensure requires 18' },
  'social-worker': { min: 18, source: 'Clinical social-work licensure requires 18' },
  'school-counselor': { min: 18, source: 'School-counsellor certification requires 18 (and the master\'s degree)' },
  'school-psychologist': { min: 18, source: 'School-psychologist certification requires 18 (and the graduate degree)' },
  'substance-abuse-counselor': { min: 18, source: 'Substance-use counsellor licensure/certification requires 18 in most states' },
  'marriage-and-family-therapist': { min: 18, source: 'LMFT licensure requires 18' },
  // 18 — regulated public-safety / technical licences and hiring floors.
  'firefighter': { min: 18, source: 'US fire departments hire at 18 (the standard minimum)' },
  'flight-attendant': { min: 18, source: 'US airlines hire flight attendants from 18 (some carriers set 21)' },
  'private-investigator': { min: 18, source: 'State PI licensing requires 18 (some states set 21)' },
  'funeral-director': { min: 18, source: 'State funeral-service licensing requires 18' },
  'nuclear-reactor-operator': { min: 18, source: 'NRC operator licensing requires 18' },
  'water-wastewater-treatment-operator': { min: 18, source: 'State water/wastewater operator licensing requires 18' },
  'elevator-mechanic': { min: 18, source: 'Elevator-mechanic licensing (in licensing states) requires 18' },
  'pest-control-tech': { min: 18, source: 'Pesticide applicator licensing requires 18 (EPA/state)' },
  'hazardous-materials-removal-worker': { min: 18, source: 'OSHA HAZWOPER-regulated work requires 18' },
  'land-surveyor': { min: 18, source: 'Land-surveyor licensure requires 18 (and the degree)' },
  'bus-driver': { min: 18, source: 'The CDL floor is 18 for intrastate commercial driving (interstate: 21); transit and school employers hire 18+' },
  'train-conductor': { min: 18, source: 'Railroads hire conductors at 18+ (FRA-regulated safety-sensitive role)' },
  'locomotive-engineer': { min: 18, source: 'Railroads hire engineers at 18+ (FRA-regulated safety-sensitive role)' },
  'subway-streetcar-operator': { min: 18, source: 'Transit agencies hire operators at 18+' },
  // 18 — body-art licensure.
  'tattoo-artist': { min: 18, source: 'Tattooing is licensed at 18 in most states' },
  'tattoo-artist-2': { min: 18, source: 'Paramedical tattooing sits under tattoo licensure — 18 in most states' },
  'body-piercing-artist': { min: 18, source: 'Body-piercing licensure requires 18 in most states' },
  'scalp-micropigmentation-artist': { min: 18, source: 'Scalp micropigmentation is tattooing — licensed at 18 in most states' },
  // 18 — business ownership: the contracts the business runs on
  // (formation, leases, business credit, client contracts) require
  // legal majority. One shared source line for the whole block.
  'beauty-salon-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'spa-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'food-truck-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'bakery-caf-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'meal-prep-business-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'childcare-center-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18); centre licensing also sets 18+ for the licensee' },
  'moving-company-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'cleaning-company-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'handyman-company-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'painting-company-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'lawn-care-company-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'pressure-washing-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'window-cleaning-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'junk-removal-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'pet-grooming-salon-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'pet-boarding-daycare-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'mobile-mechanic-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'vending-atm-route-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'laundromat-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'self-storage-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'senior-home-care-agency-owner': { min: 18, source: 'Home-care agency ownership/administration is licensed (18+); its contracts also require legal majority' },
  'tutoring-center-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'photo-booth-event-rentals-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'gym-fitness-studio-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'car-wash-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'medical-courier-owner-route': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'auto-detailing-mobile-owner': { min: 18, source: 'Owning the business — contracts, leases, business credit — requires legal majority (18)' },
  'real-estate-investor-flips': { min: 18, source: 'Buying and selling property requires legal majority (18) — contracts and financing' },
  'real-estate-investor-rentals': { min: 18, source: 'Buying and holding rental property requires legal majority (18) — contracts and financing' },
  'franchise-owner-home-services': { min: 18, source: 'A franchise agreement is a major contract — it requires legal majority (18)' },
};

// ---------------------------------------------------------------------------
// CAREER LADDERS (Matchmaker 2.0 core, brief 28.10.2026 §5.2) — the
// only producer of entry_steps / next_steps / prerequisites, attached
// in buildProfessions() below and projected into professions-base.json
// by scripts/export_base.mjs. A ladder answers "how is this job
// actually reached": entry_steps are the rungs of the standard route
// IN ORDER, from zero (entry_steps[0] is the first paid rung a person
// can stand on); a step's training_months / cost_k describe THAT step
// (its own programme), not the whole road. next_steps are the rungs
// the profession grows into. prerequisites are facts that must hold
// first (a licence, a capital fact), in words.
//
// Filled cluster by cluster, by hand, from named sources — the rest
// of the base carries empty ladders honestly until its cluster is
// done. First cluster (28.10.2026): the nursing → aesthetics ladder
// of the Marina benchmark — CNA → LPN → RN → Aesthetic Nurse →
// Med Spa Owner. Sources: BLS OOH (Nursing Assistants; LPN; RN),
// NC DHHS / Wake Tech (Nurse Aide I: 75+ hours incl. 16 clinical,
// community-college tuition in the hundreds of dollars), ZipRecruiter
// salary data for the injector rung. Step costs beyond the CNA rung
// are editorial mid-range programme costs, recorded as such in
// DATA_PASS_CHANGELOG.md.
// ---------------------------------------------------------------------------
const LADDERS = {
  'certified-nursing-assistant': {
    entry_steps: [],
    next_steps: [{ slug: 'lpn-lvn' }, { slug: 'registered-nurse' }],
    prerequisites: [
      { what: 'A state-approved Nurse Aide I programme and the state competency exam (NC: 75+ training hours including 16 clinical hours; listing on the NC Nurse Aide I Registry)' },
    ],
  },
  'lpn-lvn': {
    entry_steps: [{ slug: 'certified-nursing-assistant', training_months: 2, cost_k: 1 }],
    next_steps: [{ slug: 'registered-nurse' }],
    prerequisites: [
      { what: 'A practical-nursing programme and the NCLEX-PN licence exam; bridge programmes credit Nurse Aide I experience' },
    ],
  },
  'registered-nurse': {
    entry_steps: [
      { slug: 'certified-nursing-assistant', training_months: 2, cost_k: 1 },
      { slug: 'lpn-lvn', training_months: 9, cost_k: 6 },
    ],
    next_steps: [{ slug: 'aesthetic-nurse-nurse-injector' }, { slug: 'nurse-practitioner' }],
    prerequisites: [
      { what: 'An accredited nursing degree (ADN or BSN) and the NCLEX-RN licence exam' },
      { what: 'Routes differ: CNA → RN directly, or CNA → LPN → RN with credit for the aide work — either way the degree and the licence run in the US; a foreign degree is not itself a licence' },
    ],
  },
  'aesthetic-nurse-nurse-injector': {
    entry_steps: [
      { slug: 'certified-nursing-assistant', training_months: 2, cost_k: 1 },
      { slug: 'registered-nurse', training_months: 36, cost_k: 20 },
    ],
    next_steps: [{ slug: 'med-spa-owner' }],
    prerequisites: [
      { what: 'An active RN licence — injectables are practised on the nursing licence, under a medical director' },
      { what: 'Most employers want 1–2 years of clinical nursing first; the certification courses (neuromodulators, dermal fillers, IV therapy) come after the licence, not instead of it' },
    ],
  },
  'med-spa-owner': {
    entry_steps: [
      { slug: 'certified-nursing-assistant', training_months: 2, cost_k: 1 },
      { slug: 'registered-nurse', training_months: 36, cost_k: 20 },
      { slug: 'aesthetic-nurse-nurse-injector', training_months: 6, cost_k: 4 },
    ],
    next_steps: [],
    prerequisites: [
      { what: 'A clinical licence of your own (RN/NP/PA/MD, by state) or a contracted medical director — a med spa is a medical practice, not a salon' },
      { what: 'Startup capital well beyond training money: devices, premises, product, insurance and compliance — ownership money, not course money' },
    ],
  },
  // Prerequisites-only entries (remainder pass, 29.10.2026): professions
  // whose honest entry chain was invisible while their ladder was empty.
  // No rungs are declared — the prerequisites state the chain in words,
  // exactly as the field is defined above. NP and CRNA state the RN
  // prerequisite the founder's standard requires; the doctoral set
  // states the degree → doctorate → residency chain that matches the
  // TRAINING_OVERRIDES totals. Sources: BLS OOH "How to Become".
  'nurse-practitioner': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'An active RN licence first — nurse practitioner is an advanced-practice role built on registered nursing; it is not an entry point' },
      { what: 'A graduate nursing programme (MSN or DNP) after the RN, plus national APRN certification; most programmes want clinical RN experience first' },
    ],
  },
  'registered-nurse-2': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'An active RN licence first, with at least a year of critical-care (ICU) nursing experience — a hard admission requirement for nurse-anesthesia programmes, not a preference' },
      { what: 'A nurse-anesthesia graduate programme (doctoral, about 3 years) after the RN and ICU experience, then national certification (NBCRNA)' },
    ],
  },
  'general-surgeon': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year medical degree (MD or DO) — there is no direct or shorter entry' },
      { what: 'A 5-year general-surgery residency after medical school, then state licensure and board certification; a subspecialty fellowship adds years on top' },
    ],
  },
  'psychiatrist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year medical degree (MD or DO)' },
      { what: 'A 4-year psychiatry residency after medical school, then state licensure and board certification' },
    ],
  },
  'physician': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year medical degree (MD or DO)' },
      { what: 'A residency after medical school — 3 years for family medicine, longer for most other specialties — then state licensure' },
    ],
  },
  'dentist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree with the science prerequisites dental schools name, then a 4-year dental degree (DDS or DMD)' },
      { what: 'A state dental licence after the degree — national board exams plus a clinical exam; a specialty adds a residency' },
    ],
  },
  'veterinarian': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree with the science prerequisites vet schools name, then a 4-year Doctor of Veterinary Medicine (DVM) degree' },
      { what: 'A state veterinary licence after the degree (the NAVLE exam)' },
    ],
  },
  'podiatrist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year Doctor of Podiatric Medicine (DPM) degree' },
      { what: 'A 3-year podiatric residency (PMSR) after the degree — required for licensure — then the state licence' },
    ],
  },
  'optometrist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year Doctor of Optometry (OD) degree' },
      { what: 'A state optometry licence after the degree (NBEO exams)' },
    ],
  },
  'pharmacist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'Undergraduate prerequisites first (2+ years; most entrants hold a bachelor\'s), then a 4-year Doctor of Pharmacy (PharmD) degree' },
      { what: 'A state pharmacist licence after the degree (NAPLEX and law exams); many roles add a 1–2 year residency' },
    ],
  },
  'chiropractor': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'At least 3 years of undergraduate study first (most states require a bachelor\'s for licensure), then a 4-year Doctor of Chiropractic (DC) programme' },
      { what: 'A state chiropractic licence after the degree (NBCE exams)' },
    ],
  },
  'psychologist-therapist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a doctoral degree in psychology (PhD or PsyD — typically about 5 years including the supervised internship)' },
      { what: 'A state psychology licence after the doctorate and supervised experience (the EPPP exam)' },
    ],
  },
  'audiologist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a 4-year Doctor of Audiology (AuD) degree' },
      { what: 'A state audiology licence after the degree and its clinical externship' },
    ],
  },
  'physical-therapist': {
    entry_steps: [],
    next_steps: [],
    prerequisites: [
      { what: 'A bachelor\'s degree, then a Doctor of Physical Therapy (DPT) programme — typically 3 years' },
      { what: 'A state PT licence after the degree (the NPTE exam)' },
    ],
  },
};

// ---------------------------------------------------------------------------
// VOICE-PRIMARY professions (audit L10, 27.10.2026): the working day IS
// the person's voice — performing, broadcasting, narrating, hosting, or
// back-to-back call work. The Day-1 derivation (people category with max
// people-contact) missed every one of these because they are filed
// under online/creative/business, so a stated voice health limit never
// gated them: a person who cannot talk all day was matched to Voice
// Actor. This explicit set is the primary rule; the old people-category
// derivation stays as the fallback for all-day-talking care/teaching
// roles. Membership is by exact slug, reviewed by hand.
// ---------------------------------------------------------------------------
const VOICE_PRIMARY_SLUGS = new Set([
  'voice-actor', // the product is literally the voice
  'streamer-content-creator', // hours of live talking daily
  'podcast-producer', // hosting / narration is the job's core
  'dj-event-host', // microphone work all event long
  'speech-public-speaking-coach', // demonstrates voice work all day
  'customer-service-representative', // call-centre-heavy: back-to-back calls
]);

// ---------------------------------------------------------------------------
// CAUSE-B BASE FIELDS (28.10.2026). The red-line filters used to read
// hand-kept slug sets inside scoring.mjs (nights: one slug; public
// voice: five) and relocation was never checked at all. The fields now
// live on the profession object, derived HERE — the only producer —
// from the sources named per field, and scoring reads fields only.
// The full per-field journal (sources, borderline calls, coverage) is
// in DATA_PASS_CHANGELOG.md, cause-B entry.
// ---------------------------------------------------------------------------

// night_shifts — night work is STRUCTURAL to the job (a normal entrant
// is rostered onto overnight/rotating shifts), not an occasional
// on-call. O*NET carries no such element, so this is an editorial set,
// reviewed by hand per profession. Deliberate FALSEs worth recording:
// baker (03:00–04:00 starts are early mornings, not night shifts),
// doula and pharmacist (per the design review), drone-pilot-commercial
// (daylight operations — its baseline gate hit was a name-regex false
// positive on the gate side, never an engine fact).
const NIGHT_SHIFTS_SLUGS = new Set([
  // inpatient / 24-7 clinical operations
  'registered-nurse', 'registered-nurse-2', 'lpn-lvn', 'nurse-practitioner',
  'physician-assistant', 'emt-paramedic', 'respiratory-therapist',
  'surgical-technologist', 'dialysis-technician', 'lab-technician',
  'medical-laboratory-scientist', 'radiology-tech', 'mri-technologist',
  'sonographer-ultrasound', 'sterile-processing-tech', 'sleep-technologist',
  'cardiovascular-technologist', 'ekg-technician', 'nuclear-medicine-technologist',
  'physician', 'general-surgeon', 'certified-anesthesiologist-assistant',
  'cardiovascular-perfusionist', 'certified-nurse-midwife', 'home-health-aide',
  // transport operations that run around the clock
  'cdl-truck-driver', 'owner-operator-trucking', 'train-conductor',
  'locomotive-engineer', 'subway-streetcar-operator', 'air-traffic-controller',
  'aircraft-dispatcher-faa', 'bus-driver', 'ship-engineer-merchant-marine',
  'harbor-pilot', 'boat-captain', 'tow-truck-operator', 'commercial-pilot',
  'helicopter-pilot', 'flight-attendant',
  // public safety / 24-7 services
  'police-officer', 'firefighter', 'funeral-director',
  // 24-7 plants, networks and line maintenance
  'power-plant-operator', 'nuclear-reactor-operator',
  'water-wastewater-treatment-operator', 'millwright',
  'semiconductor-technician', 'data-center-technician', 'aircraft-mechanic-a-p',
]);

// relocation_required — living away from home, or relocating to an
// assigned work base, is a CONDITION OF ENTRY (not ordinary travel and
// not the one-off move any job can imply). Editorial white list.
// Deliberate exclusions (design review): owner-operator-trucking,
// train-conductor, locomotive-engineer, boat-captain — weeks away are
// ABSENCE, not relocation, and stay ungated until the founder rules.
const RELOCATION_SLUGS = new Set([
  'ship-engineer-merchant-marine', // months at sea per contract
  'harbor-pilot', // licensed only for one pilotage district — the move is the entry ticket
  'commercial-diver', // offshore / saturation rotations, weeks on site
  'flight-attendant', // the airline assigns the crew base; you relocate to it
  'commercial-pilot', // base assignment, same mechanics as cabin crew
  'helicopter-pilot', // EMS / offshore bases are assigned, often remote
  'tower-climber-telecom', // itinerant tower crews, weeks on the road
  'wind-turbine-technician', // travelling-tech crews are the modal entry path
  'lineworker-power-lines', // apprentice line work is travelling / storm-crew based
]);

// public_voice editorial exceptions — the Work Context rule (below)
// measures the matched SOC occupation, and for these cards the
// occupation's survey average dilutes exactly the part the card sells.
// Membership is by the card's own definition of the work:
//   podcast-producer / dj-event-host / speech-public-speaking-coach —
//     carried over from the retired scoring-side slug set (founder QA);
//     their SOCs (Producers & Directors 27-2012, Disc Jockeys 27-2091 —
//     no Work Context rows exist at all, Self-Enrichment Teachers
//     25-3021) survey the back-office average, not the host's day.
//   online-course-creator, funeral-director — the two recorded misses
//     of the old set (brief §B; funeral directors present to assembled
//     families daily, course creators record/perform on camera).
const PUBLIC_VOICE_EXCEPTIONS = new Set([
  'podcast-producer', 'dj-event-host', 'speech-public-speaking-coach',
  'online-course-creator', 'funeral-director',
]);

// voice_load manual additions (brief §B, recorded L10-type misses):
// phone-first sales / recruiting roles whose O*NET Speaking level sits
// under the rule threshold while the working day is back-to-back calls.
const VOICE_LOAD_MANUAL_SLUGS = new Set([
  'recruiter', 'commercial-insurance-producer',
]);

const SPEAKING_SKILL_ID = '2.A.1.d'; // O*NET Skills element "Speaking"

// ---------------------------------------------------------------------------
// CAREER vs SIDE HUSTLE (founder's rule, 28.10.2026). A match is a stable
// job: hired work, or your own business as your MAIN occupation. A
// side hustle is an income format nobody hires you into and that is
// typically run NEXT TO a main job — you cannot "get hired" as an Etsy
// seller. Membership below is by exact slug, reviewed by hand against
// that rule; every other profession is kind 'career' by default.
// Scoring excludes side hustles from the top-3, the bottom-3, the
// cushion and the bridge anchor, and may offer ONE of them as a
// separate extra-money idea (scorePerson's side_hustle_pick). The full
// classification — every member's one-line basis, and every borderline
// profession deliberately KEPT a career — is the table in
// DATA_PASS_CHANGELOG.md (career/side-hustle entry). Two families:
//   * marketplace / asset formats (her named cases): selling on Etsy,
//     Amazon FBA or print-on-demand, resale/flipping in all its wrappers
//     (goods, cars, boats), franchise format, absentee assets
//     (laundromat, self-storage, car wash, vending routes, weekend
//     event-rental rigs), real-estate investing as deal flow.
//   * audience / practice formats with no hiring market: streaming and
//     own-course creation (income is an audience or an asset you build,
//     typically alongside a job first) and unlicensed coaching
//     practices (no licence, no employer — typically a side practice).
// Deliberately NOT here (kept careers, reasons in the changelog):
// UGC Creator (brands hire creators per video — client work), Doula,
// Personal / Fashion Stylist, Home Organizer, Airbnb Co-host (client
// services), Tutoring Center Owner and the other operating owners
// (the owner works IN the business — it is the main occupation),
// Freight / Business / Yacht Broker (licensed, brokerages hire).
// ---------------------------------------------------------------------------
const SIDE_HUSTLE_SLUGS = new Set([
  // marketplace / asset formats
  'etsy-digital-products-seller', 'amazon-fba-seller', 'print-on-demand-seller',
  'resale-flipping-business', 'car-flipping', 'boat-restoration-flipping',
  'franchise-owner-home-services', 'laundromat-owner', 'self-storage-owner',
  'car-wash-owner', 'vending-atm-route-owner', 'photo-booth-event-rentals-owner',
  'real-estate-investor-flips', 'real-estate-investor-rentals',
  // audience / unlicensed-practice formats
  'streamer-content-creator', 'online-course-creator',
  'life-coach', 'wellness-coach',
]);

/**
 * Derive the cause-B fields on one built profession, AFTER the O*NET
 * import merge (the derivations read work_context / skills_lv). Every
 * value carries its provenance in data_flags:
 *   night_shifts_editorial / relocation_editorial — the hand-reviewed
 *     sets above (no O*NET source exists for either fact);
 *   public_voice_onet / public_voice_editorial — Work Context rule vs
 *     the exception set; no flag + work_context null = unmeasured, and
 *     the field is false (an unmeasured profession must not be blocked
 *     on a guess);
 *   voice_load_onet / voice_load_editorial / voice_load_from_category —
 *     Speaking-rule vs manual sets vs the Day-1 people-category
 *     derivation, which stays ONLY as the care/teaching fallback (the
 *     L10 comment above): a measured low Speaking level must not strip
 *     protection from roles whose day is continuous 1:1 talking.
 */
function finalizeBaseFields(p) {
  // Career vs side hustle (founder's rule, 28.10.2026 — see the set
  // above). Default is 'career': only a hand-reviewed member of the
  // set is a side hustle, and the flag records the provenance.
  p.kind = SIDE_HUSTLE_SLUGS.has(p.slug) ? 'side_hustle' : 'career';
  if (p.kind === 'side_hustle') p.data_flags.push('side_hustle_editorial');
  p.night_shifts = NIGHT_SHIFTS_SLUGS.has(p.slug);
  p.data_flags.push('night_shifts_editorial');
  p.relocation_required = RELOCATION_SLUGS.has(p.slug);
  p.data_flags.push('relocation_editorial');

  if (PUBLIC_VOICE_EXCEPTIONS.has(p.slug)) {
    p.public_voice = true;
    p.data_flags.push('public_voice_editorial');
  } else if (p.work_context) {
    p.public_voice =
      (typeof p.work_context.public_speaking_cx === 'number' && p.work_context.public_speaking_cx >= 3.5) ||
      (typeof p.work_context.public_speaking_daily_pct === 'number' && p.work_context.public_speaking_daily_pct >= 50);
    p.data_flags.push('public_voice_onet');
  } else {
    p.public_voice = false;
  }

  const speaking = p.skills_lv ? p.skills_lv[SPEAKING_SKILL_ID] : null;
  const telCx = p.work_context ? p.work_context.telephone_cx : null;
  if (VOICE_PRIMARY_SLUGS.has(p.slug) || VOICE_LOAD_MANUAL_SLUGS.has(p.slug)) {
    p.gates.voice_load = true;
    p.data_flags.push('voice_load_editorial');
  } else if (
    typeof speaking === 'number' &&
    (speaking >= 4.0 || (speaking >= 3.75 && typeof telCx === 'number' && telCx >= 4.5))
  ) {
    p.gates.voice_load = true;
    p.data_flags.push('voice_load_onet');
  } else if (p.category === 'people' && p.attrs && p.attrs.people === 2) {
    p.gates.voice_load = true;
    p.data_flags.push('voice_load_from_category');
  } else {
    p.gates.voice_load = false;
  }
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = (s) => normName(s).replace(/ /g, '-');

// ---------------------------------------------------------------------------
// Training text → months (midpoint). Roadmap `money` lines look like:
//   "Training: <b>1–6 months</b> · certificate route."
//   "Training: <b>4–5 years</b> · paid apprenticeship…"
//   "Training: <b>weeks</b>" / "<b>~3 years</b>" / "<b>6–18 months</b>"
// ---------------------------------------------------------------------------
export function parseTrainingMonths(moneyLines) {
  if (!Array.isArray(moneyLines)) return null;
  const text = moneyLines.join(' ');
  const m = text.match(/Training:\s*<b>([^<]+)<\/b>/i) || text.match(/Training:\s*([^·<]+)/i);
  if (!m) return null;
  const raw = m[1].trim().toLowerCase();
  if (/^weeks?$/.test(raw)) return 1; // "weeks" ≈ a few weeks → ~1 month stub
  const unit = /year/.test(raw) ? 12 : /week/.test(raw) ? 1 / 4.345 : 1; // default: months
  const nums = [...raw.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => Number(x[1]) * unit);
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0]; // single value or "4+ years" → the stated floor value
  return (nums[0] + nums[1]) / 2; // range midpoint
}

// ---------------------------------------------------------------------------
// Top-decile pay threshold → $K (audit V12, 28.10.2026). NO source in
// this project carries a true 75th-percentile (top-quartile) wage — not
// the O*NET import shards (no wage fields at all), not professions.json
// (median only), not the roadmaps. The ONLY sourced upper-tail figures
// are BLS top-10% thresholds written into a few roadmap money lines:
//   "…top earners clear $85K+: top 10% over $144,090"   (Accountant)
//   "…top 10% $108,510+"                                (Electrician)
//   "…top 10% over $138,140"                            (Insurance Sales Agents)
// They are stored as pay_top_decile_k — NEVER in pay_top_quartile_k:
// a decile threshold is not a quartile figure, and the floor math
// prints "top 25%" claims only against a real quartile value. The
// decile feeds its own floor status ('top_decile_only') in scoring.
// "over $X" semantics → floor to whole $K (never round the threshold up).
// ---------------------------------------------------------------------------
export function parseTopDecileK(moneyLines) {
  if (!Array.isArray(moneyLines)) return null;
  const text = moneyLines.join(' ');
  const m = text.match(/top\s*10%\s*(?:over\s*)?\$([\d,]+)/i);
  if (!m) return null;
  const dollars = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.floor(dollars / 1000);
}

// Fallback when a profession has no matched roadmap text: the site's own
// study band (tuple index 13) → midpoint months of the band's label.
// Bands: 1 "1–6 mo" → 3.5 · 2 "6–12 mo" → 9 · 3 "1–2 yrs" → 18 ·
//        4 "2–4 yrs" → 36 · 5 "4+ yrs" → 54 (stub: midpoint of 48–60).
const STUDY_BAND_MONTHS = { 1: 3.5, 2: 9, 3: 18, 4: 36, 5: 54 };

// ---------------------------------------------------------------------------
// STUB DERIVATIONS (Day-1 editorial calibration — flagged on every object).
// All attrs are 0..2 except pay (1..3) and biz (0..1).
//
// supplies (0..1 per O*NET work value) — what the profession SUPPLIES:
//   achievement       ← 0.5·payBand + 0.5·biz        (results + running your own thing)
//   independence      ← 0.6·remote + 0.4·biz          (own schedule / own boss)
//   recognition       ← 0.6·payBand + 0.4·creat      (status pay + visible work)
//   relationships     ← people                       (people are the work itself)
//   support           ← 0.5·care + 0.5·people         (structured, caring environments)
//   working_conditions← 0.7·(1 − aiRisk) + 0.3·remote (stability + place flexibility)
//   where payBand = (pay−1)/2 and the 0..2 attrs are divided by 2.
//
// sdt (0..1 affordances):
//   autonomy    ← 0.5·remote + 0.5·biz
//   relatedness ← 0.7·people + 0.3·care
//
// riasec (0..1 per letter): category base profile blended 70/30 with an
// attr signal per letter:
//   R ← hands · I ← tech · A ← creat · S ← max(people, care) ·
//   E ← biz · C ← 0.5·tech + 0.5·remote (screen/structured work proxy)
// ---------------------------------------------------------------------------
const RIASEC_CATEGORY_BASE = {
  online:    { R: 0.2, I: 0.7, A: 0.2, S: 0.2, E: 0.3, C: 0.6 },
  trades:    { R: 0.9, I: 0.3, A: 0.1, S: 0.2, E: 0.2, C: 0.3 },
  health:    { R: 0.4, I: 0.5, A: 0.1, S: 0.8, E: 0.1, C: 0.3 },
  business:  { R: 0.2, I: 0.4, A: 0.2, S: 0.3, E: 0.8, C: 0.5 },
  people:    { R: 0.2, I: 0.2, A: 0.4, S: 0.9, E: 0.4, C: 0.3 },
  creative:  { R: 0.3, I: 0.3, A: 0.9, S: 0.2, E: 0.3, C: 0.1 },
  transport: { R: 0.7, I: 0.2, A: 0.1, S: 0.2, E: 0.2, C: 0.4 },
  food:      { R: 0.6, I: 0.2, A: 0.5, S: 0.4, E: 0.3, C: 0.3 },
  beauty:    { R: 0.5, I: 0.1, A: 0.6, S: 0.6, E: 0.3, C: 0.2 },
};
const RIASEC_DEFAULT_BASE = { R: 0.3, I: 0.3, A: 0.3, S: 0.3, E: 0.3, C: 0.3 };

function deriveStubs(attrs, category) {
  const n2 = (v) => (typeof v === 'number' ? v / 2 : 0); // 0..2 → 0..1
  const payBand = typeof attrs.pay === 'number' ? (attrs.pay - 1) / 2 : 0; // 1..3 → 0..1
  const biz = typeof attrs.biz === 'number' ? attrs.biz : 0; // already 0..1

  const supplies = {
    achievement: clamp01(0.5 * payBand + 0.5 * biz),
    independence: clamp01(0.6 * n2(attrs.remote) + 0.4 * biz),
    recognition: clamp01(0.6 * payBand + 0.4 * n2(attrs.creat)),
    relationships: clamp01(n2(attrs.people)),
    support: clamp01(0.5 * n2(attrs.care) + 0.5 * n2(attrs.people)),
    working_conditions: clamp01(0.7 * (1 - n2(attrs.ai)) + 0.3 * n2(attrs.remote)),
  };

  const sdt = {
    autonomy: clamp01(0.5 * n2(attrs.remote) + 0.5 * biz),
    relatedness: clamp01(0.7 * n2(attrs.people) + 0.3 * n2(attrs.care)),
  };

  const base = RIASEC_CATEGORY_BASE[category] || RIASEC_DEFAULT_BASE;
  const riasec = {
    R: clamp01(0.7 * base.R + 0.3 * n2(attrs.hands)),
    I: clamp01(0.7 * base.I + 0.3 * n2(attrs.tech)),
    A: clamp01(0.7 * base.A + 0.3 * n2(attrs.creat)),
    S: clamp01(0.7 * base.S + 0.3 * Math.max(n2(attrs.people), n2(attrs.care))),
    E: clamp01(0.7 * base.E + 0.3 * biz),
    C: clamp01(0.7 * base.C + 0.15 * n2(attrs.tech) + 0.15 * n2(attrs.remote)),
  };

  return { supplies, sdt, riasec };
}

// ---------------------------------------------------------------------------
// Roadmap matching. Priority:
//   1. byName map shipped inside roadmaps-data-1/2 (name → slug), exact.
//   2. Normalised-name equality with a roadmap entry's `name`.
//   3. Suffix match: profession name ENDS WITH the roadmap name
//      ("Accountant" → "Accountant (CPA track)" fails this; handled by 4).
//   4. Containment: normalised profession name contains the roadmap name or
//      vice versa; shortest candidate wins ("Physician" → "Family
//      Physician", not "Physician Assistant" — suffix rule fires first).
// Unmatched roadmap cards (e.g. "Customer Service Representative", which has
// no tuple in professions.json) simply attach to nothing.
// ---------------------------------------------------------------------------
function buildRoadmapIndex(roadmapFilesData) {
  const entries = []; // {slug, name, norm, sticker, money}
  const byName = new Map(); // normName -> slug
  for (const data of roadmapFilesData) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'byName' && value && typeof value === 'object') {
        for (const [name, slug] of Object.entries(value)) byName.set(normName(name), slug);
        continue;
      }
      if (value && typeof value === 'object' && typeof value.name === 'string') {
        entries.push({
          slug: key,
          name: value.name,
          norm: normName(value.name),
          sticker: typeof value.sticker === 'string' ? value.sticker : null,
          money: Array.isArray(value.money) ? value.money : [],
        });
      }
    }
  }
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const byNorm = new Map(entries.map((e) => [e.norm, e]));
  return { entries, byName, bySlug, byNorm };
}

function matchRoadmap(profName, index) {
  const norm = normName(profName);
  const slugFromMap = index.byName.get(norm);
  if (slugFromMap && index.bySlug.has(slugFromMap)) return index.bySlug.get(slugFromMap);
  if (index.byNorm.has(norm)) return index.byNorm.get(norm);
  // suffix: profession ends with roadmap name (e.g. "Family Physician" ← "Physician")
  const suffix = index.entries
    .filter((e) => norm.endsWith(' ' + e.norm))
    .sort((a, b) => b.norm.length - a.norm.length)[0];
  if (suffix) return suffix;
  // containment either way, shortest profession-side distance wins
  const containment = index.entries
    .filter((e) => norm.includes(e.norm) || e.norm.includes(norm))
    .sort((a, b) => Math.abs(a.norm.length - norm.length) - Math.abs(b.norm.length - norm.length))[0];
  return containment || null;
}

function parseVerdict(sticker) {
  if (!sticker) return null;
  const m = sticker.match(/Our take:\s*(YES|NO)\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// buildProfessions(profData, roadmapDataArray) → array of profession stub
// objects (see header comment and the task spec for the exact shape).
// Pure data transform — no I/O — so the Mentor API can build the same
// objects from JSON fetched over HTTP when no local site dir exists
// (serverless hosts). loadProfessions() below is the file-reading wrapper.
// ---------------------------------------------------------------------------
export function buildProfessions(profData, roadmapData) {
  const tuples = Array.isArray(profData) ? profData : profData.n;
  if (!Array.isArray(tuples)) throw new Error('professions.json: expected { n: [...] }');

  const index = buildRoadmapIndex(roadmapData);

  const usedSlugs = new Set();
  const built = tuples.map((t) => {
    const [name, category, pay, ai, remote, lic, hands, people, biz, tech, out, care, creat, studyBand, payK] = t;
    const attrs = { pay, ai, remote, lic, hands, people, biz, tech, out, care, creat };

    const roadmap = matchRoadmap(name, index);
    let verdict = roadmap ? parseVerdict(roadmap.sticker) : null;

    let slug = roadmap ? roadmap.slug : slugify(name);
    if (usedSlugs.has(slug)) slug = `${slug}-2`;
    usedSlugs.add(slug);

    // pay_top_decile_k: BLS top-10% threshold parsed from the roadmap
    // money lines where the card states one (V12 — see parseTopDecileK).
    const payTopDecileK = roadmap ? parseTopDecileK(roadmap.money) : null;

    // training_months: roadmap text first (parsed midpoint), study-band fallback.
    let trainingMonths = roadmap ? parseTrainingMonths(roadmap.money) : null;
    let trainingSource = trainingMonths != null ? 'roadmap_text' : null;
    if (trainingMonths == null && STUDY_BAND_MONTHS[studyBand] != null) {
      trainingMonths = STUDY_BAND_MONTHS[studyBand];
      trainingSource = 'study_band';
    }
    if (TRAINING_OVERRIDES[slug] != null) {
      trainingMonths = TRAINING_OVERRIDES[slug];
      trainingSource = 'override';
    }

    const { supplies, sdt, riasec } = deriveStubs(attrs, category);

    const dataFlags = [
      'supplies_stub', // derived from attrs — see deriveStubs()
      'sdt_stub',
      'riasec_stub',
      ...UNSOURCED_FIELDS, // null: no source data yet
    ];
    if (payTopDecileK != null) dataFlags.push('pay_top_decile_from_roadmap_text');
    if (trainingSource === 'roadmap_text') dataFlags.push('training_months_from_roadmap_text');
    if (trainingSource === 'study_band') dataFlags.push('training_months_from_study_band');
    if (trainingSource === 'override') dataFlags.push('training_months_from_override');
    if (trainingMonths == null) dataFlags.push('training_months');
    if (!roadmap) dataFlags.push('verdict', 'verdict_text', 'roadmap_unmatched');
    else if (verdict == null) dataFlags.push('verdict_unparsed');
    if (!roadmap) dataFlags.push('slug_derived_from_name');

    // Editorial verdict fill (founder QA, 27.10.2026): no served profession
    // may carry a null verdict — a roadmap card still supersedes this.
    if (verdict == null && EDITORIAL_VERDICTS[slug]) {
      verdict = EDITORIAL_VERDICTS[slug];
      dataFlags.push('verdict_editorial');
      const vf = dataFlags.indexOf('verdict');
      if (vf >= 0) dataFlags.splice(vf, 1);
    }
    const ageGate = AGE_GATES[slug] ?? null;

    return {
      slug,
      name,
      category,
      bls_outlook: SOURCED_OUTLOOK[slug] ?? null,
      verdict,
      verdict_text: roadmap ? roadmap.sticker : null,
      age_gate: ageGate,
      payK: typeof payK === 'number' ? payK : null,
      // V12: pay_top_quartile_k stays null — no 75th-percentile source
      // exists in the project (checked 28.10.2026); the sourced BLS
      // top-10% thresholds live in pay_top_decile_k instead.
      pay_top_quartile_k: null,
      pay_top_decile_k: payTopDecileK,
      attrs,
      training_months: trainingMonths,
      supplies,
      supplies_stub: true,
      sdt,
      riasec,
      riasec_stub: true,
      gates: {
        // voice_load: FINAL value is derived in finalizeBaseFields()
        // after the O*NET merge (manual voice-primary set ∪ Speaking-LV
        // rule ∪ people-category fallback — see the cause-B block
        // above). The literal here is only the pre-import placeholder.
        voice_load: false,
        // physical: maximum hands-on load.
        physical: hands === 2,
      },
      // --- career ladder (Matchmaker 2.0 core, 28.10.2026): from the
      // LADDERS table above; empty arrays are the honest state for a
      // profession whose cluster has not been filled yet.
      entry_steps: (LADDERS[slug] && LADDERS[slug].entry_steps) || [],
      next_steps: (LADDERS[slug] && LADDERS[slug].next_steps) || [],
      prerequisites: (LADDERS[slug] && LADDERS[slug].prerequisites) || [],
      // --- cause-B base fields (28.10.2026): placeholders, derived for
      // real in finalizeBaseFields() once the import has merged.
      kind: 'career', // placeholder — finalizeBaseFields() sets the real value
      night_shifts: false,
      public_voice: false,
      relocation_required: false,
      // --- model v2 §1в sourced fields: null until applyOnetImport()
      // fills them from data/onet-import.json; flagged while null.
      onet_soc: null,
      onet_title: null,
      onet_match: null,
      job_zone: null,
      tasks: null,
      bls_inherited: null,
      bls_vintage: null,
      bls_ai_exposure: null,
      bls_ai_exposure_tier: null,
      bls_ai_exposure_source: null,
      work_values_extent: null,
      work_values_frozen_date: null,
      // Set by applyOnetImport() when the supplies extent was measured
      // on a neighbouring occupation (the occupation's own Work Values
      // row does not exist in O*NET 30.2): {soc, title, reason}.
      supplies_neighbor: null,
      abilities_lv: null,
      skills_lv: null,
      work_context: null,
      inflow_competition_flag: null,
      license_type: null,
      data_flags: dataFlags,
    };
  });
  const merged = applyOnetImport(built);
  // Cause-B fields derive from the merged record (work_context,
  // skills_lv), so they are finalised only now — one producer, one
  // place, no second copy of the rules anywhere downstream.
  for (const p of merged) finalizeBaseFields(p);
  return merged;
}

// ---------------------------------------------------------------------------
// loadProfessions(opts) — file-reading wrapper over buildProfessions().
// Reads the live site dir (default ~/workspace/careerglitch-site).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// WS2 swap: merge data/onet-import.json (O*NET 30.2) into the built
// professions. The import file is looked for relative to this module so
// the same code works in the repo layout (engine/ -> ../data/) and in
// the deployed Vercel bundle (api/_lib/engine/ -> ../data/), with cwd
// fallbacks for serverless hosts. Absent file → Day-1 behaviour,
// untouched (stubs + nulls + flags).
// ---------------------------------------------------------------------------
function readOnetImport() {
  const candidates = [
    new URL('../data/onet-import.json', import.meta.url),
    new URL('./data/onet-import.json', import.meta.url),
  ];
  try {
    candidates.push(join(process.cwd(), 'data', 'onet-import.json'));
    candidates.push(join(process.cwd(), 'api', '_lib', 'data', 'onet-import.json'));
  } catch { /* no cwd — module-relative paths only */ }
  for (const c of candidates) {
    try {
      if (existsSync(c)) return JSON.parse(readFileSync(c, 'utf8'));
    } catch { /* unreadable candidate — try the next */ }
  }
  // Sharded form (deployed bundle): the connector upload path caps a
  // single file at ~90 KB, so the bundle ships onet-import-NN.json
  // shards in the data dir; merge them back into one import object.
  const dirs = [
    new URL('../data/', import.meta.url),
    new URL('./data/', import.meta.url),
  ];
  try {
    dirs.push(join(process.cwd(), 'data'));
    dirs.push(join(process.cwd(), 'api', '_lib', 'data'));
  } catch { /* module-relative dirs only */ }
  for (const d of dirs) {
    try {
      const names = readdirSync(d).filter((n) => /^onet-import-\d+\.json$/.test(n)).sort();
      if (!names.length) continue;
      const merged = { meta: {}, professions: {} };
      for (const n of names) {
        const s = JSON.parse(readFileSync(join(d, n), 'utf8'));
        if (s.meta) merged.meta = s.meta;
        Object.assign(merged.professions, s.professions || {});
      }
      if (Object.keys(merged.professions).length) return merged;
    } catch { /* not this dir — try the next */ }
  }
  return null;
}

const dropFlags = (p, names) => { p.data_flags = p.data_flags.filter((f) => !names.includes(f)); };

export function applyOnetImport(profs) {
  const imp = readOnetImport();
  if (!imp || !imp.professions) return profs;
  for (const p of profs) {
    // bls_vintage stamps the BLS projection vintage of the site series
    // (2025–35) on EVERY vector, matched or not (model v2 §1в).
    p.bls_vintage = '2025-35';
    dropFlags(p, ['bls_vintage']);
    const e = imp.professions[p.slug];
    if (e && e.onet_soc) {
      p.onet_soc = e.onet_soc;
      p.onet_title = e.onet_title ?? null;
      p.onet_match = e.match_method ?? null;
      p.job_zone = e.job_zone ?? null;
      p.tasks = Array.isArray(e.tasks) ? e.tasks : null;
      p.bls_inherited = !!e.bls_inherited;
      dropFlags(p, ['onet_soc', 'bls_inherited']);
      if (e.riasec_profile) {
        p.riasec = e.riasec_profile;
        p.riasec_stub = false;
        dropFlags(p, ['riasec_stub']);
      }
      if (e.work_values_extent) {
        p.work_values_extent = e.work_values_extent;
        p.work_values_frozen_date = e.work_values_frozen_date ?? null;
        // supplies is DERIVED from the sourced extent — (EX − 1) / 6
        // onto 0..1 — never stored separately, so it cannot drift.
        p.supplies = Object.fromEntries(Object.entries(e.work_values_extent)
          .map(([k, v]) => [k, Math.round(((v - 1) / 6) * 10000) / 10000]));
        p.supplies_stub = false;
        dropFlags(p, ['work_values_extent', 'work_values_frozen_date', 'supplies_stub']);
        if (e.work_values_neighbor) {
          // The extent is real O*NET data but belongs to a neighbouring
          // occupation (this occupation has no Work Values row of its
          // own). Provenance is stored on the object — never hidden.
          p.supplies_neighbor = e.work_values_neighbor;
          p.data_flags.push('supplies_from_neighbor');
        }
      }
      // LV vectors ship as arrays aligned to the meta element order;
      // expand them back to {element_id: level}. A length mismatch is
      // shape drift — the field stays null and flagged, never guessed.
      const expandVec = (vec, elementsMeta) => {
        if (!vec) return null;
        if (!Array.isArray(vec)) return vec;
        const ids = Object.keys(elementsMeta || {});
        if (ids.length !== vec.length) return null;
        return Object.fromEntries(ids.map((id, i) => [id, vec[i]]));
      };
      const ab = expandVec(e.abilities_lv, imp.meta && imp.meta.abilities_elements);
      if (ab) { p.abilities_lv = ab; dropFlags(p, ['abilities_lv']); }
      const sk = expandVec(e.skills_lv, imp.meta && imp.meta.skills_elements);
      if (sk) { p.skills_lv = sk; dropFlags(p, ['skills_lv']); }
      // Work Context raw values (cause B): public_speaking / telephone /
      // face_to_face CX means + daily shares for the matched SOC. Null
      // where the occupation has no Work Context rows in 30.2 — the
      // field derivation in finalizeBaseFields handles the absence.
      p.work_context = e.work_context ?? null;
      if (p.work_context) dropFlags(p, ['work_context']);
      // BLS AI exposure: populated only where an authoritative statement
      // was read (tier + source travel with the value). Null elsewhere —
      // the flag stays on, because the field is still unsourced there.
      p.bls_ai_exposure = e.bls_ai_exposure ?? null;
      p.bls_ai_exposure_tier = e.bls_ai_exposure_tier ?? null;
      p.bls_ai_exposure_source = e.bls_ai_exposure_source ?? null;
      if (p.bls_ai_exposure) dropFlags(p, ['bls_ai_exposure']);
      p.data_flags.push('onet_sourced');
    } else {
      // No clean O*NET match: stubs and nulls stay, flagged honestly.
      p.onet_match = e ? (e.match_method ?? 'unmatched') : 'not_in_import';
      p.onet_unmatched_reason = e ? (e.match_method ?? null) : null;
      p.data_flags.push('no_onet_match');
    }
  }
  return profs;
}

export function loadProfessions(opts = {}) {
  const siteDir = opts.siteDir || process.env.CG_SITE_DIR || DEFAULT_SITE_DIR;
  const profData = JSON.parse(readFileSync(join(siteDir, 'professions.json'), 'utf8'));
  const roadmapData = ROADMAP_FILES.map((f) => JSON.parse(readFileSync(join(siteDir, f), 'utf8')));
  return buildProfessions(profData, roadmapData);
}

export const ROADMAP_FILE_NAMES = ROADMAP_FILES;

export default loadProfessions;
