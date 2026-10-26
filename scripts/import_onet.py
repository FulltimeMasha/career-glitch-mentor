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
  supplies            (EX - 1) / 6 -> 0..1, keyed by the model's 6 values
  work_values_frozen_date  latest Date among the occupation's EX rows —
                      the file is a frozen snapshot (science map §4)
  abilities_lv        Abilities.txt scale LV (0..7), keyed by Element ID
  skills_lv           Skills.txt scale LV (0..7), keyed by Element ID
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
    'content-strategist': (None, 'auto-match (Document Management Specialists) is a different job; no clean O*NET occupation for content strategy', False),
    'customer-success-manager': (None, 'auto-match (office-support supervisors) is a different job; no clean O*NET occupation', False),
    'real-estate-investor-flips': (None, 'auto-match (financial analysts) describes employees, not investor-operators; no clean O*NET occupation', False),
    'real-estate-investor-rentals': (None, 'auto-match (financial analysts) describes employees, not investor-operators; no clean O*NET occupation', False),
    'ux-researcher': (None, 'auto-match (interface designers) is a different job; no clean O*NET occupation for UX research', False),
    'doula': (None, 'auto-match (Midwives) is a clinical provider role; doulas are non-clinical support with no O*NET occupation', False),
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
    'yacht-broker': (None, 'yacht brokerage has no O*NET occupation (nearest sales occupations describe different markets)', False),
    'salesforce-administrator': (None, 'platform-specific admin role; no clean O*NET occupation', False),
    'cardiovascular-perfusionist': (None, 'perfusionists have no data-level O*NET occupation in 30.2; cardiovascular technologists are a different role', False),
    'sleep-technologist': (None, 'polysomnographic technologists have no distinct data-level occupation in 30.2', False),
    'body-piercing-artist': (None, 'body piercing has no O*NET occupation', False),
    'brewer-brewmaster': (None, 'brewing has no distinct data-level O*NET occupation in 30.2', False),
    'winemaker-enologist': (None, 'winemaking has no distinct data-level O*NET occupation in 30.2', False),
    'sommelier': (None, 'sommelier has no O*NET occupation', False),
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
    'dialysis-technician': (None, 'dialysis/patient-care technicians have no distinct data-level O*NET occupation in 30.2', False),
    'online-course-creator': (None, 'course creation as a creator business has no O*NET occupation', False),
    'streamer-content-creator': (None, 'streaming/content creation has no O*NET occupation', False),
    'ugc-creator': (None, 'UGC creation has no O*NET occupation', False),
    'tattoo-artist': (None, 'tattoo artistry has no O*NET occupation (Craft Artists is fine art, a different practice)', False),
    'dj-event-host': (None, 'event DJ/host work has no clean O*NET occupation', False),
    'personal-fashion-stylist': (None, 'personal styling has no O*NET occupation (Fashion Designers design garments, a different practice)', False),
    'home-organizer-pro': (None, 'professional organising has no O*NET occupation', False),
    # -- third pass: trades the tokeniser missed on word-form differences
    'appliance-repair-tech': ('49-9031.00', 'Home Appliance Repairers', False),
    'auto-mechanic': ('49-3023.00', 'Automotive Service Technicians and Mechanics', False),
    'ekg-technician': ('29-2031.00', 'ECG work sits inside Cardiovascular Technologists and Technicians', False),
    'hvac-technician': ('49-9021.00', 'Heating, Air Conditioning, and Refrigeration Mechanics and Installers', False),
    'landscaper-lawn-pro': ('37-3011.00', 'Landscaping and Groundskeeping Workers', False),
    'pest-control-tech': ('37-2021.00', 'Pest Control Workers', False),
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
                'supplies': ({k: round((v - 1) / 6, 4) for k, v in values_extent[soc].items()}
                             if soc in values_extent else None),
                'abilities_lv': abilities_lv.get(soc),
                'skills_lv': skills_lv.get(soc),
                'tasks': top_tasks(soc),
            })
            base_soc = soc[:7]
            if base_soc in BLS_AI_EVIDENCE:
                cat, tier, src = BLS_AI_EVIDENCE[base_soc]
                entry['bls_ai_exposure'] = cat
                entry['bls_ai_exposure_tier'] = tier
                entry['bls_ai_exposure_source'] = src
        report[slug] = {'name': name, **entry}
        imported[slug] = entry

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
