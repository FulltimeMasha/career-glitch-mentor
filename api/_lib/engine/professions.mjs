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
        // voice_load: voice-PRIMARY professions by explicit slug set
        // (audit L10 — see VOICE_PRIMARY_SLUGS above), plus the Day-1
        // derivation: a people-category profession with maximum
        // people-contact is voice-heavy all day (calls, clients,
        // teaching aloud). Used by the factual voice gate in scoring.
        voice_load: VOICE_PRIMARY_SLUGS.has(slug) || (category === 'people' && people === 2),
        // physical: maximum hands-on load.
        physical: hands === 2,
      },
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
      abilities_lv: null,
      skills_lv: null,
      inflow_competition_flag: null,
      license_type: null,
      data_flags: dataFlags,
    };
  });
  return applyOnetImport(built);
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
