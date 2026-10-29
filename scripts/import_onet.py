#!/usr/bin/env python3
"""O*NET 30.2 import for Career Glitch Mentor (Stage 2, WS2).

Reads the pinned O*NET database 30.2 text files from
data/onet/db_30_2_text/ (official download: onetcenter.org,
db_30_2_text.zip) and the site's 339 professions (slug list produced by
engine/professions.mjs), and writes:

  data/onet-import.json          — sourced card fields per profession slug
  data/onet-mapping-report.json  — match audit trail (method, candidates)

Field rules (model v2 §1в + science map §4 — nothing is invented):
  onet_soc            matched O*NET-SOC code (data-level occupations only)
  riasec_profile      Interests.txt scale OI (0..7) / 7 -> 0..1 per letter
  work_values_extent  Work Values.txt scale EX (1..7), RAW values
  work_values_neighbor  present ONLY where the occupation has no Work
                      Values row of its own and the extent was measured
                      on the nearest rated sibling/parent (SUPPLIES_
                      NEIGHBOR below); the borrowing is recorded, and
                      the loader stamps it on the profession object as
                      supplies_neighbor — never passed off as its own.
  supplies            (EX - 1) / 6 -> 0..1, keyed by the model's 6 values
  work_values_frozen_date  latest Date among the occupation's EX rows —
                      the file is a frozen snapshot (science map §4)
  abilities_lv        Abilities.txt scale LV (0..7), keyed by Element ID
  skills_lv           Skills.txt scale LV (0..7), keyed by Element ID
  work_context        Work Context.txt for three elements (cause-B fields,
                      28.10.2026): Public Speaking 4.C.1.a.2.c, Telephone
                      Conversations 4.C.1.a.2.f, Face-to-Face Discussions
                      4.C.1.a.2.l — scale CX (mean, 1..5) plus the CXP
                      category-5 share ("every day", %) where rated. Ten
                      base SOCs have no Work Context rows at all in 30.2
                      (e.g. 27-2091 Disc Jockeys) — the entry then carries
                      work_context = null and the loader falls back to the
                      editorial exception tables, flagged.
  job_zone            Job Zones.txt (1..5)
  tasks               top-5 Task Statements by Task Ratings scale IM
  bls_ai_exposure     ONLY where an authoritative statement of the BLS
                      category was read (evidence table below, keyed by
                      SOC, with source tier); otherwise null + flag.
  bls_vintage         '2025-35' for every profession (base-wide audit).

Attribution (CC BY 4.0) ships in the JSON meta and the repo README.
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ONET = ROOT / 'data' / 'onet' / 'db_30_2_text'
OUT_IMPORT = ROOT / 'data' / 'onet-import.json'
OUT_REPORT = ROOT / 'data' / 'onet-mapping-report.json'
PROFS_JSON = '/tmp/profs.json'  # produced by engine/professions.mjs

ATTRIBUTION = ('This page includes information from the O*NET 30.2 Database by the '
               'U.S. Department of Labor, Employment and Training Administration '
               '(USDOL/ETA). Used under the CC BY 4.0 license. O*NET® is a trademark '
               'of USDOL/ETA. Career Glitch has modified all or some of this '
               'information. USDOL/ETA has not approved, endorsed, or tested these '
               'modifications.')

VALUE_KEY = {  # O*NET Work Value element name -> model v2 value key
    'Achievement': 'achievement',
    'Independence': 'independence',
    'Recognition': 'recognition',
    'Relationships': 'relationships',
    'Support': 'support',
    'Working Conditions': 'working_conditions',
}
RIASEC_KEY = {'Realistic': 'R', 'Investigative': 'I', 'Artistic': 'A',
              'Social': 'S', 'Enterprising': 'E', 'Conventional': 'C'}

# --- BLS AI-exposure evidence (keyed by SOC 2018 code without suffix) ----
# Tier 'bls_official_text': stated on bls.gov (EP FAQ / AI exposure
# categories publication, read 26.10.2026).
# Tier 'secondary_report': named publications reporting the BLS table
# (beebulletin.com high-income-skills analysis; NAHB via buildradicals).
# Occupations not listed here keep bls_ai_exposure = null. The BLS XLSX
# itself could not be downloaded from this environment (Akamai 403 on
# direct fetch; the link href is not exposed by the reading tools) —
# see BUILDLOG day 2.
BLS_AI_EVIDENCE = {
    '43-4051': ('Very high', 'bls_official_text', 'BLS EP FAQ + AI exposure categories publication: customer service representatives named as Very high'),
    '15-1257': ('Very high', 'bls_official_text', 'BLS EP FAQ: web developers named as Very high'),
    '13-2052': ('Very high', 'bls_official_text', 'BLS EP FAQ: personal financial advisors named as Very high'),
    '29-1292': ('Low', 'bls_official_text', 'BLS EP FAQ: dental hygienists named as Low'),
    '33-2011': ('Low', 'bls_official_text', 'BLS EP FAQ: firefighters named as Low'),
    '37-2012': ('Low', 'bls_official_text', 'BLS EP FAQ: maids and housekeeping cleaners named as Low'),
    '47-2111': ('Moderate', 'secondary_report', 'beebulletin.com (reporting the BLS table): electricians rate Moderate'),
    '53-2011': ('Moderate', 'secondary_report', 'beebulletin.com: pilots rate Moderate (airline pilots SOC)'),
    '53-2021': ('Moderate', 'secondary_report', 'beebulletin.com: air traffic controllers rate Moderate'),
    '47-4021': ('Low', 'secondary_report', 'beebulletin.com: elevator installers rate Low'),
    '49-9051': ('Low', 'secondary_report', 'beebulletin.com: power-line workers rate Low'),
    '11-9021': ('High', 'secondary_report', 'NAHB analysis of BLS data via buildradicals.com: construction managers High'),
    '47-4011': ('High', 'secondary_report', 'NAHB analysis of BLS data via buildradicals.com: construction and building inspectors High'),
}

# --- Hand-decided mapping overrides -------------------------------------
# slug -> (soc | None, reason, bls_inherited). Written after reviewing
# every auto-match by hand (see BUILDLOG day 2). None = the profession
# has NO clean O*NET occupation; the auto-match (if any) was wrong and
# is removed rather than replaced with a stretch.
_O = {
    # -- corrections of wrong auto-matches
    'handyman-solo-pro': ('49-9071.00', 'auto-match hit a farmworker alternate title; handyman work is general maintenance and repair', False),
    'dispatcher-trucking': ('43-5032.00', 'auto-match hit an EMT alternate title; trucking dispatchers sit in Dispatchers, Except Police/Fire/Ambulance', False),
    'lab-technician': ('29-2012.00', 'auto-match hit nanotechnology technologists; the card is a medical/clinical lab technician', False),
    'project-manager': ('13-1082.00', 'Project Management Specialists is the actual SOC occupation; auto-match hit an engineering-manager alternate', False),
    'sonographer-ultrasound': ('29-2032.00', 'Diagnostic Medical Sonographers; auto-match hit cardiovascular technologists', False),
    'drone-pilot-commercial': ('53-2012.00', 'Commercial Pilots; auto-match hit mechatronics technologists', False),
    'police-officer': ('33-3051.00', "Police and Sheriff's Patrol Officers; auto-match hit a records-officer alternate title", False),
    'music-instructor': ('25-3021.00', 'private music instruction sits in Self-Enrichment Teachers, not postsecondary teaching', False),
    'dance-instructor': ('25-3021.00', 'private dance instruction sits in Self-Enrichment Teachers', False),
    'driving-instructor': ('25-3021.00', 'driving instruction sits in Self-Enrichment Teachers', False),
    'veterinary-assistant': ('31-9096.00', 'Veterinary Assistants and Laboratory Animal Caretakers; auto-match hit the technologist occupation (different credential)', False),
    'solar-installer': ('47-2231.00', 'Solar Photovoltaic Installers is the volume occupation; auto-match hit solar thermal', False),
    'cabinet-maker': ('51-7011.00', 'Cabinetmakers and Bench Carpenters; auto-match generalised to Carpenters', False),
    'cybersecurity-analyst': ('15-1212.00', 'Information Security Analysts; auto-match hit security management specialists', False),
    'hr-specialist': ('13-1071.00', 'Human Resources Specialists; auto-match narrowed to labor relations', False),
    'logistics-coordinator': ('13-1081.00', 'Logisticians; auto-match jumped a level to transportation managers', False),
    'delivery-driver-light-truck': ('53-3033.00', 'Light Truck Drivers; auto-match hit couriers/messengers', False),
    'administrative-assistant': ('43-6014.00', 'general administrative assistants sit in Secretaries and Administrative Assistants, Except Legal/Medical/Executive; auto-match hit the executive split', False),
    'fiber-optic-technician': ('49-9052.00', 'Telecommunications Line Installers and Repairers run fibre; auto-match hit photonics technicians', False),
    'funeral-director': ('39-4031.00', 'Morticians, Undertakers, and Funeral Arrangers is the practitioner occupation; auto-match hit the manager split', False),
    'school-teacher': ('25-2021.00', 'generic K-12 card; Elementary School Teachers is the largest teaching occupation (auto-match tie broke to a special-education split)', False),
    'special-education-teacher': ('25-2056.00', 'Special Education Teachers, Elementary School — the modal setting; auto-match picked the preschool split arbitrarily', False),
    'caterer': ('11-9051.00', 'caterers operate food-service businesses (Food Service Managers); auto-match hit line food-preparation work', False),
    'farm-ranch-manager': ('11-9013.00', 'Farmers, Ranchers, and Other Agricultural Managers; auto-match hit farmworkers', False),
    'septic-system-installer': ('47-4071.00', 'Septic Tank Servicers and Sewer Pipe Cleaners is the septic occupation; auto-match hit alarm installers', False),
    'content-strategist': ('13-1161.00', 'editorial neighbor: content strategy is audience/content planning inside marketing; measured profile borrowed from Market Research Analysts and Marketing Specialists (same precedent as brand-strategist); auto-match (Document Management Specialists) is a different job', False),
    'customer-success-manager': (None, 'auto-match (office-support supervisors) is a different job; O*NET also parks the reported title under 43-1011, but that clerical-supervisor profile mis-shapes an account-relationship role — stays a stub for a founder decision (re-reviewed 28.10.2026)', False),
    'real-estate-investor-flips': ('11-9021.00', 'editorial neighbor: a flip operation is acquire-renovate-sell; the operating work is renovation project management — same taxonomy home as general-contractor (auto-match financial analysts describes employees, not investor-operators)', False),
    'real-estate-investor-rentals': ('11-9141.00', 'editorial neighbor: operating rentals is property management of own assets — same home as airbnb-co-host-str-manager (auto-match financial analysts describes employees, not investor-operators)', False),
    'ux-researcher': ('15-1255.00', 'hand-reviewed 28.10.2026: "UX Researcher" IS an O*NET alternate title of Web and Digital Interface Designers — the taxonomy home after all; supplies via SUPPLIES_NEIGHBOR from the rated sibling', False),
    'doula': ('31-1122.00', 'editorial neighbor: doula work is non-clinical personal support and companionship; measured profile borrowed from Personal Care Aides (same precedent as elder-care-companion-pro); auto-match (Midwives) is a clinical provider role', False),
    # -- parent-series mappings (bls_inherited = true)
    'site-reliability-engineer': ('15-1252.00', 'no O*NET occupation for site reliability engineering; BLS series inherited from Software Developers', True),
    'data-analyst': ('15-2051.00', 'no distinct O*NET occupation for data analysts; standard crosswalk parent is Data Scientists', True),
    'data-engineer': ('15-1243.00', 'no distinct O*NET occupation for data engineers; parent series Database Architects', True),
    'commercial-insurance-producer': ('41-3021.00', 'producer is the industry title for Insurance Sales Agents; the commercial-lines specialisation has no own SOC', True),
    'ai-automation-specialist': ('15-1252.00', 'emerging role with no O*NET-SOC occupation; BLS series inherited from Software Developers', True),
    'electrologist': ('39-5094.00', 'electrology is practised inside the esthetics licence family (Skincare Specialists); no own SOC', True),
    'mortgage-broker': ('13-2072.00', 'mortgage brokers have no own SOC; BLS series is Loan Officers', True),
    # -- owner-operator cards mapped to the trade the owner performs
    'cleaning-company-owner': ('37-1011.00', 'owner_to_trade: First-Line Supervisors of Housekeeping and Janitorial Workers', False),
    'painting-company-owner': ('47-2141.00', 'owner_to_trade: Painters, Construction and Maintenance', False),
    'lawn-care-company-owner': ('37-3011.00', 'owner_to_trade: Landscaping and Groundskeeping Workers', False),
    'handyman-company-owner': ('49-9071.00', 'owner_to_trade: Maintenance and Repair Workers, General', False),
    'spa-owner': ('11-9179.02', 'Spa Managers is the occupation for spa operators', False),
    'childcare-center-owner': ('11-9031.00', 'owner_to_trade: Education and Childcare Administrators, Preschool and Daycare', False),
    'elder-care-companion-pro': ('31-1122.00', 'the work itself is Personal Care Aides', False),
    'nanny-family-assistant-pro': ('39-9011.00', 'the work itself is Childcare Workers', False),
    'owner-operator-trucking': ('53-3032.00', 'owner_to_trade: Heavy and Tractor-Trailer Truck Drivers', False),
    'moving-company-owner': ('53-3033.00', 'owner_to_trade: Light Truck Drivers (box-truck moving work)', False),
    'auto-detailing-mobile-owner': ('53-7061.00', 'owner_to_trade: Cleaners of Vehicles and Equipment', False),
    'window-cleaning-owner': ('37-2011.00', 'owner_to_trade: Janitors and Cleaners (window work sits here)', False),
    'pressure-washing-owner': ('37-2011.00', 'owner_to_trade: exterior cleaning sits in Janitors and Cleaners', False),
    'junk-removal-owner': ('53-7062.00', 'owner_to_trade: Laborers and Freight, Stock, and Material Movers, Hand', False),
    'pet-grooming-salon-owner': ('39-2021.00', 'owner_to_trade: Animal Caretakers (pet grooming has no own SOC)', False),
    'mobile-pet-groomer': ('39-2021.00', 'owner_to_trade: Animal Caretakers (pet grooming has no own SOC)', False),
    'pet-boarding-daycare-owner': ('39-2021.00', 'owner_to_trade: Animal Caretakers', False),
    'senior-home-care-agency-owner': ('31-1121.00', 'owner_to_trade: the agency product is Home Health Aides work', False),
    'gym-fitness-studio-owner': ('39-9031.00', 'owner_to_trade: Exercise Trainers and Group Fitness Instructors', False),
    'food-truck-owner': ('35-1012.00', 'owner_to_trade: First-Line Supervisors of Food Preparation and Serving Workers', False),
    'meal-prep-business-owner': ('35-2014.00', 'owner_to_trade: Cooks, Restaurant (production cooking)', False),
    'bakery-caf-owner': ('11-9051.00', 'owner_to_trade: Food Service Managers (bakery-café is a food establishment)', False),
    'chocolatier-candy-maker': ('51-3092.00', 'the craft sits in Food Batchmakers', False),
    'farmers-market-producer': ('11-9013.00', 'market producers are growers: Farmers, Ranchers, and Other Agricultural Managers', False),
    'vending-atm-route-owner': ('49-9091.00', 'owner_to_trade: Coin, Vending, and Amusement Machine Servicers and Repairers', False),
    'photo-booth-event-rentals-owner': ('41-2021.00', 'owner_to_trade: Counter and Rental Clerks (rental operations)', False),
    'tutoring-center-owner': ('25-3041.00', 'owner_to_trade: Tutors', False),
    'boat-restoration-flipping': ('49-3051.00', 'the hands-on work is Motorboat Mechanics and Service Technicians', False),
    'car-flipping': ('49-3023.00', 'the reconditioning work is Automotive Service Technicians and Mechanics', False),
    # -- unmatched professions with a defensible single home
    'aba-therapist-kids': ('21-1093.00', 'behaviour technicians have no own SOC; delivery sits in Social and Human Service Assistants', True),
    'psychologist-therapist': ('19-3033.00', 'Clinical and Counseling Psychologists', False),
    'sports-coach': ('27-2022.00', 'Coaches and Scouts', False),
    'speech-public-speaking-coach': ('25-3021.00', 'public-speaking instruction sits in Self-Enrichment Teachers', False),
    'ev-charging-technician': ('47-2111.00', 'EV charger installation is electrician work (Electricians)', True),
    'gis-specialist-cartographer': ('17-1021.00', 'Cartographers and Photogrammetrists', False),
    'laser-hair-removal-technician': ('39-5094.00', 'laser hair removal is delivered inside esthetics practice (Skincare Specialists)', True),
    'hair-replacement-wig-specialist': ('39-5012.00', 'the licence family is Hairdressers, Hairstylists, and Cosmetologists', True),
    'reflexologist': ('31-9011.00', 'reflexology is practised inside massage-therapy licensure (Massage Therapists)', True),
    # -- professions with NO clean O*NET occupation (stay unmatched)
    'car-wash-owner': (None, 'owner of a largely automated facility; Cleaners of Vehicles and Equipment describes attendants, not the operator business', False),
    'laundromat-owner': (None, 'absentee equipment business; no O*NET occupation describes it', False),
    'self-storage-owner': (None, 'absentee real-estate business; no O*NET occupation describes it', False),
    'resale-flipping-business': (None, 'platform resale has no O*NET occupation', False),
    'etsy-digital-products-seller': (None, 'digital-product selling has no O*NET occupation', False),
    'print-on-demand-seller': (None, 'print-on-demand selling has no O*NET occupation', False),
    'amazon-fba-seller': (None, 'marketplace selling has no O*NET occupation', False),
    'franchise-owner-home-services': (None, 'franchise ownership is a business form, not an occupation', False),
    'life-coach': (None, 'life coaching is unlicensed and has no O*NET occupation', False),
    'yacht-broker': ('41-9022.00', 'editorial neighbor: yacht brokerage is licensed big-ticket asset sales on commission; measured profile borrowed from Real Estate Sales Agents (no own O*NET occupation)', False),
    'salesforce-administrator': ('15-1244.00', 'editorial neighbor: platform administration is systems-administration work on a business platform; measured profile borrowed from Network and Computer Systems Administrators', False),
    'cardiovascular-perfusionist': ('29-2031.00', 'hand-reviewed 28.10.2026: no own data-level occupation, but "Perfusionist" is an O*NET reported title under Cardiovascular Technologists and Technicians — the profile is borrowed from that reported-title home and the borrowing is recorded here', False),
    'sleep-technologist': ('29-2099.01', 'hand-reviewed 28.10.2026: Neurodiagnostic Technologists is the occupation — its rated tasks literally include polysomnography (PSG)', False),
    'body-piercing-artist': (None, 'body piercing has no O*NET occupation (re-reviewed 28.10.2026: no alternate/reported title home; the PMU licence-family profile mis-shapes a body-art practice — stays a stub for a founder decision)', False),
    'brewer-brewmaster': ('51-9012.00', 'hand-reviewed 28.10.2026: "Brewer" and "Brewmaster" are O*NET alternate titles of the still-machine occupation — brewing vessels sit in the still/kettle family in the taxonomy', False),
    'winemaker-enologist': ('51-9012.00', 'hand-reviewed 28.10.2026: "Winemaker" is an O*NET alternate title of the still-machine occupation (the science-side sibling, Food Scientists 19-1012, carries "Enologist")', False),
    'sommelier': ('35-3031.00', 'editorial neighbor: the sommelier is the wine specialist of dining-room service; "Wine Steward" is an O*NET alternate title of Waiters and Waitresses — measured profile borrowed from that occupation', False),
    # -- second pass: obvious homes the tokeniser missed (abbreviations,
    #    merged titles, SOC-2018 renames)
    'ux-ui-designer': ('15-1255.00', 'UX/UI design IS Web and Digital Interface Designers in the SOC-2018 taxonomy', False),
    'qa-engineer': ('15-1253.00', 'Software Quality Assurance Analysts and Testers', False),
    'no-code-developer': ('15-1254.00', 'platform-based web development; BLS series inherited from Web Developers', True),
    'mobile-app-developer': ('15-1252.00', 'app developers sit inside Software Developers since the SOC-2018 merge', False),
    'motion-designer-3d-artist': ('27-1014.00', 'motion/3D work sits in Special Effects Artists and Animators', False),
    'seo-specialist': ('13-1161.01', 'Search Marketing Strategists is the SEO occupation', False),
    'ppc-paid-ads-specialist': ('13-1161.01', 'paid search is the core of Search Marketing Strategists', False),
    'smm-manager': ('13-1161.00', 'social-media management has no own SOC; practitioner home is Market Research Analysts and Marketing Specialists', True),
    'crm-email-marketer': ('13-1161.00', 'email/CRM marketing has no own SOC; practitioner home is Marketing Specialists', True),
    'brand-strategist': ('13-1161.00', 'brand strategy has no own SOC; practitioner home is Marketing Specialists', True),
    'virtual-assistant': ('43-6014.00', 'a virtual assistant performs the Secretaries and Administrative Assistants occupation remotely', False),
    'bookkeeper-advisory': ('43-3031.00', 'Bookkeeping, Accounting, and Auditing Clerks; the advisory layer is an upsell on the same base occupation', False),
    'b2b-sales-rep': ('41-4012.00', 'Sales Representatives, Wholesale and Manufacturing, Except Technical and Scientific Products', False),
    'pr-specialist': ('27-3031.00', 'Public Relations Specialists', False),
    'lpn-lvn': ('29-2061.00', 'Licensed Practical and Licensed Vocational Nurses (abbreviation-only title defeated the tokeniser)', False),
    'radiology-tech': ('29-2034.00', 'Radiologic Technologists and Technicians', False),
    'pt-assistant': ('31-2021.00', 'Physical Therapist Assistants', False),
    'vet-technician': ('29-2056.00', 'Veterinary Technologists and Technicians', False),
    'nutrition-coach-dietitian': ('29-1031.00', 'Dietitians and Nutritionists (the licensed anchor of the combined card)', False),
    'sterile-processing-tech': ('31-9093.00', 'sterile processing is Medical Equipment Preparers work (instrument sterilisation)', False),
    'home-inspector': ('47-4011.00', 'home inspectors sit in Construction and Building Inspectors', False),
    'general-contractor': ('11-9021.00', 'general contractors sit in Construction Managers in the O*NET taxonomy', False),
    'garage-door-tech': ('49-9011.00', 'Mechanical Door Repairers is the garage-door occupation', False),
    'arborist-tree-pro': ('37-3013.00', 'Tree Trimmers and Pruners (certified arborists are the credentialed top of this occupation)', False),
    'boat-mechanic-marine-tech': ('49-3051.00', 'Motorboat Mechanics and Service Technicians', False),
    'set-production-designer': ('27-1027.00', 'Set and Exhibit Designers', False),
    'cosmetologist-hair-stylist': ('39-5012.00', 'Hairdressers, Hairstylists, and Cosmetologists', False),
    'lash-brow-artist': ('39-5094.00', 'lash/brow services are esthetics-scope work (Skincare Specialists)', True),
    'permanent-makeup-artist': ('39-5094.00', 'permanent makeup is delivered inside the esthetics/cosmetology licence family (Skincare Specialists)', True),
    'beauty-salon-owner': ('39-5012.00', 'owner_to_trade: Hairdressers, Hairstylists, and Cosmetologists', False),
    'yoga-pilates-instructor': ('39-9031.00', 'Exercise Trainers and Group Fitness Instructors', False),
    'airbnb-co-host-str-manager': ('11-9141.00', 'short-term rental management is Property, Real Estate, and Community Association Managers work', False),
    'home-stager': ('27-1025.00', 'staging is interior-decoration work; taxonomy home is Interior Designers', True),
    'dialysis-technician': ('29-2012.00', 'hand-reviewed 28.10.2026: no distinct data-level occupation, but "Certified Dialysis Technician" and "Hemodialysis Technician" are O*NET reported titles under Medical and Clinical Laboratory Technicians — profile borrowed from that reported-title home and the borrowing is recorded here', False),
    'online-course-creator': ('25-3021.00', 'editorial neighbor: a course creator designs and delivers their own instruction as a business; measured profile borrowed from Self-Enrichment Teachers (same precedent as music/dance/driving instructors)', False),
    'streamer-content-creator': ('27-3011.00', 'editorial neighbor: streaming is live audience performance and hosting; measured profile borrowed from Broadcast Announcers and Radio Disc Jockeys', False),
    'ugc-creator': ('27-2011.00', 'editorial neighbor: UGC work is on-camera commercial performance plus self-production; measured profile borrowed from Actors', False),
    'tattoo-artist': (None, 'tattoo artistry has no O*NET occupation (Craft Artists is fine art, a different practice; re-reviewed 28.10.2026 — stays a stub for a founder decision)', False),
    'dj-event-host': ('27-2091.00', 'hand-reviewed 28.10.2026: Disc Jockeys, Except Radio is the occupation itself (alternate titles include "Event Disc Jockey" and "Club Disc Jockey"); it has no Work Values row, so supplies come via SUPPLIES_NEIGHBOR from the radio sibling', False),
    'personal-fashion-stylist': (None, 'personal styling has no O*NET occupation (Fashion Designers design garments, a different practice; re-reviewed 28.10.2026 — stays a stub for a founder decision)', False),
    'home-organizer-pro': ('27-1025.00', 'editorial neighbor: professional organising is residential spatial arrangement work; measured profile borrowed from Interior Designers (same precedent as home-stager)', False),
    # -- third pass: trades the tokeniser missed on word-form differences
    'appliance-repair-tech': ('49-9031.00', 'Home Appliance Repairers', False),
    'auto-mechanic': ('49-3023.00', 'Automotive Service Technicians and Mechanics', False),
    'ekg-technician': ('29-2031.00', 'ECG work sits inside Cardiovascular Technologists and Technicians', False),
    'hvac-technician': ('49-9021.00', 'Heating, Air Conditioning, and Refrigeration Mechanics and Installers', False),
    'landscaper-lawn-pro': ('37-3011.00', 'Landscaping and Groundskeeping Workers', False),
    'pest-control-tech': ('37-2021.00', 'Pest Control Workers', False),
    # -- fourth pass (fix A, 28.10.2026): the six professions added in the
    #    28.10 QA pass, each with its exact SOC occupation (brief §2A)
    'customer-service-representative': ('43-4051.00', 'Customer Service Representatives is the exact SOC occupation', False),
    'medical-health-services-manager': ('11-9111.00', 'Medical and Health Services Managers is the exact SOC occupation', False),
    'medical-secretary': ('43-6013.00', 'Medical Secretaries and Administrative Assistants is the exact SOC occupation', False),
    'cad-drafter': ('17-3011.00', 'Architectural and Civil Drafters is the CAD drafter occupation', False),
    'building-inspector': ('47-4011.00', 'Construction and Building Inspectors is the exact SOC occupation (home-inspector already maps here)', False),
    'civil-engineering-technician': ('17-3022.00', 'Civil Engineering Technologists and Technicians is the exact SOC occupation', False),
    # -- stub-fill pass (28.10.2026): the fix-A hold-backs, hand-reviewed
    #    one by one against Occupation Data, Alternate Titles and tasks.
    'audio-video-equipment-technician': ('27-4011.00', 'hand-reviewed 28.10.2026: Audio and Video Technicians is the exact occupation (auto-match confirmed)', False),
    'avionics-technician': ('49-2091.00', 'hand-reviewed 28.10.2026: Avionics Technicians is the exact occupation (auto-match confirmed)', False),
    'business-broker': ('41-9022.00', 'editorial neighbor: business brokerage is licensed asset-sale brokerage; O*NET parks the reported title under Brokerage Clerks (43-4011, securities back office — a different work family), so the measured profile is borrowed from Real Estate Sales Agents', False),
    'career-and-technical-education-teacher': ('25-2032.00', 'hand-reviewed 28.10.2026: Career/Technical Education Teachers, Secondary School is the exact occupation (auto-match confirmed)', False),
    'certified-nurse-midwife': ('29-1161.00', 'hand-reviewed 28.10.2026: Nurse Midwives is the exact occupation (auto-match confirmed)', False),
    'child-life-specialist': ('39-9011.00', 'hand-reviewed 28.10.2026: "Child Life Specialist" is an O*NET alternate title of Childcare Workers (auto-match confirmed)', False),
    'costume-designer': ('27-1022.00', 'hand-reviewed 28.10.2026: "Costume Designer" is an O*NET alternate title of Fashion Designers (auto-match confirmed)', False),
    'customs-broker': ('13-1041.08', 'hand-reviewed 28.10.2026: Customs Brokers is the exact detailed occupation (auto-match confirmed)', False),
    'distiller': ('51-9012.00', 'hand-reviewed 28.10.2026: "Distiller" is an O*NET alternate title of the still-machine occupation (auto-match confirmed)', False),
    'electrical-engineer': ('17-2071.00', 'hand-reviewed 28.10.2026: Electrical Engineers is the exact occupation (auto-match confirmed)', False),
    'food-stylist': ('27-1027.00', 'hand-reviewed 28.10.2026: "Food Stylist" is an O*NET alternate title of Set and Exhibit Designers (auto-match confirmed)', False),
    'freight-broker-agent': ('43-5011.00', 'hand-reviewed 28.10.2026: Cargo and Freight Agents is the standard crosswalk home — its rated tasks are literally negotiating and arranging freight transport (auto-match confirmed)', False),
    'general-surgeon': (None, 'hand-reviewed 28.10.2026: auto-match (29-1242) is Orthopedic Surgeons — wrong specialty; general surgery sits in Surgeons, All Other (29-1249.00), which is NOT a data-level occupation in 30.2 (no Job Zone, no ratings), and no rated surgeon sibling is a defensible donor — stays a stub for a founder decision', False),
    'lighting-designer': ('27-1027.00', 'hand-reviewed 28.10.2026: "Lighting Designer" is an O*NET alternate title of Set and Exhibit Designers — the stage/production-design family home (the technician side is film-stage-lighting-technician); auto-match (27-1021 product design) rejected', False),
    'mechanical-engineer': ('17-2141.00', 'hand-reviewed 28.10.2026: Mechanical Engineers is the exact occupation (auto-match confirmed)', False),
    'medical-laboratory-scientist': ('29-2011.00', 'hand-reviewed 28.10.2026: auto-match (19-1042 Medical Scientists, a research occupation) was WRONG; the MLS is Medical and Clinical Laboratory Technologists', False),
    'platform-engineer': ('15-1299.08', 'hand-reviewed 28.10.2026: Computer Systems Engineers/Architects accepted after task review — platform engineering is internal systems architecture and infrastructure design (auto-match confirmed)', False),
    'power-plant-operator': ('51-8013.00', 'hand-reviewed 28.10.2026: Power Plant Operators is the exact occupation (auto-match confirmed)', False),
    'school-psychologist': ('19-3034.00', 'hand-reviewed 28.10.2026: School Psychologists is the exact occupation (auto-match confirmed)', False),
    'subway-streetcar-operator': ('53-4041.00', 'hand-reviewed 28.10.2026: Subway and Streetcar Operators is the exact occupation (auto-match confirmed)', False),
    'telecommunications-equipment-installer': ('49-2022.00', 'hand-reviewed 28.10.2026: Telecommunications Equipment Installers and Repairers, Except Line Installers is the exact occupation (auto-match confirmed)', False),
    # -- stub-fill pass (28.10.2026): previously unmatched professions,
    #    hand-reviewed against Alternate Titles / Reported Titles / tasks.
    'embedded-systems-engineer': ('15-1252.00', 'hand-reviewed 28.10.2026: "Embedded Software Engineer" and "Embedded Systems Software Developer" are O*NET alternate titles of Software Developers; supplies via SUPPLIES_NEIGHBOR like the rest of the software family', False),
    'board-certified-behavior-analyst-bcba': ('19-3033.00', 'hand-reviewed 28.10.2026: "Behavior Analyst" is an O*NET alternate title of Clinical and Counseling Psychologists; the BCBA is the credentialed plan designer (delivery sits in aba-therapist-kids / Social and Human Service Assistants)', False),
    'data-center-technician': ('49-2011.00', 'hand-reviewed 28.10.2026: no alternate-title home; the work is hands-on installation, cabling and repair of computing hardware, so the measured profile is Computer, Automated Teller, and Office Machine Repairers (15-1231 network support is the screen-side sibling)', False),
    'cnc-machinist-programmer': ('51-4041.00', 'hand-reviewed 28.10.2026: "CNC Machinist" is an O*NET alternate title of Machinists; the machinist craft is the card home (the programmer-only split is 51-9162)', False),
    'tattoo-artist-2': ('39-5094.00', 'hand-reviewed 28.10.2026: paramedical tattooing (scar/areola restoration) is permanent-makeup practice; same licence-family home as permanent-makeup-artist (Skincare Specialists)', False),
    'scalp-micropigmentation-artist': ('39-5094.00', 'hand-reviewed 28.10.2026: scalp micropigmentation IS permanent makeup; same licence-family home as permanent-makeup-artist (Skincare Specialists)', False),
    'vertical-farm-technician': ('45-2092.00', 'hand-reviewed 28.10.2026: "Hydroponic Controlled Environment Agricultural Grower" is an O*NET alternate title of Farmworkers and Laborers, Crop, Nursery, and Greenhouse — the taxonomy home of CEA growing work', False),
    'esl-adult-literacy-teacher': ('25-3011.00', 'hand-reviewed 28.10.2026: the occupation title itself is Adult Basic Education, Adult Secondary Education, and English as a Second Language Instructors', False),
    # -- Matchmaker 2.0 core rows (28.10.2026): the nursing -> aesthetics
    # ladder rows were added to the base with editorial tuples; linking
    # them here so their measured profiles are O*NET data, not stubs.
    'certified-nursing-assistant': ('31-1131.00', 'hand-reviewed 28.10.2026: Nursing Assistants is the exact SOC occupation', False),
    'aesthetic-nurse-nurse-injector': ('29-1141.00', 'hand-reviewed 28.10.2026: aesthetic/injector nursing has no own SOC; it is practised on the RN licence, so the measured profile is Registered Nurses (pay is NOT inherited — the card figure is labelled job-posting data)', False),
    'med-spa-owner': ('11-9111.00', 'hand-reviewed 28.10.2026: a med spa is a medical practice and its working owner has no own SOC; the measured profile is Medical and Health Services Managers (pay is NOT inherited — the card figure is an editorial owner-income estimate)', False),
}

# --- Supplies donors ------------------------------------------------------
# Occupations whose OWN Work Values row does not exist in O*NET 30.2
# (Work Values covers 874 of 923 data-level occupations; the missing
# ones are mostly post-2018 splits). For these, supplies (work values)
# are measured on the nearest rated sibling/parent occupation, and the
# borrowing is recorded on the entry (work_values_neighbor) and on the
# built profession object (supplies_neighbor) — never passed off as the
# occupation's own row. RIASEC always stays the occupation's own.
SUPPLIES_NEIGHBOR = {
    'software-developer': ('15-1251.00', 'Software Developers has no Work Values row in 30.2; supplies measured on Computer Programmers, the sibling craft occupation'),
    'devops-engineer': ('15-1251.00', 'inherited software-developer series; same supplies donor as software-developer'),
    'ai-automation-specialist': ('15-1251.00', 'inherited software-developer series; same supplies donor as software-developer'),
    'mobile-app-developer': ('15-1251.00', 'software-developer series; same supplies donor as software-developer'),
    'site-reliability-engineer': ('15-1251.00', 'inherited software-developer series; same supplies donor as software-developer'),
    'embedded-systems-engineer': ('15-1251.00', 'software-developer series; same supplies donor as software-developer'),
    'data-analyst': ('15-2041.00', 'Data Scientists was split out of Statisticians in SOC 2018 and has no Work Values row; supplies measured on the parent occupation'),
    'data-scientist-ml-engineer': ('15-2041.00', 'same parent-occupation donor as data-analyst'),
    'ux-ui-designer': ('15-1254.00', 'Web and Digital Interface Designers has no Work Values row; supplies measured on Web Developers, the rated sibling split'),
    'web-designer': ('15-1254.00', 'same sibling donor as ux-ui-designer'),
    'ux-researcher': ('15-1254.00', 'taxonomy home 15-1255 has no Work Values row; same sibling donor as ux-ui-designer'),
    'financial-analyst': ('13-2052.00', 'Financial and Investment Analysts has no Work Values row; supplies measured on Personal Financial Advisors, the rated sibling in the 13-205x family'),
    'project-manager': ('13-1081.00', 'Project Management Specialists has no Work Values row; supplies measured on Logisticians, the rated sibling in the 13-108x business-operations group'),
    'emt-paramedic': ('33-2011.00', 'Emergency Medical Technicians has no Work Values row (nor does the Paramedics split); supplies measured on Firefighters, the rated first-responder sibling — most EMTs are fire-service based'),
    'medical-coder': ('43-3021.00', 'Medical Records Specialists has no Work Values row; supplies measured on Billing and Posting Clerks, the rated sibling in the same revenue-cycle records chain'),
    'special-education-teacher': ('25-2057.00', 'the Elementary split has no Work Values row; supplies measured on Special Education Teachers, Middle School, the rated adjacent grade band of the same occupation family'),
    'bus-driver': ('53-3052.00', 'the School split has no Work Values row; supplies measured on Bus Drivers, Transit and Intercity, the rated sibling split'),
    'penetration-tester': ('15-1212.00', 'Penetration Testers has no Work Values row; supplies measured on Information Security Analysts, the rated parent specialty'),
    'digital-forensics-analyst': ('15-1212.00', 'Digital Forensics Analysts has no Work Values row; supplies measured on Information Security Analysts, the rated parent specialty'),
    'medical-dosimetrist': ('29-1124.00', 'Medical Dosimetrists has no Work Values row; supplies measured on Radiation Therapists, the rated sibling in the radiation-oncology team'),
    'histotechnologist': ('29-2011.00', 'the Histotechnologists split has no Work Values row; supplies measured on Medical and Clinical Laboratory Technologists, the rated parent occupation'),
    'film-stage-lighting-technician': ('27-4011.00', 'Lighting Technicians has no Work Values row; supplies measured on Audio and Video Technicians, the rated sibling stage/production-tech occupation'),
    'dj-event-host': ('27-3011.00', 'Disc Jockeys, Except Radio has no Work Values row; supplies measured on Broadcast Announcers and Radio Disc Jockeys, the rated sibling performance occupation'),
}
OVERRIDES = _O


def read_tsv(name):
    with open(ONET / name, newline='', encoding='utf-8') as fh:
        return list(csv.DictReader(fh, delimiter='\t'))


def norm(s):
    s = s.lower().replace('&', ' and ')
    s = re.sub(r'\([^)]*\)', ' ', s)          # drop parentheticals
    s = re.sub(r'[^a-z0-9 ]+', ' ', s)
    toks = []
    for t in s.split():
        if len(t) > 3 and t.endswith('s') and not t.endswith('ss'):
            t = t[:-1]
        toks.append(t)
    return ' '.join(toks)


def main():
    profs = json.loads(Path(PROFS_JSON).read_text())
    occ_rows = read_tsv('Occupation Data.txt')
    job_zones = {r['O*NET-SOC Code']: int(r['Job Zone']) for r in read_tsv('Job Zones.txt')}
    data_level = set(job_zones)  # 923 data-level occupations

    titles = {}        # norm title -> soc (data-level only)
    title_by_soc = {}
    for r in occ_rows:
        soc = r['O*NET-SOC Code']
        if soc not in data_level:
            continue
        title_by_soc[soc] = r['Title']
        titles.setdefault(norm(r['Title']), soc)

    alternates = {}    # norm alternate title -> soc (data-level only)
    for r in read_tsv('Alternate Titles.txt'):
        soc = r['O*NET-SOC Code']
        if soc in data_level:
            alternates.setdefault(norm(r['Alternate Title']), soc)

    # --- per-SOC sourced data -------------------------------------------
    riasec = {}
    for r in read_tsv('Interests.txt'):
        if r['Scale ID'] != 'OI' or r['Element Name'] not in RIASEC_KEY:
            continue
        riasec.setdefault(r['O*NET-SOC Code'], {})[RIASEC_KEY[r['Element Name']]] = round(float(r['Data Value']) / 7, 4)

    values_extent, values_date = {}, {}
    for r in read_tsv('Work Values.txt'):
        if r['Scale ID'] != 'EX' or r['Element Name'] not in VALUE_KEY:
            continue
        soc = r['O*NET-SOC Code']
        values_extent.setdefault(soc, {})[VALUE_KEY[r['Element Name']]] = float(r['Data Value'])
        d = r['Date']
        if soc not in values_date or d > values_date[soc]:
            values_date[soc] = d

    def lv_vectors(fname):
        out = {}
        names = {}
        for r in read_tsv(fname):
            if r['Scale ID'] != 'LV':
                continue
            out.setdefault(r['O*NET-SOC Code'], {})[r['Element ID']] = float(r['Data Value'])
            names[r['Element ID']] = r['Element Name']
        return out, names

    abilities_lv, ability_names = lv_vectors('Abilities.txt')
    skills_lv, skill_names = lv_vectors('Skills.txt')

    # --- Work Context (cause B): CX mean + CXP category-5 share for the
    # three elements the base fields derive from. Occupations without
    # incumbent-survey rows simply never appear here.
    WC_ELEMENTS = {
        '4.C.1.a.2.c': 'public_speaking',
        '4.C.1.a.2.f': 'telephone',
        '4.C.1.a.2.l': 'face_to_face',
    }
    work_context = {}
    for r in read_tsv('Work Context.txt'):
        key = WC_ELEMENTS.get(r['Element ID'])
        if not key:
            continue
        d = work_context.setdefault(r['O*NET-SOC Code'], {})
        if r['Scale ID'] == 'CX':
            d[key + '_cx'] = round(float(r['Data Value']), 2)
        elif r['Scale ID'] == 'CXP' and r['Category'] == '5':
            d[key + '_daily_pct'] = round(float(r['Data Value']), 1)

    task_text = {}
    for r in read_tsv('Task Statements.txt'):
        task_text[(r['O*NET-SOC Code'], r['Task ID'])] = r['Task']
    task_im = {}
    for r in read_tsv('Task Ratings.txt'):
        if r['Scale ID'] == 'IM':
            task_im.setdefault(r['O*NET-SOC Code'], []).append((float(r['Data Value']), r['Task ID']))

    def top_tasks(soc, n=5):
        rated = sorted(task_im.get(soc, []), reverse=True)[:n]
        return [task_text[(soc, tid)] for _, tid in rated if (soc, tid) in task_text]

    # --- matching ---------------------------------------------------------
    def tokens(s):
        return set(norm(s).split())

    title_tokens = {soc: tokens(t) for soc, t in title_by_soc.items()}

    def match(name):
        n = norm(name)
        if n in titles:
            return titles[n], 'exact_title', []
        if n in alternates:
            return alternates[n], 'alternate_title', []
        pt = tokens(name)
        scored = []
        for soc, tt in title_tokens.items():
            inter = len(pt & tt)
            if inter == 0:
                continue
            union = len(pt | tt)
            jac = inter / union
            containment = inter / min(len(pt), len(tt))
            scored.append((containment, jac, soc))
        scored.sort(reverse=True)
        if scored and scored[0][0] >= 0.75 and scored[0][1] >= 0.4:
            cands = [(title_by_soc[s], round(c, 2), round(j, 2)) for c, j, s in scored[:3]]
            ambiguous = len(scored) > 1 and scored[1][0] == scored[0][0]
            return scored[0][2], ('fuzzy_ambiguous' if ambiguous else 'token_match'), cands
        return None, 'unmatched', [(title_by_soc[s], round(c, 2), round(j, 2)) for c, j, s in scored[:3]]

    imported, report = {}, {}
    for p in profs:
        slug, name = p['slug'], p['name']
        soc, method, cands = match(name)
        inherited = False
        if slug in OVERRIDES:
            o_soc, reason, inherited = OVERRIDES[slug]
            if o_soc is not None and o_soc not in title_by_soc:
                raise SystemExit(f'override for {slug} names a non-data-level SOC: {o_soc}')
            soc = o_soc
            method = f'override: {reason}'
        entry = {'match_method': method, 'candidates': cands, 'bls_inherited': inherited}
        if soc:
            entry.update({
                'onet_soc': soc,
                'onet_title': title_by_soc.get(soc),
                'job_zone': job_zones.get(soc),
                'riasec_profile': riasec.get(soc),
                'work_values_extent': values_extent.get(soc),
                'work_values_frozen_date': values_date.get(soc),
                # supplies is NOT stored: the loader derives it from
                # work_values_extent ((EX - 1) / 6) — one source, no drift.
                # abilities/skills ship as ARRAYS aligned to the element
                # order declared in meta (abilities_elements /
                # skills_elements) to keep the file shippable.
                'abilities_lv': ([abilities_lv[soc].get(eid) for eid in ability_names]
                                 if soc in abilities_lv else None),
                'skills_lv': ([skills_lv[soc].get(eid) for eid in skill_names]
                              if soc in skills_lv else None),
                'tasks': top_tasks(soc),
                # Work Context for the matched SOC (cause B): the raw
                # CX/CXP values the loader derives public_voice and the
                # voice_load telephone leg from — stored raw, derived
                # once in the loader, so the two can never drift.
                'work_context': work_context.get(soc),
            })
            # Supplies donor: the occupation's own Work Values row does
            # not exist in 30.2 — borrow the extent from the nearest
            # rated sibling/parent and RECORD the borrowing on the entry.
            if not entry.get('work_values_extent') and slug in SUPPLIES_NEIGHBOR:
                n_soc, n_reason = SUPPLIES_NEIGHBOR[slug]
                if n_soc not in values_extent:
                    raise SystemExit(f'supplies donor {n_soc} for {slug} has no Work Values rows')
                entry['work_values_extent'] = values_extent[n_soc]
                entry['work_values_frozen_date'] = values_date.get(n_soc)
                entry['work_values_neighbor'] = {
                    'soc': n_soc,
                    'title': title_by_soc.get(n_soc),
                    'reason': n_reason,
                }
            elif entry.get('work_values_extent') and slug in SUPPLIES_NEIGHBOR:
                print(f'NOTE: {slug} has its own Work Values row — donor entry unused')
            base_soc = soc[:7]
            if base_soc in BLS_AI_EVIDENCE:
                cat, tier, src = BLS_AI_EVIDENCE[base_soc]
                entry['bls_ai_exposure'] = cat
                entry['bls_ai_exposure_tier'] = tier
                entry['bls_ai_exposure_source'] = src
        report[slug] = {'name': name, **entry}
        # The shipped import drops the review-only 'candidates' field
        # (it lives in onet-mapping-report.json).
        imported[slug] = {k: v for k, v in entry.items() if k != 'candidates'}

    matched = sum(1 for e in imported.values() if 'onet_soc' in e)
    out = {
        'meta': {
            'onet_version': '30.2',
            'source': 'O*NET Database 30.2 text files, onetcenter.org (db_30_2_text.zip)',
            'attribution': ATTRIBUTION,
            'work_values_note': 'Work Values.txt EX ratings are a frozen snapshot (Work Importance Profiler closed 03.06.2024); per-occupation work_values_frozen_date is the latest rating date in the file.',
            'abilities_elements': ability_names,
            'skills_elements': skill_names,
            'bls_ai_exposure_note': 'Populated only from read authoritative statements (see per-entry source/tier). The full BLS XLSX could not be downloaded from the build environment (Akamai 403); unlisted occupations stay null.',
            'work_context_note': 'Work Context.txt (O*NET 30.2): CX mean (1..5) and CXP category-5 share (%) for Public Speaking (4.C.1.a.2.c), Telephone Conversations (4.C.1.a.2.f) and Face-to-Face Discussions (4.C.1.a.2.l), added 28.10.2026 for the cause-B base fields (public_voice, voice_load). Null where the occupation has no Work Context rows.',
            'professions_total': len(profs),
            'professions_matched': matched,
        },
        'professions': imported,
    }
    OUT_IMPORT.write_text(json.dumps(out, indent=1))
    OUT_REPORT.write_text(json.dumps(report, indent=1))
    print(f'matched {matched}/{len(profs)}')
    by_method = {}
    for e in imported.values():
        by_method[e['match_method'].split(':')[0]] = by_method.get(e['match_method'].split(':')[0], 0) + 1
    print('methods:', by_method)
    un = [s for s, e in imported.items() if 'onet_soc' not in e]
    print('unmatched:', len(un))
    for s in un:
        print('  ', s, '|', report[s]['name'], '| cands:', report[s]['candidates'][:2])


if __name__ == '__main__':
    sys.exit(main())
